import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/worker.js';
import { applySyncOps } from '../syncReducer.js';
import { collectionKey } from '../collection.js';

function fakeKv() {
  const values = new Map();
  return {
    values,
    async put(key, value) { values.set(key, value); },
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async delete(key) { values.delete(key); },
  };
}

function emptySnapshot({ collection = [], containers = {}, history = [] } = {}) {
  return {
    app: {
      schemaVersion: 1,
      collection,
      containers,
      ui: { viewMode: 'collection', viewAsList: false, selectedFormat: '', sortField: null, sortDir: 'asc' },
    },
    history,
    shares: [],
  };
}

function fakeSyncEnv(snapshot = emptySnapshot(), revision = 1) {
  const state = { snapshot, revision };
  const env = {
    SYNC_AUTH_DISABLED: '1',
    MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION: '1',
    MCP_CHANGE_TOKEN_SECRET: 'test-secret',
    SHARES: fakeKv(),
    OAUTH_KV: fakeKv(),
    COLLECTION_SYNC: {
      idFromName(name) { return name; },
      get() {
        return {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/sync/bootstrap') {
              return Response.json({
                hasCloudData: true,
                collectionId: 'user_test',
                revision: state.revision,
                snapshot: state.snapshot,
              });
            }
            if (url.pathname === '/sync/push') {
              const body = await request.json();
              if (body.requireBaseRevision === true && body.baseRevision !== state.revision) {
                return Response.json({
                  error: 'revision conflict',
                  expectedRevision: body.baseRevision,
                  actualRevision: state.revision,
                }, { status: 409 });
              }
              const ops = Array.isArray(body.ops) ? body.ops : [];
              state.snapshot = applySyncOps(state.snapshot, ops);
              state.revision += ops.length;
              return Response.json({
                collectionId: 'user_test',
                revision: state.revision,
                snapshot: state.snapshot,
                acceptedOpIds: ops.map(op => op.id),
              });
            }
            return Response.json({ error: 'not found' }, { status: 404 });
          },
        };
      },
    },
  };
  return { env, state };
}

async function issueMcpToken(env, scope = 'collection.read collection.write') {
  const register = await worker.fetch(new Request('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Client',
      redirect_uris: ['https://client.example/callback'],
    }),
  }), env);
  assert.equal(register.status, 201);
  const client = await register.json();

  const authorize = await worker.fetch(new Request(
    'https://example.com/authorize?response_type=code'
      + '&client_id=' + encodeURIComponent(client.client_id)
      + '&redirect_uri=' + encodeURIComponent('https://client.example/callback')
      + '&scope=' + encodeURIComponent(scope)
      + '&state=abc'
      + '&debugUser=user_1'
  ), env);
  assert.equal(authorize.status, 302);
  const redirect = new URL(authorize.headers.get('Location'));
  assert.equal(redirect.searchParams.get('state'), 'abc');
  const code = redirect.searchParams.get('code');
  assert.ok(code);

  const token = await worker.fetch(new Request('https://example.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: client.client_id,
      redirect_uri: 'https://client.example/callback',
    }),
  }), env);
  assert.equal(token.status, 200);
  return token.json();
}

async function rpc(env, accessToken, method, params = {}) {
  const res = await worker.fetch(new Request('https://example.com/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), env);
  assert.equal(res.status, 200);
  return res.json();
}

test('mcp: dynamic client registration is disabled unless explicitly enabled', async () => {
  const { env } = fakeSyncEnv();
  delete env.SYNC_AUTH_DISABLED;
  env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION = '0';
  const register = await worker.fetch(new Request('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Client',
      redirect_uris: ['https://client.example/callback'],
    }),
  }), env);
  assert.equal(register.status, 403);
  const data = await register.json();
  assert.equal(data.error, 'registration_not_allowed');
});

async function rpcWithAuthorization(env, authorization, method, params = {}) {
  const res = await worker.fetch(new Request('https://example.com/mcp', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), env);
  assert.equal(res.status, 200);
  return res.json();
}

async function callTool(env, accessToken, name, args = {}) {
  return rpc(env, accessToken, 'tools/call', {
    name,
    arguments: args,
  });
}

function signTestChangeToken(payload, secret = 'test-secret') {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return encoded + '.' + sig;
}

function card(overrides = {}) {
  return {
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    scryfallId: 'sol-ring-1',
    setCode: 'cmm',
    cn: '400',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'box', name: 'bulk' },
    price: 1,
    ...overrides,
  };
}

