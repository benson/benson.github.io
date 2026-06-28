// Shared test harness: an in-memory worker (real worker.js + CollectionSyncObject
// over fake KV/D1), a fake browser to drive OAuth, and helpers to log in and run
// commands with captured stdout.
import worker, { CollectionSyncObject } from '../../worker/worker.js';
import { login } from '../src/oauth.mjs';
import { Session } from '../src/api.mjs';
import { createOutput } from '../src/output.mjs';
import { normalizeCollectionEntry } from '../vendor/collection.js';

export function fakeKv() {
  const values = new Map();
  return {
    values,
    async put(k, v) { values.set(k, v); },
    async get(k) { return values.has(k) ? values.get(k) : null; },
    async delete(k) { values.delete(k); },
  };
}

export function fakeD1() {
  const collections = new Map();
  const byUser = new Map();
  const ops = [];
  const prepare = (sql) => ({
    args: [],
    bind(...a) { this.args = a; return this; },
    async first() {
      if (sql.includes('from sync_collections')) { const id = byUser.get(this.args[0]); return id ? collections.get(id) : null; }
      if (sql.includes('from sync_ops')) { const [c, cl, o] = this.args; return ops.find(x => x.collection_id === c && x.client_id === cl && x.op_id === o) || null; }
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

export function makeEnv() {
  const env = { SYNC_AUTH_DISABLED: '1', OAUTH_KV: fakeKv(), DB: fakeD1() };
  const instances = new Map();
  env.COLLECTION_SYNC = {
    idFromName(name) { return name; },
    get(id) { if (!instances.has(id)) instances.set(id, new CollectionSyncObject({}, env)); const o = instances.get(id); return { fetch: (req) => o.fetch(req) }; },
  };
  return env;
}

export const workerFetch = (env) => (input, init) => worker.fetch(new Request(input, init), env);

export function fakeBrowser(env, user = 'test_user') {
  return async (authUrl) => {
    const u = new URL(authUrl);
    u.searchParams.set('debugUser', user);
    const res = await worker.fetch(new Request(u.href), env);
    await fetch(res.headers.get('Location'));
    return true;
  };
}

export const quietOut = { info() {}, c: { green: s => s, dim: s => s, yellow: s => s, red: s => s } };

export async function loginSession(env, { write = true, user = 'test_user' } = {}) {
  const fetchImpl = workerFetch(env);
  const scope = write ? 'collection.read collection.write' : 'collection.read';
  const tokens = await login({ base: 'https://api.test', scope, out: quietOut, openBrowser: fakeBrowser(env, user), fetchImpl });
  return new Session({
    base: 'https://api.test',
    credentials: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, accessExpiresAt: Date.now() + tokens.expires_in * 1000, scope: tokens.scope },
    persist() {}, fetchImpl,
  });
}

export function entry(data) {
  return normalizeCollectionEntry(data, { preserveResolvedFields: true });
}

// Run a command with a provided session and captured stdout; returns parsed --json.
export async function runCmd(command, { args = [], flags = {}, session }) {
  const out = createOutput({ json: true, color: false });
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  const ctx = { out, flags: { json: true, ...flags }, args, apiBase: 'https://api.test', makeSession: () => session };
  try {
    const code = await command.run(ctx);
    const stdout = chunks.join('');
    return { code, json: stdout.trim() ? JSON.parse(stdout) : null };
  } finally {
    process.stdout.write = original;
  }
}
