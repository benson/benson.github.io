const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_READ_SCOPE = 'collection.read';
const MCP_WRITE_SCOPE = 'collection.write';
const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE];
const MCP_ACCESS_TTL_SECONDS = 60 * 60;
const MCP_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MCP_CODE_TTL_SECONDS = 10 * 60;
const MCP_PREVIEW_TTL_SECONDS = 10 * 60;
const MCP_CLIENT_PREFIX = 'mcp:client:';
const MCP_CODE_PREFIX = 'mcp:code:';
const MCP_TOKEN_PREFIX = 'mcp:access:';
const MCP_REFRESH_PREFIX = 'mcp:refresh:';
const MCP_PENDING_PREFIX = 'mcp:pending:';

const memoryStore = new Map();

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return fallback; }
}

function randomId(prefix = '') {
  if (crypto.randomUUID) return prefix + crypto.randomUUID().replace(/-/g, '');
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(input) {
  const padded = String(input || '').replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(input || '').length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlJson(value) {
  return bytesToB64url(utf8(JSON.stringify(value)));
}

async function sha256B64url(value) {
  const digest = await crypto.subtle.digest('SHA-256', utf8(value));
  return bytesToB64url(new Uint8Array(digest));
}

async function hmacSignature(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, utf8(message));
  return bytesToB64url(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  const left = utf8(a);
  const right = utf8(b);
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i++) out |= left[i] ^ right[i];
  return out === 0;
}

function publicOrigin(request, env) {
  return String(env.MCP_PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/+$/g, '');
}

function clerkOrigin(env) {
  return String(env.CLERK_FRONTEND_API_URL || env.CLERK_ISSUER || '').replace(/\/+$/g, '');
}

function clerkOAuthScopes(env) {
  return String(env.CLERK_OAUTH_SCOPES || 'profile email').trim() || 'profile email';
}

async function storePut(env, key, value, ttlSeconds = null) {
  const record = {
    value,
    expiresAt: ttlSeconds ? nowSeconds() + ttlSeconds : null,
  };
  if (env.OAUTH_KV?.put) {
    const options = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
    await env.OAUTH_KV.put(key, JSON.stringify(record), options);
    return;
  }
  memoryStore.set(key, record);
}

async function storeGet(env, key) {
  let record = null;
  if (env.OAUTH_KV?.get) {
    record = safeJsonParse(await env.OAUTH_KV.get(key), null);
  } else {
    record = memoryStore.get(key) || null;
  }
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < nowSeconds()) {
    await storeDelete(env, key);
    return null;
  }
  return record.value ?? null;
}

async function storeDelete(env, key) {
  if (env.OAUTH_KV?.delete) await env.OAUTH_KV.delete(key);
  else memoryStore.delete(key);
}

function parseScopes(raw, fallback = [MCP_READ_SCOPE]) {
  const requested = String(raw || '').split(/\s+/).map(s => s.trim()).filter(Boolean);
  const allowed = requested.filter(scope => MCP_SCOPES.includes(scope));
  return allowed.length ? [...new Set(allowed)] : [...fallback];
}

function hasScope(auth, scope) {
  return auth?.scopes?.includes(scope);
}

function oauthJson(data, status, request, deps, extraHeaders = {}) {
  const res = deps.json(data, status, request);
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(res.body, { status: res.status, headers });
}

function oauthError(error, description, status, request, deps) {
  return oauthJson({ error, error_description: description }, status, request, deps);
}

function redirectResponse(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function clientFromBasic(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(':');
    return {
      clientId: idx === -1 ? decoded : decoded.slice(0, idx),
      clientSecret: idx === -1 ? '' : decoded.slice(idx + 1),
    };
  } catch (e) {
    return null;
  }
}

async function readRequestBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) return await request.json();
  const form = await request.formData();
  const out = {};
  for (const [key, value] of form.entries()) out[key] = String(value);
  return out;
}

async function getOAuthClient(env, clientId) {
  if (!clientId) return null;
  return storeGet(env, MCP_CLIENT_PREFIX + clientId);
}

async function registerOAuthClient(request, env, deps) {
  if (request.method !== 'POST') return oauthError('invalid_request', 'registration requires POST', 405, request, deps);
  const body = await request.json().catch(() => ({}));
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.map(String).filter(Boolean)
    : [];
  if (!redirectUris.length) return oauthError('invalid_client_metadata', 'redirect_uris is required', 400, request, deps);
  const clientId = randomId('mcp_client_');
  const client = {
    client_id: clientId,
    client_name: String(body.client_name || 'MCP Client').slice(0, 120),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: MCP_SCOPES.join(' '),
    created_at: Date.now(),
  };
  await storePut(env, MCP_CLIENT_PREFIX + clientId, client);
  return oauthJson(client, 201, request, deps);
}

async function issueAuthorizationCode(env, data) {
  const code = randomId('mcp_code_');
  await storePut(env, MCP_CODE_PREFIX + code, {
    ...data,
    createdAt: Date.now(),
  }, MCP_CODE_TTL_SECONDS);
  return code;
}

async function issueMcpTokens(env, { userId, clientId = 'mtgcollection', scopes = [MCP_READ_SCOPE] }) {
  const accessToken = randomId('mcp_at_');
  const refreshToken = randomId('mcp_rt_');
  const issuedAt = nowSeconds();
  const access = {
    userId,
    clientId,
    scopes: parseScopes(scopes.join(' ')),
    iat: issuedAt,
    exp: issuedAt + MCP_ACCESS_TTL_SECONDS,
  };
  const refresh = {
    userId,
    clientId,
    scopes: access.scopes,
    iat: issuedAt,
  };
  await storePut(env, MCP_TOKEN_PREFIX + accessToken, access, MCP_ACCESS_TTL_SECONDS);
  await storePut(env, MCP_REFRESH_PREFIX + refreshToken, refresh, MCP_REFRESH_TTL_SECONDS);
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: MCP_ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: access.scopes.join(' '),
  };
}

async function verifyPkce(record, verifier) {
  if (!record.codeChallenge) return true;
  if (!verifier) return false;
  if ((record.codeChallengeMethod || 'plain') === 'S256') {
    return timingSafeEqual(await sha256B64url(verifier), record.codeChallenge);
  }
  return timingSafeEqual(verifier, record.codeChallenge);
}