test('mcp: unauthenticated requests return OAuth challenge metadata', async () => {
  const { env } = fakeSyncEnv();
  const res = await worker.fetch(new Request('https://example.com/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
  }), env);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('WWW-Authenticate'), /\.well-known\/oauth-protected-resource/);
});

test('mcp: OAuth debug flow issues a token that can list tools', async () => {
  const { env } = fakeSyncEnv();
  const token = await issueMcpToken(env);
  assert.match(token.access_token, /^mcp_at_/);

  const listed = await rpc(env, token.access_token, 'tools/list');
  assert.ok(listed.result.tools.some(tool => tool.name === 'preview_create_container'));
  assert.ok(listed.result.tools.some(tool => tool.name === 'apply_collection_change'));
});

test('mcp: raw MCP access tokens are accepted for hosted remote MCP adapters', async () => {
  const { env } = fakeSyncEnv();
  const token = await issueMcpToken(env);
  const initialized = await rpcWithAuthorization(env, token.access_token, 'initialize');
  assert.equal(initialized.result.serverInfo.name, 'MTG Collection');
});

test('mcp: read-only tokens cannot apply changes', async () => {
  const { env } = fakeSyncEnv();
  const token = await issueMcpToken(env, 'collection.read');
  const applied = await callTool(env, token.access_token, 'apply_collection_change', { changeToken: 'bad.token' });
  assert.equal(applied.error.code, -32003);
  assert.match(applied.error.message, /insufficient_scope/);
});

test('mcp: ambiguous inventory move returns candidates instead of a change token', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ scryfallId: 'sol-ring-a', cn: '1' }),
      card({ scryfallId: 'sol-ring-b', cn: '2', finish: 'foil' }),
    ],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_move_inventory_item', {
    query: 'sol ring',
    toLocation: 'binder staples',
  });
  assert.equal(preview.result.structuredContent.status, 'ambiguous');
  assert.equal(preview.result.structuredContent.candidates.length, 2);
});

test('mcp: search_inventory filters finish requests', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Breya, Etherium Shaper', resolvedName: 'Breya, Etherium Shaper', scryfallId: 'breya-1', finish: 'foil' }),
      card({ name: 'Ancient Tomb', resolvedName: 'Ancient Tomb', scryfallId: 'tomb-1', finish: 'normal' }),
    ],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    query: 'foils',
    limit: 50,
  });
  const results = searched.result.structuredContent.results;
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Breya, Etherium Shaper');
  assert.equal(results[0].finish, 'foil');
});

test('mcp: preview/apply inventory move updates snapshot, revision, and history', async () => {
  const entry = card({ qty: 2 });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env, state } = fakeSyncEnv(snapshot, 3);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_move_inventory_item', {
    itemKey: collectionKey(entry),
    qty: 1,
    toLocation: 'binder staples',
    createContainer: true,
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'preview');
  assert.ok(data.changeToken);

  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: data.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.ok(state.snapshot.app.collection.some(c => c.qty === 1 && c.location?.type === 'binder' && c.location?.name === 'staples'));
  assert.ok(state.snapshot.app.collection.some(c => c.qty === 1 && c.location?.type === 'box' && c.location?.name === 'bulk'));
  assert.equal(state.snapshot.history[0].source, 'mcp');
  assert.match(state.snapshot.history[0].summary, /Moved 1 Sol Ring/);
});

