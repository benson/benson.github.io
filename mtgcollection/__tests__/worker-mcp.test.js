import test from 'node:test';
import assert from 'node:assert/strict';
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
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/responses');
    authHeader = init.headers.Authorization;
    requestBody = JSON.parse(init.body);
    return Response.json({ output_text: 'groq ok' });
  };
  try {
    const res = await worker.fetch(new Request('https://example.com/mcp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-User': 'user_1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'is this working?' }],
      }),
    }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'groq');
    assert.equal(data.mode, 'hosted');
    assert.equal(data.model, 'llama-3.1-8b-instant');
    assert.equal(authHeader, 'Bearer gsk-hosted-secret');
    const mcpTool = requestBody.tools.find(tool => tool.type === 'mcp');
    assert.equal(mcpTool.headers.Authorization.startsWith('Bearer mcp_at_'), true);
    assert.equal(mcpTool.require_approval, 'never');
    assert.ok(mcpTool.allowed_tools.includes('preview_create_container'));
    assert.equal(mcpTool.allowed_tools.includes('apply_collection_change'), false);
    assert.equal([...env.OAUTH_KV.values.values()].some(value => String(value).includes('gsk-hosted-secret')), false);
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
