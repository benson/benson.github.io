import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../worker/worker.js';

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;

function fakeKv() {
  const values = new Map();
  const putOptions = new Map();
  return {
    values,
    putOptions,
    async put(key, value, options) {
      values.set(key, value);
      putOptions.set(key, options);
    },
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async delete(key) { values.delete(key); },
  };
}

function b64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function pemFromSpki(spki) {
  const b64 = Buffer.from(spki).toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

async function makeJwtFixture(claims = {}) {
  const keyPair = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: 'user_1',
    iss: 'https://issuer.test',
    azp: 'https://example.com',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  }));
  const signature = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const spki = await subtle.exportKey('spki', keyPair.publicKey);
  return {
    token: `${header}.${payload}.${b64url(signature)}`,
    publicKeyPem: pemFromSpki(spki),
  };
}

function syncEnv(overrides = {}) {
  return {
    SHARES: fakeKv(),
    COLLECTION_SYNC: {
      idFromName(name) { return name; },
      get(id) {
        return {
          async fetch(request) {
            return Response.json({
              ok: true,
              id,
              user: request.headers.get('X-Sync-User-Id'),
            });
          },
        };
      },
    },
    ...overrides,
  };
}

test('worker: sync routes require authentication before touching bindings', async () => {
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap'), {
    SHARES: fakeKv(),
  });
  assert.equal(res.status, 401);
  assert.match(await res.text(), /missing token|auth/i);
});

test('worker: public legacy share reads still work without auth', async () => {
  const shares = fakeKv();
  const env = { SHARES: shares };
  shares.values.set('share:legacy1', JSON.stringify({ kind: 'deck', version: 1, container: { type: 'deck', name: 'breya' } }));

  const read = await worker.fetch(new Request('https://example.com/share/legacy1'), env);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.container.name, 'breya');
});

test('worker: anonymous share writes are disabled by default', async () => {
  const shares = fakeKv();
  const env = { SHARES: shares };
  const create = await worker.fetch(new Request('https://example.com/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'deck', version: 1, container: { type: 'deck', name: 'breya' } }),
  }), env);

  assert.equal(create.status, 401);
  assert.match(await create.text(), /sign in/i);
  assert.equal(shares.values.size, 0);
});

test('worker: anonymous legacy share writes can be explicitly enabled', async () => {
  const shares = fakeKv();
  const env = { SHARES: shares, MTGCOLLECTION_ALLOW_ANON_SHARE_WRITES: '1' };
  const create = await worker.fetch(new Request('https://example.com/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'deck', version: 1, container: { type: 'deck', name: 'breya' } }),
  }), env);

  assert.equal(create.status, 200);
  const { id } = await create.json();
  assert.ok(id);

  const read = await worker.fetch(new Request('https://example.com/share/' + id), env);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.container.name, 'breya');
  assert.deepEqual(shares.putOptions.get('share:' + id), { expirationTtl: 2592000 });
});

test('worker: authenticated share writes do not expire from KV', async () => {
  const shares = fakeKv();
  const env = {
    SYNC_AUTH_DISABLED: '1',
    SHARES: shares,
  };
  const create = await worker.fetch(new Request('https://example.com/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-User': 'user_1' },
    body: JSON.stringify({ kind: 'deck', version: 1, container: { type: 'deck', name: 'breya' } }),
  }), env);

  assert.equal(create.status, 200);
  const { id } = await create.json();
  assert.equal(shares.putOptions.get('share:' + id), undefined);

  const update = await worker.fetch(new Request('https://example.com/share/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Debug-User': 'user_1' },
    body: JSON.stringify({ kind: 'deck', version: 1, container: { type: 'deck', name: 'breya updated' } }),
  }), env);

  assert.equal(update.status, 200);
  assert.equal(shares.putOptions.get('share:' + id), undefined);
});

test('worker: debug-auth sync requests route to the Durable Object binding', async () => {
  let proxied = null;
  const env = {
    SYNC_AUTH_DISABLED: '1',
    SHARES: fakeKv(),
    COLLECTION_SYNC: {
      idFromName(name) { return name; },
      get(id) {
        return {
          async fetch(request) {
            proxied = { id, user: request.headers.get('X-Sync-User-Id') };
            return Response.json({ ok: true });
          },
        };
      },
    },
  };

  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { 'X-Debug-User': 'user_1' },
  }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(proxied, { id: 'collection:user_1', user: 'user_1' });
});

test('worker: valid Clerk JWT routes authenticated sync requests', async () => {
  const fixture = await makeJwtFixture();
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { Authorization: `Bearer ${fixture.token}` },
  }), syncEnv({
    CLERK_JWT_KEY: fixture.publicKeyPem,
    CLERK_ISSUER: 'https://issuer.test',
    CLERK_AUTHORIZED_PARTIES: 'https://example.com',
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: 'collection:user_1', user: 'user_1' });
});

test('worker: Clerk JWT issuer must match configured issuer', async () => {
  const fixture = await makeJwtFixture({ iss: 'https://other-issuer.test' });
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { Authorization: `Bearer ${fixture.token}` },
  }), syncEnv({
    CLERK_JWT_KEY: fixture.publicKeyPem,
    CLERK_ISSUER: 'https://issuer.test',
    CLERK_AUTHORIZED_PARTIES: 'https://example.com',
  }));

  assert.equal(res.status, 401);
  assert.match(await res.text(), /issuer is not allowed/);
});

test('worker: Clerk JWT audience is enforced when configured', async () => {
  const fixture = await makeJwtFixture({ aud: ['mtgcollection-dev'] });
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { Authorization: `Bearer ${fixture.token}` },
  }), syncEnv({
    CLERK_JWT_KEY: fixture.publicKeyPem,
    CLERK_ISSUER: 'https://issuer.test',
    CLERK_AUDIENCE: 'mtgcollection-prod',
    CLERK_AUTHORIZED_PARTIES: 'https://example.com',
  }));

  assert.equal(res.status, 401);
  assert.match(await res.text(), /audience is not allowed/);
});

test('worker: Clerk JWT audience arrays can satisfy configured audience', async () => {
  const fixture = await makeJwtFixture({ aud: ['mtgcollection-dev', 'mtgcollection-prod'] });
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { Authorization: `Bearer ${fixture.token}` },
  }), syncEnv({
    CLERK_JWT_KEY: fixture.publicKeyPem,
    CLERK_ISSUER: 'https://issuer.test',
    CLERK_AUDIENCE: 'mtgcollection-prod',
    CLERK_AUTHORIZED_PARTIES: 'https://example.com',
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: 'collection:user_1', user: 'user_1' });
});