async function handleAuthorize(request, env, deps) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') || '';
  const scope = parseScopes(url.searchParams.get('scope'), [MCP_READ_SCOPE, MCP_WRITE_SCOPE]);
  if (responseType !== 'code') return oauthError('unsupported_response_type', 'only response_type=code is supported', 400, request, deps);
  const client = await getOAuthClient(env, clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return oauthError('invalid_client', 'unknown client or redirect_uri', 400, request, deps);
  }

  const debugUser = url.searchParams.get('debugUser') || request.headers.get('X-Debug-User');
  if (env.SYNC_AUTH_DISABLED === '1' && debugUser) {
    const code = await issueAuthorizationCode(env, {
      userId: debugUser,
      clientId,
      redirectUri,
      scopes: scope,
      codeChallenge: url.searchParams.get('code_challenge') || '',
      codeChallengeMethod: url.searchParams.get('code_challenge_method') || 'plain',
    });
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    return redirectResponse(redirect.href);
  }

  if (!env.CLERK_OAUTH_CLIENT_ID || !env.CLERK_OAUTH_CLIENT_SECRET || !clerkOrigin(env)) {
    return htmlResponse('<h1>MTG Collection MCP auth is not configured</h1><p>Set CLERK_OAUTH_CLIENT_ID, CLERK_OAUTH_CLIENT_SECRET, and CLERK_FRONTEND_API_URL or CLERK_ISSUER.</p>', 500);
  }

  const bridgeState = randomId('mcp_state_');
  await storePut(env, MCP_PENDING_PREFIX + bridgeState, {
    clientId,
    redirectUri,
    state,
    scopes: scope,
    codeChallenge: url.searchParams.get('code_challenge') || '',
    codeChallengeMethod: url.searchParams.get('code_challenge_method') || 'plain',
  }, MCP_CODE_TTL_SECONDS);

  const callback = publicOrigin(request, env) + '/oauth/clerk/callback';
  const authUrl = new URL(clerkOrigin(env) + '/oauth/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', env.CLERK_OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', callback);
  authUrl.searchParams.set('scope', clerkOAuthScopes(env));
  authUrl.searchParams.set('state', bridgeState);
  return redirectResponse(authUrl.href);
}

async function exchangeClerkCode(request, env, code) {
  const callback = publicOrigin(request, env) + '/oauth/clerk/callback';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callback,
  });
  const creds = btoa(env.CLERK_OAUTH_CLIENT_ID + ':' + env.CLERK_OAUTH_CLIENT_SECRET);
  const res = await fetch(clerkOrigin(env) + '/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + creds,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'Clerk token exchange failed');
  return data;
}

async function userFromClerkTokens(request, env, deps, tokens) {
  if (tokens.id_token) {
    const auth = await deps.verifyClerkJwt(tokens.id_token, {
      ...env,
      CLERK_AUDIENCE: env.CLERK_OAUTH_CLIENT_ID,
      CLERK_AUDIENCES: env.CLERK_OAUTH_CLIENT_ID,
    }, request);
    return auth.userId;
  }
  if (!tokens.access_token) throw new Error('Clerk response did not include a usable token');
  const userinfo = await fetch(clerkOrigin(env) + '/oauth/userinfo', {
    headers: { Authorization: 'Bearer ' + tokens.access_token },
  }).then(res => res.json());
  const userId = userinfo.sub || userinfo.user_id;
  if (!userId) throw new Error('Clerk userinfo did not include sub');
  return String(userId);
}

async function handleClerkCallback(request, env, deps) {
  const url = new URL(request.url);
  const bridgeState = url.searchParams.get('state') || '';
  const pending = await storeGet(env, MCP_PENDING_PREFIX + bridgeState);
  await storeDelete(env, MCP_PENDING_PREFIX + bridgeState);
  if (!pending) return oauthError('invalid_request', 'unknown OAuth state', 400, request, deps);
  if (url.searchParams.get('error')) {
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set('error', url.searchParams.get('error'));
    if (pending.state) redirect.searchParams.set('state', pending.state);
    return redirectResponse(redirect.href);
  }

  const tokens = await exchangeClerkCode(request, env, url.searchParams.get('code') || '');
  const userId = await userFromClerkTokens(request, env, deps, tokens);
  const code = await issueAuthorizationCode(env, { ...pending, userId });
  const redirect = new URL(pending.redirectUri);
  redirect.searchParams.set('code', code);
  if (pending.state) redirect.searchParams.set('state', pending.state);
  return redirectResponse(redirect.href);
}

async function handleToken(request, env, deps) {
  if (request.method !== 'POST') return oauthError('invalid_request', 'token endpoint requires POST', 405, request, deps);
  const body = await readRequestBody(request);
  const basic = clientFromBasic(request);
  const clientId = body.client_id || basic?.clientId || '';
  const grantType = body.grant_type || '';
  const client = await getOAuthClient(env, clientId);
  if (!client && clientId !== 'mtgcollection-chat') return oauthError('invalid_client', 'unknown client', 401, request, deps);

  if (grantType === 'authorization_code') {
    const code = String(body.code || '');
    const record = await storeGet(env, MCP_CODE_PREFIX + code);
    await storeDelete(env, MCP_CODE_PREFIX + code);
    if (!record) return oauthError('invalid_grant', 'authorization code is invalid or expired', 400, request, deps);
    if (record.clientId !== clientId || (body.redirect_uri && body.redirect_uri !== record.redirectUri)) {
      return oauthError('invalid_grant', 'authorization code does not match client', 400, request, deps);
    }
    if (!(await verifyPkce(record, body.code_verifier || ''))) {
      return oauthError('invalid_grant', 'PKCE verification failed', 400, request, deps);
    }
    return oauthJson(await issueMcpTokens(env, record), 200, request, deps, { 'Cache-Control': 'no-store' });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = String(body.refresh_token || '');
    const record = await storeGet(env, MCP_REFRESH_PREFIX + refreshToken);
    if (!record || record.clientId !== clientId) return oauthError('invalid_grant', 'refresh token is invalid', 400, request, deps);
    return oauthJson(await issueMcpTokens(env, record), 200, request, deps, { 'Cache-Control': 'no-store' });
  }

  return oauthError('unsupported_grant_type', 'unsupported grant_type', 400, request, deps);
}

function oauthServerMetadata(request, env) {
  const origin = publicOrigin(request, env);
  return {
    issuer: origin,
    authorization_endpoint: origin + '/authorize',
    token_endpoint: origin + '/token',
    registration_endpoint: origin + '/register',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: MCP_SCOPES,
    service_documentation: 'https://bensonperry.com/mtgcollection/',
  };
}

function protectedResourceMetadata(request, env) {
  const origin = publicOrigin(request, env);
  return {
    resource: origin + '/mcp',
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: MCP_SCOPES,
  };
}

export function isMcpOAuthPath(path) {
  return path === '/authorize'
    || path === '/token'
    || path === '/register'
    || path === '/oauth/clerk/callback'
    || path === '/.well-known/oauth-authorization-server'
    || path === '/.well-known/oauth-protected-resource';
}

