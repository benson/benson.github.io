// mtgcollection worker
// --------------------
// Hosts legacy public deck snapshots in KV and authenticated collection sync
// in D1/Durable Objects. Public GET /share/:id remains capability-link based.
import {
  handleByokChatRequest,
  handleMcpApplyRequest,
  handleMcpOAuthRequest,
  handleMcpRequest,
  isMcpOAuthPath,
} from './mcp.js';

const ALLOWED_ORIGINS = [
  'https://bensonperry.com',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

const TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const SHARE_KEY_PREFIX = 'share:';
const ID_PATTERN = /^[a-zA-Z0-9_-]{6,48}$/;

function sharePutOptions(auth) {
  return auth ? undefined : { expirationTtl: TTL_SECONDS };
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function allowAnonymousShareWrites(env) {
  return env.SYNC_AUTH_DISABLED === '1' || truthy(env.MTGCOLLECTION_ALLOW_ANON_SHARE_WRITES);
}

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Debug-User',
  };
}

function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function text(message, status = 200, request = null) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain', ...corsHeaders(request) },
  });
}

function generateId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

async function readBody(request) {
  const body = await request.text();
  if (body.length > MAX_PAYLOAD_BYTES) throw new Error('payload too large (max ' + MAX_PAYLOAD_BYTES + ' bytes)');
  JSON.parse(body);
  return body;
}

function b64urlToBytes(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlToJson(input) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(input)));
}

function configList(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function claimIncludes(claim, expectedValues) {
  if (!expectedValues.length) return true;
  const actualValues = Array.isArray(claim) ? claim.map(String) : claim ? [String(claim)] : [];
  return actualValues.some(value => expectedValues.includes(value));
}

function pemToArrayBuffer(pem) {
  const b64 = String(pem || '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  return b64urlToBytes(b64.replace(/\+/g, '-').replace(/\//g, '_')).buffer;
}

async function verifyClerkJwt(token, env, request) {
  if (env.SYNC_AUTH_DISABLED === '1') {
    const url = new URL(request.url);
    return { userId: request.headers.get('X-Debug-User') || url.searchParams.get('debugUser') || 'dev_user' };
  }
  if (!env.CLERK_JWT_KEY) throw new Error('auth is not configured');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('unsupported token algorithm');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - 5) throw new Error('token expired');
  if (payload.nbf && payload.nbf > now + 5) throw new Error('token not active');

  const allowedIssuers = configList(env.CLERK_ISSUER || env.CLERK_ISSUERS);
  if (allowedIssuers.length && !allowedIssuers.includes(String(payload.iss || ''))) {
    throw new Error('token issuer is not allowed');
  }

  const allowedAudiences = configList(env.CLERK_AUDIENCE || env.CLERK_AUDIENCES);
  if (!claimIncludes(payload.aud, allowedAudiences)) {
    throw new Error('token audience is not allowed');
  }

  const allowedParties = configList(env.CLERK_AUTHORIZED_PARTIES || ALLOWED_ORIGINS.join(','));
  if (payload.azp && allowedParties.length && !allowedParties.includes(payload.azp)) {
    throw new Error('token origin is not allowed');
  }

  const key = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(env.CLERK_JWT_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), signed);
  if (!ok) throw new Error('invalid token signature');
  if (!payload.sub) throw new Error('token missing subject');
  return { userId: String(payload.sub), claims: payload };
}

async function authenticate(request, env) {
  const url = new URL(request.url);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');
  if (!token && env.SYNC_AUTH_DISABLED !== '1') throw new Error('missing token');
  return verifyClerkJwt(token || '', env, request);
}

async function optionalAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth && env.SYNC_AUTH_DISABLED !== '1') return null;
  return authenticate(request, env);
}

function collectionIdForUser(userId) {
  const bytes = new TextEncoder().encode(userId);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'user_' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeLocation(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    const m = s.match(/^(deck|binder|box)[\s:]+(.+)$/);
    if (m) return { type: m[1], name: m[2].trim() };
    return s ? { type: 'box', name: s } : null;
  }
  if (typeof raw === 'object') {
    const name = String(raw.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) return null;
    const type = ['deck', 'binder', 'box'].includes(raw.type) ? raw.type : 'box';
    return { type, name };
  }
  return null;
}

function locationKey(loc) {
  const n = normalizeLocation(loc);
  return n ? n.type + ':' + n.name : '';
}

