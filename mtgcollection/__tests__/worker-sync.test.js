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

function fakeRateLimiter(success = true) {
  const calls = [];
  return {
    calls,
    async limit(input) {
      calls.push(input);
      return { success };
    },
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

test('worker: sync routes honor the configured rate limiter before auth', async () => {
  const limiter = fakeRateLimiter(false);
  const res = await worker.fetch(new Request('https://example.com/sync/bootstrap', {
    headers: { 'CF-Connecting-IP': '203.0.113.9' },
  }), {
    SHARES: fakeKv(),
    SYNC_RATE_LIMITER: limiter,
  });

  assert.equal(res.status, 429);
  assert.deepEqual(limiter.calls, [{ key: 'sync:203.0.113.9' }]);
});

test('worker: share reads honor their configured rate limiter', async () => {
  const limiter = fakeRateLimiter(false);
  const res = await worker.fetch(new Request('https://example.com/share/legacy1', {
    headers: { 'CF-Connecting-IP': '203.0.113.10' },
  }), {
    SHARES: fakeKv(),
    SHARE_READ_RATE_LIMITER: limiter,
  });

  assert.equal(res.status, 429);
  assert.deepEqual(limiter.calls, [{ key: 'share-read:203.0.113.10' }]);
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

test('worker: anonymous TCG handoff writes are origin-limited and expire', async () => {
  const handoffs = fakeKv();
  const previewId = 'e1dd057e-1f38-4a5f-819c-f3af9134fecf';
  const previewBytes = Buffer.from('fake jpeg preview image bytes'.repeat(4));
  const previewImage = { type: 'image/jpeg', width: 1200, height: 630, data: b64url(previewBytes) };
  const payload = {
    v: 1,
    alg: 'A256GCM',
    iv: 'abcdefghijklmnop',
    data: 'ciphertext_123',
    preview: { scryfallId: previewId, image: previewImage },
  };
  const encryptedPayload = { v: 1, alg: 'A256GCM', iv: 'abcdefghijklmnop', data: 'ciphertext_123' };

  const create = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://bensonperry.com' },
    body: JSON.stringify(payload),
  }), { TCG_HANDOFFS: handoffs });

  assert.equal(create.status, 200);
  const { id, expiresAt } = await create.json();
  assert.match(id, /^[a-zA-Z0-9]{3}$/);
  assert.ok(expiresAt > Date.now());
  assert.deepEqual(JSON.parse(handoffs.values.get('tcg:' + id)), payload);
  assert.deepEqual(handoffs.putOptions.get('tcg:' + id), { expirationTtl: 1209600 });

  const read = await worker.fetch(new Request('https://example.com/tcg-handoffs/' + id), { TCG_HANDOFFS: handoffs });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), encryptedPayload);

  const redirect = await worker.fetch(new Request('https://example.com/t/' + id), { TCG_HANDOFFS: handoffs });
  assert.equal(redirect.status, 200);
  const html = await redirect.text();
  assert.match(html, new RegExp(`https://api\\.bensonperry\\.com/t/${id}/preview\\.jpg`));
  assert.doesNotMatch(html, new RegExp(`https://cards\\.scryfall\\.io/large/front/e/1/${previewId}\\.jpg`));
  assert.doesNotMatch(html, /preview\.png/);

  const image = await worker.fetch(new Request('https://example.com/t/' + id + '/preview.jpg'), { TCG_HANDOFFS: handoffs });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array(previewBytes));
});

test('worker: TCG handoff previews fall back to the first Scryfall card image', async () => {
  const handoffs = fakeKv();
  const previewId = 'e1dd057e-1f38-4a5f-819c-f3af9134fecf';
  handoffs.values.set('tcg:abc', JSON.stringify({
    v: 1,
    alg: 'A256GCM',
    iv: 'abcdefghijklmnop',
    data: 'ciphertext_123',
    preview: { scryfallId: previewId },
  }));

  const redirect = await worker.fetch(new Request('https://example.com/t/abc'), { TCG_HANDOFFS: handoffs });
  assert.equal(redirect.status, 200);
  const html = await redirect.text();
  assert.match(html, new RegExp(`https://cards\\.scryfall\\.io/large/front/e/1/${previewId}\\.jpg`));

  const image = await worker.fetch(new Request('https://example.com/t/abc/preview.jpg'), { TCG_HANDOFFS: handoffs });
  assert.equal(image.status, 302);
  assert.equal(image.headers.get('Location'), `https://cards.scryfall.io/large/front/e/1/${previewId}.jpg`);
});