export async function handleMcpOAuthRequest(request, env, deps) {
  const path = new URL(request.url).pathname;
  if (path === '/.well-known/oauth-authorization-server') return deps.json(oauthServerMetadata(request, env), 200, request);
  if (path === '/.well-known/oauth-protected-resource') return deps.json(protectedResourceMetadata(request, env), 200, request);
  if (path === '/register') return registerOAuthClient(request, env, deps);
  if (path === '/authorize') return handleAuthorize(request, env, deps);
  if (path === '/oauth/clerk/callback') return handleClerkCallback(request, env, deps);
  if (path === '/token') return handleToken(request, env, deps);
  return deps.text('not found', 404, request);
}

async function authenticateMcp(request, env, deps, requiredScope = MCP_READ_SCOPE) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    const record = await storeGet(env, MCP_TOKEN_PREFIX + token);
    if (record && (!requiredScope || record.scopes.includes(requiredScope))) return record;
    if (record) throw new Error('insufficient_scope');
  }
  if (env.SYNC_AUTH_DISABLED === '1') {
    const userId = request.headers.get('X-Debug-User') || new URL(request.url).searchParams.get('debugUser');
    if (userId) return { userId, clientId: 'debug', scopes: [...MCP_SCOPES] };
  }
  throw new Error(token ? 'insufficient_scope' : 'unauthorized');
}

function mcpChallenge(request, env) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer resource_metadata="' + publicOrigin(request, env) + '/.well-known/oauth-protected-resource"',
    },
  });
}