function collectionKey(entry) {
  const loc = locationKey(entry.location);
  const board = loc.startsWith('deck:') ? ':' + (entry.deckBoard || 'main') : '';
  return (entry.scryfallId || ((entry.setCode || '') + ':' + (entry.cn || '') + ':' + (entry.name || '')))
    + ':' + (entry.finish || 'normal')
    + ':' + (entry.condition || 'near_mint')
    + ':' + (entry.language || 'en')
    + ':' + loc
    + board;
}

function makeEmptySnapshot() {
  return {
    app: {
      schemaVersion: 1,
      collection: [],
      containers: {},
      ui: { viewMode: 'collection', viewAsList: false, selectedFormat: '', sortField: null, sortDir: 'asc' },
    },
    history: [],
    shares: [],
  };
}

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return fallback; }
}

function removeEntry(collection, key) {
  return (collection || []).filter(entry => collectionKey(entry) !== key);
}

function upsertEntry(collection, entry) {
  const out = removeEntry(collection, collectionKey(entry));
  out.push(cloneJson(entry, entry));
  return out;
}

function applyOp(snapshot, op) {
  const next = cloneJson(snapshot, makeEmptySnapshot()) || makeEmptySnapshot();
  const payload = op?.payload || {};
  if (op?.type === 'snapshot.replace') return cloneJson(payload.snapshot, next) || next;
  if (op?.type === 'collection.upsert') next.app.collection = upsertEntry(next.app.collection, payload.entry);
  else if (op?.type === 'collection.remove') next.app.collection = removeEntry(next.app.collection, payload.key);
  else if (op?.type === 'collection.replace') {
    next.app.collection = removeEntry(next.app.collection, payload.beforeKey);
    next.app.collection = upsertEntry(next.app.collection, payload.entry);
  } else if (op?.type === 'collection.qtyDelta') {
    const idx = next.app.collection.findIndex(entry => collectionKey(entry) === payload.key);
    if (idx === -1 && payload.delta > 0 && payload.entry) {
      next.app.collection = upsertEntry(next.app.collection, { ...payload.entry, qty: payload.delta });
    } else if (idx !== -1) {
      const qty = (parseInt(next.app.collection[idx].qty, 10) || 0) + (parseInt(payload.delta, 10) || 0);
      if (qty <= 0) next.app.collection.splice(idx, 1);
      else next.app.collection[idx].qty = qty;
    }
  } else if (op?.type === 'container.upsert') {
    if (!next.app.containers) next.app.containers = {};
    next.app.containers[payload.key] = cloneJson(payload.container, payload.container);
  } else if (op?.type === 'container.remove') {
    if (next.app.containers) delete next.app.containers[payload.key];
  } else if (op?.type === 'ui.patch') {
    next.app.ui = { ...(next.app.ui || {}), ...(payload.patch || {}) };
  } else if (op?.type === 'history.append') {
    if (payload.event) next.history.unshift(cloneJson(payload.event, payload.event));
  } else if (op?.type === 'history.replace') {
    next.history = Array.isArray(payload.history) ? cloneJson(payload.history, []) : [];
  }
  return next;
}

async function getShareOwner(env, shareId) {
  if (!env.DB) return null;
  return env.DB.prepare('select * from sync_shares where share_id = ?').bind(shareId).first();
}

async function recordShareOwner(env, { shareId, userId, collectionId = '', containerKey = '', kind = 'deck' }) {
  if (!env.DB || !userId) return;
  await env.DB.prepare(`
    insert into sync_shares (share_id, user_id, collection_id, container_key, kind, created_at, updated_at)
    values (?, ?, ?, ?, ?, unixepoch(), unixepoch())
    on conflict(share_id) do update set
      user_id = excluded.user_id,
      collection_id = excluded.collection_id,
      container_key = excluded.container_key,
      kind = excluded.kind,
      updated_at = unixepoch()
  `).bind(shareId, userId, collectionId, containerKey, kind).run();
}

