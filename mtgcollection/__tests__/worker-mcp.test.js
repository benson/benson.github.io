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
  assert.ok(listed.result.tools.some(tool => tool.name === 'get_agent_guide'));
  assert.ok(listed.result.tools.some(tool => tool.name === 'preview_create_container'));
  assert.ok(listed.result.tools.some(tool => tool.name === 'apply_collection_change'));
});

test('mcp: agent guide is exposed as tool, resource, and prompt', async () => {
  const { env } = fakeSyncEnv();
  const token = await issueMcpToken(env);

  const initialized = await rpc(env, token.access_token, 'initialize');
  assert.ok(initialized.result.capabilities.resources);
  assert.ok(initialized.result.capabilities.prompts);

  const tool = await callTool(env, token.access_token, 'get_agent_guide');
  assert.match(tool.result.structuredContent.text, /regular printing/);
  assert.match(tool.result.structuredContent.text, /decklist/);

  const resources = await rpc(env, token.access_token, 'resources/list');
  assert.equal(resources.result.resources[0].uri, 'mtgcollection://agent-guide');
  const resource = await rpc(env, token.access_token, 'resources/read', { uri: 'mtgcollection://agent-guide' });
  assert.match(resource.result.contents[0].text, /unique cards/);

  const prompts = await rpc(env, token.access_token, 'prompts/list');
  assert.equal(prompts.result.prompts[0].name, 'mtg_collection_agent_guide');
  const prompt = await rpc(env, token.access_token, 'prompts/get', { name: 'mtg_collection_agent_guide' });
  assert.match(prompt.result.messages[0].content.text, /preview_edit_inventory_item/);
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

test('mcp: move preview without a destination returns the matched card', async () => {
  const entry = card({
    name: 'Force of Will',
    resolvedName: 'Force of Will',
    scryfallId: 'force-1',
    setCode: '2xm',
    cn: '51',
    location: { type: 'binder', name: 'trade binder' },
    price: 75.04,
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'binder:trade binder': { type: 'binder', name: 'trade binder' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_move_inventory_item', {
    query: 'force of will',
    location: 'trade binder',
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'invalid');
  assert.match(data.error, /toLocation/);
  assert.equal(data.card.itemKey, collectionKey(entry));
  assert.equal(data.card.name, 'Force of Will');
  assert.deepEqual(data.card.location, { type: 'binder', name: 'trade binder' });
  assert.equal(data.candidates[0].itemKey, collectionKey(entry));
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

test('mcp: search_inventory broad reads default above twenty cards', async () => {
  const collection = Array.from({ length: 23 }, (_, index) => card({
    name: 'Foil Card ' + (index + 1),
    resolvedName: 'Foil Card ' + (index + 1),
    scryfallId: 'foil-' + (index + 1),
    cn: String(index + 1),
    finish: 'foil',
  }));
  const { env } = fakeSyncEnv(emptySnapshot({ collection }));
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    query: 'foils',
  });
  const data = searched.result.structuredContent;
  assert.equal(data.limit, 100);
  assert.equal(data.results.length, 23);
  assert.equal(data.results.every(result => result.finish === 'foil'), true);
});

test('mcp: search_inventory supports most-expensive price questions', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Budget Card', resolvedName: 'Budget Card', scryfallId: 'budget-1', price: 0.5 }),
      card({ name: 'Chase Card', resolvedName: 'Chase Card', scryfallId: 'chase-1', price: 42.25, qty: 2 }),
      card({ name: 'Middle Card', resolvedName: 'Middle Card', scryfallId: 'middle-1', price: 5 }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    query: "what's the most expensive card in my collection?",
    limit: 1,
  });
  const results = searched.result.structuredContent.results;
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Chase Card');
  assert.equal(results[0].price, 42.25);
  assert.equal(results[0].totalValue, 84.5);
});

test('mcp: search_inventory supports price, quantity, and type filters', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Sol Ring', resolvedName: 'Sol Ring', scryfallId: 'sol-ring-1', price: 2.5, qty: 7, typeLine: 'Artifact' }),
      card({ name: 'Counterspell', resolvedName: 'Counterspell', scryfallId: 'counterspell-1', price: 3, qty: 4, typeLine: 'Instant' }),
      card({ name: 'Island', resolvedName: 'Island', scryfallId: 'island-1', price: 0.05, qty: 30, typeLine: 'Basic Land - Island' }),
      card({ name: 'Arcane Signet', resolvedName: 'Arcane Signet', scryfallId: 'signet-1', price: 1.25, qty: 12, typeLine: 'Artifact' }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    minPrice: 2,
    minQty: 4,
    cardType: 'artifact',
    sortBy: 'qty',
    sortDirection: 'desc',
  });
  const results = searched.result.structuredContent.results;
  assert.deepEqual(results.map(result => result.name), ['Sol Ring']);
  assert.equal(results[0].typeLine, 'Artifact');
  assert.equal(results[0].qty, 7);
});

test('mcp: search_inventory can infer broad filters from natural query text', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Breya, Etherium Shaper', resolvedName: 'Breya, Etherium Shaper', scryfallId: 'breya-1', price: 12, finish: 'foil', condition: 'near_mint', typeLine: 'Legendary Artifact Creature' }),
      card({ name: 'Ancient Tomb', resolvedName: 'Ancient Tomb', scryfallId: 'tomb-1', price: 80, finish: 'normal', condition: 'near_mint', typeLine: 'Land' }),
      card({ name: 'Damaged Foil Island', resolvedName: 'Damaged Foil Island', scryfallId: 'island-foil-1', price: 0.5, finish: 'foil', condition: 'damaged', typeLine: 'Basic Land' }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    query: 'show me near mint foil artifacts worth more than $2',
  });
  const results = searched.result.structuredContent.results;
  assert.deepEqual(results.map(result => result.name), ['Breya, Etherium Shaper']);
  assert.equal(results[0].finish, 'foil');
  assert.equal(results[0].condition, 'near_mint');
  assert.equal(results[0].price, 12);
});

