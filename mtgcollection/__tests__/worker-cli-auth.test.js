import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker, { CollectionSyncObject } from '../worker/worker.js';

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;
const CLI_CLIENT = 'biblioplex-cli';

function fakeKv() {
  const values = new Map();
  return {
    values,
    async put(key, value) { values.set(key, value); },
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async delete(key) { values.delete(key); },
  };
}

// OAuth records are stored by storePut() as { value, expiresAt }; storeGet()
// returns record.value. Seed in that exact shape.
function seedRecord(kv, key, value) {
  kv.values.set(key, JSON.stringify({ value, expiresAt: null }));
}

function seedAccessToken(kv, token, scopes, { userId = 'user_1', clientId = CLI_CLIENT } = {}) {
  const iat = Math.floor(Date.now() / 1000);
  seedRecord(kv, 'mcp:access:' + token, { userId, clientId, scopes, iat, exp: iat + 3600 });
}

function seedRefreshToken(kv, token, scopes, { userId = 'user_1', clientId = CLI_CLIENT } = {}) {
  seedRecord(kv, 'mcp:refresh:' + token, { userId, clientId, scopes, iat: Math.floor(Date.now() / 1000) });
}

async function pkceChallenge(verifier) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return Buffer.from(new Uint8Array(digest))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function echoSyncEnv(overrides = {}) {
  return {
    OAUTH_KV: fakeKv(),
    COLLECTION_SYNC: {
      idFromName(name) { return name; },
      get(id) {
        return {
          async fetch(request) {
            return Response.json({
              ok: true,
              id,
              user: request.headers.get('X-Sync-User-Id'),
              kind: request.headers.get('X-Sync-Auth-Kind'),
            });
          },
        };
      },
    },
    ...overrides,
  };
}

function authorizeUrl(params) {
  const url = new URL('https://api.bensonperry.com/authorize');
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  return url.href;
}

// ---------- B1: public CLI client + loopback redirect + S256 ----------

test('cli-auth: loopback authorize with S256 issues a code (debug bridge)', async () => {
  const env = { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv() };
  const res = await worker.fetch(new Request(authorizeUrl({
    response_type: 'code',
    client_id: CLI_CLIENT,
    redirect_uri: 'http://127.0.0.1:53117/callback',
    code_challenge: 'abc123',
    code_challenge_method: 'S256',
    scope: 'collection.read collection.write',
    state: 'xyz',
    debugUser: 'user_1',
  })), env);
  assert.equal(res.status, 302);
  const loc = res.headers.get('Location');
  assert.ok(loc.startsWith('http://127.0.0.1:53117/callback?'), loc);
  const u = new URL(loc);
  assert.ok(u.searchParams.get('code'));
  assert.equal(u.searchParams.get('state'), 'xyz');
});

test('cli-auth: ipv6 and localhost loopback ports are accepted', async () => {
  for (const redirect of ['http://localhost:8989/cb', 'http://[::1]:8989/cb']) {
    const res = await worker.fetch(new Request(authorizeUrl({
      response_type: 'code', client_id: CLI_CLIENT, redirect_uri: redirect,
      code_challenge: 'abc', code_challenge_method: 'S256', debugUser: 'user_1',
    })), { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv() });
    assert.equal(res.status, 302, redirect);
  }
});

test('cli-auth: non-loopback and spoofed redirects are rejected', async () => {
  const bad = [
    'https://evil.com/callback',
    'http://127.0.0.1.evil.com/cb',
    'http://localhost@evil.com/cb',
    'http://evil.com#127.0.0.1/cb',
    'https://127.0.0.1:443/cb',
  ];
  for (const redirect of bad) {
    const res = await worker.fetch(new Request(authorizeUrl({
      response_type: 'code', client_id: CLI_CLIENT, redirect_uri: redirect,
      code_challenge: 'abc', code_challenge_method: 'S256', debugUser: 'user_1',
    })), { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv() });
    assert.equal(res.status, 400, 'should reject ' + redirect);
    assert.equal((await res.json()).error, 'invalid_client', redirect);
  }
});

test('cli-auth: CLI client requires PKCE S256 (plain/missing rejected)', async () => {
  for (const params of [
    { code_challenge: 'abc', code_challenge_method: 'plain' },
    { /* no challenge */ },
  ]) {
    const res = await worker.fetch(new Request(authorizeUrl({
      response_type: 'code', client_id: CLI_CLIENT, redirect_uri: 'http://127.0.0.1:5000/cb',
      debugUser: 'user_1', ...params,
    })), { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv() });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_request');
  }
});