test('mcp: preview add inventory resolves an exact printing through Scryfall', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://api.scryfall.com/cards/znr/220');
    return Response.json({
      id: 'maelstrom-artisan-id',
      name: 'Maelstrom Artisan',
      set: 'znr',
      set_name: 'Zendikar Rising',
      collector_number: '220',
      lang: 'en',
      rarity: 'uncommon',
      cmc: 5,
      colors: ['G'],
      color_identity: ['G'],
      type_line: 'Creature - Elf Artificer',
      oracle_text: 'When Maelstrom Artisan enters...',
      legalities: { commander: 'legal' },
      finishes: ['nonfoil', 'foil'],
      image_uris: { normal: 'https://img.test/maelstrom.jpg' },
      prices: { usd: '0.10', usd_foil: '0.25' },
      scryfall_uri: 'https://scryfall.test/card/znr/220/maelstrom-artisan',
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'maelstrom artisan',
      setCode: 'znr',
      cn: '220',
      qty: 1,
      finish: 'nonfoil',
      condition: 'lp',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'preview');
    assert.equal(data.previewType, 'inventory.add');
    assert.equal(data.card.name, 'Maelstrom Artisan');
    assert.match(data.summary, /Added 1 Maelstrom Artisan/);

    const applied = await callTool(env, token.access_token, 'apply_collection_change', {
      changeToken: data.changeToken,
    });
    assert.equal(applied.result.structuredContent.status, 'applied');
    const added = state.snapshot.app.collection[0];
    assert.equal(added.scryfallId, 'maelstrom-artisan-id');
    assert.equal(added.resolvedName, 'Maelstrom Artisan');
    assert.equal(added.setCode, 'znr');
    assert.equal(added.cn, '220');
    assert.equal(added.finish, 'normal');
    assert.equal(added.condition, 'lightly_played');
    assert.equal(added.imageUrl, 'https://img.test/maelstrom.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add inventory returns candidate printings when only a name is provided', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/cards\/search\?/);
    return Response.json({
      total_cards: 2,
      has_more: false,
      data: [
        {
          id: 'hamlet-tdm-1',
          name: 'Petrified Hamlet',
          set: 'tdm',
          set_name: 'Tarkir: Dragonstorm',
          collector_number: '276',
          released_at: '2025-04-11',
          rarity: 'rare',
          type_line: 'Land',
          finishes: ['nonfoil', 'foil'],
          image_uris: { normal: 'https://img.test/hamlet-tdm.jpg' },
          scryfall_uri: 'https://scryfall.test/card/tdm/276/petrified-hamlet',
        },
        {
          id: 'hamlet-ptdm-1',
          name: 'Petrified Hamlet',
          set: 'ptdm',
          set_name: 'Tarkir: Dragonstorm Promos',
          collector_number: '276s',
          released_at: '2025-04-11',
          rarity: 'rare',
          type_line: 'Land',
          finishes: ['foil'],
          image_uris: { normal: 'https://img.test/hamlet-promo.jpg' },
          scryfall_uri: 'https://scryfall.test/card/ptdm/276s/petrified-hamlet',
        },
      ],
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'petrified hamlet',
      condition: 'nm',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_input');
    assert.equal(data.changeToken, undefined);
    assert.ok(data.missingFields.includes('qty'));
    assert.ok(data.missingFields.includes('finish'));
    assert.ok(data.missingFields.includes('printing'));
    assert.equal(data.candidates.length, 2);
    assert.equal(data.candidates[0].setCode, 'tdm');
    assert.equal(data.candidates[0].previewAddArgs.scryfallId, 'hamlet-tdm-1');
    assert.equal(data.candidates[0].previewAddArgs.condition, 'near_mint');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: search card printings returns exact Scryfall add arguments', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  let userAgent = '';
  globalThis.fetch = async (url, init = {}) => {
    userAgent = init.headers?.['User-Agent'] || '';
    assert.match(String(url), /\/cards\/search\?/);
    return Response.json({
      total_cards: 1,
      has_more: false,
      data: [{
        id: 'hamlet-tdm-1',
        name: 'Petrified Hamlet',
        set: 'tdm',
        set_name: 'Tarkir: Dragonstorm',
        collector_number: '276',
        released_at: '2025-04-11',
        rarity: 'rare',
        type_line: 'Land',
        finishes: ['nonfoil', 'foil'],
        image_uris: { normal: 'https://img.test/hamlet-tdm.jpg' },
        scryfall_uri: 'https://scryfall.test/card/tdm/276/petrified-hamlet',
      }],
    });
  };
  try {
    const lookup = await callTool(env, token.access_token, 'search_card_printings', {
      name: 'petrified hamlet',
      finish: 'nonfoil',
      qty: 2,
      limit: 5,
    });
    const data = lookup.result.structuredContent;
    assert.equal(data.status, 'ok');
    assert.equal(data.requestedFinish, 'nonfoil');
    assert.equal(data.candidates.length, 1);
    assert.equal(data.candidates[0].previewAddArgs.scryfallId, 'hamlet-tdm-1');
    assert.equal(data.candidates[0].previewAddArgs.finish, 'normal');
    assert.equal(data.candidates[0].previewAddArgs.qty, 2);
    assert.match(userAgent, /MTGCollection/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: search card printings falls back when Scryfall search errors', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).includes('/cards/search?')) {
      return Response.json({ details: 'temporary failure' }, { status: 500 });
    }
    assert.equal(String(url), 'https://api.scryfall.com/cards/named?exact=petrified%20hamlet');
    return Response.json({
      id: 'hamlet-tdm-1',
      name: 'Petrified Hamlet',
      set: 'sos',
      set_name: 'Secrets of Strixhaven',
      collector_number: '259',
      released_at: '2026-04-24',
      rarity: 'rare',
      type_line: 'Land',
      finishes: ['nonfoil', 'foil'],
      image_uris: { normal: 'https://img.test/hamlet.jpg' },
      scryfall_uri: 'https://scryfall.test/card/sos/259/petrified-hamlet',
    });
  };
  try {
    const lookup = await callTool(env, token.access_token, 'search_card_printings', {
      name: 'petrified hamlet',
      limit: 5,
    });
    const data = lookup.result.structuredContent;
    assert.equal(data.status, 'ok');
    assert.equal(data.candidates.length, 1);
    assert.equal(data.candidates[0].setCode, 'sos');
    assert.deepEqual(urls, [
      'https://api.scryfall.com/cards/search?q=!' + encodeURIComponent('"petrified hamlet"') + '&unique=prints&order=released&dir=desc&include_extras=true&include_variations=true',
      'https://api.scryfall.com/cards/named?exact=petrified%20hamlet',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add inventory can auto-preview a unique name lookup', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/cards\/search\?/);
    return Response.json({
      total_cards: 1,
      has_more: false,
      data: [{
        id: 'hamlet-tdm-1',
        name: 'Petrified Hamlet',
        set: 'tdm',
        set_name: 'Tarkir: Dragonstorm',
        collector_number: '276',
        lang: 'en',
        released_at: '2025-04-11',
        rarity: 'rare',
        cmc: 0,
        colors: [],
        color_identity: ['G'],
        type_line: 'Land',
        oracle_text: 'Petrified Hamlet enters tapped...',
        legalities: { commander: 'legal' },
        finishes: ['nonfoil', 'foil'],
        image_uris: { normal: 'https://img.test/hamlet-tdm.jpg' },
        prices: { usd: '0.50' },
        scryfall_uri: 'https://scryfall.test/card/tdm/276/petrified-hamlet',
      }],
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'petrified hamlet',
      qty: 1,
      finish: 'nonfoil',
      condition: 'nm',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'preview');
    assert.equal(data.card.name, 'Petrified Hamlet');
    const applied = await callTool(env, token.access_token, 'apply_collection_change', {
      changeToken: data.changeToken,
    });
    assert.equal(applied.result.structuredContent.status, 'applied');
    assert.equal(state.snapshot.app.collection[0].scryfallId, 'hamlet-tdm-1');
    assert.equal(state.snapshot.app.collection[0].rarity, 'rare');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add inventory rejects incomplete Scryfall metadata', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://api.scryfall.com/cards/vow/262');
    return Response.json({
      id: 'dreamroot-id',
      name: 'Dreamroot Cascade',
      set: 'vow',
      set_name: 'Innistrad: Crimson Vow',
      collector_number: '262',
      lang: 'en',
      cmc: 0,
      colors: [],
      color_identity: ['G', 'U'],
      type_line: 'Land',
      finishes: ['nonfoil', 'foil'],
      prices: { usd: '3.00' },
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      setCode: 'vow',
      cn: '262',
      qty: 1,
      finish: 'nonfoil',
      condition: 'nm',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_clarification');
    assert.equal(data.changeToken, undefined);
    assert.ok(data.missingFields.includes('rarity'));
    assert.ok(data.missingFields.includes('imageUrl'));
    assert.equal(state.snapshot.app.collection.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add inventory tolerates chat-coerced string args', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const listed = await rpc(env, token.access_token, 'tools/list');
  const addTool = listed.result.tools.find(tool => tool.name === 'preview_add_inventory_item');
  assert.ok(addTool.inputSchema.properties.qty.oneOf.some(schema => schema.type === 'string'));
  assert.ok(addTool.inputSchema.properties.createcontainer.oneOf.some(schema => schema.type === 'string'));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://api.scryfall.com/cards/stx/211');
    return Response.json({
      id: 'prismari-charm-id',
      name: 'Prismari Charm',
      set: 'stx',
      set_name: 'Strixhaven: School of Mages',
      collector_number: '211',
      lang: 'en',
      rarity: 'uncommon',
      cmc: 3,
      colors: ['U', 'R'],
      color_identity: ['U', 'R'],
      type_line: 'Instant',
      oracle_text: 'Choose one...',
      legalities: { commander: 'legal' },
      finishes: ['nonfoil', 'foil'],
      image_uris: { normal: 'https://img.test/prismari.jpg' },
      prices: { usd: '0.10', usd_foil: '0.30' },
      scryfall_uri: 'https://scryfall.test/card/stx/211/prismari-charm',
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'prismari charm',
      setCode: 'stx',
      collectorNumber: '211',
      qty: '2',
      finish: 'foil',
      condition: 'nm',
      location: 'box spells',
      createcontainer: 'true',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'preview');
    assert.equal(data.previewType, 'inventory.add');
    assert.equal(data.card.name, 'Prismari Charm');
    assert.match(data.summary, /Added 2 Prismari Charm to \{loc:box:spells\}/);
    const applied = await callTool(env, token.access_token, 'apply_collection_change', {
      changeToken: data.changeToken,
    });
    assert.equal(applied.result.structuredContent.status, 'applied');
    assert.equal(state.snapshot.app.containers['box:spells'].type, 'box');
    assert.equal(state.snapshot.app.collection[0].qty, 2);
    assert.equal(state.snapshot.app.collection[0].finish, 'foil');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add rejects a guessed printing instead of falling back to card name', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url) === 'https://api.scryfall.com/cards/ddu/179') {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    throw new Error('should not resolve guessed printings by name');
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'dreamroot cascade',
      setCode: 'ddu',
      cn: '179',
      qty: 1,
      finish: 'nonfoil',
      condition: 'nm',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_clarification');
    assert.equal(data.changeToken, undefined);
    assert.match(data.message, /not found/i);
    assert.deepEqual(urls, ['https://api.scryfall.com/cards/ddu/179']);
    assert.equal(state.snapshot.app.collection.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: stale preview tokens are rejected on apply', async () => {
  const entry = card();
  const { env, state } = fakeSyncEnv(emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  }), 1);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_move_inventory_item', {
    itemKey: collectionKey(entry),
    toLocation: 'binder staples',
    createContainer: true,
  });
  state.revision += 1;
  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: preview.result.structuredContent.changeToken,
  });
  assert.equal(applied.error.code, -32000);
  assert.match(applied.error.message, /changed since preview/);
  assert.equal(applied.error.data.expectedRevision, 1);
  assert.equal(applied.error.data.actualRevision, 2);
});

test('mcp: apply rejects older add tokens with incomplete card metadata', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot(), 1);
  const token = await issueMcpToken(env);
  const partialEntry = {
    name: 'Dreamroot Cascade',
    resolvedName: 'Dreamroot Cascade',
    setCode: 'ddu',
    cn: '179',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: null,
  };
  const ops = [
    {
      id: 'old-add-op',
      type: 'collection.qtyDelta',
      createdAt: Date.now(),
      payload: { key: 'ddu:179:Dreamroot Cascade:normal:near_mint:en:', delta: 1, entry: partialEntry },
    },
    {
      id: 'old-history-op',
      type: 'history.append',
      createdAt: Date.now(),
      payload: {
        event: {
          id: 'old-event',
          type: 'add',
          summary: 'Added 1 Dreamroot Cascade',
          source: 'mcp',
          mcp: { changeId: 'old-change' },
        },
      },
    },
  ];
  const changeToken = signTestChangeToken({
    userId: 'user_1',
    scopes: ['collection.read', 'collection.write'],
    expectedRevision: 1,
    changeId: 'old-change',
    summary: 'Added 1 Dreamroot Cascade',
    ops,
    expiresAt: Date.now() + 60_000,
  });

  const applied = await callTool(env, token.access_token, 'apply_collection_change', { changeToken });
  assert.equal(applied.error.code, -32000);
  assert.match(applied.error.message, /incomplete card metadata/);
  assert.deepEqual(applied.error.data.missingFields.sort(), ['finishes', 'imageUrl', 'rarity', 'scryfallId', 'setName', 'typeLine'].sort());
  assert.equal(state.snapshot.app.collection.length, 0);
});

test('mcp: apply endpoint can commit multiple preview tokens in one sync push', async () => {
  const { env, state } = fakeSyncEnv(emptySnapshot(), 7);
  const token = await issueMcpToken(env);
  const box = await callTool(env, token.access_token, 'preview_create_container', {
    type: 'box',
    name: 'bulk',
  });
  const binder = await callTool(env, token.access_token, 'preview_create_container', {
    type: 'binder',
    name: 'trades',
  });

  const res = await worker.fetch(new Request('https://example.com/mcp/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-User': 'user_1',
    },
    body: JSON.stringify({
      changeTokens: [
        box.result.structuredContent.changeToken,
        binder.result.structuredContent.changeToken,
      ],
    }),
  }), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'applied');
  assert.equal(data.summary, 'Applied 2 previewed collection changes');
  assert.equal(state.snapshot.app.containers['box:bulk'].type, 'box');
  assert.equal(state.snapshot.app.containers['binder:trades'].type, 'binder');
  assert.equal(state.snapshot.history.length, 2);
  assert.ok(state.snapshot.history[0].mcp.beforeSnapshot.app.containers['box:bulk']);
  assert.equal(state.snapshot.history[1].mcp.beforeSnapshot.app.containers['box:bulk'], undefined);
});