test('worker: TCG handoff ids are retried instead of overwriting active links', async () => {
  const handoffs = fakeKv();
  handoffs.values.set('tcg:222', JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'existing_iv', data: 'existing_data' }));
  const originalGetRandomValues = globalThis.crypto.getRandomValues;
  let calls = 0;
  globalThis.crypto.getRandomValues = (bytes) => {
    bytes.fill(calls++ === 0 ? 0 : 1);
    return bytes;
  };

  try {
    const create = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://bensonperry.com' },
      body: JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'abcdefghijklmnop', data: 'ciphertext_123' }),
    }), { TCG_HANDOFFS: handoffs });

    assert.equal(create.status, 200);
    const { id } = await create.json();
    assert.equal(id, '333');
    assert.equal(JSON.parse(handoffs.values.get('tcg:222')).data, 'existing_data');
    assert.equal(JSON.parse(handoffs.values.get('tcg:333')).data, 'ciphertext_123');
  } finally {
    globalThis.crypto.getRandomValues = originalGetRandomValues;
  }
});

test('worker: TCG handoff writes reject invalid origins and payloads', async () => {
  const validPayload = { v: 1, alg: 'A256GCM', iv: 'abcdefghijklmnop', data: 'ciphertext_123' };

  const invalidOrigin = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' },
    body: JSON.stringify(validPayload),
  }), { TCG_HANDOFFS: fakeKv() });
  assert.equal(invalidOrigin.status, 403);

  const invalidJson = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://bensonperry.com' },
    body: '{bad json',
  }), { TCG_HANDOFFS: fakeKv() });
  assert.equal(invalidJson.status, 400);

  const invalidFields = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://bensonperry.com' },
    body: JSON.stringify({ v: 1, alg: 'none', iv: 'abcdefghijklmnop', data: 'ciphertext_123' }),
  }), { TCG_HANDOFFS: fakeKv() });
  assert.equal(invalidFields.status, 400);

  const oversized = await worker.fetch(new Request('https://example.com/tcg-handoffs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://bensonperry.com' },
    body: JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'abcdefghijklmnop', data: 'a'.repeat(340 * 1024) }),
  }), { TCG_HANDOFFS: fakeKv() });
  assert.equal(oversized.status, 413);
});

test('worker: TCG handoff reads return 404 and redirect page preserves hash client-side', async () => {
  const missing = await worker.fetch(new Request('https://example.com/tcg-handoffs/missing1'), { TCG_HANDOFFS: fakeKv() });
  assert.equal(missing.status, 404);

  const redirect = await worker.fetch(new Request('https://example.com/t/abc'), {});
  assert.equal(redirect.status, 200);
  assert.match(redirect.headers.get('Content-Type'), /text\/html/);
  const html = await redirect.text();
  assert.match(html, /https:\/\/bensonperry\.com\/tcgplayer-assistant\/\?s=abc/);
  assert.match(html, /window\.location\.hash/);
  assert.match(html, /window\.location\.replace/);
  assert.match(html, /property="og:title" content="Card Mail"/);
  assert.match(html, /property="og:image" content="https:\/\/bensonperry\.com\/tcgplayer-assistant\/preview\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /rel="icon" href="https:\/\/bensonperry\.com\/tcgplayer-assistant\/favicon\.svg"/);
  assert.match(html, /noindex,nofollow,noarchive/);

  const favicon = await worker.fetch(new Request('https://example.com/favicon.ico'), {});
  assert.equal(favicon.status, 302);
  assert.equal(favicon.headers.get('Location'), 'https://bensonperry.com/tcgplayer-assistant/favicon.svg');
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