function opId(prefix = 'mcp_op') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function makeSyncOp(type, payload = {}) {
  return {
    schemaVersion: 1,
    id: opId(),
    type,
    ts: Date.now(),
    payload: cloneJson(payload, {}),
  };
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

async function syncJson(env, deps, userId, path, { method = 'GET', body = null } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body != null) init.body = JSON.stringify(body);
  const req = new Request('https://mtgcollection.local' + path, init);
  const res = await deps.routeSync(req, env, { userId });
  const text = await res.text();
  const data = safeJsonParse(text, null);
  if (!res.ok) {
    const err = new Error(data?.error || text || ('sync request failed: ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function currentCloud(env, deps, userId) {
  const data = await syncJson(env, deps, userId, '/sync/bootstrap');
  return {
    collectionId: data.collectionId || '',
    revision: data.revision || 0,
    snapshot: data.snapshot || makeEmptySnapshot(),
    hasCloudData: data.hasCloudData !== false,
  };
}

async function pushOps(env, deps, userId, { ops, snapshot, baseRevision, requireBaseRevision = false }) {
  return syncJson(env, deps, userId, '/sync/push', {
    method: 'POST',
    body: {
      clientId: 'mcp',
      baseRevision,
      requireBaseRevision,
      ops,
      snapshot,
    },
  });
}

function makeContainer(loc) {
  const normalized = normalizeLocation(loc);
  if (!normalized) return null;
  const now = Date.now();
  const container = {
    type: normalized.type,
    name: normalized.name,
    createdAt: now,
    updatedAt: now,
  };
  if (container.type === 'deck') {
    container.deck = {
      title: container.name,
      description: '',
      format: '',
      commander: '',
      commanderScryfallId: '',
      commanderScryfallUri: '',
      commanderImageUrl: '',
      commanderBackImageUrl: '',
      partner: '',
      partnerScryfallId: '',
      partnerScryfallUri: '',
      partnerImageUrl: '',
      partnerBackImageUrl: '',
      companion: '',
    };
    container.deckList = [];
  }
  return container;
}

function normalizeLocation(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return null;
    const m = s.match(/^(deck|binder|box)[\s:]+(.+)$/);
    if (m) return { type: m[1], name: m[2].trim() };
    return ['deck', 'binder', 'box'].includes(s) ? { type: s, name: s } : { type: 'box', name: s };
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
  const normalized = normalizeLocation(loc);
  return normalized ? normalized.type + ':' + normalized.name : '';
}

function collectionKey(entry) {
  const loc = locationKey(entry?.location);
  const board = loc.startsWith('deck:') ? ':' + (entry.deckBoard || 'main') : '';
  return (entry.scryfallId || ((entry.setCode || '') + ':' + (entry.cn || '') + ':' + (entry.name || '')))
    + ':' + (entry.finish || 'normal')
    + ':' + (entry.condition || 'near_mint')
    + ':' + (entry.language || 'en')
    + ':' + loc
    + board;
}

function applyOne(snapshot, op) {
  const next = cloneJson(snapshot, makeEmptySnapshot()) || makeEmptySnapshot();
  const payload = op?.payload || {};
  if (op?.type === 'snapshot.replace') return cloneJson(payload.snapshot, next) || next;
  if (op?.type === 'collection.upsert') {
    next.app.collection = removeEntry(next.app.collection, collectionKey(payload.entry));
    next.app.collection.push(cloneJson(payload.entry, payload.entry));
  } else if (op?.type === 'collection.remove') {
    next.app.collection = removeEntry(next.app.collection, payload.key);
  } else if (op?.type === 'collection.replace') {
    next.app.collection = removeEntry(next.app.collection, payload.beforeKey);
    next.app.collection = removeEntry(next.app.collection, collectionKey(payload.entry));
    next.app.collection.push(cloneJson(payload.entry, payload.entry));
  } else if (op?.type === 'collection.qtyDelta') {
    const idx = next.app.collection.findIndex(entry => collectionKey(entry) === payload.key);
    if (idx === -1 && payload.delta > 0 && payload.entry) {
      next.app.collection.push({ ...cloneJson(payload.entry, payload.entry), qty: payload.delta });
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
  } else if (op?.type === 'history.append') {
    if (payload.event) next.history.unshift(cloneJson(payload.event, payload.event));
  } else if (op?.type === 'history.replace') {
    next.history = Array.isArray(payload.history) ? cloneJson(payload.history, []) : [];
  }
  return next;
}

function removeEntry(collection, key) {
  return (collection || []).filter(entry => collectionKey(entry) !== key);
}

function applyOps(snapshot, ops) {
  let next = cloneJson(snapshot, makeEmptySnapshot()) || makeEmptySnapshot();
  for (const op of ops || []) next = applyOne(next, op);
  return next;
}

function containerFromSnapshot(snapshot, loc) {
  const key = locationKey(loc);
  if (!key) return null;
  const fromRegistry = snapshot?.app?.containers?.[key];
  if (fromRegistry) return fromRegistry;
  const normalized = normalizeLocation(loc);
  if ((snapshot?.app?.collection || []).some(entry => locationKey(entry.location) === key)) return makeContainer(normalized);
  return null;
}

function allContainers(snapshot) {
  const byKey = new Map(Object.entries(snapshot?.app?.containers || {}));
  for (const entry of snapshot?.app?.collection || []) {
    const loc = normalizeLocation(entry.location);
    if (loc && !byKey.has(locationKey(loc))) byKey.set(locationKey(loc), makeContainer(loc));
  }
  return [...byKey.entries()].map(([key, container]) => ({ key, ...container }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

function containerStats(snapshot, loc) {
  const key = locationKey(loc);
  const cards = (snapshot?.app?.collection || []).filter(entry => locationKey(entry.location) === key);
  return {
    unique: cards.length,
    total: cards.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0),
    value: cards.reduce((sum, entry) => sum + ((Number(entry.price) || 0) * (parseInt(entry.qty, 10) || 0)), 0),
  };
}

function summarizeEntry(entry) {
  return {
    itemKey: collectionKey(entry),
    name: entry.resolvedName || entry.name || '',
    scryfallId: entry.scryfallId || '',
    setCode: entry.setCode || '',
    cn: entry.cn || '',
    finish: entry.finish || 'normal',
    condition: entry.condition || 'near_mint',
    language: entry.language || 'en',
    qty: parseInt(entry.qty, 10) || 0,
    location: normalizeLocation(entry.location),
    deckBoard: entry.deckBoard || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    price: Number(entry.price) || 0,
  };
}

function matchesInventory(entry, args = {}) {
  if (args.itemKey && collectionKey(entry) !== args.itemKey) return false;
  if (args.scryfallId && entry.scryfallId !== args.scryfallId) return false;
  if (args.setCode && String(entry.setCode || '').toLowerCase() !== String(args.setCode).toLowerCase()) return false;
  if (args.cn && String(entry.cn || '').toLowerCase() !== String(args.cn).toLowerCase()) return false;
  if (args.location && locationKey(entry.location) !== locationKey(args.location)) return false;
  const q = String(args.query || args.name || '').trim().toLowerCase();
  if (q) {
    const name = String(entry.resolvedName || entry.name || '').toLowerCase();
    if (!name.includes(q)) return false;
  }
  return true;
}

function findInventory(snapshot, args = {}, limit = 25) {
  return (snapshot?.app?.collection || [])
    .filter(entry => matchesInventory(entry, args))
    .slice(0, limit)
    .map(summarizeEntry);
}

function eventBase({ type = 'mcp-change', summary = '', before = [], affectedKeys = [], containerBefore = null, containerAfter = null, deckLocation = '', deckBefore = null, deckAfter = null, mcp = {} }) {
  return {
    id: 'ev_mcp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    type,
    summary,
    before,
    created: [],
    affectedKeys,
    cards: before.map(record => ({
      name: record.card?.resolvedName || record.card?.name || '',
      imageUrl: record.card?.imageUrl || '',
      backImageUrl: record.card?.backImageUrl || '',
    })).filter(card => card.name || card.imageUrl),
    scope: deckLocation ? 'deck' : 'collection',
    deckLocation,
    containerBefore,
    containerAfter,
    deckBefore,
    deckAfter,
    dismissed: false,
    undone: false,
    source: 'mcp',
    mcp,
  };
}

function changeSecret(env) {
  if (env.MCP_CHANGE_TOKEN_SECRET) return env.MCP_CHANGE_TOKEN_SECRET;
  if (env.SYNC_AUTH_DISABLED === '1') return 'mtgcollection-dev-change-secret';
  throw new Error('MCP_CHANGE_TOKEN_SECRET is not configured');
}

async function signChangeToken(env, payload) {
  const encoded = b64urlJson(payload);
  return encoded + '.' + await hmacSignature(changeSecret(env), encoded);
}

async function verifyChangeToken(env, token) {
  const [encoded, sig] = String(token || '').split('.');
  if (!encoded || !sig) throw new Error('invalid change token');
  const expected = await hmacSignature(changeSecret(env), encoded);
  if (!timingSafeEqual(sig, expected)) throw new Error('invalid change token signature');
  const payload = safeJsonParse(new TextDecoder().decode(b64urlToBytes(encoded)), null);
  if (!payload || payload.expiresAt < Date.now()) throw new Error('change token expired');
  return payload;
}

async function previewFromOps(env, auth, cloud, { summary, ops, event }) {
  const beforeSnapshot = cloneJson(cloud.snapshot, makeEmptySnapshot());
  const changeId = randomId('mcp_change_');
  const eventWithMcp = {
    ...event,
    mcp: {
      ...(event.mcp || {}),
      changeId,
      beforeSnapshot,
    },
  };
  const allOps = [...ops, makeSyncOp('history.append', { event: eventWithMcp })];
  const afterSnapshot = applyOps(beforeSnapshot, allOps);
  const token = await signChangeToken(env, {
    userId: auth.userId,
    scopes: auth.scopes,
    expectedRevision: cloud.revision,
    changeId,
    summary,
    ops: allOps,
    expiresAt: Date.now() + MCP_PREVIEW_TTL_SECONDS * 1000,
  });
  return {
    status: 'preview',
    summary,
    expectedRevision: cloud.revision,
    expiresAt: new Date(Date.now() + MCP_PREVIEW_TTL_SECONDS * 1000).toISOString(),
    changeToken: token,
    opCount: allOps.length,
    totalsAfter: {
      unique: afterSnapshot.app.collection.length,
      total: afterSnapshot.app.collection.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0),
      containers: Object.keys(afterSnapshot.app.containers || {}).length,
    },
  };
}

function requireWritePreviewArgs(auth) {
  if (!hasScope(auth, MCP_WRITE_SCOPE)) throw new Error('insufficient_scope');
}

async function toolGetCollectionSummary(env, deps, auth) {
  const cloud = await currentCloud(env, deps, auth.userId);
  const collection = cloud.snapshot.app.collection || [];
  const containers = allContainers(cloud.snapshot);
  return {
    revision: cloud.revision,
    uniqueCards: collection.length,
    totalCards: collection.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0),
    containers: {
      total: containers.length,
      decks: containers.filter(c => c.type === 'deck').length,
      binders: containers.filter(c => c.type === 'binder').length,
      boxes: containers.filter(c => c.type === 'box').length,
    },
    recentChanges: (cloud.snapshot.history || []).slice(0, 5).map(ev => ({
      id: ev.id,
      ts: ev.ts,
      type: ev.type,
      summary: ev.summary,
      source: ev.source || '',
    })),
  };
}

async function toolSearchInventory(env, deps, auth, args) {
  const cloud = await currentCloud(env, deps, auth.userId);
  return {
    revision: cloud.revision,
    results: findInventory(cloud.snapshot, args, Math.min(parseInt(args.limit, 10) || 20, 100)),
  };
}

async function toolListContainers(env, deps, auth, args = {}) {
  const cloud = await currentCloud(env, deps, auth.userId);
  const type = args.type && ['deck', 'binder', 'box'].includes(args.type) ? args.type : '';
  const containers = allContainers(cloud.snapshot)
    .filter(container => !type || container.type === type)
    .map(container => ({
      key: locationKey(container),
      type: container.type,
      name: container.name,
      stats: containerStats(cloud.snapshot, container),
      deckListCount: container.type === 'deck'
        ? (container.deckList || []).reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0)
        : 0,
    }));
  return { revision: cloud.revision, containers };
}

async function toolGetContainer(env, deps, auth, args = {}) {
  const cloud = await currentCloud(env, deps, auth.userId);
  const loc = normalizeLocation(args.location || { type: args.type, name: args.name });
  const container = containerFromSnapshot(cloud.snapshot, loc);
  if (!container) return { revision: cloud.revision, found: false, location: loc };
  const cards = findInventory(cloud.snapshot, { location: loc }, Math.min(parseInt(args.limit, 10) || 50, 200));
  return {
    revision: cloud.revision,
    found: true,
    container: { key: locationKey(container), ...container },
    stats: containerStats(cloud.snapshot, loc),
    cards,
  };
}

async function toolGetDeck(env, deps, auth, args = {}) {
  const cloud = await currentCloud(env, deps, auth.userId);
  const loc = normalizeLocation(args.location || { type: 'deck', name: args.name });
  if (loc?.type !== 'deck') return { revision: cloud.revision, found: false, error: 'location is not a deck' };
  const deck = containerFromSnapshot(cloud.snapshot, loc);
  if (!deck || deck.type !== 'deck') return { revision: cloud.revision, found: false, location: loc };
  const list = Array.isArray(deck.deckList) ? deck.deckList : [];
  return {
    revision: cloud.revision,
    found: true,
    deck: {
      key: locationKey(deck),
      name: deck.name,
      metadata: deck.deck || {},
      deckList: list,
      deckListTotal: list.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0),
    },
    physicalInventory: findInventory(cloud.snapshot, { location: loc }, 200),
  };
}

async function toolGetRecentChanges(env, deps, auth, args = {}) {
  const cloud = await currentCloud(env, deps, auth.userId);
  return {
    revision: cloud.revision,
    changes: (cloud.snapshot.history || []).slice(0, Math.min(parseInt(args.limit, 10) || 20, 100)).map(ev => ({
      id: ev.id,
      ts: ev.ts,
      type: ev.type,
      summary: ev.summary,
      source: ev.source || '',
      undone: !!ev.undone,
    })),
  };
}

async function toolPreviewMoveInventoryItem(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const matches = (cloud.snapshot.app.collection || []).filter(entry => matchesInventory(entry, args));
  if (matches.length !== 1) {
    return {
      status: matches.length ? 'ambiguous' : 'not_found',
      candidates: matches.slice(0, 20).map(summarizeEntry),
    };
  }
  const entry = matches[0];
  const qty = Math.min(Math.max(1, parseInt(args.qty, 10) || (parseInt(entry.qty, 10) || 1)), parseInt(entry.qty, 10) || 1);
  const toLocation = normalizeLocation(args.toLocation || args.locationTo || args.destination);
  if (!toLocation) return { status: 'invalid', error: 'toLocation is required' };
  const toKey = locationKey(toLocation);
  const existingContainer = containerFromSnapshot(cloud.snapshot, toLocation);
  if (!existingContainer && args.createContainer !== true) {
    return {
      status: 'missing_container',
      missingContainer: toLocation,
      message: 'Set createContainer=true to create ' + toKey + ' as part of this move.',
    };
  }
  const beforeKey = collectionKey(entry);
  const moved = { ...cloneJson(entry, entry), qty, location: toLocation };
  if (toLocation.type === 'deck') moved.deckBoard = args.deckBoard || moved.deckBoard || 'main';
  else delete moved.deckBoard;
  const afterKey = collectionKey(moved);
  const ops = [];
  if (!existingContainer) ops.push(makeSyncOp('container.upsert', { key: toKey, container: makeContainer(toLocation) }));
  ops.push(makeSyncOp('collection.qtyDelta', { key: beforeKey, delta: -qty, entry }));
  ops.push(makeSyncOp('collection.qtyDelta', { key: afterKey, delta: qty, entry: moved }));
  const summary = 'Moved ' + qty + ' ' + (entry.resolvedName || entry.name || 'card') + ' to {loc:' + toKey + '}';
  const event = eventBase({
    type: 'edit',
    summary,
    before: [{ key: beforeKey, card: cloneJson(entry, entry) }],
    affectedKeys: [beforeKey],
    containerAfter: !existingContainer ? toLocation : null,
  });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

async function toolPreviewAddInventoryItem(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const raw = args.entry && typeof args.entry === 'object' ? args.entry : args;
  const location = normalizeLocation(raw.location);
  const entry = {
    name: String(raw.name || raw.resolvedName || '').trim(),
    resolvedName: String(raw.resolvedName || raw.name || '').trim(),
    scryfallId: String(raw.scryfallId || '').trim(),
    setCode: String(raw.setCode || raw.set || '').toLowerCase(),
    cn: String(raw.cn || raw.collectorNumber || '').trim(),
    finish: String(raw.finish || 'normal').toLowerCase(),
    condition: String(raw.condition || 'near_mint').toLowerCase(),
    language: String(raw.language || 'en').toLowerCase(),
    qty: Math.max(1, parseInt(raw.qty, 10) || 1),
    location,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
  };
  if (!entry.name && !entry.scryfallId) return { status: 'invalid', error: 'entry.name or entry.scryfallId is required' };
  if (!entry.scryfallId && (!entry.setCode || !entry.cn)) return { status: 'invalid', error: 'entry.scryfallId or setCode+cn is required' };
  const locKey = locationKey(location);
  const ops = [];
  if (location && !containerFromSnapshot(cloud.snapshot, location)) {
    if (args.createContainer !== true) {
      return { status: 'missing_container', missingContainer: location, message: 'Set createContainer=true to create ' + locKey + '.' };
    }
    ops.push(makeSyncOp('container.upsert', { key: locKey, container: makeContainer(location) }));
  }
  const key = collectionKey(entry);
  ops.push(makeSyncOp('collection.qtyDelta', { key, delta: entry.qty, entry }));
  const summary = 'Added ' + entry.qty + ' ' + (entry.resolvedName || entry.name || 'card') + (locKey ? ' to {loc:' + locKey + '}' : '');
  const event = eventBase({ type: 'add', summary, affectedKeys: [key], containerAfter: location && !containerFromSnapshot(cloud.snapshot, location) ? location : null });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

function normalizeDeckBoard(raw) {
  const board = String(raw || 'main').toLowerCase();
  return ['main', 'sideboard', 'maybe'].includes(board) ? board : 'main';
}

function deckListKey(entry) {
  return String(entry.scryfallId || '') + '|' + normalizeDeckBoard(entry.board);
}

function findDeckListMatches(deck, args = {}) {
  const q = String(args.query || args.name || '').trim().toLowerCase();
  const board = args.board ? normalizeDeckBoard(args.board) : '';
  return (deck.deckList || []).filter(entry => {
    if (args.scryfallId && entry.scryfallId !== args.scryfallId) return false;
    if (board && normalizeDeckBoard(entry.board) !== board) return false;
    if (q && !String(entry.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

async function toolPreviewDecklistChange(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const deckLoc = normalizeLocation(args.deck || args.location || { type: 'deck', name: args.deckName });
  if (deckLoc?.type !== 'deck') return { status: 'invalid', error: 'deck location is required' };
  const deck = cloneJson(containerFromSnapshot(cloud.snapshot, deckLoc), null);
  if (!deck || deck.type !== 'deck') return { status: 'not_found', deck: deckLoc };
  if (!Array.isArray(deck.deckList)) deck.deckList = [];
  const beforeDeck = cloneJson(deck, deck);
  const action = String(args.action || '').toLowerCase();
  let summary = '';

  if (action === 'add') {
    const raw = args.entry || args;
    const entry = {
      scryfallId: String(raw.scryfallId || '').trim(),
      qty: Math.max(1, parseInt(raw.qty, 10) || 1),
      board: normalizeDeckBoard(raw.board),
      name: String(raw.name || '').trim(),
      setCode: String(raw.setCode || raw.set || '').toLowerCase(),
      cn: String(raw.cn || '').trim(),
      imageUrl: String(raw.imageUrl || ''),
      backImageUrl: String(raw.backImageUrl || ''),
      rarity: String(raw.rarity || '').toLowerCase(),
      cmc: raw.cmc ?? null,
      typeLine: String(raw.typeLine || ''),
      colors: Array.isArray(raw.colors) ? raw.colors : [],
      colorIdentity: Array.isArray(raw.colorIdentity) ? raw.colorIdentity : [],
    };
    if (!entry.scryfallId) return { status: 'invalid', error: 'entry.scryfallId is required' };
    const existing = deck.deckList.find(e => deckListKey(e) === deckListKey(entry));
    if (existing) existing.qty += entry.qty;
    else deck.deckList.push(entry);
    summary = 'Added ' + entry.qty + ' ' + (entry.name || 'card') + ' to {loc:' + locationKey(deckLoc) + '}';
  } else if (action === 'remove') {
    const matches = findDeckListMatches(deck, args);
    if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'not_found', candidates: matches.slice(0, 20) };
    deck.deckList = deck.deckList.filter(entry => entry !== matches[0]);
    summary = 'Removed ' + (matches[0].name || 'card') + ' from {loc:' + locationKey(deckLoc) + '}';
  } else if (action === 'move_board') {
    const matches = findDeckListMatches(deck, args);
    if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'not_found', candidates: matches.slice(0, 20) };
    const target = normalizeDeckBoard(args.toBoard || args.targetBoard);
    const match = matches[0];
    const merge = deck.deckList.find(entry => entry !== match && entry.scryfallId === match.scryfallId && normalizeDeckBoard(entry.board) === target);
    if (merge) {
      merge.qty += match.qty || 1;
      deck.deckList = deck.deckList.filter(entry => entry !== match);
    } else {
      match.board = target;
    }
    summary = 'Moved ' + (match.name || 'card') + ' to ' + target + ' in {loc:' + locationKey(deckLoc) + '}';
  } else {
    return { status: 'invalid', error: 'action must be add, remove, or move_board' };
  }

  deck.updatedAt = Date.now();
  const key = locationKey(deckLoc);
  const ops = [makeSyncOp('container.upsert', { key, container: deck })];
  const event = eventBase({
    type: 'deck-update',
    summary,
    deckLocation: key,
    containerAfter: deckLoc,
    deckBefore: beforeDeck.deck || null,
    deckAfter: deck.deck || null,
  });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

async function toolPreviewCreateContainer(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const loc = normalizeLocation(args.location || { type: args.type, name: args.name });
  if (!loc) return { status: 'invalid', error: 'container location is required' };
  if (containerFromSnapshot(cloud.snapshot, loc)) return { status: 'no_op', message: locationKey(loc) + ' already exists' };
  const container = makeContainer(loc);
  const key = locationKey(loc);
  const summary = 'Created {loc:' + key + '}';
  const ops = [makeSyncOp('container.upsert', { key, container })];
  const event = eventBase({
    type: loc.type === 'deck' ? 'deck-create' : 'storage-create',
    summary,
    deckLocation: loc.type === 'deck' ? key : '',
    containerAfter: loc,
    deckAfter: container.deck || null,
  });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

async function toolPreviewRenameContainer(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const before = normalizeLocation(args.before || args.from || { type: args.type, name: args.name });
  const after = normalizeLocation(args.after || args.to || { type: args.toType || args.type, name: args.toName || args.newName });
  if (!before || !after) return { status: 'invalid', error: 'before and after locations are required' };
  if (locationKey(before) === locationKey(after)) return { status: 'no_op', message: 'container already has that name' };
  if ((before.type === 'deck' || after.type === 'deck') && before.type !== after.type) {
    return { status: 'invalid', error: 'deck containers cannot be converted to or from storage containers' };
  }
  const existing = cloneJson(containerFromSnapshot(cloud.snapshot, before), null);
  if (!existing) return { status: 'not_found', container: before };
  const target = cloneJson(containerFromSnapshot(cloud.snapshot, after), null) || makeContainer(after);
  const beforeKey = locationKey(before);
  const afterKey = locationKey(after);
  const nextContainer = {
    ...target,
    ...existing,
    type: after.type,
    name: after.name,
    updatedAt: Date.now(),
  };
  if (nextContainer.deck && !nextContainer.deck.title) nextContainer.deck.title = after.name;
  const ops = [
    makeSyncOp('container.upsert', { key: afterKey, container: nextContainer }),
    makeSyncOp('container.remove', { key: beforeKey }),
  ];
  const affected = (cloud.snapshot.app.collection || []).filter(entry => locationKey(entry.location) === beforeKey);
  for (const entry of affected) {
    const next = { ...cloneJson(entry, entry), location: after };
    ops.push(makeSyncOp('collection.replace', { beforeKey: collectionKey(entry), afterKey: collectionKey(next), entry: next }));
  }
  const summary = 'Renamed ' + before.type + ' ' + before.name + ' to {loc:' + afterKey + '}';
  const event = eventBase({
    type: before.type === 'deck' ? 'deck-rename' : 'storage-rename',
    summary,
    before: affected.map(entry => ({ key: collectionKey(entry), card: cloneJson(entry, entry) })),
    affectedKeys: affected.map(collectionKey),
    deckLocation: after.type === 'deck' ? afterKey : '',
    containerBefore: before,
    containerAfter: after,
    deckBefore: existing.deck || null,
    deckAfter: nextContainer.deck || null,
  });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

async function toolPreviewDeleteContainer(env, deps, auth, args = {}) {
  requireWritePreviewArgs(auth);
  const cloud = await currentCloud(env, deps, auth.userId);
  const loc = normalizeLocation(args.location || { type: args.type, name: args.name });
  if (!loc) return { status: 'invalid', error: 'container location is required' };
  if (loc.type === 'deck' && args.allowDeckDelete !== true) {
    return { status: 'needs_confirmation', message: 'Set allowDeckDelete=true to delete a deck container.' };
  }
  const container = cloneJson(containerFromSnapshot(cloud.snapshot, loc), null);
  if (!container) return { status: 'not_found', container: loc };
  const key = locationKey(loc);
  const affected = (cloud.snapshot.app.collection || []).filter(entry => locationKey(entry.location) === key);
  const ops = [makeSyncOp('container.remove', { key })];
  for (const entry of affected) {
    const next = { ...cloneJson(entry, entry), location: null };
    delete next.deckBoard;
    ops.push(makeSyncOp('collection.replace', { beforeKey: collectionKey(entry), afterKey: collectionKey(next), entry: next }));
  }
  const summary = affected.length
    ? 'Deleted {loc:' + key + '} and cleared ' + affected.length + ' card' + (affected.length === 1 ? '' : 's')
    : 'Deleted {loc:' + key + '}';
  const event = eventBase({
    type: loc.type === 'deck' ? 'deck-delete' : 'storage-delete',
    summary,
    before: affected.map(entry => ({ key: collectionKey(entry), card: cloneJson(entry, entry) })),
    affectedKeys: affected.map(collectionKey),
    containerBefore: loc,
    deckBefore: container.deck || null,
  });
  return previewFromOps(env, auth, cloud, { summary, ops, event });
}

async function toolApplyCollectionChange(env, deps, auth, args = {}) {
  if (!hasScope(auth, MCP_WRITE_SCOPE)) throw new Error('insufficient_scope');
  const payload = await verifyChangeToken(env, args.changeToken);
  if (payload.userId !== auth.userId) throw new Error('change token belongs to another user');
  const cloud = await currentCloud(env, deps, auth.userId);
  if (cloud.revision !== payload.expectedRevision) {
    const err = new Error('cloud collection changed since preview');
    err.status = 409;
    err.data = { expectedRevision: payload.expectedRevision, actualRevision: cloud.revision };
    throw err;
  }
  const pushed = await pushOps(env, deps, auth.userId, {
    ops: payload.ops,
    snapshot: cloud.snapshot,
    baseRevision: payload.expectedRevision,
    requireBaseRevision: true,
  });
  return {
    status: 'applied',
    summary: payload.summary,
    collectionId: pushed.collectionId,
    revision: pushed.revision,
    acceptedOpIds: pushed.acceptedOpIds || [],
  };
}

async function toolUndoLastMcpChange(env, deps, auth) {
  if (!hasScope(auth, MCP_WRITE_SCOPE)) throw new Error('insufficient_scope');
  const cloud = await currentCloud(env, deps, auth.userId);
  const history = cloud.snapshot.history || [];
  const event = history.find(ev => ev?.source === 'mcp' && !ev.undone && ev.mcp?.beforeSnapshot);
  if (!event) return { status: 'not_found', message: 'No undoable MCP change found.' };
  if (history[0]?.id !== event.id) {
    return { status: 'unsafe', message: 'The last MCP change is no longer the most recent change; undo it manually in the app.' };
  }
  const undoEvent = eventBase({
    type: 'mcp-undo',
    summary: 'Undid MCP change: ' + (event.summary || event.type || 'change'),
  });
  const nextHistory = [undoEvent, { ...event, undone: true }, ...history.slice(1)];
  const beforeSnapshot = cloneJson(event.mcp.beforeSnapshot, makeEmptySnapshot());
  const ops = [
    makeSyncOp('snapshot.replace', { snapshot: beforeSnapshot }),
    makeSyncOp('history.replace', { history: nextHistory }),
  ];
  const pushed = await pushOps(env, deps, auth.userId, {
    ops,
    snapshot: cloud.snapshot,
    baseRevision: cloud.revision,
    requireBaseRevision: true,
  });
  return { status: 'undone', revision: pushed.revision, summary: undoEvent.summary };
}

const TOOL_DEFINITIONS = [
  ['get_collection_summary', 'Summarize the signed-in MTG collection.', {}],
  ['search_inventory', 'Search physical inventory entries.', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      itemKey: { type: 'string' },
      scryfallId: { type: 'string' },
      location: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      limit: { type: 'number' },
    },
  }],
  ['list_containers', 'List decks, binders, and boxes.', {
    type: 'object',
    properties: { type: { type: 'string', enum: ['deck', 'binder', 'box'] } },
  }],
  ['get_container', 'Get a binder, box, or deck container and its cards.', {
    type: 'object',
    properties: { type: { type: 'string' }, name: { type: 'string' }, location: { oneOf: [{ type: 'string' }, { type: 'object' }] }, limit: { type: 'number' } },
  }],
  ['get_deck', 'Get deck metadata, decklist, and physical inventory in that deck.', {
    type: 'object',
    properties: { name: { type: 'string' }, location: { oneOf: [{ type: 'string' }, { type: 'object' }] } },
  }],
  ['get_recent_changes', 'List recent collection changelog entries.', {
    type: 'object',
    properties: { limit: { type: 'number' } },
  }],
  ['preview_move_inventory_item', 'Preview moving physical inventory to another location.', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      itemKey: { type: 'string' },
      toLocation: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      qty: { type: 'number' },
      createContainer: { type: 'boolean' },
    },
    required: ['toLocation'],
  }],
  ['preview_add_inventory_item', 'Preview adding a physical inventory entry.', { type: 'object' }],
  ['preview_decklist_change', 'Preview add/remove/move-board changes to a decklist.', { type: 'object' }],
  ['preview_create_container', 'Preview creating a deck, binder, or box.', { type: 'object' }],
  ['preview_rename_container', 'Preview renaming or converting a binder/box container.', { type: 'object' }],
  ['preview_delete_container', 'Preview deleting a container. Non-empty storage containers clear locations, not cards.', { type: 'object' }],
  ['apply_collection_change', 'Apply a signed previewed collection change.', {
    type: 'object',
    properties: { changeToken: { type: 'string' } },
    required: ['changeToken'],
  }],
  ['undo_last_mcp_change', 'Undo the most recent MCP-created change when it is still safe to do so.', {}],
].map(([name, description, inputSchema]) => ({
  name,
  description,
  inputSchema: inputSchema.type ? inputSchema : { type: 'object', properties: {} },
}));

function toolNeedsWrite(name) {
  return name === 'apply_collection_change' || name === 'undo_last_mcp_change';
}

async function executeTool(name, args, env, deps, auth) {
  switch (name) {
    case 'get_collection_summary': return toolGetCollectionSummary(env, deps, auth, args);
    case 'search_inventory': return toolSearchInventory(env, deps, auth, args);
    case 'list_containers': return toolListContainers(env, deps, auth, args);
    case 'get_container': return toolGetContainer(env, deps, auth, args);
    case 'get_deck': return toolGetDeck(env, deps, auth, args);
    case 'get_recent_changes': return toolGetRecentChanges(env, deps, auth, args);
    case 'preview_move_inventory_item': return toolPreviewMoveInventoryItem(env, deps, auth, args);
    case 'preview_add_inventory_item': return toolPreviewAddInventoryItem(env, deps, auth, args);
    case 'preview_decklist_change': return toolPreviewDecklistChange(env, deps, auth, args);
    case 'preview_create_container': return toolPreviewCreateContainer(env, deps, auth, args);
    case 'preview_rename_container': return toolPreviewRenameContainer(env, deps, auth, args);
    case 'preview_delete_container': return toolPreviewDeleteContainer(env, deps, auth, args);
    case 'apply_collection_change': return toolApplyCollectionChange(env, deps, auth, args);
    case 'undo_last_mcp_change': return toolUndoLastMcpChange(env, deps, auth, args);
    default: throw new Error('unknown tool: ' + name);
  }
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

async function handleJsonRpc(message, env, deps, auth) {
  if (!message || typeof message !== 'object') return jsonRpcError(null, -32600, 'Invalid Request');
  const { id = null, method, params = {} } = message;
  try {
    if (method === 'initialize') {
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'MTG Collection', version: '0.1.0' },
      });
    }
    if (method === 'notifications/initialized' || method === 'initialized') return null;
    if (method === 'ping') return jsonRpcResult(id, {});
    if (method === 'tools/list') return jsonRpcResult(id, { tools: TOOL_DEFINITIONS });
    if (method === 'tools/call') {
      const name = params.name;
      if (toolNeedsWrite(name) && !hasScope(auth, MCP_WRITE_SCOPE)) {
        return jsonRpcError(id, -32003, 'insufficient_scope', { requiredScope: MCP_WRITE_SCOPE });
      }
      const data = await executeTool(name, params.arguments || {}, env, deps, auth);
      return jsonRpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: false,
      });
    }
    return jsonRpcError(id, -32601, 'Method not found');
  } catch (e) {
    const status = e.status || (/scope/.test(e.message) ? 403 : 400);
    return jsonRpcError(id, status === 403 ? -32003 : -32000, e.message || 'tool failed', e.data);
  }
}

export async function handleMcpRequest(request, env, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.corsHeaders(request) });
  if (request.method !== 'POST') return deps.json({ error: 'MCP endpoint expects POST JSON-RPC requests' }, 405, request);
  let auth = null;
  try {
    auth = await authenticateMcp(request, env, deps, MCP_READ_SCOPE);
  } catch (e) {
    return mcpChallenge(request, env);
  }
  const body = await request.json().catch(() => null);
  const batch = Array.isArray(body);
  const messages = batch ? body : [body];
  const responses = [];
  for (const message of messages) {
    const response = await handleJsonRpc(message, env, deps, auth);
    if (response) responses.push(response);
  }
  return deps.json(batch ? responses : responses[0], 200, request);
}