test('mcp: deleting a non-empty storage container clears locations without deleting cards', async () => {
  const entry = card({ location: { type: 'binder', name: 'trade' } });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'binder:trade': { type: 'binder', name: 'trade' } },
  });
  const { env, state } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_delete_container', {
    location: 'binder trade',
  });
  assert.match(preview.result.structuredContent.summary, /cleared 1 card/);
  const applied = await callTool(env, token.accessToken || token.access_token, 'apply_collection_change', {
    changeToken: preview.result.structuredContent.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.equal(state.snapshot.app.collection.length, 1);
  assert.equal(state.snapshot.app.collection[0].location, null);
  assert.equal(state.snapshot.app.containers['binder:trade'], undefined);
});

test('mcp chat: provider API key is not persisted or echoed in errors', async () => {
  const { env } = fakeSyncEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: 'bad key sk-test-secret' } }, { status: 401 });
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test-secret',
        messages: [{ role: 'user', content: 'what is in my binders?' }],
      }),
    }), env);
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.doesNotMatch(data.error, /sk-test-secret/);
    assert.equal(env.OAUTH_KV.values.size > 0, true);
    assert.equal([...env.OAUTH_KV.values.values()].some(value => String(value).includes('sk-test-secret')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted chat can be disabled before auth or provider calls', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_ENABLED = '0';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ output_text: 'unexpected' });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test-secret',
        messages: [{ role: 'user', content: 'ping' }],
      }),
    }), env);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.match(data.error, /disabled/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: OpenAI remote MCP receives the raw MCP token', async () => {
  const { env } = fakeSyncEnv();
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    requestBody = JSON.parse(init.body);
    return Response.json({ output_text: 'ok' });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test-secret',
        messages: [{ role: 'user', content: 'is this working?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    assert.ok(requestBody);
    const mcpTool = requestBody.tools.find(tool => tool.type === 'mcp');
    assert.ok(mcpTool.authorization.startsWith('mcp_at_'));
    assert.doesNotMatch(mcpTool.authorization, /^Bearer\s+/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted OpenAI key is used when no BYOK key is supplied', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_OPENAI_API_KEY = 'sk-hosted-secret';
  const originalFetch = globalThis.fetch;
  let authHeader = '';
  let requestBody = null;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    authHeader = init.headers.Authorization;
    requestBody = JSON.parse(init.body);
    return Response.json({ output_text: 'hosted ok' });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        messages: [{ role: 'user', content: 'is this working?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.mode, 'hosted');
    assert.equal(data.model, 'gpt-5-nano');
    assert.equal(authHeader, 'Bearer sk-hosted-secret');
    assert.equal(requestBody.max_output_tokens, 1000);
    assert.equal([...env.OAUTH_KV.values.values()].some(value => String(value).includes('sk-hosted-secret')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted Groq key is used by default with preview-only remote MCP tools', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  let authHeader = '';
  let requestBody = null;
  const preview = {
    status: 'preview',
    previewType: 'inventory.add',
    summary: 'Added 1 Maelstrom Artisan',
    expectedRevision: 3,
    expiresAt: '2026-05-04T12:00:00.000Z',
    changeToken: 'preview.token',
    opCount: 2,
    totalsAfter: { unique: 1, total: 1, containers: 0 },
    card: { name: 'Maelstrom Artisan', setCode: 'znr', cn: '220', finish: 'normal', qty: 1 },
  };
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/responses');
    authHeader = init.headers.Authorization;
    requestBody = JSON.parse(init.body);
    return Response.json({
      output_text: 'groq ok',
      output: [{
        type: 'mcp_call',
        name: 'preview_add_inventory_item',
        result: {
          content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }],
          structuredContent: preview,
        },
      }],
    });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'add a maelstrom artisan' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'groq');
    assert.equal(data.mode, 'hosted');
    assert.equal(data.model, 'openai/gpt-oss-120b');
    assert.equal(authHeader, 'Bearer gsk-hosted-secret');
    const mcpTool = requestBody.tools.find(tool => tool.type === 'mcp');
    assert.equal(mcpTool.headers.Authorization.startsWith('Bearer mcp_at_'), true);
    assert.equal(mcpTool.require_approval, 'never');
    assert.ok(mcpTool.allowed_tools.includes('preview_create_container'));
    assert.equal(mcpTool.allowed_tools.includes('apply_collection_change'), false);
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].changeToken, 'preview.token');
    assert.equal(data.previews[0].summary, 'Added 1 Maelstrom Artisan');
    assert.equal(data.previews[0].expectedRevision, 3);
    assert.equal([...env.OAUTH_KV.values.values()].some(value => String(value).includes('gsk-hosted-secret')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: add input needs are returned as app-renderable drafts', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const draft = {
    status: 'needs_input',
    previewType: 'inventory.add',
    message: 'Choose the exact printing and missing copy details, then create a preview.',
    missingFields: ['printing', 'qty', 'finish', 'condition'],
    query: 'petrified hamlet',
    resolvedName: 'Petrified Hamlet',
    candidates: [{
      name: 'Petrified Hamlet',
      scryfallId: 'hamlet-tdm-1',
      setCode: 'tdm',
      setName: 'Tarkir: Dragonstorm',
      collectorNumber: '276',
      rarity: 'rare',
      finishes: ['nonfoil', 'foil'],
      previewAddArgs: {
        scryfallId: 'hamlet-tdm-1',
        name: 'Petrified Hamlet',
        setCode: 'tdm',
        cn: '276',
      },
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: 'I need more info.',
    output: [{
      type: 'mcp_call',
      name: 'preview_add_inventory_item',
      result: { structuredContent: draft },
    }],
  });
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'add petrified hamlet' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Choose options below.');
    assert.equal(data.previews.length, 0);
    assert.equal(data.drafts.length, 1);
    assert.equal(data.drafts[0].missingFields.includes('condition'), true);
    assert.equal(data.drafts[0].candidates[0].previewAddArgs.scryfallId, 'hamlet-tdm-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: inventory read results are returned as app-renderable cards', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const inventory = {
    revision: 12,
    results: [{
      itemKey: 'card-1',
      name: 'Maelstrom Artisan // Rocket Volley',
      scryfallId: 'sos-122',
      setCode: 'sos',
      cn: '122',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      tags: ['spells'],
      price: 0.26,
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: 'Here is what I found.',
    output: [{
      type: 'mcp_call',
      name: 'search_inventory',
      result: { structuredContent: inventory },
    }],
  });
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'what instants do i have?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.cards.length, 1);
    assert.equal(data.cards[0].itemKey, 'card-1');
    assert.equal(data.cards[0].name, 'Maelstrom Artisan // Rocket Volley');
    assert.deepEqual(data.cards[0].location, { type: 'binder', name: 'trade binder' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: inventory cards drop placeholders and respect requested finish', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const inventory = {
    revision: 12,
    results: [{
      itemKey: 'card-foil',
      name: 'Breya, Etherium Shaper',
      scryfallId: 'breya-1',
      setCode: 'c16',
      cn: '29',
      finish: 'foil',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'box', name: 'bulk' },
    }, {
      itemKey: 'card-normal',
      name: 'Ancient Tomb',
      scryfallId: 'tomb-1',
      setCode: 'tmp',
      cn: '315',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: '',
    output: [{
      type: 'mcp_call',
      name: 'search_inventory',
      result: {
        structuredContent: inventory,
        debugEcho: { itemKey: 'not-a-card' },
      },
    }],
  });
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'what foils do i have?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.cards.length, 1);
    assert.equal(data.cards[0].itemKey, 'card-foil');
    assert.equal(data.cards[0].name, 'Breya, Etherium Shaper');
    assert.equal(data.cards[0].finish, 'foil');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: mismatched add previews are not offered for approval', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const preview = {
    status: 'preview',
    previewType: 'inventory.add',
    summary: 'Added 1 Chandra, Torch of Defiance',
    expectedRevision: 3,
    expiresAt: '2026-05-04T12:00:00.000Z',
    changeToken: 'wrong.token',
    opCount: 2,
    card: { name: 'Chandra, Torch of Defiance', setCode: 'kld', cn: '110', finish: 'foil', qty: 1 },
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/responses');
    return Response.json({
      output_text: 'It looks like the card was added successfully.',
      output: [{
        type: 'mcp_call',
        name: 'preview_add_inventory_item',
        result: { structuredContent: preview },
      }],
    });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'add a foil prismari charm 0211 to my collection' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.previews, []);
    assert.equal(data.previewWarnings.length, 1);
    assert.match(data.previewWarnings[0], /Chandra, Torch of Defiance/);
    assert.match(data.previewWarnings[0], /prismari charm/);
    assert.equal(data.text, data.previewWarnings[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: duplicate add previews are reduced to the requested quantity', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const oneCopy = {
    status: 'preview',
    previewType: 'inventory.add',
    summary: 'Added 1 Dreamroot Cascade',
    expectedRevision: 70,
    expiresAt: '2026-05-04T12:00:00.000Z',
    changeToken: 'one.token',
    opCount: 2,
    card: { name: 'Dreamroot Cascade', setCode: 'eoe', cn: '276', finish: 'normal', qty: 1 },
  };
  const twoCopies = {
    ...oneCopy,
    summary: 'Added 2 Dreamroot Cascade',
    changeToken: 'two.token',
    card: { ...oneCopy.card, qty: 2 },
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/responses');
    return Response.json({
      output_text: '2 previews ready below.',
      output: [{
        type: 'mcp_call',
        name: 'preview_add_inventory_item',
        result: { structuredContent: oneCopy },
      }, {
        type: 'mcp_call',
        name: 'preview_add_inventory_item',
        result: { structuredContent: twoCopies },
      }],
    });
  };
  try {
    let res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'add a dreamroot cascade to my collection' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    let data = await res.json();
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].changeToken, 'one.token');
    assert.equal(data.previewWarnings.length, 1);
    assert.match(data.previewWarnings[0], /multiple add previews/);

    res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'add two dreamroot cascade to my collection' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    data = await res.json();
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].changeToken, 'two.token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted quota blocks provider calls after the daily limit', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_OPENAI_API_KEY = 'sk-hosted-secret';
  env.MTGCOLLECTION_CHAT_DAILY_LIMIT = '1';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ output_text: 'ok' });
  };
  try {
    const request = () => new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    assert.equal((await worker.fetch(request(), env)).status, 200);
    const blocked = await worker.fetch(request(), env);
    assert.equal(blocked.status, 429);
    const data = await blocked.json();
    assert.match(data.error, /daily limit/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: chat MCP token can preview but cannot apply', async () => {
  const { env } = fakeSyncEnv();
  const originalFetch = globalThis.fetch;
  let mcpToken = '';
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const requestBody = JSON.parse(init.body);
    mcpToken = requestBody.tools.find(tool => tool.type === 'mcp').authorization;
    return Response.json({ output_text: 'ok' });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test-secret',
        messages: [{ role: 'user', content: 'create a box named demo' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    assert.match(mcpToken, /^mcp_at_/);

    const listed = await rpc(env, mcpToken, 'tools/list');
    const names = listed.result.tools.map(tool => tool.name);
    assert.ok(names.includes('preview_create_container'));
    assert.equal(names.includes('apply_collection_change'), false);
    assert.equal(names.includes('undo_last_mcp_change'), false);

    const preview = await callTool(env, mcpToken, 'preview_create_container', { type: 'box', name: 'demo' });
    assert.equal(preview.result.structuredContent.status, 'preview');
    const applied = await callTool(env, mcpToken, 'apply_collection_change', {
      changeToken: preview.result.structuredContent.changeToken,
    });
    assert.equal(applied.error.code, -32003);
    assert.match(applied.error.message, /chat preview/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