test('cli-auth: unknown client is rejected', async () => {
  const res = await worker.fetch(new Request(authorizeUrl({
    response_type: 'code', client_id: 'not-a-client', redirect_uri: 'http://127.0.0.1:5000/cb',
    code_challenge: 'abc', code_challenge_method: 'S256', debugUser: 'user_1',
  })), { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv() });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_client');
});

test('cli-auth: end-to-end authorize -> token -> /sync with the minted token', async () => {
  const env = echoSyncEnv({ SYNC_AUTH_DISABLED: '1' });
  const verifier = 'verifier-0123456789-0123456789-0123456789-abc';
  const challenge = await pkceChallenge(verifier);
  const redirect = 'http://127.0.0.1:61234/callback';

  const authRes = await worker.fetch(new Request(authorizeUrl({
    response_type: 'code', client_id: CLI_CLIENT, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: 'S256',
    scope: 'collection.read collection.write', state: 's1', debugUser: 'user_1',
  })), env);
  assert.equal(authRes.status, 302);
  const code = new URL(authRes.headers.get('Location')).searchParams.get('code');

  const tokenRes = await worker.fetch(new Request('https://api.bensonperry.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code', code, client_id: CLI_CLIENT,
      redirect_uri: redirect, code_verifier: verifier,
    }),
  }), env);
  assert.equal(tokenRes.status, 200);
  const tokens = await tokenRes.json();
  assert.ok(tokens.access_token.startsWith('mcp_at_'));
  assert.ok(tokens.refresh_token.startsWith('mcp_rt_'));
  assert.equal(tokens.scope, 'collection.read collection.write');

  const boot = await worker.fetch(new Request('https://api.bensonperry.com/sync/bootstrap', {
    headers: { Authorization: 'Bearer ' + tokens.access_token },
  }), env);
  assert.equal(boot.status, 200);
  assert.deepEqual(await boot.json(), { ok: true, id: 'collection:user_1', user: 'user_1', kind: 'oauth' });
});

test('cli-auth: wrong PKCE verifier is rejected at the token endpoint', async () => {
  const env = echoSyncEnv({ SYNC_AUTH_DISABLED: '1' });
  const challenge = await pkceChallenge('the-real-verifier-aaaaaaaaaaaaaaaaaaaa');
  const redirect = 'http://127.0.0.1:61999/callback';
  const authRes = await worker.fetch(new Request(authorizeUrl({
    response_type: 'code', client_id: CLI_CLIENT, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: 'S256', debugUser: 'user_1',
  })), env);
  const code = new URL(authRes.headers.get('Location')).searchParams.get('code');
  const tokenRes = await worker.fetch(new Request('https://api.bensonperry.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, client_id: CLI_CLIENT, redirect_uri: redirect, code_verifier: 'WRONG' }),
  }), env);
  assert.equal(tokenRes.status, 400);
  assert.equal((await tokenRes.json()).error, 'invalid_grant');
});

// ---------- B2: /sync accepts OAuth token + scope enforcement ----------

test('cli-auth: read-scope token can read but cannot push', async () => {
  const env = echoSyncEnv();
  seedAccessToken(env.OAUTH_KV, 'mcp_at_readonly', ['collection.read']);
  const headers = { Authorization: 'Bearer mcp_at_readonly' };

  const boot = await worker.fetch(new Request('https://api.bensonperry.com/sync/bootstrap', { headers }), env);
  assert.equal(boot.status, 200);
  assert.equal((await boot.json()).kind, 'oauth');

  const push = await worker.fetch(new Request('https://api.bensonperry.com/sync/push', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: [] }),
  }), env);
  assert.equal(push.status, 403);
  assert.equal((await push.json()).error, 'insufficient_scope');
});

test('cli-auth: write-scope token routes a push to the durable object', async () => {
  const env = echoSyncEnv();
  seedAccessToken(env.OAUTH_KV, 'mcp_at_rw', ['collection.read', 'collection.write']);
  const push = await worker.fetch(new Request('https://api.bensonperry.com/sync/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer mcp_at_rw', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops: [] }),
  }), env);
  assert.equal(push.status, 200);
  assert.deepEqual(await push.json(), { ok: true, id: 'collection:user_1', user: 'user_1', kind: 'oauth' });
});