test('mcp: search_inventory matches punctuation-insensitive plural card names', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Glint-Nest Crane', resolvedName: 'Glint-Nest Crane', scryfallId: 'crane-1', price: 0.14 }),
      card({ name: 'Gilded Goose', resolvedName: 'Gilded Goose', scryfallId: 'goose-1', price: 1.5 }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    query: 'do i have any glint nest cranes?',
  });
  const results = searched.result.structuredContent.results;
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Glint-Nest Crane');
});

test('mcp: search_inventory resolves bare location names to existing containers', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Breya, Etherium Shaper', resolvedName: 'Breya, Etherium Shaper', scryfallId: 'breya-1', price: 12, location: { type: 'box', name: 'bulk' } }),
      card({ name: 'Mana Crypt', resolvedName: 'Mana Crypt', scryfallId: 'crypt-1', price: 180, location: { type: 'deck', name: 'breya artifacts' } }),
      card({ name: 'Dockside Extortionist', resolvedName: 'Dockside Extortionist', scryfallId: 'dockside-1', price: 65, location: { type: 'deck', name: 'breya artifacts' } }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'deck:breya artifacts': { type: 'deck', name: 'breya artifacts' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const searched = await callTool(env, token.access_token, 'search_inventory', {
    location: 'breya artifacts',
    sortBy: 'price',
    sortDirection: 'desc',
    limit: 1,
  });
  const results = searched.result.structuredContent.results;
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Mana Crypt');
  assert.deepEqual(results[0].location, { type: 'deck', name: 'breya artifacts' });

  const fuzzy = await callTool(env, token.access_token, 'search_inventory', {
    location: 'bulk',
    sortBy: 'price',
    sortDirection: 'desc',
    limit: 1,
  });
  assert.equal(fuzzy.result.structuredContent.results[0].name, 'Breya, Etherium Shaper');
});

test('mcp: collection summary includes price rollups when available', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({ name: 'Cheap Card', resolvedName: 'Cheap Card', scryfallId: 'cheap-1', price: 1, qty: 3 }),
      card({ name: 'Expensive Card', resolvedName: 'Expensive Card', scryfallId: 'expensive-1', price: 10, qty: 1 }),
      card({ name: 'Unpriced Card', resolvedName: 'Unpriced Card', scryfallId: 'unpriced-1', price: null }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const summary = await callTool(env, token.access_token, 'get_collection_summary');
  const data = summary.result.structuredContent;
  assert.equal(data.totalValue, 13);
  assert.equal(data.pricedEntries, 2);
  assert.equal(data.unpricedEntries, 1);
  assert.equal(data.mostExpensiveCard.name, 'Expensive Card');
  assert.equal(data.mostValuableStack.name, 'Expensive Card');
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

test('mcp: preview edit inventory can combine move and finish changes', async () => {
  const entry = card({
    name: 'Glint-Nest Crane',
    resolvedName: 'Glint-Nest Crane',
    scryfallId: 'glint-nest-crane-1',
    setCode: 'kld',
    cn: '50',
    finish: 'normal',
    finishes: ['nonfoil', 'foil'],
    location: { type: 'box', name: 'bulk' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env, state } = fakeSyncEnv(snapshot, 9);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_edit_inventory_item', {
    query: 'glint nest crane',
    toLocation: 'trade binder',
    finish: 'foil',
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'preview');
  assert.equal(data.previewType, 'inventory.edit');
  assert.match(data.summary, /Updated 1 Glint-Nest Crane/);
  assert.match(data.summary, /\{loc:binder:trade binder\}/);
  assert.match(data.summary, /finish normal to foil/);
  assert.equal(data.card.finish, 'foil');
  assert.deepEqual(data.card.location, { type: 'binder', name: 'trade binder' });

  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: data.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.equal(state.snapshot.app.collection.length, 1);
  assert.equal(state.snapshot.app.collection[0].finish, 'foil');
  assert.deepEqual(state.snapshot.app.collection[0].location, { type: 'binder', name: 'trade binder' });
});

test('mcp: destination aliases resolve existing deck boxes', async () => {
  const entry = card({
    name: 'Counterspell',
    resolvedName: 'Counterspell',
    scryfallId: 'counterspell-1',
    setCode: '2xm',
    cn: '47',
    qty: 2,
    location: { type: 'binder', name: 'trade binder' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: {
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
      'deck:breya artifacts': {
        type: 'deck',
        name: 'breya artifacts',
        deck: { title: 'Breya Artifacts', format: 'commander' },
        deckList: [],
      },
    },
  });
  const { env, state } = fakeSyncEnv(snapshot, 9);
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_move_inventory_item', {
    query: 'counterspell',
    fromLocation: 'trade binder',
    toLocation: 'breya deck box',
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'preview');
  assert.match(data.summary, /\{loc:deck:breya artifacts\}/);

  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: data.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.deepEqual(state.snapshot.app.collection[0].location, { type: 'deck', name: 'breya artifacts' });
});

test('mcp: preview delete inventory item removes a physical card', async () => {
  const entry = card({
    name: 'Great Furnace',
    resolvedName: 'Great Furnace',
    scryfallId: 'great-furnace-1',
    setCode: 'sld',
    cn: '303',
    finish: 'foil',
  });
  const { env, state } = fakeSyncEnv(emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  }));
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_delete_inventory_item', {
    query: 'great furnace',
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'preview');
  assert.equal(data.previewType, 'inventory.delete');
  assert.equal(data.card.name, 'Great Furnace');
  assert.match(data.summary, /Deleted 1 Great Furnace/);

  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: data.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.equal(state.snapshot.app.collection.length, 0);
});

test('mcp: preview duplicate inventory item adds another same-stack copy', async () => {
  const entry = card({
    name: 'Force of Will',
    resolvedName: 'Force of Will',
    scryfallId: 'force-of-will-1',
    setCode: '2xm',
    cn: '51',
    location: { type: 'binder', name: 'trade binder' },
  });
  const { env, state } = fakeSyncEnv(emptySnapshot({
    collection: [entry],
    containers: { 'binder:trade binder': { type: 'binder', name: 'trade binder' } },
  }));
  const token = await issueMcpToken(env);
  const preview = await callTool(env, token.access_token, 'preview_duplicate_inventory_item', {
    query: 'force of will',
    targetQty: 2,
  });
  const data = preview.result.structuredContent;
  assert.equal(data.status, 'preview');
  assert.equal(data.previewType, 'inventory.add');
  assert.equal(data.card.name, 'Force of Will');
  assert.equal(data.card.qty, 1);
  assert.equal(data.card.totalQtyAfter, 2);

  const applied = await callTool(env, token.access_token, 'apply_collection_change', {
    changeToken: data.changeToken,
  });
  assert.equal(applied.result.structuredContent.status, 'applied');
  assert.equal(state.snapshot.app.collection.length, 1);
  assert.equal(state.snapshot.app.collection[0].qty, 2);
});

test('mcp: preview replace inventory printing swaps Scryfall metadata', async () => {
  const entry = card({
    name: 'Cyclonic Rift',
    resolvedName: 'Cyclonic Rift',
    scryfallId: 'cyclonic-rift-rtr',
    setCode: 'rtr',
    setName: 'Return to Ravnica',
    cn: '35',
    finish: 'normal',
    location: { type: 'box', name: 'bulk' },
  });
  const { env, state } = fakeSyncEnv(emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  }));
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://api.scryfall.com/cards/sld/999');
    return Response.json({
      id: 'cyclonic-rift-sld',
      name: 'Cyclonic Rift',
      set: 'sld',
      set_name: 'Secret Lair Drop',
      collector_number: '999',
      lang: 'en',
      rarity: 'rare',
      cmc: 2,
      colors: ['U'],
      color_identity: ['U'],
      type_line: 'Instant',
      oracle_text: 'Return target nonland permanent...',
      legalities: { commander: 'legal' },
      finishes: ['foil'],
      image_uris: { normal: 'https://img.test/rift-sld.jpg' },
      prices: { usd_foil: '42.00' },
      scryfall_uri: 'https://scryfall.test/card/sld/999/cyclonic-rift',
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_replace_inventory_printing', {
      itemKey: collectionKey(entry),
      targetSetCode: 'sld',
      targetCn: '999',
      finish: 'foil',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'preview');
    assert.equal(data.previewType, 'inventory.edit');
    assert.equal(data.card.name, 'Cyclonic Rift');
    assert.equal(data.card.setCode, 'sld');
    assert.equal(data.card.cn, '999');
    assert.equal(data.card.finish, 'foil');
    assert.match(data.summary, /printing RTR #35 to SLD #999/i);

    const applied = await callTool(env, token.access_token, 'apply_collection_change', {
      changeToken: data.changeToken,
    });
    assert.equal(applied.result.structuredContent.status, 'applied');
    assert.equal(state.snapshot.app.collection[0].scryfallId, 'cyclonic-rift-sld');
    assert.equal(state.snapshot.app.collection[0].setCode, 'sld');
    assert.equal(state.snapshot.app.collection[0].cn, '999');
    assert.equal(state.snapshot.app.collection[0].finish, 'foil');
    assert.equal(state.snapshot.app.collection[0].condition, 'near_mint');
    assert.deepEqual(state.snapshot.app.collection[0].location, { type: 'box', name: 'bulk' });
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('mcp: preview add treats regular printing as a style hint, not card name text', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const text = String(url);
    assert.match(text, /\/cards\/search\?/);
    assert.match(decodeURIComponent(text), /!"Serra Angel"/);
    assert.doesNotMatch(decodeURIComponent(text), /regular printing/i);
    return Response.json({
      total_cards: 2,
      has_more: false,
      data: [
        {
          id: 'serra-promo',
          name: 'Serra Angel',
          set: 'p30a',
          set_name: '30th Anniversary Promos',
          set_type: 'promo',
          collector_number: '1s',
          released_at: '2022-01-01',
          rarity: 'rare',
          type_line: 'Creature - Angel',
          finishes: ['foil'],
          promo: true,
          booster: false,
          full_art: true,
          frame_effects: ['showcase'],
          image_uris: { normal: 'https://img.test/serra-promo.jpg' },
          scryfall_uri: 'https://scryfall.test/card/promo/serra',
        },
        {
          id: 'serra-base',
          name: 'Serra Angel',
          set: 'fdn',
          set_name: 'Foundations',
          set_type: 'core',
          collector_number: '144',
          released_at: '2024-11-15',
          rarity: 'uncommon',
          type_line: 'Creature - Angel',
          finishes: ['nonfoil', 'foil'],
          promo: false,
          booster: true,
          full_art: false,
          frame_effects: [],
          image_uris: { normal: 'https://img.test/serra-base.jpg' },
          scryfall_uri: 'https://scryfall.test/card/fdn/144/serra-angel',
        },
      ],
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'Serra Angel, the regular printing',
      qty: 1,
      condition: 'nm',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_input');
    assert.ok(data.missingFields.includes('finish'));
    assert.ok(data.missingFields.includes('printing'));
    assert.equal(data.candidates[0].setCode, 'fdn');
    assert.equal(data.candidates[0].scryfallId, 'serra-base');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add rejects exact printing arguments that resolve to a different card name', async () => {
  const snapshot = emptySnapshot({
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/cards\/cmm\/400$/);
    return Response.json({
      id: 'myr-sire-cmm-400',
      name: 'Myr Sire',
      set: 'cmm',
      set_name: 'Commander Masters',
      collector_number: '400',
      lang: 'en',
      rarity: 'common',
      type_line: 'Artifact Creature - Phyrexian Myr',
      finishes: ['nonfoil', 'foil'],
      image_uris: { normal: 'https://img.test/myr-sire.jpg' },
      prices: { usd: '0.17' },
      scryfall_uri: 'https://scryfall.test/card/cmm/400/myr-sire',
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'Sol Ring',
      setCode: 'cmm',
      cn: '400',
      finish: 'normal',
      condition: 'near_mint',
      qty: 2,
      location: { type: 'box', name: 'bulk' },
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_clarification');
    assert.equal(data.changeToken, undefined);
    assert.match(data.message, /resolves to "Myr Sire", not "Sol Ring"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp: preview add inventory includes and ranks older edition hints', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  const recent = Array.from({ length: 13 }, (_, index) => ({
    id: 'serra-recent-' + index,
    name: 'Serra Angel',
    set: index === 0 ? 'fdn' : 'sld',
    set_name: index === 0 ? 'Foundations' : 'Secret Lair Drop',
    collector_number: String(100 + index),
    released_at: '2024-01-' + String(index + 1).padStart(2, '0'),
    rarity: 'uncommon',
    type_line: 'Creature - Angel',
    finishes: ['foil'],
    image_uris: { normal: 'https://img.test/serra-' + index + '.jpg' },
    scryfall_uri: 'https://scryfall.test/card/recent/' + index,
  }));
  globalThis.fetch = async url => {
    assert.match(String(url), /\/cards\/search\?/);
    return Response.json({
      total_cards: 14,
      has_more: false,
      data: [
        ...recent,
        {
          id: 'serra-7ed-foil',
          name: 'Serra Angel',
          set: '7ed',
          set_name: 'Seventh Edition',
          collector_number: '42★',
          released_at: '2001-04-11',
          rarity: 'uncommon',
          type_line: 'Creature - Angel',
          finishes: ['foil'],
          image_uris: { normal: 'https://img.test/serra-7ed.jpg' },
          scryfall_uri: 'https://scryfall.test/card/7ed/42/star/serra-angel',
        },
      ],
    });
  };
  try {
    const preview = await callTool(env, token.access_token, 'preview_add_inventory_item', {
      name: 'serra angel',
      edition: '7th ed',
      qty: 1,
      finish: 'foil',
      condition: 'nm',
      location: 'trade binder',
    });
    const data = preview.result.structuredContent;
    assert.equal(data.status, 'needs_input');
    assert.deepEqual(data.missingFields, ['printing']);
    assert.equal(data.candidates.length, 14);
    assert.equal(data.candidates[0].setCode, '7ed');
    assert.equal(data.candidates[0].setName, 'Seventh Edition');
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

test('mcp: search card printings suggests nearby names when no card matches', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  const token = await issueMcpToken(env);
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).includes('/cards/search?')) {
      return Response.json({ total_cards: 0, has_more: false, data: [] });
    }
    if (String(url).includes('/cards/named?')) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    if (String(url).includes('/cards/autocomplete?')) {
      return Response.json({ data: ['Lorehold Apprentice', 'Lorehold Command', 'Lorehold Campus'] });
    }
    throw new Error('unexpected Scryfall URL: ' + url);
  };
  try {
    const lookup = await callTool(env, token.access_token, 'search_card_printings', {
      name: 'lorehold captain',
      finish: 'foil',
      limit: 5,
    });
    const data = lookup.result.structuredContent;
    assert.equal(data.status, 'not_found');
    assert.equal(data.query, 'lorehold captain');
    assert.deepEqual(data.suggestions.slice(0, 2), ['Lorehold Apprentice', 'Lorehold Command']);
    assert.match(data.message, /real Magic card matching "lorehold captain"/i);
    assert.match(data.message, /Lorehold Apprentice/);
    assert.ok(urls.some(url => url.includes('/cards/autocomplete?')));
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

test('mcp chat: hosted Cloudflare Workers AI uses the local preview tool loop', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Ragavan, Nimble Pilferer',
        resolvedName: 'Ragavan, Nimble Pilferer',
        scryfallId: 'ragavan-1',
        setCode: 'mul',
        cn: '86',
        finish: 'foil',
        location: { type: 'binder', name: 'trade binder' },
        price: 55,
      }),
    ],
    containers: {
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  let firstPayload = null;
  let secondPayload = null;
  env.AI = {
    async run(model, payload) {
      assert.equal(model, '@cf/openai/gpt-oss-120b');
      calls += 1;
      if (calls === 1) {
        firstPayload = payload;
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { finish: 'foil', limit: 100 },
          }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        };
      }
      secondPayload = payload;
      return {
        response: 'Here are your foils.',
        usage: { prompt_tokens: 140, completion_tokens: 8 },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'what foils do i have?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'cloudflare');
    assert.equal(data.mode, 'hosted');
    assert.equal(data.model, '@cf/openai/gpt-oss-120b');
    assert.equal(calls, 2);
    assert.ok(firstPayload.tools.some(tool => tool.function?.name === 'search_inventory'));
    assert.equal(firstPayload.tools.some(tool => tool.function?.name === 'apply_collection_change'), false);
    assert.ok(secondPayload.messages.some(message => message.role === 'tool' && /Ragavan/.test(message.content)));
    assert.equal(data.text, 'I found 1 foil card from your collection. It is shown below.');
    assert.equal(data.cards.length, 1);
    assert.equal(data.cards[0].name, 'Ragavan, Nimble Pilferer');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted Cloudflare can preview combined inventory edits', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Glint-Nest Crane',
        resolvedName: 'Glint-Nest Crane',
        scryfallId: 'glint-nest-crane-1',
        setCode: 'kld',
        cn: '50',
        finish: 'normal',
        finishes: ['nonfoil', 'foil'],
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  let firstPayload = null;
  env.AI = {
    async run(model, payload) {
      assert.equal(model, '@cf/openai/gpt-oss-120b');
      calls += 1;
      if (calls === 1) {
        firstPayload = payload;
        return {
          tool_calls: [{
            name: 'preview_edit_inventory_item',
            arguments: {
              query: 'glint nest crane',
              toLocation: 'trade binder',
              finish: 'foil',
            },
          }],
        };
      }
      return { response: 'Preview ready below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move my glint nest crane to my trade binder and make it foil' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.ok(firstPayload.tools.some(tool => tool.function?.name === 'preview_edit_inventory_item'));
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.match(data.previews[0].summary, /finish normal to foil/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: hosted Cloudflare does not duplicate plain move previews', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Glint-Nest Crane',
        resolvedName: 'Glint-Nest Crane',
        scryfallId: 'glint-nest-crane-1',
        setCode: 'kld',
        cn: '50',
        finish: 'normal',
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'preview_move_inventory_item',
            arguments: {
              query: 'glint nest crane',
              toLocation: 'trade binder',
            },
          }],
        };
      }
      return { response: 'Preview ready below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move my glint nest crane to my trade binder' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.match(data.previews[0].summary, /Moved 1 Glint-Nest Crane to \{loc:binder:trade binder\}/);
    assert.equal(
      data.previews[0].card.itemKey,
      collectionKey({ ...snapshot.app.collection[0], location: { type: 'binder', name: 'trade binder' } })
    );
    assert.deepEqual(data.previews[0].card.location, { type: 'binder', name: 'trade binder' });
    assert.deepEqual(data.raw.output.map(item => item.name), ['preview_move_inventory_item']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare sends compact tool results back to the model', async () => {
  const entry = card({
    name: 'Glint-Nest Crane',
    resolvedName: 'Glint-Nest Crane',
    scryfallId: 'glint-nest-crane-1',
    setCode: 'kld',
    cn: '50',
    finish: 'normal',
    location: { type: 'box', name: 'bulk' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  let secondPayload = null;
  env.AI = {
    async run(model, payload) {
      assert.equal(model, '@cf/openai/gpt-oss-120b');
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            id: 'edit_call',
            name: 'preview_edit_inventory_item',
            arguments: {
              itemKey: collectionKey(entry),
              toLocation: 'trade binder',
            },
          }],
        };
      }
      secondPayload = payload;
      return { response: 'Preview ready below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move glint nest crane to trade binder' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.previews.length, 1);
    const toolMessage = secondPayload.messages.find(message => message.role === 'tool');
    assert.ok(toolMessage);
    assert.match(toolMessage.content, /Glint-Nest Crane/);
    assert.doesNotMatch(toolMessage.content, /changeToken/);
    assert.doesNotMatch(toolMessage.content, /beforeSnapshot/);
    assert.ok(toolMessage.content.length < 4000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare 3030 after finding a card recovers a combined edit preview', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Glint-Nest Crane',
        resolvedName: 'Glint-Nest Crane',
        scryfallId: 'glint-nest-crane-1',
        setCode: 'kld',
        cn: '50',
        finish: 'normal',
        finishes: ['nonfoil', 'foil'],
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run(model) {
      assert.equal(model, '@cf/openai/gpt-oss-120b');
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'glint nest crane', limit: 10 },
          }],
        };
      }
      return { response: '3030: internal server error' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move my glint nest crane into my trade binder and update it to be foil' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.doesNotMatch(data.text, /3030/);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.match(data.previews[0].summary, /Updated 1 Glint-Nest Crane/);
    assert.match(data.previews[0].summary, /\{loc:binder:trade binder\}/);
    assert.match(data.previews[0].summary, /finish normal to foil/);
    assert.equal(data.raw.provider_error, '3030: internal server error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare 3030 on regular-printing add recovers input draft', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let aiCalls = 0;
  env.AI = {
    async run() {
      aiCalls += 1;
      return { response: '3030: internal server error' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(decodeURIComponent(String(url)), /!"emeritus of conflict"/i);
    assert.doesNotMatch(decodeURIComponent(String(url)), /regular printing/i);
    return Response.json({
      total_cards: 1,
      has_more: false,
      data: [{
        id: 'emeritus-base',
        name: 'Emeritus of Conflict // Lightning Bolt',
        set: 'fin',
        set_name: 'Final Fantasy',
        set_type: 'expansion',
        collector_number: '133',
        released_at: '2025-06-13',
        rarity: 'rare',
        type_line: 'Creature // Instant',
        finishes: ['nonfoil', 'foil'],
        promo: false,
        booster: true,
        full_art: false,
        frame_effects: [],
        image_uris: { normal: 'https://img.test/emeritus.jpg' },
        scryfall_uri: 'https://scryfall.test/card/fin/133/emeritus-of-conflict',
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
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'add a nm emeritus of conflict, the regular printing' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(aiCalls, 1);
    assert.equal(data.text, 'Choose options below.');
    assert.equal(data.drafts.length, 1);
    assert.equal(data.drafts[0].candidates[0].setCode, 'fin');
    assert.deepEqual(data.raw.output.map(item => item.name), ['preview_add_inventory_item']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: delete from collection recovers from destination-style confusion', async () => {
  const entry = card({
    name: 'Great Furnace',
    resolvedName: 'Great Furnace',
    scryfallId: 'great-furnace-1',
    setCode: 'sld',
    cn: '303',
    finish: 'foil',
    location: { type: 'box', name: 'bulk' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'great furnace', limit: 5 },
          }],
        };
      }
      return { response: 'I need a destination container to move the card out of inventory.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'remove the great furnace from my collection entirely' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.delete');
    assert.equal(data.previews[0].card.name, 'Great Furnace');
    assert.deepEqual(data.raw.output.map(item => item.name), ['search_inventory', 'preview_delete_inventory_item']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: another same style recovers to same-stack add preview', async () => {
  const entry = card({
    name: 'Force of Will',
    resolvedName: 'Force of Will',
    scryfallId: 'force-of-will-1',
    setCode: '2xm',
    cn: '51',
    location: { type: 'binder', name: 'trade binder' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'binder:trade binder': { type: 'binder', name: 'trade binder' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'force of will', limit: 5 },
          }],
        };
      }
      return { response: '3030: internal server error' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'add another force of will same style to my collection i have 2 of them now' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.add');
    assert.equal(data.previews[0].card.name, 'Force of Will');
    assert.equal(data.previews[0].card.qty, 1);
    assert.equal(data.previews[0].card.totalQtyAfter, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare wrong add-miss prose after finding a card recovers edit preview', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Glint-Nest Crane',
        resolvedName: 'Glint-Nest Crane',
        scryfallId: 'glint-nest-crane-1',
        setCode: 'kld',
        cn: '50',
        finish: 'normal',
        finishes: ['nonfoil', 'foil'],
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run(model) {
      assert.equal(model, '@cf/openai/gpt-oss-120b');
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'glint nest crane', limit: 10 },
          }],
        };
      }
      return {
        response: 'I could not find a matching real Magic card for that add request. Check the spelling, or give me an exact set code and collector number or a Scryfall link.',
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move my glint nest crane into my trade binder and update it to be foil' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.match(data.previews[0].summary, /Updated 1 Glint-Nest Crane/);
    assert.match(data.previews[0].summary, /\{loc:binder:trade binder\}/);
    assert.match(data.previews[0].summary, /finish normal to foil/);
    assert.equal(data.raw.raw_response.recovery_reason, 'mutation_preview_from_inventory_result');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: preview results override contradictory provider failure prose', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Chandra, Torch of Defiance',
        resolvedName: 'Chandra, Torch of Defiance',
        scryfallId: 'chandra-1',
        setCode: 'kld',
        cn: '110',
        finish: 'normal',
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'preview_edit_inventory_item',
            arguments: {
              query: 'chandra torch of defiance',
              toLocation: 'trade binder',
              condition: 'lightly_played',
            },
          }],
        };
      }
      return {
        response: 'I could not find a matching real Magic card for that add request. Check the spelling, or give me an exact set code and collector number or a Scryfall link.',
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move chandra torch of defiance to trade binder and mark it lightly played' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.match(data.previews[0].summary, /condition near mint to lightly played/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare recovers edit previews from user text after bad tool arguments', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        name: 'Chandra, Torch of Defiance',
        resolvedName: 'Chandra, Torch of Defiance',
        scryfallId: 'chandra-1',
        setCode: 'kld',
        cn: '110',
        finish: 'normal',
        location: { type: 'box', name: 'bulk' },
      }),
    ],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'preview_edit_inventory_item',
            arguments: {
              query: 'chandra',
              toLocation: 'trade binder',
              condition: 'lp',
              fromCondition: 'damaged',
            },
          }],
        };
      }
      return {
        response: 'I could not find a matching real Magic card for that add request. Check the spelling, or give me an exact set code and collector number or a Scryfall link.',
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move chandra torch of defiance to trade binder and mark it lightly played' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.equal(data.previews[0].card.name, 'Chandra, Torch of Defiance');
    assert.equal(data.previews[0].card.condition, 'lightly_played');
    assert.deepEqual(data.previews[0].card.location, { type: 'binder', name: 'trade binder' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: incomplete edit previews are replaced with a preview that covers every requested edit', async () => {
  const entry = card({
    name: 'Glint-Nest Crane',
    resolvedName: 'Glint-Nest Crane',
    scryfallId: 'glint-nest-crane-1',
    setCode: 'kld',
    cn: '50',
    finish: 'normal',
    finishes: ['nonfoil', 'foil'],
    location: { type: 'box', name: 'bulk' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
      'binder:trade binder': { type: 'binder', name: 'trade binder' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'glint nest crane', limit: 5 },
          }, {
            name: 'preview_edit_inventory_item',
            arguments: { itemKey: collectionKey(entry), finish: 'foil' },
          }],
        };
      }
      return {
        response: 'I prepared a preview to move Glint-Nest Crane to the trade binder and make it foil.',
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'move my glint nest crane into my trade binder and update it to be foil' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.equal(data.previews[0].card.name, 'Glint-Nest Crane');
    assert.equal(data.previews[0].card.finish, 'foil');
    assert.deepEqual(data.previews[0].card.location, { type: 'binder', name: 'trade binder' });
    assert.equal(data.previewWarnings.length, 1);
    assert.match(data.previewWarnings[0], /Glint-Nest Crane/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: printing swap recovers from finish-only preview', async () => {
  const entry = card({
    name: 'Cyclonic Rift',
    resolvedName: 'Cyclonic Rift',
    scryfallId: 'cyclonic-rift-rtr',
    setCode: 'rtr',
    setName: 'Return to Ravnica',
    cn: '35',
    finish: 'normal',
    location: { type: 'box', name: 'bulk' },
  });
  const snapshot = emptySnapshot({
    collection: [entry],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'preview_edit_inventory_item',
            arguments: { itemKey: collectionKey(entry), finish: 'foil' },
          }],
        };
      }
      return { response: 'Preview ready below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const href = String(url);
    assert.match(href, /\/cards\/search\?/);
    return Response.json({
      total_cards: 2,
      has_more: false,
      data: [{
        id: 'cyclonic-rift-rtr',
        name: 'Cyclonic Rift',
        set: 'rtr',
        set_name: 'Return to Ravnica',
        set_type: 'expansion',
        collector_number: '35',
        released_at: '2012-10-05',
        rarity: 'rare',
        type_line: 'Instant',
        finishes: ['nonfoil', 'foil'],
        image_uris: { normal: 'https://img.test/rift-rtr.jpg' },
        prices: { usd: '33.00', usd_foil: '90.00' },
        scryfall_uri: 'https://scryfall.test/card/rtr/35/cyclonic-rift',
      }, {
        id: 'cyclonic-rift-sld',
        name: 'Cyclonic Rift',
        set: 'sld',
        set_name: 'Secret Lair Drop',
        set_type: 'promo',
        collector_number: '999',
        released_at: '2025-01-01',
        rarity: 'rare',
        type_line: 'Instant',
        finishes: ['foil'],
        image_uris: { normal: 'https://img.test/rift-sld.jpg' },
        prices: { usd_foil: '42.00' },
        scryfall_uri: 'https://scryfall.test/card/sld/999/cyclonic-rift',
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
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'change the printing on my cyclonic rift, i swapped it to a secret lair foil one' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(calls, 2);
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.edit');
    assert.equal(data.previews[0].card.name, 'Cyclonic Rift');
    assert.equal(data.previews[0].card.setCode, 'sld');
    assert.equal(data.previews[0].card.cn, '999');
    assert.equal(data.previews[0].card.finish, 'foil');
    assert.equal(data.previewWarnings.length, 1);
    assert.deepEqual(data.raw.output.map(item => item.name), ['preview_edit_inventory_item', 'preview_replace_inventory_printing']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: exact add requests can recover from search-only Cloudflare tool use', async () => {
  const snapshot = emptySnapshot({
    containers: {
      'box:bulk': { type: 'box', name: 'bulk' },
    },
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_card_printings',
            arguments: { name: 'Sol Ring' },
          }],
        };
      }
      return { response: 'Choose options below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const href = String(url);
    if (/\/cards\/search\?/.test(href)) {
      return Response.json({
        total_cards: 2,
        has_more: false,
        data: [
          {
            id: 'sol-ring-sld',
            name: 'Sol Ring',
            set: 'sld',
            set_name: 'Secret Lair Drop',
            collector_number: '2417',
            released_at: '2024-01-01',
            rarity: 'rare',
            type_line: 'Artifact',
            finishes: ['foil'],
            image_uris: { normal: 'https://img.test/sol-sld.jpg' },
            prices: { usd_foil: '5.00' },
            scryfall_uri: 'https://scryfall.test/card/sld/2417/sol-ring',
          },
          {
            id: 'sol-ring-cmm-400',
            name: 'Sol Ring',
            set: 'cmm',
            set_name: 'Commander Masters',
            collector_number: '400',
            released_at: '2023-08-04',
            rarity: 'uncommon',
            type_line: 'Artifact',
            finishes: ['nonfoil', 'foil'],
            image_uris: { normal: 'https://img.test/sol-cmm.jpg' },
            prices: { usd: '2.50', usd_foil: '4.00' },
            scryfall_uri: 'https://scryfall.test/card/cmm/400/sol-ring',
          },
        ],
      });
    }
    if (/\/cards\/sol-ring-cmm-400$/.test(href)) {
      return Response.json({
        id: 'sol-ring-cmm-400',
        name: 'Sol Ring',
        set: 'cmm',
        set_name: 'Commander Masters',
        collector_number: '400',
        lang: 'en',
        rarity: 'uncommon',
        type_line: 'Artifact',
        finishes: ['nonfoil', 'foil'],
        image_uris: { normal: 'https://img.test/sol-cmm.jpg' },
        prices: { usd: '2.50', usd_foil: '4.00' },
        scryfall_uri: 'https://scryfall.test/card/cmm/400/sol-ring',
      });
    }
    throw new Error('unexpected Scryfall URL: ' + href);
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'add two near mint nonfoil sol ring cmm 400 to bulk' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.equal(data.previews[0].previewType, 'inventory.add');
    assert.equal(data.previews[0].card.name, 'Sol Ring');
    assert.equal(data.previews[0].card.setCode, 'cmm');
    assert.equal(data.previews[0].card.cn, '400');
    assert.equal(data.previews[0].card.qty, 2);
    assert.equal(data.previews[0].card.finish, 'normal');
    assert.deepEqual(data.previews[0].card.location, { type: 'box', name: 'bulk' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: Cloudflare recovers natural-language create container requests from empty tool args', async () => {
  const { env } = fakeSyncEnv(emptySnapshot());
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'preview_create_container',
            arguments: {},
          }],
        };
      }
      return { response: 'Where should I place that box?' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'make me a box called prize support' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Preview ready below.');
    assert.equal(data.previews.length, 1);
    assert.match(data.previews[0].summary, /\{loc:box:prize support\}/);
    assert.equal(data.raw.output.filter(item => item.name === 'preview_create_container').length, 2);
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

test('mcp chat: add lookup misses become useful assistant text', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    output_text: '',
    output: [{
      type: 'mcp_call',
      name: 'preview_add_inventory_item',
      result: {
        structuredContent: {
          status: 'needs_clarification',
          query: 'lorehold captain',
          message: 'I could not find a real Magic card matching "lorehold captain".',
          missingFields: ['scryfallId', 'setCode', 'collectorNumber'],
          suggestions: ['Lorehold Apprentice', 'Lorehold Command', 'Lorehold Campus'],
        },
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
        messages: [{ role: 'user', content: 'add a foil lorehold captain to my trade binder' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.previews.length, 0);
    assert.equal(data.drafts.length, 0);
    assert.match(data.text, /real Magic card matching "lorehold captain"/i);
    assert.match(data.text, /Lorehold Apprentice/);
    assert.match(data.text, /Lorehold Command/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: secret lair add requests preselect Secret Lair printings', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const candidate = (setCode, setName, cn) => ({
    name: 'Path to Exile',
    scryfallId: 'path-' + setCode,
    setCode,
    setName,
    collectorNumber: cn,
    rarity: 'uncommon',
    finishes: ['nonfoil', 'foil'],
    previewAddArgs: {
      scryfallId: 'path-' + setCode,
      name: 'Path to Exile',
      setCode,
      cn,
    },
  });
  globalThis.fetch = async () => Response.json({
    output_text: 'I need more info.',
    output: [{
      type: 'mcp_call',
      name: 'preview_add_inventory_item',
      result: {
        structuredContent: {
          status: 'needs_input',
          previewType: 'inventory.add',
          message: 'Choose the exact printing and missing copy details, then create a preview.',
          missingFields: ['printing', 'qty', 'finish', 'condition'],
          query: 'Path to Exile',
          resolvedName: 'Path to Exile',
          candidates: [
            candidate('soc', 'Secrets of Strixhaven Commander', '150'),
            candidate('pza', 'Teenage Mutant Ninja Turtles Source Material', '1'),
            candidate('sld', 'Secret Lair Drop', '2227'),
          ],
        },
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
        messages: [{ role: 'user', content: 'add a secret lair path to exile to my bulk' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Choose options below.');
    assert.equal(data.drafts.length, 1);
    assert.equal(data.drafts[0].candidates[0].setCode, 'sld');
    assert.equal(data.drafts[0].candidates[0].setName, 'Secret Lair Drop');
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

test('mcp chat: inventory card results replace provider prose with a short summary', async () => {
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
      itemKey: 'card-foil-2',
      name: 'Ragavan, Nimble Pilferer',
      scryfallId: 'ragavan-1',
      setCode: 'mul',
      cn: '86',
      finish: 'foil',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: '- Breya, Etherium Shaper\n- Ragavan, Nimble Pilferer',
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
        messages: [{ role: 'user', content: 'what foils do i have?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'I found 2 foil cards from your collection. They are shown below.');
    assert.equal(data.cards.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: collection unique count questions recover from mistaken card searches', async () => {
  const snapshot = emptySnapshot({
    collection: [
      card({
        itemKey: 'mox-key',
        name: 'Mox Opal',
        resolvedName: 'Mox Opal',
        scryfallId: 'mox-opal-1',
        setCode: 'sld',
        cn: '1072',
        finish: 'etched',
        qty: 1,
      }),
      card({
        itemKey: 'sol-ring-key',
        name: 'Sol Ring',
        resolvedName: 'Sol Ring',
        scryfallId: 'sol-ring-1',
        setCode: 'cmm',
        cn: '400',
        qty: 3,
      }),
    ],
  });
  const { env } = fakeSyncEnv(snapshot);
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  let calls = 0;
  env.AI = {
    async run() {
      calls += 1;
      if (calls === 1) {
        return {
          tool_calls: [{
            name: 'search_inventory',
            arguments: { query: 'Mox Opal', limit: 1 },
          }],
        };
      }
      return { response: 'I found 1 card from your collection. It is shown below.' };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Cloudflare hosted chat should use env.AI, not external fetch');
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        provider: 'cloudflare',
        messages: [{ role: 'user', content: 'how many unique cards in my collection' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'You have 2 unique cards in your collection.');
    assert.equal(data.cards.length, 0);
    assert.deepEqual(data.raw.output.map(item => item.name), ['search_inventory', 'get_collection_summary']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: move follow-ups keep the question while returning referenced cards', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const moveNeedsDestination = {
    status: 'invalid',
    error: 'toLocation is required',
    card: {
      itemKey: 'force-key',
      name: 'Force of Will',
      scryfallId: 'force-1',
      setCode: '2xm',
      cn: '51',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      price: 75.04,
    },
  };
  globalThis.fetch = async () => Response.json({
    output_text: 'I can help move **Force of Will** out of your trade binder. Where should it go?',
    output: [{
      type: 'mcp_call',
      name: 'preview_move_inventory_item',
      result: { structuredContent: moveNeedsDestination },
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
        messages: [{ role: 'user', content: 'take my force of will out of my trade binder' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'I can help move **Force of Will** out of your trade binder. Where should it go?');
    assert.equal(data.cards.length, 1);
    assert.equal(data.cards[0].name, 'Force of Will');
    assert.deepEqual(data.cards[0].location, { type: 'binder', name: 'trade binder' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: price ranking questions use returned card prices', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const inventory = {
    revision: 12,
    results: [{
      itemKey: 'cheap-card',
      name: 'Cheap Card',
      scryfallId: 'cheap-1',
      setCode: 'abc',
      cn: '1',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'box', name: 'bulk' },
      price: 1,
    }, {
      itemKey: 'chase-card',
      name: 'Chase Card',
      scryfallId: 'chase-1',
      setCode: 'abc',
      cn: '2',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      price: 42.25,
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: 'I do not have price data.',
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
        messages: [{ role: 'user', content: "what's the most expensive card in my collection?" }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'The most expensive card I found is Chase Card at $42.25. It is shown below.');
    assert.equal(data.cards[0].name, 'Chase Card');
    assert.equal(data.cards[0].price, 42.25);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: single-card value questions answer directly from returned price', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const inventory = {
    revision: 12,
    results: [{
      itemKey: 'ancient-tomb',
      name: 'Ancient Tomb',
      scryfallId: 'tpr-315',
      setCode: 'tmp',
      cn: '315',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      price: 129.85,
      totalValue: 129.85,
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: 'I found 1 card.',
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
        messages: [{ role: 'user', content: 'how much is my ancient tomb worth?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Your Ancient Tomb is worth $129.85. It is shown below.');
    assert.equal(data.cards.length, 1);
    assert.equal(data.cards[0].name, 'Ancient Tomb');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: container count questions use returned container stats', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const containers = {
    revision: 12,
    containers: [{
      key: 'box:bulk',
      type: 'box',
      name: 'bulk',
      stats: { unique: 2, total: 3, value: 1.25 },
    }, {
      key: 'binder:trade binder',
      type: 'binder',
      name: 'trade binder',
      stats: { unique: 17, total: 23, value: 456.78 },
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: '',
    output: [{
      type: 'mcp_call',
      name: 'list_containers',
      result: { structuredContent: containers },
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
        messages: [{ role: 'user', content: 'how many cards in my trade binder' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'Trade binder has 23 total cards across 17 unique cards.');
    assert.deepEqual(data.cards, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mcp chat: container price ranking questions use returned card prices', async () => {
  const { env } = fakeSyncEnv();
  env.MTGCOLLECTION_CHAT_GROQ_API_KEY = 'gsk-hosted-secret';
  const originalFetch = globalThis.fetch;
  const container = {
    revision: 12,
    found: true,
    container: {
      key: 'binder:trade binder',
      type: 'binder',
      name: 'trade binder',
    },
    stats: { unique: 28, total: 28, value: 205.25 },
    cards: [{
      itemKey: 'binder-cheap',
      name: 'Binder Cheap Card',
      scryfallId: 'cheap-1',
      setCode: 'abc',
      cn: '1',
      finish: 'normal',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      price: 0.25,
    }, {
      itemKey: 'binder-chase',
      name: 'Binder Chase Card',
      scryfallId: 'chase-1',
      setCode: 'abc',
      cn: '2',
      finish: 'foil',
      condition: 'near_mint',
      language: 'en',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
      price: 99.5,
    }],
  };
  globalThis.fetch = async () => Response.json({
    output_text: '',
    output: [{
      type: 'mcp_call',
      name: 'get_container',
      result: { structuredContent: container },
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
        messages: [{ role: 'user', content: "what's the most expensive card in the trade binder" }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.text, 'The most expensive card I found is Binder Chase Card at $99.50. It is shown below.');
    assert.equal(data.cards[0].name, 'Binder Chase Card');
    assert.equal(data.cards[0].price, 99.5);
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