export class CollectionSyncObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const userId = request.headers.get('X-Sync-User-Id');
    if (!userId) return json({ error: 'unauthorized' }, 401, request);
    if (url.pathname === '/sync/live') return this.handleLive(request);
    if (!this.env.DB) return json({ error: 'D1 DB binding is not configured' }, 500, request);

    if (url.pathname === '/sync/bootstrap') return this.bootstrap(request, userId);
    if (url.pathname === '/sync/claim') return this.claim(request, userId);
    if (url.pathname === '/sync/pull') return this.pull(request, userId, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    if (url.pathname === '/sync/push') return this.push(request, userId);
    return json({ error: 'not found' }, 404, request);
  }

  async rowForUser(userId) {
    return this.env.DB.prepare('select * from sync_collections where user_id = ?').bind(userId).first();
  }

  async bootstrap(request, userId) {
    const row = await this.rowForUser(userId);
    if (!row) return json({ hasCloudData: false, revision: 0, collectionId: collectionIdForUser(userId) }, 200, request);
    return json({
      hasCloudData: true,
      collectionId: row.id,
      revision: row.revision || 0,
      snapshot: JSON.parse(row.snapshot_json || 'null') || makeEmptySnapshot(),
    }, 200, request);
  }

  async claim(request, userId) {
    const existing = await this.rowForUser(userId);
    if (existing) {
      return json({
        error: 'collection already exists',
        collectionId: existing.id,
        revision: existing.revision,
        snapshot: JSON.parse(existing.snapshot_json || 'null'),
      }, 409, request);
    }
    const body = await request.json();
    const snapshot = body.snapshot || makeEmptySnapshot();
    const id = collectionIdForUser(userId);
    await this.env.DB.prepare(`
      insert into sync_collections (id, user_id, revision, snapshot_json, created_at, updated_at)
      values (?, ?, 1, ?, unixepoch(), unixepoch())
    `).bind(id, userId, JSON.stringify(snapshot)).run();
    await this.env.DB.prepare(`
      insert into sync_ops (id, collection_id, user_id, client_id, op_id, revision, op_json, created_at)
      values (?, ?, ?, ?, ?, 1, ?, unixepoch())
    `).bind(generateId('syncop_'), id, userId, 'claim', 'claim', JSON.stringify({ type: 'snapshot.replace', payload: { snapshot } })).run();
    this.broadcast(1);
    return json({ collectionId: id, revision: 1, snapshot }, 200, request);
  }

  async pull(request, userId, since) {
    const row = await this.rowForUser(userId);
    if (!row) return json({ hasCloudData: false, revision: 0, ops: [] }, 200, request);
    const ops = await this.env.DB.prepare(`
      select revision, op_json from sync_ops
      where collection_id = ? and revision > ?
      order by revision asc
      limit 500
    `).bind(row.id, since).all();
    return json({
      collectionId: row.id,
      revision: row.revision || 0,
      snapshot: JSON.parse(row.snapshot_json || 'null') || makeEmptySnapshot(),
      ops: (ops.results || []).map(record => ({ revision: record.revision, ...JSON.parse(record.op_json) })),
    }, 200, request);
  }

  async push(request, userId) {
    const body = await request.json();
    const clientId = String(body.clientId || 'unknown');
    const ops = Array.isArray(body.ops) ? body.ops : [];
    let row = await this.rowForUser(userId);
    if (!row) {
      const id = collectionIdForUser(userId);
      const snapshot = body.snapshot || makeEmptySnapshot();
      await this.env.DB.prepare(`
        insert into sync_collections (id, user_id, revision, snapshot_json, created_at, updated_at)
        values (?, ?, 0, ?, unixepoch(), unixepoch())
      `).bind(id, userId, JSON.stringify(snapshot)).run();
      row = await this.rowForUser(userId);
    }

    let revision = row.revision || 0;
    const baseRevision = parseInt(body.baseRevision, 10) || 0;
    if (body.requireBaseRevision === true && baseRevision !== revision) {
      return json({
        error: 'revision conflict',
        expectedRevision: baseRevision,
        actualRevision: revision,
      }, 409, request);
    }
    let snapshot = JSON.parse(row.snapshot_json || 'null') || makeEmptySnapshot();
    const acceptedOpIds = [];
    for (const op of ops) {
      if (!op?.id) continue;
      const duplicate = await this.env.DB.prepare(`
        select revision from sync_ops where collection_id = ? and client_id = ? and op_id = ?
      `).bind(row.id, clientId, op.id).first();
      if (duplicate) {
        acceptedOpIds.push(op.id);
        continue;
      }
      snapshot = applyOp(snapshot, op);
      revision += 1;
      await this.env.DB.prepare(`
        insert into sync_ops (id, collection_id, user_id, client_id, op_id, revision, op_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).bind(generateId('syncop_'), row.id, userId, clientId, op.id, revision, JSON.stringify(op)).run();
      acceptedOpIds.push(op.id);
    }
    await this.env.DB.prepare(`
      update sync_collections set revision = ?, snapshot_json = ?, updated_at = unixepoch() where id = ?
    `).bind(revision, JSON.stringify(snapshot), row.id).run();
    this.broadcast(revision);
    return json({ collectionId: row.id, revision, snapshot, acceptedOpIds }, 200, request);
  }

  handleLive(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected websocket' }, 426, request);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (this.ctx.acceptWebSocket) this.ctx.acceptWebSocket(server);
    else server.accept();
    server.send(JSON.stringify({ type: 'hello' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  broadcast(revision) {
    if (!this.ctx.getWebSockets) return;
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ type: 'revision', revision })); } catch (e) {}
    }
  }
}

async function routeSync(request, env, auth) {
  if (!env.COLLECTION_SYNC) return json({ error: 'Durable Object binding is not configured' }, 500, request);
  const id = env.COLLECTION_SYNC.idFromName('collection:' + auth.userId);
  const stub = env.COLLECTION_SYNC.get(id);
  const next = new Request(request);
  next.headers.set('X-Sync-User-Id', auth.userId);
  return stub.fetch(next);
}

async function canWriteShare(request, env, shareId, auth) {
  const owner = await getShareOwner(env, shareId);
  if (!owner) return true;
  if (!auth || owner.user_id !== auth.userId) return false;
  return true;
}

function workerDeps() {
  return {
    authenticate,
    cloneJson,
    collectionKey,
    corsHeaders,
    generateId,
    json,
    locationKey,
    makeEmptySnapshot,
    normalizeLocation,
    routeSync,
    text,
    verifyClerkJwt,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    const path = url.pathname;
    const deps = workerDeps();

    if (isMcpOAuthPath(path)) return handleMcpOAuthRequest(request, env, deps);
    if (path === '/mcp') return handleMcpRequest(request, env, deps);
    if (path === '/mcp/chat') return handleByokChatRequest(request, env, deps);
    if (path === '/mcp/apply') return handleMcpApplyRequest(request, env, deps);

    if (path.startsWith('/sync/')) {
      try {
        const auth = await authenticate(request, env);
        return await routeSync(request, env, auth);
      } catch (e) {
        const status = /D1|binding|database|table|SQLITE|Durable Object/.test(e.message || '') ? 500 : 401;
        return json({ error: e.message || 'unauthorized' }, status, request);
      }
    }

    if (path === '/share' && request.method === 'POST') {
      try {
        const auth = await optionalAuth(request, env).catch(e => { throw e; });
        if (!auth && !allowAnonymousShareWrites(env)) {
          return text('sign in to create share links', 401, request);
        }
        const body = await readBody(request);
        const id = generateId();
        await env.SHARES.put(SHARE_KEY_PREFIX + id, body, sharePutOptions(auth));
        if (auth) await recordShareOwner(env, { shareId: id, userId: auth.userId, collectionId: collectionIdForUser(auth.userId) });
        return json({ id }, 200, request);
      } catch (e) {
        const status = /token|auth|origin|signature|expired/.test(e.message) ? 401 : 400;
        return text((status === 401 ? 'unauthorized: ' : 'bad request: ') + e.message, status, request);
      }
    }

    const m = path.match(/^\/share\/([^/]+)$/);
    if (m) {
      const id = m[1];
      if (!ID_PATTERN.test(id)) return text('invalid id', 400, request);
      const key = SHARE_KEY_PREFIX + id;

      if (request.method === 'GET') {
        const value = await env.SHARES.get(key);
        if (value === null) return text('snapshot not found', 404, request);
        return new Response(value, {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
        });
      }

      if (request.method === 'PUT') {
        try {
          const auth = await optionalAuth(request, env);
          if (!auth && !allowAnonymousShareWrites(env)) {
            return text('sign in to update share links', 401, request);
          }
          if (!(await canWriteShare(request, env, id, auth))) return text('unauthorized', 401, request);
          const body = await readBody(request);
          await env.SHARES.put(key, body, sharePutOptions(auth));
          if (auth) await recordShareOwner(env, { shareId: id, userId: auth.userId, collectionId: collectionIdForUser(auth.userId) });
          return json({ ok: true }, 200, request);
        } catch (e) {
          return text('bad request: ' + e.message, 400, request);
        }
      }

      if (request.method === 'DELETE') {
        const auth = await optionalAuth(request, env);
        if (!auth && !allowAnonymousShareWrites(env)) {
          return text('sign in to delete share links', 401, request);
        }
        if (!(await canWriteShare(request, env, id, auth))) return text('unauthorized', 401, request);
        await env.SHARES.delete(key);
        if (env.DB && auth) {
          await env.DB.prepare('delete from sync_shares where share_id = ? and user_id = ?').bind(id, auth.userId).run();
        }
        return json({ ok: true }, 200, request);
      }
    }

    return text('not found', 404, request);
  },
};