function scrubSecret(message, secret) {
  if (!secret) return message;
  return String(message || '').split(secret).join('[redacted]');
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && typeof message === 'object')
    .map(message => ({
      role: ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user',
      content: String(message.content || ''),
    }))
    .filter(message => message.content.trim());
}

function extractOpenAiText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' || content.type === 'text') chunks.push(content.text || '');
    }
  }
  return chunks.join('\n').trim();
}

function extractAnthropicText(data) {
  return (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n')
    .trim();
}

export async function mintInternalMcpToken(env, { userId, scopes = [MCP_READ_SCOPE] }) {
  const tokens = await issueMcpTokens(env, { userId, clientId: 'mtgcollection-chat', scopes });
  return tokens.access_token;
}

export async function handleMcpApplyRequest(request, env, deps) {
  if (request.method !== 'POST') return deps.json({ error: 'POST required' }, 405, request);
  let clerkAuth = null;
  try {
    clerkAuth = await deps.authenticate(request, env);
  } catch (e) {
    return deps.json({ error: e.message || 'unauthorized' }, 401, request);
  }
  const body = await request.json().catch(() => ({}));
  const auth = { userId: clerkAuth.userId, scopes: [...MCP_SCOPES] };
  try {
    return deps.json(await toolApplyCollectionChange(env, deps, auth, body), 200, request);
  } catch (e) {
    return deps.json({ error: e.message || 'apply failed', data: e.data || null }, e.status || 400, request);
  }
}

export async function handleByokChatRequest(request, env, deps) {
  if (request.method !== 'POST') return deps.json({ error: 'POST required' }, 405, request);
  let clerkAuth = null;
  try {
    clerkAuth = await deps.authenticate(request, env);
  } catch (e) {
    return deps.json({ error: e.message || 'unauthorized' }, 401, request);
  }
  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || '').toLowerCase();
  const apiKey = String(body.apiKey || '').trim();
  const messages = normalizeChatMessages(body.messages);
  if (!apiKey) return deps.json({ error: 'apiKey is required' }, 400, request);
  if (!messages.length) return deps.json({ error: 'messages are required' }, 400, request);
  const mcpToken = await mintInternalMcpToken(env, { userId: clerkAuth.userId, scopes: [MCP_READ_SCOPE] });
  const mcpUrl = publicOrigin(request, env) + '/mcp';

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: body.model || 'gpt-5.4-mini',
          input: messages,
          tools: [{
            type: 'mcp',
            server_label: 'mtgcollection',
            server_description: 'Read and preview safe changes to an MTG Collection account.',
            server_url: mcpUrl,
            authorization: mcpToken,
            require_approval: 'never',
          }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || data.error || 'OpenAI request failed');
      return deps.json({ provider, text: extractOpenAiText(data), raw: data }, 200, request);
    }

    if (provider === 'anthropic') {
      const toolConfigs = {};
      for (const tool of TOOL_DEFINITIONS) {
        toolConfigs[tool.name] = { enabled: !toolNeedsWrite(tool.name) };
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'mcp-client-2025-11-20',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: body.model || 'claude-sonnet-4-5',
          max_tokens: Math.min(parseInt(body.maxTokens, 10) || 1200, 4000),
          messages: messages.filter(message => message.role !== 'system'),
          system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n') || undefined,
          mcp_servers: [{
            type: 'url',
            url: mcpUrl,
            name: 'mtgcollection',
            authorization_token: mcpToken,
          }],
          tools: [{
            type: 'mcp_toolset',
            mcp_server_name: 'mtgcollection',
            default_config: { enabled: false },
            configs: toolConfigs,
          }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Anthropic request failed');
      return deps.json({ provider, text: extractAnthropicText(data), raw: data }, 200, request);
    }

    return deps.json({ error: 'provider must be openai or anthropic' }, 400, request);
  } catch (e) {
    return deps.json({ error: scrubSecret(e.message || String(e), apiKey) }, 502, request);
  }
}