test('cli-auth: share endpoints still reject an OAuth mcp_at_ token', async () => {
  const env = { SHARES: fakeKv(), OAUTH_KV: fakeKv(), CLERK_JWT_KEY: 'x' };
  seedAccessToken(env.OAUTH_KV, 'mcp_at_rw', ['collection.read', 'collection.write']);
  const res = await worker.fetch(new Request('https://api.bensonperry.com/share', {
    method: 'POST',
    headers: { Authorization: 'Bearer mcp_at_rw', 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'deck', version: 1 }),
  }), env);
  assert.equal(res.status, 401);
  assert.equal(env.SHARES.values.size, 0);
});

// ---------- DO-level op allowlist for CLI tokens ----------

test('cli-auth: durable object rejects whole-state ops from a CLI token', async () => {
  const obj = new CollectionSyncObject({}, { DB: {} });
  for (const type of ['snapshot.replace', 'history.replace', 'ui.patch']) {
    const res = await obj.fetch(new Request('https://do/sync/push', {
      method: 'POST',
      headers: { 'X-Sync-User-Id': 'user_1', 'X-Sync-Auth-Kind': 'oauth' },
      body: JSON.stringify({ clientId: 'cli', ops: [{ id: 'op1', type, payload: {} }] }),
    }));
    assert.equal(res.status, 403, type);
    assert.equal((await res.json()).opType, type);
  }
});

test('cli-auth: durable object blocks claim from a CLI token', async () => {
  const obj = new CollectionSyncObject({}, { DB: {} });
  const res = await obj.fetch(new Request('https://do/sync/claim', {
    method: 'POST',
    headers: { 'X-Sync-User-Id': 'user_1', 'X-Sync-Auth-Kind': 'oauth' },
    body: JSON.stringify({ snapshot: {} }),
  }));
  assert.equal(res.status, 403);
});

// ---------- B3: refresh rotation + revoke ----------

test('cli-auth: refresh token is rotated (old one stops working)', async () => {
  const env = { OAUTH_KV: fakeKv() };
  seedRefreshToken(env.OAUTH_KV, 'mcp_rt_old', ['collection.read', 'collection.write']);

  const first = await worker.fetch(new Request('https://api.bensonperry.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'mcp_rt_old', client_id: CLI_CLIENT }),
  }), env);
  assert.equal(first.status, 200);
  const rotated = await first.json();
  assert.ok(rotated.refresh_token.startsWith('mcp_rt_'));
  assert.notEqual(rotated.refresh_token, 'mcp_rt_old');
  assert.equal(env.OAUTH_KV.values.has('mcp:refresh:mcp_rt_old'), false);

  const reuse = await worker.fetch(new Request('https://api.bensonperry.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'mcp_rt_old', client_id: CLI_CLIENT }),
  }), env);
  assert.equal(reuse.status, 400);
  assert.equal((await reuse.json()).error, 'invalid_grant');
});

test('cli-auth: /revoke deletes access and refresh tokens', async () => {
  const env = { OAUTH_KV: fakeKv() };
  seedAccessToken(env.OAUTH_KV, 'mcp_at_kill', ['collection.read']);
  seedRefreshToken(env.OAUTH_KV, 'mcp_rt_kill', ['collection.read']);

  const a = await worker.fetch(new Request('https://api.bensonperry.com/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'mcp_at_kill' }),
  }), env);
  assert.equal(a.status, 200);
  assert.equal((await a.json()).ok, true);
  assert.equal(env.OAUTH_KV.values.has('mcp:access:mcp_at_kill'), false);

  const r = await worker.fetch(new Request('https://api.bensonperry.com/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'mcp_rt_kill' }),
  }), env);
  assert.equal(r.status, 200);
  assert.equal(env.OAUTH_KV.values.has('mcp:refresh:mcp_rt_kill'), false);
});

test('cli-auth: oauth metadata advertises the revocation endpoint', async () => {
  const res = await worker.fetch(new Request('https://api.bensonperry.com/.well-known/oauth-authorization-server'), {});
  assert.equal(res.status, 200);
  const meta = await res.json();
  assert.equal(meta.revocation_endpoint, 'https://api.bensonperry.com/revoke');
});
