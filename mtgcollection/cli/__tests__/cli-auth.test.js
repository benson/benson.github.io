// End-to-end: the real CLI auth/session code against the real worker + durable
// object (with an in-memory D1 and KV), driven by an injected "browser". Proves
// login (PKCE loopback) -> token -> bootstrap -> push(add) -> read-back works
// with the production auth + op-allowlist path.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { CollectionSyncObject } from '../../worker/worker.js';
import { login } from '../src/oauth.mjs';
import { Session } from '../src/api.mjs';
import { applyMutation, loadSnapshot } from '../src/mutate.mjs';
import { collectionOf, summarize } from '../src/snapshot.mjs';
import { normalizeCollectionEntry } from '../vendor/collection.js';

function fakeKv() {
  const values = new Map();
  return {
    values,
    async put(k, v) { values.set(k, v); },
    async get(k) { return values.has(k) ? values.get(k) : null; },
    async delete(k) { values.delete(k); },
  };
}

// Minimal in-memory D1 matching the worker's sync SQL.
function fakeD1() {
  const collections = new Map(); // id -> row
  const byUser = new Map();      // user_id -> id
  const ops = [];
  const prepare = (sql) => ({
    args: [],
    bind(...a) { this.args = a; return this; },
    async first() {
      if (sql.includes('from sync_collections')) {
        const id = byUser.get(this.args[0]);
        return id ? collections.get(id) : null;
      }
      if (sql.includes('from sync_ops')) {
        const [cid, client, opid] = this.args;
        return ops.find(o => o.collection_id === cid && o.client_id === client && o.op_id === opid) || null;
      }
      return null;
    },
    async run() {
      if (sql.includes('insert into sync_collections')) {
        const revision = Number((sql.match(/values\s*\(\?,\s*\?,\s*(\d+),/) || [])[1] || 0);
        const [id, user_id, snapshot_json] = this.args;
        collections.set(id, { id, user_id, revision, snapshot_json });
        byUser.set(user_id, id);
      } else if (sql.includes('insert into sync_ops')) {
        const [, collection_id, , client_id, op_id] = this.args;
        ops.push({ collection_id, client_id, op_id });
      } else if (sql.includes('update sync_collections')) {
        const [revision, snapshot_json, id] = this.args;
        const row = collections.get(id);
        if (row) { row.revision = revision; row.snapshot_json = snapshot_json; }
      }
      return { success: true };
    },
    async all() { return { results: [] }; },
  });
  return { prepare };
}

function makeEnv() {
  const env = { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv(), DB: fakeD1() };
  const instances = new Map();
  env.COLLECTION_SYNC = {
    idFromName(name) { return name; },
    get(id) {
      if (!instances.has(id)) instances.set(id, new CollectionSyncObject({}, env));
      const obj = instances.get(id);
      return { fetch: (req) => obj.fetch(req) };
    },
  };
  return env;
}

function workerFetch(env) {
  return (input, init) => worker.fetch(new Request(input, init), env);
}

// Drives the OAuth redirect like a browser: hits /authorize (debug bridge) then
// the CLI's loopback callback with the returned code.
function fakeBrowser(env) {
  return async (authUrl) => {
    const u = new URL(authUrl);
    u.searchParams.set('debugUser', 'test_user');
    const res = await worker.fetch(new Request(u.href), env);
    const location = res.headers.get('Location');
    await fetch(location); // real loopback delivery to the CLI's local server
    return true;
  };
}

const quietOut = { info() {}, c: { green: s => s } };

test('cli: login -> bootstrap -> push(add) -> read back against the real worker', async () => {
  const env = makeEnv();
  const fetchImpl = workerFetch(env);

  const tokens = await login({
    base: 'https://api.test',
    scope: 'collection.read collection.write',
    out: quietOut,
    openBrowser: fakeBrowser(env),
    fetchImpl,
  });
  assert.ok(tokens.access_token.startsWith('mcp_at_'));
  assert.ok(tokens.refresh_token.startsWith('mcp_rt_'));

  const creds = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
  };
  const session = new Session({ base: 'https://api.test', credentials: creds, persist() {}, fetchImpl });

  const before = await loadSnapshot(session);
  assert.equal(summarize(collectionOf(before.snapshot)).total, 0);

  const entry = normalizeCollectionEntry(
    { name: 'Sol Ring', setCode: 'c21', cn: '263', scryfallId: 'sol-ring-c21', qty: 2, finish: 'normal', condition: 'near_mint', language: 'en' },
    { preserveResolvedFields: true },
  );
  const result = await applyMutation(session, (draft) => {
    draft.app.collection.push(entry);
  });
  assert.equal(result.ops.length, 1);
  assert.equal(result.ops[0].type, 'collection.upsert');

  const after = await loadSnapshot(session);
  const stats = summarize(collectionOf(after.snapshot));
  assert.equal(stats.unique, 1);
  assert.equal(stats.total, 2);
});

test('cli: a read-only session is rejected when it tries to push', async () => {
  const env = makeEnv();
  const fetchImpl = workerFetch(env);
  const tokens = await login({
    base: 'https://api.test', scope: 'collection.read', out: quietOut,
    openBrowser: fakeBrowser(env), fetchImpl,
  });
  const session = new Session({
    base: 'https://api.test',
    credentials: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, accessExpiresAt: Date.now() + 3.6e6, scope: tokens.scope },
    persist() {}, fetchImpl,
  });
  await assert.rejects(
    applyMutation(session, (draft) => { draft.app.collection.push({ name: 'x', setCode: 's', cn: '1', finish: 'normal', condition: 'near_mint', language: 'en', qty: 1, scryfallId: 'x' }); }),
    /write access/,
  );
});
