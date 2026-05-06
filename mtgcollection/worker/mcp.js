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
const MCP_CHAT_CLIENT_ID = 'mtgcollection-chat';
const CHAT_USAGE_PREFIX = 'mcp:chat-usage:';
const SCRYFALL_API = 'https://api.scryfall.com';
const SCRYFALL_USER_AGENT = 'MTGCollection/0.1 (https://bensonperry.com/mtgcollection)';
const SCRYFALL_PRINTINGS_MAX_PAGES = 3;
const SCRYFALL_PRINTINGS_HARD_CAP = 150;

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

function isChatClient(auth) {
  return auth?.clientId === MCP_CHAT_CLIENT_ID;
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

function enabledFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

async function registerOAuthClient(request, env, deps) {
  if (request.method !== 'POST') return oauthError('invalid_request', 'registration requires POST', 405, request, deps);
  if (env.SYNC_AUTH_DISABLED !== '1' && !enabledFlag(env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION)) {
    return oauthError('registration_not_allowed', 'dynamic MCP client registration is disabled', 403, request, deps);
  }
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
  const token = header.startsWith('Bearer ') ? header.slice(7) : (header.startsWith('mcp_at_') ? header : '');
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

function normalizeMcpFinish(raw, card = null) {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const requested = value === 'foil' ? 'foil'
    : value === 'etched' || value === 'etched_foil' ? 'etched'
    : 'normal';
  const finishes = Array.isArray(card?.finishes) ? card.finishes.map(String) : [];
  if (requested === 'normal' && finishes.length && !finishes.includes('nonfoil')) {
    return finishes.includes('foil') ? 'foil' : finishes.includes('etched') ? 'etched' : 'normal';
  }
  if (requested === 'foil' && finishes.length && !finishes.includes('foil')) {
    return finishes.includes('nonfoil') ? 'normal' : finishes.includes('etched') ? 'etched' : 'normal';
  }
  if (requested === 'etched' && finishes.length && !finishes.includes('etched')) {
    return finishes.includes('foil') ? 'foil' : 'normal';
  }
  if (!raw && finishes.length && !finishes.includes('nonfoil')) {
    if (finishes.includes('foil')) return 'foil';
    if (finishes.includes('etched')) return 'etched';
  }
  return requested;
}

function normalizeMcpCondition(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!value || value === 'nm' || value === 'm' || value === 'mint' || value === 'near_mint') return 'near_mint';
  if (value === 'lp' || value === 'light_played' || value === 'lightly_played') return 'lightly_played';
  if (value === 'mp' || value === 'moderate_played' || value === 'moderately_played') return 'moderately_played';
  if (value === 'hp' || value === 'heavy_played' || value === 'heavily_played') return 'heavily_played';
  if (value === 'dmg' || value === 'poor' || value === 'damaged') return 'damaged';
  return value;
}

function coerceMcpBoolean(raw) {
  if (raw === true || raw === false) return raw;
  const value = String(raw ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(value)) return true;
  if (['false', 'no', 'n', '0', ''].includes(value)) return false;
  return Boolean(raw);
}

function readCreateContainerFlag(args = {}) {
  return coerceMcpBoolean(args.createContainer ?? args.createcontainer ?? args.create_container);
}

function getScryfallImageUrl(card) {
  if (!card) return '';
  if (card.image_uris) return card.image_uris.normal || card.image_uris.small || '';
  const face = Array.isArray(card.card_faces) ? card.card_faces[0] : null;
  return face?.image_uris?.normal || face?.image_uris?.small || '';
}

function getScryfallBackImageUrl(card) {
  const face = Array.isArray(card?.card_faces) ? card.card_faces[1] : null;
  return face?.image_uris?.normal || face?.image_uris?.small || '';
}

function getScryfallUsdPrice(card, finish) {
  const prices = card?.prices || {};
  const exact = finish === 'foil' ? prices.usd_foil
    : finish === 'etched' ? prices.usd_etched
    : prices.usd;
  const parsed = parseFloat(exact);
  if (parsed) return { price: parsed, priceFallback: false };
  const fallback = parseFloat(prices.usd);
  if (finish !== 'normal' && fallback) return { price: fallback, priceFallback: true };
  return { price: null, priceFallback: false };
}

async function fetchScryfallJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': SCRYFALL_USER_AGENT,
        'X-User-Agent': SCRYFALL_USER_AGENT,
      },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message || String(e) } };
  }
}

function normalizeExactCardName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildScryfallPrintingsSearchUrl(name) {
  const escaped = String(name || '').replace(/"/g, '\\"');
  const query = '!"' + escaped + '"';
  return SCRYFALL_API
    + '/cards/search?q=' + encodeURIComponent(query)
    + '&unique=prints&order=released&dir=desc&include_extras=true&include_variations=true';
}

function preferExactScryfallPrintings(cards, name) {
  const target = normalizeExactCardName(name);
  if (!target) return cards;
  const exact = cards.filter(card => normalizeExactCardName(card?.name) === target);
  return exact.length ? exact : cards;
}

function emptyScryfallPrintingsResult(extra = {}) {
  return { cards: [], totalCount: 0, truncated: false, fuzzyName: '', lookupError: '', ...extra };
}

async function fetchScryfallPrintingsFromUrl(url, { maxPages = SCRYFALL_PRINTINGS_MAX_PAGES, hardCap = SCRYFALL_PRINTINGS_HARD_CAP } = {}) {
  const collected = [];
  let pages = 0;
  let totalCards = 0;
  let lookupError = '';
  while (url && pages < maxPages) {
    const fetched = await fetchScryfallJson(url);
    if (!fetched.ok) {
      if (fetched.status === 404) break;
      lookupError = 'Scryfall printings lookup failed'
        + (fetched.status ? ' (HTTP ' + fetched.status + ')' : '')
        + (fetched.data?.details ? ': ' + fetched.data.details : '');
      break;
    }
    pages++;
    if (typeof fetched.data.total_cards === 'number') totalCards = fetched.data.total_cards;
    if (Array.isArray(fetched.data.data)) {
      for (const card of fetched.data.data) {
        collected.push(card);
        if (collected.length >= hardCap) break;
      }
    }
    if (collected.length >= hardCap) break;
    url = fetched.data.has_more ? fetched.data.next_page : null;
  }
  return {
    cards: collected,
    totalCount: Math.max(totalCards, collected.length),
    truncated: collected.length < Math.max(totalCards, collected.length),
    lookupError,
  };
}

async function fetchScryfallNamedCard(name) {
  const exact = await fetchScryfallJson(SCRYFALL_API + '/cards/named?exact=' + encodeURIComponent(name));
  if (exact.ok && exact.data?.name) return { card: exact.data, fuzzyName: '' };
  const fuzzy = await fetchScryfallJson(SCRYFALL_API + '/cards/named?fuzzy=' + encodeURIComponent(name));
  if (fuzzy.ok && fuzzy.data?.name) return { card: fuzzy.data, fuzzyName: String(fuzzy.data.name || '') };
  return { card: null, fuzzyName: '' };
}

async function fetchScryfallPrintingsByName(name, { maxPages = SCRYFALL_PRINTINGS_MAX_PAGES, hardCap = SCRYFALL_PRINTINGS_HARD_CAP, allowFuzzy = true } = {}) {
  const searched = await fetchScryfallPrintingsFromUrl(buildScryfallPrintingsSearchUrl(name), { maxPages, hardCap });
  const collected = searched.cards;
  const totalCards = searched.totalCount;

  const exactPrintings = preferExactScryfallPrintings(collected, name);
  if (exactPrintings.length) {
    const filteredToExact = exactPrintings.length !== collected.length;
    return {
      cards: exactPrintings,
      totalCount: filteredToExact ? exactPrintings.length : Math.max(totalCards, collected.length),
      truncated: filteredToExact ? false : collected.length < Math.max(totalCards, collected.length),
      fuzzyName: '',
      lookupError: searched.lookupError,
    };
  }

  if (allowFuzzy) {
    const named = await fetchScryfallNamedCard(name);
    if (named.card) {
      const fuzzyName = named.fuzzyName || '';
      if (normalizeExactCardName(fuzzyName) && normalizeExactCardName(fuzzyName) !== normalizeExactCardName(name)) {
        const lookup = await fetchScryfallPrintingsByName(fuzzyName, { maxPages, hardCap, allowFuzzy: false });
        return { ...lookup, fuzzyName };
      }
      if (named.card.prints_search_uri) {
        const prints = await fetchScryfallPrintingsFromUrl(named.card.prints_search_uri, { maxPages, hardCap });
        const cards = preferExactScryfallPrintings(prints.cards, named.card.name);
        if (cards.length) {
          return {
            cards,
            totalCount: cards.length !== prints.cards.length ? cards.length : prints.totalCount,
            truncated: cards.length !== prints.cards.length ? false : prints.truncated,
            fuzzyName,
            lookupError: prints.lookupError || searched.lookupError,
          };
        }
      }
      return { cards: [named.card], totalCount: 1, truncated: false, fuzzyName, lookupError: searched.lookupError };
    }
  }

  return emptyScryfallPrintingsResult({ lookupError: searched.lookupError });
}

function requestedScryfallFinish(raw) {
  const normalized = normalizeMcpFinish(raw);
  if (!raw) return '';
  return normalized === 'normal' ? 'nonfoil' : normalized;
}

function candidateMatchesRequestedFinish(card, rawFinish) {
  const requested = requestedScryfallFinish(rawFinish);
  if (!requested) return true;
  const finishes = Array.isArray(card?.finishes) ? card.finishes.map(String) : [];
  return !finishes.length || finishes.includes(requested);
}

function formatScryfallPrintingCandidate(card, args = {}) {
  const finish = normalizeMcpFinish(args.finish, card);
  const qty = Math.max(1, parseInt(args.qty, 10) || 1);
  const previewAddArgs = {
    scryfallId: String(card?.id || ''),
    name: String(card?.name || ''),
    setCode: String(card?.set || '').toLowerCase(),
    cn: String(card?.collector_number || ''),
    finish,
    condition: normalizeMcpCondition(args.condition),
    language: String(args.language || args.lang || card?.lang || 'en').toLowerCase(),
    qty,
  };
  const location = normalizeLocation(args.location);
  if (location) previewAddArgs.location = location;
  if (Array.isArray(args.tags)) previewAddArgs.tags = args.tags.map(String);
  if (args.createContainer !== undefined) previewAddArgs.createContainer = coerceMcpBoolean(args.createContainer);
  return {
    name: String(card?.name || ''),
    scryfallId: String(card?.id || ''),
    setCode: String(card?.set || '').toLowerCase(),
    setName: String(card?.set_name || ''),
    collectorNumber: String(card?.collector_number || ''),
    rarity: String(card?.rarity || '').toLowerCase(),
    releasedAt: String(card?.released_at || ''),
    finishes: Array.isArray(card?.finishes) ? [...card.finishes] : [],
    requestedFinish: finish,
    typeLine: String(card?.type_line || card?.card_faces?.[0]?.type_line || ''),
    imageUrl: getScryfallImageUrl(card),
    scryfallUri: String(card?.scryfall_uri || ''),
    previewAddArgs,
  };
}

function printingPreferenceTextFromArgs(args = {}) {
  return [
    args.query,
    args.name,
    args.setCode,
    args.set,
    args.setName,
    args.edition,
    args.printing,
  ].map(value => String(value || '')).join(' ');
}

function requestsSecretLairPrinting(text) {
  return /\bsecret[\s_-]+lair\b|\bsld\b/i.test(String(text || ''));
}

function candidateSetCode(candidate) {
  return String(candidate?.setCode || candidate?.set || candidate?.previewAddArgs?.setCode || '').trim().toLowerCase();
}

function candidateSetName(candidate) {
  return String(candidate?.setName || candidate?.set_name || candidate?.previewAddArgs?.setName || '').trim().toLowerCase();
}

function printingPreferenceScore(candidate, text) {
  if (!requestsSecretLairPrinting(text)) return 0;
  const setCode = candidateSetCode(candidate);
  const setName = candidateSetName(candidate);
  if (setCode === 'sld') return 100;
  if (setName.includes('secret lair')) return 90;
  return 0;
}

function preferPrintingCandidatesForRequest(candidates, text) {
  if (!requestsSecretLairPrinting(text)) return candidates;
  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    score: printingPreferenceScore(candidate, text),
  }));
  if (!scored.some(item => item.score > 0)) return candidates;
  return scored
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(item => item.candidate);
}

async function lookupScryfallPrintingCards(args = {}) {
  const name = String(args.name || args.query || '').trim();
  if (!name) return { status: 'invalid', error: 'name or query is required', cards: [], candidates: [] };
  const requestedLimit = parseInt(args.limit, 10);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 12, 50));
  const lookup = await fetchScryfallPrintingsByName(name, {
    hardCap: Math.max(limit, Math.min(SCRYFALL_PRINTINGS_HARD_CAP, 150)),
  });
  const finishFiltered = args.finish
    ? lookup.cards.filter(card => candidateMatchesRequestedFinish(card, args.finish))
    : lookup.cards;
  const candidates = preferPrintingCandidatesForRequest(
    finishFiltered.map(card => formatScryfallPrintingCandidate(card, args)),
    printingPreferenceTextFromArgs(args)
  ).slice(0, limit);
  const requestedFinish = requestedScryfallFinish(args.finish);
  return {
    status: candidates.length ? 'ok' : 'not_found',
    query: name,
    resolvedName: lookup.fuzzyName || name,
    fuzzyName: lookup.fuzzyName,
    requestedFinish,
    totalCount: args.finish ? finishFiltered.length : lookup.totalCount,
    truncated: lookup.truncated || finishFiltered.length > candidates.length,
    cards: finishFiltered,
    candidates,
    message: candidates.length
      ? 'Choose one of these exact Scryfall printings, then call preview_add_inventory_item with that candidate previewAddArgs.'
      : 'No matching Scryfall printings were found.',
  };
}

async function searchScryfallPrintingCandidates(args = {}) {
  const lookup = await lookupScryfallPrintingCards(args);
  const { cards, ...result } = lookup;
  return result;
}

async function resolveScryfallCardForAdd(raw) {
  const scryfallId = String(raw.scryfallId || '').trim();
  if (scryfallId) {
    const fetched = await fetchScryfallJson(SCRYFALL_API + '/cards/' + encodeURIComponent(scryfallId));
    if (fetched.ok) return fetched.data;
    return null;
  }
  const setCode = String(raw.setCode || raw.set || '').trim().toLowerCase();
  const cn = String(raw.cn || raw.collectorNumber || '').trim();
  if (setCode && cn) {
    const fetched = await fetchScryfallJson(SCRYFALL_API + '/cards/' + encodeURIComponent(setCode) + '/' + encodeURIComponent(cn));
    if (fetched.ok) return fetched.data;
    return null;
  }
  const name = String(raw.name || raw.resolvedName || raw.query || '').trim();
  if (!name) return null;
  const exact = await fetchScryfallJson(SCRYFALL_API + '/cards/named?exact=' + encodeURIComponent(name));
  if (exact.ok) return exact.data;
  const fuzzy = await fetchScryfallJson(SCRYFALL_API + '/cards/named?fuzzy=' + encodeURIComponent(name));
  return fuzzy.ok ? fuzzy.data : null;
}

function mergeScryfallCardIntoInventoryEntry(raw, card, location) {
  const finish = normalizeMcpFinish(raw.finish, card);
  const priced = getScryfallUsdPrice(card, finish);
  return {
    name: String(raw.name || card?.name || '').trim(),
    resolvedName: String(card?.name || raw.resolvedName || raw.name || '').trim(),
    scryfallId: String(card?.id || raw.scryfallId || '').trim(),
    scryfallUri: String(card?.scryfall_uri || raw.scryfallUri || ''),
    setCode: String(card?.set || raw.setCode || raw.set || '').toLowerCase(),
    setName: String(card?.set_name || raw.setName || ''),
    cn: String(card?.collector_number || raw.cn || raw.collectorNumber || '').trim(),
    finish,
    condition: normalizeMcpCondition(raw.condition),
    language: String(raw.language || raw.lang || card?.lang || 'en').toLowerCase(),
    qty: Math.max(1, parseInt(raw.qty, 10) || 1),
    location,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    rarity: String(card?.rarity || raw.rarity || '').toLowerCase(),
    cmc: card?.cmc ?? null,
    colors: card?.colors || card?.card_faces?.[0]?.colors || [],
    colorIdentity: card?.color_identity || [],
    typeLine: card?.type_line || (card?.card_faces?.map(face => face.type_line).filter(Boolean).join(' // ') || ''),
    oracleText: card?.oracle_text || (card?.card_faces?.map(face => face.oracle_text).filter(Boolean).join(' // ') || ''),
    legalities: card?.legalities || {},
    finishes: Array.isArray(card?.finishes) ? [...card.finishes] : [],
    imageUrl: getScryfallImageUrl(card),
    backImageUrl: getScryfallBackImageUrl(card),
    price: priced.price,
    priceFallback: priced.priceFallback,
  };
}

function hasExactScryfallPrintingTarget(raw = {}) {
  if (String(raw.scryfallId || '').trim()) return true;
  const setCode = String(raw.setCode || raw.set || '').trim();
  const cn = String(raw.cn || raw.collectorNumber || '').trim();
  return !!(setCode && cn);
}

const REQUIRED_MCP_ADD_CARD_FIELDS = [
  ['scryfallId', 'scryfallId'],
  ['resolvedName', 'resolvedName'],
  ['setCode', 'setCode'],
  ['setName', 'setName'],
  ['cn', 'collectorNumber'],
  ['rarity', 'rarity'],
  ['typeLine', 'typeLine'],
  ['imageUrl', 'imageUrl'],
];

function missingMcpAddCardFields(entry = {}) {
  const missing = [];
  for (const [key, label] of REQUIRED_MCP_ADD_CARD_FIELDS) {
    if (!String(entry[key] ?? '').trim()) missing.push(label);
  }
  if (!Array.isArray(entry.finishes) || !entry.finishes.length) missing.push('finishes');
  return missing;
}

function mcpAddNeedsClarification({ missingFields = [], message = '' } = {}) {
  const fields = [...new Set(missingFields.map(String).filter(Boolean))];
  return {
    status: 'needs_clarification',
    error: message || 'A card add preview requires a complete real Scryfall printing before it can create a change token.',
    missingFields: fields,
    message: message || 'Ask the user for a Scryfall card id, Scryfall URL, or exact set code and collector number, then retry the preview.',
  };
}

function mcpAddNeedsInput({ candidates = [], missingFields = [], query = '', resolvedName = '', requestedFinish = '', totalCount = 0, truncated = false, message = '' } = {}) {
  const fields = [...new Set(missingFields.map(String).filter(Boolean))];
  return {
    status: 'needs_input',
    previewType: 'inventory.add',
    message: message || 'Choose the missing add details below, then create a preview.',
    missingFields: fields,
    query,
    resolvedName,
    requestedFinish,
    totalCount,
    truncated,
    candidates,
  };
}

function hasOwnNonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function missingMcpAddOptionFields(raw = {}) {
  const missing = [];
  if (!hasOwnNonEmpty(raw.qty) || !(parseInt(raw.qty, 10) > 0)) missing.push('qty');
  if (!hasOwnNonEmpty(raw.finish)) missing.push('finish');
  if (!hasOwnNonEmpty(raw.condition)) missing.push('condition');
  return missing;
}

function addPreviewOpsMissingCardFields(ops = []) {
  const isAddEvent = ops.some(op => op?.type === 'history.append' && op.payload?.event?.type === 'add');
  if (!isAddEvent) return [];
  const missing = [];
  for (const op of ops) {
    const payload = op?.payload || {};
    const entry = payload.entry;
    if (op?.type === 'collection.qtyDelta' && (parseInt(payload.delta, 10) || 0) > 0 && entry) {
      missing.push(...missingMcpAddCardFields(entry));
    } else if ((op?.type === 'collection.upsert' || op?.type === 'collection.replace') && entry) {
      missing.push(...missingMcpAddCardFields(entry));
    }
  }
  return [...new Set(missing)];
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

function resolveLocationForSnapshot(snapshot, raw) {
  const normalized = normalizeLocation(raw);
  if (!normalized) return null;
  const exact = containerFromSnapshot(snapshot, normalized);
  if (exact) return { type: exact.type || normalized.type, name: exact.name || normalized.name };
  if (typeof raw === 'string') {
    const wanted = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    const containers = allContainers(snapshot);
    const exactNameMatches = containers.filter(container => String(container.name || '').toLowerCase() === wanted);
    if (exactNameMatches.length === 1) return { type: exactNameMatches[0].type, name: exactNameMatches[0].name };
    const fuzzyNameMatches = containers.filter(container => {
      const name = String(container.name || '').toLowerCase();
      return name.includes(wanted) || wanted.includes(name);
    });
    if (fuzzyNameMatches.length === 1) return { type: fuzzyNameMatches[0].type, name: fuzzyNameMatches[0].name };
  }
  return normalized;
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

function entryQty(entry) {
  return parseInt(entry?.qty, 10) || 0;
}

function entryPrice(entry) {
  return Number(entry?.price) || 0;
}

function entryTotalValue(entry) {
  return entryPrice(entry) * entryQty(entry);
}

function roundCurrency(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

function highestPricedEntry(collection, metric = 'price') {
  return (collection || [])
    .filter(entry => entryPrice(entry) > 0)
    .sort((a, b) => {
      const aValue = metric === 'totalValue' ? entryTotalValue(a) : entryPrice(a);
      const bValue = metric === 'totalValue' ? entryTotalValue(b) : entryPrice(b);
      return bValue - aValue
        || String(a.resolvedName || a.name || '').localeCompare(String(b.resolvedName || b.name || ''));
    })[0] || null;
}

function summarizeEntry(entry) {
  const qty = entryQty(entry);
  const price = entryPrice(entry);
  return {
    itemKey: collectionKey(entry),
    name: entry.resolvedName || entry.name || '',
    scryfallId: entry.scryfallId || '',
    setCode: entry.setCode || '',
    cn: entry.cn || '',
    finish: entry.finish || 'normal',
    condition: entry.condition || 'near_mint',
    language: entry.language || 'en',
    qty,
    location: normalizeLocation(entry.location),
    deckBoard: entry.deckBoard || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    rarity: entry.rarity || '',
    typeLine: entry.typeLine || entry.type_line || '',
    setName: entry.setName || '',
    colors: Array.isArray(entry.colors) ? entry.colors : [],
    price,
    priceFallback: Boolean(entry.priceFallback),
    totalValue: roundCurrency(price * qty),
  };
}

function normalizeInventoryFinish(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!value) return '';
  if (value === 'normal' || value === 'nonfoil' || value === 'nonfoils' || value === 'non_foil' || value === 'non_foils') return 'normal';
  if (value === 'foil' || value === 'foils' || value === 'foiled') return 'foil';
  if (value === 'etched' || value === 'etched_foil' || value === 'etched_foils') return 'etched';
  return '';
}

function finishFromInventoryText(raw) {
  const text = String(raw || '').toLowerCase();
  if (/\bnon[\s_-]?foils?\b|\bnormal\b/.test(text)) return 'normal';
  if (/\betched(?:[\s_-]?foils?)?\b/.test(text)) return 'etched';
  if (/\bfoils?\b|\bfoiled\b/.test(text)) return 'foil';
  return '';
}

function stripInventoryFinishQuery(raw) {
  return String(raw || '')
    .replace(/\bnon[\s_-]?foils?\b/gi, ' ')
    .replace(/\betched(?:[\s_-]?foils?)?\b/gi, ' ')
    .replace(/\bfoils?\b|\bfoiled\b/gi, ' ')
    .replace(/\b(?:near[\s_-]?mint|lightly[\s_-]?played|moderately[\s_-]?played|heavily[\s_-]?played|damaged|nm|lp|mp|hp|dmg)\b/gi, ' ')
    .replace(/\b(?:commons?|uncommons?|rares?|mythics?|mythic\s+rares?)\b/gi, ' ')
    .replace(/\b(?:artifacts?|battles?|creatures?|enchantments?|instants?|lands?|planeswalkers?|sorceries)\b/gi, ' ')
    .replace(/\b(?:worth|price|priced|value|valued|costs?)\s+(?:at\s+)?(?:more\s+than|over|above|greater\s+than|at\s+least|less\s+than|under|below|at\s+most|>=?|<=?)\s+\$?\d+(?:\.\d+)?/gi, ' ')
    .replace(/\b(?:more\s+than|over|above|greater\s+than|at\s+least|less\s+than|under|below|at\s+most|>=?|<=?)\s+\$?\d+(?:\.\d+)?\b/gi, ' ')
    .replace(/\$\s?\d+(?:\.\d+)?\s*(?:\+|or\s+more|and\s+up)?/gi, ' ')
    .replace(/\b(?:at\s+least|more\s+than|over|less\s+than|under|below|at\s+most|>=?|<=?)\s+\d+\s+(?:copies|copy|cards?)\b/gi, ' ')
    .replace(/\b\d+\s*(?:\+|or\s+more)\s+(?:copies|copy|cards?)\b/gi, ' ')
    .replace(/\b(?:any|are|card|cards|cheapest|collection|copies|copy|cost|costs|do|expensive|have|highest|i|in|least|list|lowest|many|me|most|my|of|own|owned|price|priced|prices|priciest|quantity|qty|show|the|top|valuable|value|values|what|which|worth|s)\b/gi, ' ')
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inventoryFinishFilter(args = {}) {
  return normalizeInventoryFinish(args.finish)
    || finishFromInventoryText(args.query)
    || '';
}

function normalizeInventoryCondition(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!value) return '';
  if (value === 'nm' || value === 'near_mint' || value === 'nearmint') return 'near_mint';
  if (value === 'lp' || value === 'lightly_played') return 'lightly_played';
  if (value === 'mp' || value === 'moderately_played') return 'moderately_played';
  if (value === 'hp' || value === 'heavily_played') return 'heavily_played';
  if (value === 'dmg' || value === 'damaged') return 'damaged';
  return '';
}

function conditionFromInventoryText(raw) {
  const text = String(raw || '').toLowerCase();
  if (/\b(?:near[\s_-]?mint|nm)\b/.test(text)) return 'near_mint';
  if (/\b(?:lightly[\s_-]?played|lp)\b/.test(text)) return 'lightly_played';
  if (/\b(?:moderately[\s_-]?played|mp)\b/.test(text)) return 'moderately_played';
  if (/\b(?:heavily[\s_-]?played|hp)\b/.test(text)) return 'heavily_played';
  if (/\b(?:damaged|dmg)\b/.test(text)) return 'damaged';
  return '';
}

function normalizeRarity(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['common', 'uncommon', 'rare', 'mythic', 'mythic rare', 'special', 'bonus'].includes(value)) {
    return value === 'mythic rare' ? 'mythic' : value;
  }
  if (value === 'c') return 'common';
  if (value === 'u') return 'uncommon';
  if (value === 'r') return 'rare';
  if (value === 'm') return 'mythic';
  return '';
}

function rarityFromInventoryText(raw) {
  const text = String(raw || '').toLowerCase();
  if (/\bmythic(?:\s+rare)?s?\b/.test(text)) return 'mythic';
  if (/\brares?\b/.test(text)) return 'rare';
  if (/\buncommons?\b/.test(text)) return 'uncommon';
  if (/\bcommons?\b/.test(text)) return 'common';
  return '';
}

function inventoryTypeFromText(raw) {
  const text = String(raw || '').toLowerCase();
  const types = ['artifact', 'battle', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery'];
  for (const type of types) {
    const plural = type === 'sorcery' ? 'sorceries' : type + 's';
    if (new RegExp('\\b' + type + '\\b|\\b' + plural + '\\b').test(text)) return type;
  }
  return '';
}

function normalizeInventoryType(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return inventoryTypeFromText(value) || value;
}

function numericArg(args, names, fallback = null) {
  for (const name of names) {
    if (args[name] === undefined || args[name] === null || args[name] === '') continue;
    const value = Number(String(args[name]).replace(/[$,]/g, ''));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function numericTextBound(raw, patterns) {
  const text = String(raw || '').toLowerCase().replace(/,/g, '');
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function minPriceFromText(raw) {
  return numericTextBound(raw, [
    /\b(?:worth|price|priced|value|valued|costs?)\s+(?:at\s+)?(?:more\s+than|over|above|greater\s+than|at\s+least|>=?)\s+\$?(\d+(?:\.\d+)?)/,
    /\b(?:more\s+than|over|above|greater\s+than|at\s+least|>=?)\s+\$?(\d+(?:\.\d+)?)\b/,
    /\$\s?(\d+(?:\.\d+)?)\s*(?:\+|or\s+more|and\s+up)/,
  ]);
}

function maxPriceFromText(raw) {
  return numericTextBound(raw, [
    /\b(?:worth|price|priced|value|valued|costs?)\s+(?:at\s+)?(?:less\s+than|under|below|at\s+most|<=?)\s+\$?(\d+(?:\.\d+)?)/,
    /\b(?:less\s+than|under|below|at\s+most|<=?)\s+\$?(\d+(?:\.\d+)?)\b/,
  ]);
}

function minQtyFromText(raw) {
  return numericTextBound(raw, [
    /\b(?:at\s+least|more\s+than|over|>=?)\s+(\d+)\s+(?:copies|copy|cards?)\b/,
    /\b(\d+)\s*(?:\+|or\s+more)\s+(?:copies|copy|cards?)\b/,
    /\b(?:many|lots\s+of|a\s+lot\s+of|multiple)\s+copies\b/,
  ]) || (/\b(?:many|lots\s+of|a\s+lot\s+of|multiple)\s+copies\b/i.test(String(raw || '')) ? 2 : null);
}

function maxQtyFromText(raw) {
  return numericTextBound(raw, [
    /\b(?:less\s+than|under|below|at\s+most|<=?)\s+(\d+)\s+(?:copies|copy|cards?)\b/,
  ]);
}

function inventoryConditionFilter(args = {}) {
  return normalizeInventoryCondition(args.condition)
    || conditionFromInventoryText(args.query)
    || '';
}

function inventoryRarityFilter(args = {}) {
  return normalizeRarity(args.rarity)
    || rarityFromInventoryText(args.query)
    || '';
}

function inventoryTypeFilter(args = {}) {
  return normalizeInventoryType(args.cardType || args.typeLine || args.type)
    || inventoryTypeFromText(args.query)
    || '';
}

function inventoryTagsFilter(args = {}) {
  const raw = Array.isArray(args.tags) ? args.tags : (args.tag ? [args.tag] : []);
  return raw.map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean);
}

function inventorySearchToken(raw) {
  const token = String(raw || '').trim().toLowerCase();
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('es') && token.length > 4 && /(ches|shes|xes|zes|ses)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

function inventorySearchTokens(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map(inventorySearchToken)
    .filter(Boolean);
}

function inventoryNameMatchesQuery(name, query) {
  const nameText = String(name || '');
  const queryText = String(query || '');
  if (!queryText) return true;
  if (nameText.toLowerCase().includes(queryText.toLowerCase())) return true;
  const nameTokens = inventorySearchTokens(nameText);
  const queryTokens = inventorySearchTokens(queryText);
  if (!queryTokens.length) return true;
  return queryTokens.every(queryToken => nameTokens.some(nameToken => (
    nameToken === queryToken
      || nameToken.startsWith(queryToken)
      || queryToken.startsWith(nameToken)
  )));
}

function matchesInventory(entry, args = {}) {
  if (args.itemKey && collectionKey(entry) !== args.itemKey) return false;
  if (args.scryfallId && entry.scryfallId !== args.scryfallId) return false;
  if (args.setCode && String(entry.setCode || '').toLowerCase() !== String(args.setCode).toLowerCase()) return false;
  if (args.cn && String(entry.cn || '').toLowerCase() !== String(args.cn).toLowerCase()) return false;
  if (args.location && locationKey(entry.location) !== locationKey(args.location)) return false;
  const finish = inventoryFinishFilter(args);
  if (finish && (normalizeInventoryFinish(entry.finish) || 'normal') !== finish) return false;
  const condition = inventoryConditionFilter(args);
  if (condition && (normalizeInventoryCondition(entry.condition) || 'near_mint') !== condition) return false;
  const rarity = inventoryRarityFilter(args);
  if (rarity && normalizeRarity(entry.rarity) !== rarity) return false;
  const cardType = inventoryTypeFilter(args);
  if (cardType && !String(entry.typeLine || entry.type_line || '').toLowerCase().includes(cardType)) return false;
  const tags = inventoryTagsFilter(args);
  if (tags.length) {
    const entryTags = new Set((Array.isArray(entry.tags) ? entry.tags : []).map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean));
    if (!tags.every(tag => entryTags.has(tag))) return false;
  }
  const minPrice = numericArg(args, ['minPrice', 'priceMin'], minPriceFromText(args.query));
  if (minPrice != null && entryPrice(entry) < minPrice) return false;
  const maxPrice = numericArg(args, ['maxPrice', 'priceMax'], maxPriceFromText(args.query));
  if (maxPrice != null && entryPrice(entry) > maxPrice) return false;
  const minTotalValue = numericArg(args, ['minTotalValue', 'totalValueMin'], null);
  if (minTotalValue != null && entryTotalValue(entry) < minTotalValue) return false;
  const maxTotalValue = numericArg(args, ['maxTotalValue', 'totalValueMax'], null);
  if (maxTotalValue != null && entryTotalValue(entry) > maxTotalValue) return false;
  const minQty = numericArg(args, ['minQty', 'qtyMin'], minQtyFromText(args.query));
  if (minQty != null && entryQty(entry) < minQty) return false;
  const maxQty = numericArg(args, ['maxQty', 'qtyMax'], maxQtyFromText(args.query));
  if (maxQty != null && entryQty(entry) > maxQty) return false;
  const rawQuery = args.query != null ? stripInventoryFinishQuery(args.query) : args.name;
  const q = String(rawQuery || '').trim().toLowerCase();
  if (q) {
    const name = String(entry.resolvedName || entry.name || '').toLowerCase();
    if (!inventoryNameMatchesQuery(name, q)) return false;
  }
  return true;
}

function inventoryPriceSortDirection(raw) {
  const text = String(raw || '').toLowerCase();
  if (/\b(?:cheapest|least\s+expensive|lowest\s+(?:price|value)|least\s+valuable)\b/.test(text)) return 'asc';
  if (/\b(?:most\s+expensive|most\s+valuable|highest\s+(?:price|value)|priciest|top\s+(?:price|priced|value|valuable)|worth\s+the\s+most)\b/.test(text)) return 'desc';
  return '';
}

function normalizeInventorySortBy(args = {}) {
  const raw = String(args.sortBy || args.sort || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'price' || raw === 'prices' || raw === 'unit_price') return 'price';
  if (raw === 'value' || raw === 'total' || raw === 'total_value') return 'totalValue';
  if (raw === 'qty' || raw === 'quantity' || raw === 'copies' || raw === 'copy_count') return 'qty';
  if (raw === 'name') return 'name';
  if (/\b(?:most|fewest|least|highest|lowest)\s+(?:copies|copy|quantity|qty)\b/i.test(String(args.query || ''))) return 'qty';
  if (inventoryPriceSortDirection(args.query)) return 'price';
  return '';
}

function normalizeInventorySortDirection(args = {}) {
  const explicit = String(args.sortDirection || args.direction || '').trim().toLowerCase();
  if (explicit === 'asc' || explicit === 'ascending') return 'asc';
  if (explicit === 'desc' || explicit === 'descending') return 'desc';
  const queryDirection = inventoryPriceSortDirection(args.query);
  if (queryDirection) return queryDirection;
  const sortBy = normalizeInventorySortBy({ ...args, query: '' });
  if (sortBy === 'price' || sortBy === 'totalValue' || sortBy === 'qty') return 'desc';
  return 'asc';
}

function sortInventoryEntries(entries, args = {}) {
  const sortBy = normalizeInventorySortBy(args);
  if (!sortBy) return entries;
  const direction = normalizeInventorySortDirection(args);
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    if (sortBy === 'name') return multiplier * String(a.resolvedName || a.name || '').localeCompare(String(b.resolvedName || b.name || ''));
    if (sortBy === 'qty') return multiplier * (entryQty(a) - entryQty(b))
      || String(a.resolvedName || a.name || '').localeCompare(String(b.resolvedName || b.name || ''));
    const aValue = sortBy === 'totalValue' ? entryTotalValue(a) : entryPrice(a);
    const bValue = sortBy === 'totalValue' ? entryTotalValue(b) : entryPrice(b);
    return multiplier * (aValue - bValue)
      || String(a.resolvedName || a.name || '').localeCompare(String(b.resolvedName || b.name || ''));
  });
}

function findInventory(snapshot, args = {}, limit = 25) {
  const filtered = (snapshot?.app?.collection || [])
    .filter(entry => matchesInventory(entry, args));
  return sortInventoryEntries(filtered, args)
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
  const missingAddFields = addPreviewOpsMissingCardFields(allOps);
  if (missingAddFields.length) {
    return mcpAddNeedsClarification({
      missingFields: missingAddFields,
      message: 'The add preview resolved to incomplete card metadata, so no change token was created.',
    });
  }
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
  const totalValue = roundCurrency(collection.reduce((sum, entry) => sum + entryTotalValue(entry), 0));
  const pricedEntries = collection.filter(entry => entryPrice(entry) > 0).length;
  const mostExpensiveCard = highestPricedEntry(collection, 'price');
  const mostValuableStack = highestPricedEntry(collection, 'totalValue');
  return {
    revision: cloud.revision,
    uniqueCards: collection.length,
    totalCards: collection.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0),
    totalValue,
    pricedEntries,
    unpricedEntries: Math.max(0, collection.length - pricedEntries),
    mostExpensiveCard: mostExpensiveCard ? summarizeEntry(mostExpensiveCard) : null,
    mostValuableStack: mostValuableStack ? summarizeEntry(mostValuableStack) : null,
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
  const searchArgs = { ...args };
  if (searchArgs.location) searchArgs.location = resolveLocationForSnapshot(cloud.snapshot, searchArgs.location);
  const limit = Math.min(parseInt(args.limit, 10) || 100, 200);
  return {
    revision: cloud.revision,
    results: findInventory(cloud.snapshot, searchArgs, limit),
    limit,
  };
}

async function toolSearchCardPrintings(env, deps, auth, args = {}) {
  return searchScryfallPrintingCandidates(args);
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
  const loc = resolveLocationForSnapshot(cloud.snapshot, args.location || { type: args.type, name: args.name });
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
  const loc = resolveLocationForSnapshot(cloud.snapshot, args.location || { type: 'deck', name: args.name });
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
  const toLocation = resolveLocationForSnapshot(cloud.snapshot, args.toLocation || args.locationTo || args.destination);
  if (!toLocation) return { status: 'invalid', error: 'toLocation is required' };
  const toKey = locationKey(toLocation);
  const existingContainer = containerFromSnapshot(cloud.snapshot, toLocation);
  if (!existingContainer && !readCreateContainerFlag(args)) {
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
  const missingOptionFields = missingMcpAddOptionFields(raw);
  let resolvedCard = null;
  if (!hasExactScryfallPrintingTarget(raw)) {
    const lookup = await lookupScryfallPrintingCards({ ...raw, limit: raw.limit || 12 });
    if (lookup.cards.length === 1 && !missingOptionFields.length) {
      resolvedCard = lookup.cards[0];
    } else if (lookup.candidates.length) {
      return mcpAddNeedsInput({
        message: 'Choose the exact printing and missing copy details, then create a preview.',
        missingFields: [...(lookup.cards.length === 1 ? [] : ['printing']), ...missingOptionFields],
        query: lookup.query,
        resolvedName: lookup.resolvedName,
        requestedFinish: lookup.requestedFinish,
        totalCount: lookup.totalCount,
        truncated: lookup.truncated,
        candidates: lookup.candidates,
      });
    } else {
      return mcpAddNeedsClarification({
        missingFields: ['scryfallId', 'setCode', 'collectorNumber'],
        message: 'No matching Scryfall printing was found. Ask the user for the set code and collector number, or a Scryfall card URL/id.',
      });
    }
  }
  const location = resolveLocationForSnapshot(cloud.snapshot, raw.location);
  resolvedCard = resolvedCard || await resolveScryfallCardForAdd(raw);
  if (!resolvedCard) {
    return mcpAddNeedsClarification({
      missingFields: ['scryfallId', 'setCode', 'collectorNumber'],
      message: 'That Scryfall printing was not found. Ask the user to confirm the set code and collector number, or provide a Scryfall card URL/id.',
    });
  }
  if (missingOptionFields.length) {
    const candidate = formatScryfallPrintingCandidate(resolvedCard, raw);
    return mcpAddNeedsInput({
      message: 'Choose the missing copy details, then create a preview.',
      missingFields: missingOptionFields,
      query: raw.name || raw.query || '',
      resolvedName: candidate.name,
      requestedFinish: requestedScryfallFinish(raw.finish),
      totalCount: 1,
      candidates: [candidate],
    });
  }
  const entry = mergeScryfallCardIntoInventoryEntry(raw, resolvedCard, location);
  const missingFields = missingMcpAddCardFields(entry);
  if (missingFields.length) {
    return mcpAddNeedsClarification({
      missingFields,
      message: 'Scryfall returned incomplete metadata for that printing, so no add preview was created.',
    });
  }
  const locKey = locationKey(location);
  const ops = [];
  if (location && !containerFromSnapshot(cloud.snapshot, location)) {
    if (!readCreateContainerFlag(args)) {
      return { status: 'missing_container', missingContainer: location, message: 'Set createContainer=true to create ' + locKey + '.' };
    }
    ops.push(makeSyncOp('container.upsert', { key: locKey, container: makeContainer(location) }));
  }
  const key = collectionKey(entry);
  ops.push(makeSyncOp('collection.qtyDelta', { key, delta: entry.qty, entry }));
  const summary = 'Added ' + entry.qty + ' ' + (entry.resolvedName || entry.name || 'card') + (locKey ? ' to {loc:' + locKey + '}' : '');
  const event = eventBase({ type: 'add', summary, affectedKeys: [key], containerAfter: location && !containerFromSnapshot(cloud.snapshot, location) ? location : null });
  const preview = await previewFromOps(env, auth, cloud, { summary, ops, event });
  return {
    ...preview,
    previewType: 'inventory.add',
    card: {
      name: entry.resolvedName || entry.name || '',
      setCode: entry.setCode || '',
      cn: entry.cn || '',
      finish: entry.finish || 'normal',
      qty: entry.qty,
      location,
    },
  };
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

function changeTokensFromApplyArgs(args = {}) {
  const tokens = Array.isArray(args.changeTokens) ? args.changeTokens
    : Array.isArray(args.changeToken) ? args.changeToken
      : [args.changeToken];
  return tokens.map(token => String(token || '').trim()).filter(Boolean);
}

function opsWithSequentialUndoSnapshot(ops, beforeSnapshot) {
  const adjusted = cloneJson(ops, []);
  for (const op of adjusted) {
    if (op?.type === 'history.append' && op.payload?.event?.mcp) {
      op.payload.event.mcp.beforeSnapshot = cloneJson(beforeSnapshot, makeEmptySnapshot());
    }
  }
  return adjusted;
}

async function toolApplyCollectionChange(env, deps, auth, args = {}) {
  if (!hasScope(auth, MCP_WRITE_SCOPE)) throw new Error('insufficient_scope');
  const tokens = changeTokensFromApplyArgs(args);
  if (!tokens.length) throw new Error('changeToken is required');
  const payloads = [];
  for (const token of tokens) {
    const payload = await verifyChangeToken(env, token);
    if (payload.userId !== auth.userId) throw new Error('change token belongs to another user');
    if (!Array.isArray(payload.scopes) || !payload.scopes.includes(MCP_WRITE_SCOPE)) {
      throw new Error('change token does not include collection.write');
    }
    const missingAddFields = addPreviewOpsMissingCardFields(payload.ops);
    if (missingAddFields.length) {
      const err = new Error('change token contains incomplete card metadata');
      err.status = 400;
      err.data = {
        status: 'needs_clarification',
        missingFields: missingAddFields,
        message: 'Ask the user for an exact Scryfall printing, then create a fresh preview.',
      };
      throw err;
    }
    payloads.push(payload);
  }
  const cloud = await currentCloud(env, deps, auth.userId);
  const expectedRevision = payloads[0].expectedRevision;
  if (payloads.some(payload => payload.expectedRevision !== expectedRevision) || cloud.revision !== expectedRevision) {
    const err = new Error('cloud collection changed since preview');
    err.status = 409;
    err.data = { expectedRevision, actualRevision: cloud.revision };
    throw err;
  }

  const ops = [];
  let runningSnapshot = cloneJson(cloud.snapshot, makeEmptySnapshot());
  for (const payload of payloads) {
    const adjustedOps = opsWithSequentialUndoSnapshot(payload.ops, runningSnapshot);
    ops.push(...adjustedOps);
    runningSnapshot = applyOps(runningSnapshot, adjustedOps);
  }

  const pushed = await pushOps(env, deps, auth.userId, {
    ops,
    snapshot: cloud.snapshot,
    baseRevision: expectedRevision,
    requireBaseRevision: true,
  });
  const summary = payloads.length === 1
    ? payloads[0].summary
    : 'Applied ' + payloads.length + ' previewed collection changes';
  return {
    status: 'applied',
    summary,
    summaries: payloads.map(payload => payload.summary).filter(Boolean),
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

const NUMBERISH_SCHEMA = { oneOf: [{ type: 'number' }, { type: 'string' }] };
const BOOLEANISH_SCHEMA = { oneOf: [{ type: 'boolean' }, { type: 'string' }] };

const TOOL_DEFINITIONS = [
  ['get_collection_summary', 'Summarize the signed-in MTG collection, including total priced value and the highest-priced cards when price data exists.', {}],
  ['search_inventory', 'Search physical inventory entries. Results include per-copy USD price, quantity, totalValue, card type, rarity, tags, and location. For broad filter questions leave query empty and use filters like finish, location, minPrice, minQty, cardType, condition, rarity, tags, sortBy, and sortDirection. Use sortBy=price and sortDirection=desc for most-expensive-card questions.', {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Card name text only. Leave empty for broad collection filters like foils, instants, expensive cards, container contents, or quantity thresholds.' },
      itemKey: { type: 'string' },
      scryfallId: { type: 'string' },
      setCode: { type: 'string' },
      cn: { type: 'string' },
      finish: { type: 'string', enum: ['normal', 'nonfoil', 'non-foil', 'foil', 'foils', 'etched', 'etched foil'] },
      condition: { type: 'string', enum: ['near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged', 'nm', 'lp', 'mp', 'hp', 'dmg'] },
      rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'mythic', 'c', 'u', 'r', 'm'] },
      cardType: { type: 'string', description: 'A Magic card type such as artifact, creature, instant, sorcery, enchantment, land, planeswalker, or battle.' },
      tags: { type: 'array', items: { type: 'string' } },
      location: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      minPrice: NUMBERISH_SCHEMA,
      maxPrice: NUMBERISH_SCHEMA,
      minTotalValue: NUMBERISH_SCHEMA,
      maxTotalValue: NUMBERISH_SCHEMA,
      minQty: NUMBERISH_SCHEMA,
      maxQty: NUMBERISH_SCHEMA,
      sortBy: { type: 'string', enum: ['name', 'price', 'value', 'totalValue', 'qty', 'quantity'] },
      sortDirection: { type: 'string', enum: ['asc', 'ascending', 'desc', 'descending'] },
      limit: NUMBERISH_SCHEMA,
    },
  }],
  ['search_card_printings', 'Look up exact Scryfall printings for a card name before previewing an add. Use this when a user asks to add a card but has not given setCode+collectorNumber or scryfallId.', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      name: { type: 'string' },
      finish: { type: 'string', enum: ['normal', 'nonfoil', 'non-foil', 'foil', 'etched', 'etched foil'] },
      condition: { type: 'string' },
      language: { type: 'string' },
      qty: NUMBERISH_SCHEMA,
      location: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      createContainer: BOOLEANISH_SCHEMA,
      tags: { type: 'array', items: { type: 'string' } },
      limit: NUMBERISH_SCHEMA,
    },
  }],
  ['list_containers', 'List decks, binders, and boxes.', {
    type: 'object',
    properties: { type: { type: 'string', enum: ['deck', 'binder', 'box'] } },
  }],
  ['get_container', 'Get a binder, box, or deck container and its cards.', {
    type: 'object',
    properties: { type: { type: 'string' }, name: { type: 'string' }, location: { oneOf: [{ type: 'string' }, { type: 'object' }] }, limit: NUMBERISH_SCHEMA },
  }],
  ['get_deck', 'Get deck metadata, decklist, and physical inventory in that deck.', {
    type: 'object',
    properties: { name: { type: 'string' }, location: { oneOf: [{ type: 'string' }, { type: 'object' }] } },
  }],
  ['get_recent_changes', 'List recent collection changelog entries.', {
    type: 'object',
    properties: { limit: NUMBERISH_SCHEMA },
  }],
  ['preview_move_inventory_item', 'Preview moving physical inventory to another location.', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      itemKey: { type: 'string' },
      toLocation: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      qty: NUMBERISH_SCHEMA,
      createContainer: BOOLEANISH_SCHEMA,
      createcontainer: BOOLEANISH_SCHEMA,
      create_container: BOOLEANISH_SCHEMA,
    },
    required: ['toLocation'],
  }],
  ['preview_add_inventory_item', 'Preview adding a physical inventory entry. Requires a real Scryfall printing plus explicit qty, finish, and condition. Do not guess physical-copy options; missing details return needs_input with candidates for the app to render.', {
    type: 'object',
    properties: {
      name: { type: 'string' },
      scryfallId: { type: 'string' },
      setCode: { type: 'string' },
      set: { type: 'string' },
      cn: { type: 'string' },
      collectorNumber: { type: 'string' },
      finish: { type: 'string', enum: ['normal', 'nonfoil', 'non-foil', 'foil', 'etched', 'etched foil'] },
      condition: { type: 'string' },
      language: { type: 'string' },
      qty: NUMBERISH_SCHEMA,
      location: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      createContainer: BOOLEANISH_SCHEMA,
      createcontainer: BOOLEANISH_SCHEMA,
      create_container: BOOLEANISH_SCHEMA,
      tags: { type: 'array', items: { type: 'string' } },
    },
  }],
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
  inputSchema: nullableOptionalProperties(inputSchema.type ? inputSchema : { type: 'object', properties: {} }),
}));

function schemaAllowsNull(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type === 'null') return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  return Array.isArray(schema.oneOf) && schema.oneOf.some(schemaAllowsNull);
}

function nullableSchema(schema) {
  if (!schema || typeof schema !== 'object' || schemaAllowsNull(schema)) return schema;
  if (Array.isArray(schema.oneOf)) return { ...schema, oneOf: [...schema.oneOf, { type: 'null' }] };
  if (Array.isArray(schema.type)) return { ...schema, type: [...schema.type, 'null'] };
  return { oneOf: [schema, { type: 'null' }] };
}

function nullableOptionalProperties(schema) {
  if (!schema || typeof schema !== 'object' || schema.type !== 'object' || !schema.properties) return schema;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const properties = {};
  for (const [name, propSchema] of Object.entries(schema.properties)) {
    properties[name] = required.has(name) ? propSchema : nullableSchema(propSchema);
  }
  return { ...schema, properties };
}

function toolNeedsWrite(name) {
  return name === 'apply_collection_change'
    || name === 'undo_last_mcp_change'
    || String(name || '').startsWith('preview_');
}

function toolHiddenForAuth(tool, auth) {
  if (!hasScope(auth, MCP_WRITE_SCOPE) && toolNeedsWrite(tool.name)) return true;
  return isChatClient(auth) && (tool.name === 'apply_collection_change' || tool.name === 'undo_last_mcp_change');
}

function visibleToolsForAuth(auth) {
  return TOOL_DEFINITIONS.filter(tool => !toolHiddenForAuth(tool, auth));
}

async function executeTool(name, args, env, deps, auth) {
  switch (name) {
    case 'get_collection_summary': return toolGetCollectionSummary(env, deps, auth, args);
    case 'search_inventory': return toolSearchInventory(env, deps, auth, args);
    case 'search_card_printings': return toolSearchCardPrintings(env, deps, auth, args);
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
    if (method === 'tools/list') return jsonRpcResult(id, { tools: visibleToolsForAuth(auth) });
    if (method === 'tools/call') {
      const name = params.name;
      if (isChatClient(auth) && (name === 'apply_collection_change' || name === 'undo_last_mcp_change')) {
        return jsonRpcError(id, -32003, 'tool unavailable in chat preview session');
      }
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

function scrubSecrets(message, secrets) {
  return secrets.reduce((out, secret) => scrubSecret(out, secret), String(message || ''));
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

function normalizeMcpPreview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const changeToken = typeof value.changeToken === 'string' ? value.changeToken.trim() : '';
  if (!changeToken) return null;
  const status = String(value.status || '').toLowerCase();
  if (status && status !== 'preview') return null;
  const out = {
    changeToken,
    summary: String(value.summary || value.message || 'Previewed collection change'),
  };
  if (value.expectedRevision !== undefined) out.expectedRevision = value.expectedRevision;
  if (value.expiresAt !== undefined) out.expiresAt = value.expiresAt;
  if (value.opCount !== undefined) out.opCount = value.opCount;
  if (value.totalsAfter && typeof value.totalsAfter === 'object') out.totalsAfter = value.totalsAfter;
  if (value.previewType !== undefined) out.previewType = String(value.previewType || '');
  if (value.card && typeof value.card === 'object') out.card = cloneJson(value.card, null);
  return out;
}

function normalizeMcpDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.filter(candidate => candidate?.previewAddArgs && typeof candidate.previewAddArgs === 'object')
    : [];
  if (!candidates.length) return null;
  const status = String(value.status || '').toLowerCase();
  if (!['ok', 'needs_input', 'needs_selection'].includes(status)) return null;
  return {
    status,
    previewType: String(value.previewType || 'inventory.add'),
    message: String(value.message || 'Choose the missing add details below, then create a preview.'),
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(String) : [],
    query: String(value.query || ''),
    resolvedName: String(value.resolvedName || ''),
    requestedFinish: String(value.requestedFinish || ''),
    totalCount: value.totalCount ?? candidates.length,
    truncated: !!value.truncated,
    candidates: candidates.slice(0, 20).map(candidate => ({
      name: String(candidate.name || ''),
      scryfallId: String(candidate.scryfallId || ''),
      setCode: String(candidate.setCode || ''),
      setName: String(candidate.setName || ''),
      collectorNumber: String(candidate.collectorNumber || ''),
      rarity: String(candidate.rarity || ''),
      releasedAt: String(candidate.releasedAt || ''),
      finishes: Array.isArray(candidate.finishes) ? candidate.finishes.map(String) : [],
      requestedFinish: String(candidate.requestedFinish || ''),
      typeLine: String(candidate.typeLine || ''),
      imageUrl: String(candidate.imageUrl || ''),
      scryfallUri: String(candidate.scryfallUri || ''),
      previewAddArgs: cloneJson(candidate.previewAddArgs, {}),
    })),
  };
}

function preferDraftsForUserRequest(drafts, userText) {
  if (!Array.isArray(drafts) || !drafts.length) return [];
  return drafts.map(draft => ({
    ...draft,
    candidates: preferPrintingCandidatesForRequest(draft.candidates, userText),
  }));
}

function jsonValuesFromString(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > 30000) return [];
  const candidates = [trimmed];
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  const seen = new Set();
  return candidates
    .filter(candidate => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      return true;
    })
    .map(candidate => safeJsonParse(candidate, null))
    .filter(value => value && typeof value === 'object');
}

function collectMcpPreviews(value, out, seenObjects, seenTokens, depth = 0) {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    for (const parsed of jsonValuesFromString(value)) collectMcpPreviews(parsed, out, seenObjects, seenTokens, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  const preview = normalizeMcpPreview(value);
  if (preview && !seenTokens.has(preview.changeToken)) {
    seenTokens.add(preview.changeToken);
    out.push(preview);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMcpPreviews(item, out, seenObjects, seenTokens, depth + 1);
    return;
  }
  for (const child of Object.values(value)) collectMcpPreviews(child, out, seenObjects, seenTokens, depth + 1);
}

function extractMcpPreviews(data) {
  const out = [];
  collectMcpPreviews(data, out, new WeakSet(), new Set());
  return out;
}

function collectMcpDrafts(value, out, seenObjects, seenKeys, depth = 0) {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    for (const parsed of jsonValuesFromString(value)) collectMcpDrafts(parsed, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  const draft = normalizeMcpDraft(value);
  if (draft) {
    const key = draft.candidates.map(candidate => candidate.scryfallId || candidate.setCode + ':' + candidate.collectorNumber).join('|')
      + ':' + draft.missingFields.join(',');
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      out.push(draft);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMcpDrafts(item, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  for (const child of Object.values(value)) collectMcpDrafts(child, out, seenObjects, seenKeys, depth + 1);
}

function extractMcpDrafts(data) {
  const out = [];
  collectMcpDrafts(data, out, new WeakSet(), new Set());
  return out;
}

function normalizeMcpInventoryCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const itemKey = String(value.itemKey || '').trim();
  if (!itemKey) return null;
  const name = String(value.name || value.resolvedName || '').trim();
  if (!name) return null;
  const qty = Math.max(0, parseInt(value.qty, 10) || 0);
  if (!qty) return null;
  return {
    itemKey,
    name,
    scryfallId: String(value.scryfallId || '').trim(),
    setCode: String(value.setCode || value.set || '').trim().toLowerCase(),
    cn: String(value.cn || value.collectorNumber || '').trim(),
    finish: String(value.finish || 'normal').trim().toLowerCase(),
    condition: String(value.condition || 'near_mint').trim().toLowerCase(),
    language: String(value.language || value.lang || 'en').trim().toLowerCase(),
    qty,
    location: normalizeLocation(value.location),
    deckBoard: String(value.deckBoard || '').trim(),
    tags: Array.isArray(value.tags) ? value.tags.map(String).filter(Boolean).slice(0, 12) : [],
    rarity: String(value.rarity || '').trim().toLowerCase(),
    typeLine: String(value.typeLine || value.type_line || '').trim(),
    setName: String(value.setName || '').trim(),
    colors: Array.isArray(value.colors) ? value.colors.map(String).filter(Boolean).slice(0, 6) : [],
    price: Number(value.price) || 0,
    priceFallback: Boolean(value.priceFallback),
    totalValue: Number(value.totalValue) || 0,
    imageUrl: String(value.imageUrl || '').trim(),
    backImageUrl: String(value.backImageUrl || '').trim(),
    scryfallUri: String(value.scryfallUri || '').trim(),
  };
}

function collectMcpInventoryCards(value, out, seenObjects, seenKeys, depth = 0) {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    for (const parsed of jsonValuesFromString(value)) collectMcpInventoryCards(parsed, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  const card = normalizeMcpInventoryCard(value);
  if (card && !seenKeys.has(card.itemKey)) {
    seenKeys.add(card.itemKey);
    out.push(card);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMcpInventoryCards(item, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  for (const child of Object.values(value)) collectMcpInventoryCards(child, out, seenObjects, seenKeys, depth + 1);
}

function extractMcpInventoryCards(data) {
  const out = [];
  collectMcpInventoryCards(data, out, new WeakSet(), new Set());
  return out.slice(0, 100);
}

function locationFromKeyString(key) {
  const raw = String(key || '').trim();
  const index = raw.indexOf(':');
  if (index === -1) return null;
  return normalizeLocation({ type: raw.slice(0, index), name: raw.slice(index + 1) });
}

function normalizeMcpContainerStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stats = value.stats && typeof value.stats === 'object' ? value.stats : null;
  const rawContainer = value.container && typeof value.container === 'object' ? value.container : value;
  if (!stats) return null;
  const keyedLocation = locationFromKeyString(rawContainer.key);
  const loc = normalizeLocation(rawContainer) || keyedLocation;
  if (!loc) return null;
  const total = Math.max(0, parseInt(stats.total, 10) || 0);
  const unique = Math.max(0, parseInt(stats.unique, 10) || 0);
  return {
    key: locationKey(loc),
    type: loc.type,
    name: loc.name,
    stats: {
      unique,
      total,
      value: roundCurrency(Number(stats.value) || 0),
    },
  };
}

function collectMcpContainerStats(value, out, seenObjects, seenKeys, depth = 0) {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    for (const parsed of jsonValuesFromString(value)) collectMcpContainerStats(parsed, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (seenObjects.has(value)) return;
  seenObjects.add(value);

  const container = normalizeMcpContainerStats(value);
  if (container && !seenKeys.has(container.key)) {
    seenKeys.add(container.key);
    out.push(container);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMcpContainerStats(item, out, seenObjects, seenKeys, depth + 1);
    return;
  }
  for (const child of Object.values(value)) collectMcpContainerStats(child, out, seenObjects, seenKeys, depth + 1);
}

function extractMcpContainerStats(data) {
  const out = [];
  collectMcpContainerStats(data, out, new WeakSet(), new Set());
  return out.slice(0, 100);
}

function containerStatsQuestion(userText) {
  const text = String(userText || '').toLowerCase();
  if (inventoryPriceSortDirection(text)) return false;
  const asksCount = /\bhow\s+many\b|\bcount\b|\btotal\b|\bnumber\s+of\b/.test(text);
  const mentionsContainer = /\b(?:binder|box|deck|container)\b|\bin\s+(?:my\s+)?[a-z0-9\s-]+$/.test(text);
  const asksValue = /\b(?:value|valued|worth)\b/.test(text) && mentionsContainer;
  return (asksCount && mentionsContainer) || asksValue;
}

function containerMatchScore(container, userText) {
  const text = String(userText || '').toLowerCase();
  const name = String(container?.name || '').toLowerCase();
  const type = String(container?.type || '').toLowerCase();
  const key = String(container?.key || '').toLowerCase();
  const userTokens = new Set(normalizedMatchTokens(text));
  let score = 0;
  if (key && text.includes(key)) score += 8;
  if (name && text.includes(name)) score += 5;
  if (type && userTokens.has(type)) score += 2;
  for (const token of normalizedMatchTokens(name)) {
    if (userTokens.has(token)) score += 1;
  }
  return score;
}

function chooseContainerStats(containers, userText) {
  const normalized = Array.isArray(containers) ? containers.filter(Boolean) : [];
  if (!normalized.length) return null;
  if (normalized.length === 1) return normalized[0];
  const ranked = normalized
    .map(container => ({ container, score: containerMatchScore(container, userText) }))
    .sort((a, b) => b.score - a.score || a.container.key.localeCompare(b.container.key));
  return ranked[0]?.score > 0 ? ranked[0].container : null;
}

function plural(count, singular, pluralWord = singular + 's') {
  return Number(count) === 1 ? singular : pluralWord;
}

function capitalizedSentenceStart(text) {
  const raw = String(text || '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'That container';
}

function containerStatsSummaryText(containers, userText) {
  if (!containerStatsQuestion(userText)) return '';
  const container = chooseContainerStats(containers, userText);
  if (!container) return '';
  const total = Math.max(0, parseInt(container.stats?.total, 10) || 0);
  const unique = Math.max(0, parseInt(container.stats?.unique, 10) || 0);
  const value = Number(container.stats?.value) || 0;
  const label = capitalizedSentenceStart(container.name || container.type || 'that container');
  if (/\b(?:value|valued|worth)\b/i.test(userText)) {
    return label + ' is valued at $' + value.toFixed(2) + ' across '
      + total + ' total ' + plural(total, 'card') + ' and '
      + unique + ' unique ' + plural(unique, 'card') + '.';
  }
  return label + ' has ' + total + ' total ' + plural(total, 'card') + ' across '
    + unique + ' unique ' + plural(unique, 'card') + '.';
}

function filterInventoryCardsForUserRequest(cards, userText) {
  const finish = finishFromInventoryText(userText);
  const minPrice = minPriceFromText(userText);
  const maxPrice = maxPriceFromText(userText);
  const minQty = minQtyFromText(userText);
  const maxQty = maxQtyFromText(userText);
  const type = inventoryTypeFromText(userText);
  const condition = conditionFromInventoryText(userText);
  const rarity = rarityFromInventoryText(userText);
  const canFilterType = !type || cards.some(card => String(card.typeLine || '').trim());
  const canFilterRarity = !rarity || cards.some(card => String(card.rarity || '').trim());
  return cards.filter(card => {
    if (finish && (normalizeInventoryFinish(card.finish) || 'normal') !== finish) return false;
    if (condition && (normalizeInventoryCondition(card.condition) || 'near_mint') !== condition) return false;
    if (canFilterRarity && rarity && normalizeRarity(card.rarity) !== rarity) return false;
    if (canFilterType && type && !String(card.typeLine || '').toLowerCase().includes(type)) return false;
    if (minPrice != null && (Number(card.price) || 0) < minPrice) return false;
    if (maxPrice != null && (Number(card.price) || 0) > maxPrice) return false;
    if (minQty != null && (parseInt(card.qty, 10) || 0) < minQty) return false;
    if (maxQty != null && (parseInt(card.qty, 10) || 0) > maxQty) return false;
    return true;
  });
}

function inventoryFinishSummaryLabel(finish) {
  if (finish === 'foil') return 'foil';
  if (finish === 'etched') return 'etched foil';
  if (finish === 'normal') return 'nonfoil';
  return '';
}

function singleCardValueQuestion(userText) {
  const text = String(userText || '').toLowerCase();
  if (inventoryPriceSortDirection(text)) return false;
  if (minPriceFromText(text) != null || maxPriceFromText(text) != null) return false;
  return /\bhow\s+much\b/.test(text) || /\b(?:worth|value|price|priced|cost|costs)\b/.test(text);
}

function singleCardValueSummaryText(card) {
  const qty = Math.max(1, parseInt(card?.qty, 10) || 1);
  const unitPrice = Number(card?.price) || 0;
  const totalValue = Number(card?.totalValue) || (unitPrice * qty);
  if (!unitPrice && !totalValue) {
    return 'I found ' + card.name + ', but it does not have a saved price. It is shown below.';
  }
  if (qty > 1 && totalValue && Math.abs(totalValue - unitPrice) > 0.001) {
    return 'Your ' + qty + ' copies of ' + card.name + ' are worth $' + totalValue.toFixed(2)
      + ' total ($' + unitPrice.toFixed(2) + ' each). They are shown below.';
  }
  return 'Your ' + card.name + ' is worth $' + (unitPrice || totalValue).toFixed(2) + '. It is shown below.';
}

function inventoryCardsSummaryText(cards, userText) {
  const count = Array.isArray(cards) ? cards.length : 0;
  if (!count) return '';
  if (count === 1 && singleCardValueQuestion(userText)) {
    return singleCardValueSummaryText(cards[0]);
  }
  const priceDirection = inventoryPriceSortDirection(userText);
  if (priceDirection) {
    const card = cards[0];
    const price = Number(card?.price) || 0;
    const priceText = price ? ' at $' + price.toFixed(2) : '';
    const label = priceDirection === 'asc' ? 'cheapest priced card' : 'most expensive card';
    return 'The ' + label + ' I found is ' + card.name + priceText + '. It is shown below.';
  }
  const finish = inventoryFinishSummaryLabel(finishFromInventoryText(userText));
  const noun = count === 1 ? 'card' : 'cards';
  return 'I found ' + count + ' ' + (finish ? finish + ' ' : '') + noun + ' from your collection. '
    + (count === 1 ? 'It is' : 'They are') + ' shown below.';
}

function orderInventoryCardsForUserRequest(cards, userText) {
  const direction = inventoryPriceSortDirection(userText);
  if (!direction) return cards;
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...cards].sort((a, b) => {
    const priceDelta = (Number(a.price) || 0) - (Number(b.price) || 0);
    return multiplier * priceDelta || a.name.localeCompare(b.name);
  });
}

const PREVIEW_MATCH_STOPWORDS = new Set([
  'a', 'add', 'an', 'and', 'another', 'binder', 'box', 'card', 'cards', 'collection', 'create', 'deck', 'foil', 'foils', 'from', 'in', 'into',
  'make', 'move', 'my', 'nonfoil', 'normal', 'of', 'one', 'please', 'put', 'the', 'to', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine', 'ten', 'with',
]);

function normalizedMatchTokens(text) {
  return (String(text || '')
    .normalize('NFKD')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [])
    .map(token => (/^\d+$/.test(token) ? String(parseInt(token, 10)) : token))
    .filter(Boolean);
}

function significantMatchTokens(text) {
  return normalizedMatchTokens(text).filter(token => token.length >= 3 && !PREVIEW_MATCH_STOPWORDS.has(token));
}

function cardNameFromPreview(preview) {
  const explicit = String(preview?.card?.name || '').trim();
  if (explicit) return explicit;
  const match = String(preview?.summary || '').match(/^Added\s+\d+\s+(.+?)(?:\s+to\s+\{loc:|$)/i);
  return match ? match[1].trim() : '';
}

function previewLooksLikeUserRequest(preview, userText) {
  if (preview?.previewType !== 'inventory.add') return true;
  const userTokens = new Set(normalizedMatchTokens(userText));
  const userSignificant = significantMatchTokens(userText);
  if (!userSignificant.length) return true;

  const name = cardNameFromPreview(preview);
  const nameTokens = significantMatchTokens(name);
  const overlappingNameTokens = nameTokens.filter(token => userTokens.has(token));
  if (overlappingNameTokens.length >= 2) return true;
  if (overlappingNameTokens.length === 1 && userSignificant.length === 1) return true;

  const cn = normalizedMatchTokens(preview?.card?.cn || '')[0] || '';
  const setCode = String(preview?.card?.setCode || '').trim().toLowerCase();
  if (cn && userTokens.has(cn) && (!setCode || userTokens.has(setCode))) return true;
  return false;
}

function previewMismatchMessage(preview, userText) {
  const name = cardNameFromPreview(preview) || 'a different card';
  const request = String(userText || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return 'The model previewed "' + name + '", but that does not appear to match your request'
    + (request ? ' ("' + request + '")' : '')
    + '. I did not offer that change for approval.';
}

const REQUESTED_QTY_WORDS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

function parseSmallQuantity(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 99 ? n : null;
}

function requestedAddQuantity(userText) {
  const text = String(userText || '').toLowerCase();
  const compact = text.replace(/\s+/g, ' ').trim();
  const wordPattern = Array.from(REQUESTED_QTY_WORDS.keys()).join('|');
  const patterns = [
    /\b(?:add|put)\s+(?:me\s+)?(\d{1,2})\b/,
    /\b(\d{1,2})\s*(?:x|copies?|cards?)\b/,
    /\bx\s*(\d{1,2})\b/,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    const qty = match ? parseSmallQuantity(match[1]) : null;
    if (qty) return qty;
  }
  const wordMatch = compact.match(new RegExp('\\b(?:add|put)\\s+(?:me\\s+)?(' + wordPattern + ')\\b'))
    || compact.match(new RegExp('\\b(' + wordPattern + ')\\s+(?:copies?|cards?)\\b'));
  if (wordMatch) return REQUESTED_QTY_WORDS.get(wordMatch[1]) || null;
  return /\b(?:add|put)\b/.test(compact) ? 1 : null;
}

function previewCardQuantity(preview) {
  const explicit = parseSmallQuantity(preview?.card?.qty);
  if (explicit) return explicit;
  const summaryQty = String(preview?.summary || '').match(/^Added\s+(\d{1,2})\b/i);
  return summaryQty ? parseSmallQuantity(summaryQty[1]) : null;
}

function previewAddIdentity(preview) {
  if (preview?.previewType !== 'inventory.add') return '';
  const name = significantMatchTokens(cardNameFromPreview(preview)).join(' ');
  if (!name) return '';
  const setCode = String(preview?.card?.setCode || '').trim().toLowerCase();
  const cn = normalizedMatchTokens(preview?.card?.cn || '').join('');
  const finish = String(preview?.card?.finish || '').trim().toLowerCase();
  const location = JSON.stringify(preview?.card?.location || null);
  return [name, setCode, cn, finish, location].join('|');
}

function duplicatePreviewMessage(chosen, dropped, requestedQty) {
  const name = cardNameFromPreview(chosen) || 'that card';
  const keptQty = previewCardQuantity(chosen) || requestedQty || 1;
  const droppedQtys = dropped.map(preview => previewCardQuantity(preview)).filter(Boolean);
  const suffix = droppedQtys.length
    ? ' I kept the ' + keptQty + '-copy preview and ignored duplicate/conflicting preview quantities: ' + droppedQtys.join(', ') + '.'
    : ' I kept one matching preview and ignored the duplicates.';
  return 'The model produced multiple add previews for "' + name + '."' + suffix;
}

function dedupeAddPreviews(previews, userText) {
  const out = [];
  const warnings = [];
  const groups = new Map();
  for (const preview of previews) {
    const identity = previewAddIdentity(preview);
    if (!identity) {
      out.push(preview);
      continue;
    }
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(preview);
  }
  const requestedQty = requestedAddQuantity(userText);
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const chosen = group.find(preview => requestedQty && previewCardQuantity(preview) === requestedQty) || group[0];
    out.push(chosen);
    warnings.push(duplicatePreviewMessage(chosen, group.filter(preview => preview !== chosen), requestedQty));
  }
  return { previews: out, previewWarnings: warnings };
}

function filterChatPreviews(previews, lastUserText) {
  const accepted = [];
  const warnings = [];
  for (const preview of previews) {
    if (previewLooksLikeUserRequest(preview, lastUserText)) accepted.push(preview);
    else warnings.push(previewMismatchMessage(preview, lastUserText));
  }
  const deduped = dedupeAddPreviews(accepted, lastUserText);
  return { previews: deduped.previews, previewWarnings: [...warnings, ...deduped.previewWarnings] };
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

function extractCloudflareText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  if (typeof data.response === 'string') return data.response;
  const result = data?.result && typeof data.result === 'object' ? data.result : data;
  const message = result?.choices?.[0]?.message;
  if (typeof message?.content === 'string') return message.content;
  return extractOpenAiText(data);
}

function chatSuccessResponse(deps, request, { provider, model, hosted, usage, data, text, messages = [] }) {
  const lastUserText = [...messages].reverse().find(message => message.role === 'user')?.content || '';
  const filtered = filterChatPreviews(extractMcpPreviews(data), lastUserText);
  const drafts = preferDraftsForUserRequest(extractMcpDrafts(data), lastUserText);
  const cards = orderInventoryCardsForUserRequest(
    filterInventoryCardsForUserRequest(extractMcpInventoryCards(data), lastUserText),
    lastUserText
  );
  const containerSummary = containerStatsSummaryText(extractMcpContainerStats(data), lastUserText);
  const responseCards = containerSummary ? [] : cards;
  const responseText = drafts.length && !filtered.previews.length
    ? 'Choose options below.'
    : filtered.previewWarnings.length && !filtered.previews.length
    ? filtered.previewWarnings.join('\n')
    : containerSummary
    ? containerSummary
    : responseCards.length
    ? inventoryCardsSummaryText(responseCards, lastUserText)
    : text;
  return deps.json({
    provider,
    model,
    mode: hosted ? 'hosted' : 'byok',
    usage,
    text: responseText,
    previews: filtered.previews,
    drafts,
    cards: responseCards,
    previewWarnings: filtered.previewWarnings,
    raw: data,
  }, 200, request);
}

function chatProviderApiKey(env, provider) {
  if (provider === 'groq') return String(env.MTGCOLLECTION_CHAT_GROQ_API_KEY || env.GROQ_API_KEY || '').trim();
  if (provider === 'openai') return String(env.MTGCOLLECTION_CHAT_OPENAI_API_KEY || env.OPENAI_API_KEY || '').trim();
  if (provider === 'anthropic') return String(env.MTGCOLLECTION_CHAT_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '').trim();
  return '';
}

function chatModel(env, provider, body) {
  const requested = String(body.model || '').trim();
  if (requested) return requested;
  if (provider === 'cloudflare') return String(env.MTGCOLLECTION_CHAT_CLOUDFLARE_MODEL || '@cf/openai/gpt-oss-120b').trim();
  if (provider === 'groq') return String(env.MTGCOLLECTION_CHAT_GROQ_MODEL || 'openai/gpt-oss-120b').trim();
  if (provider === 'anthropic') return String(env.MTGCOLLECTION_CHAT_ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
  return String(env.MTGCOLLECTION_CHAT_OPENAI_MODEL || 'gpt-5-nano').trim();
}

function chatMaxOutputTokens(env, body) {
  const requested = parseInt(body.maxTokens, 10);
  const configured = parseInt(env.MTGCOLLECTION_CHAT_MAX_OUTPUT_TOKENS || env.CHAT_MAX_OUTPUT_TOKENS, 10);
  const value = Number.isFinite(requested) && requested > 0 ? requested : configured || 1000;
  return Math.max(64, Math.min(value, 4000));
}

function chatDailyLimit(env) {
  const configured = parseInt(env.MTGCOLLECTION_CHAT_DAILY_LIMIT || env.CHAT_DAILY_LIMIT, 10);
  if (!Number.isFinite(configured)) return 25;
  return Math.max(0, configured);
}

function chatUsageKey(userId, date = new Date()) {
  return CHAT_USAGE_PREFIX + date.toISOString().slice(0, 10) + ':' + userId;
}

async function assertHostedChatQuota(env, userId) {
  const limit = chatDailyLimit(env);
  if (limit <= 0) return { count: 0, limit };
  const key = chatUsageKey(userId);
  const current = await storeGet(env, key) || { count: 0 };
  const count = parseInt(current.count, 10) || 0;
  if (count >= limit) {
    const err = new Error('hosted chat daily limit reached');
    err.status = 429;
    err.data = { limit, count };
    throw err;
  }
  const next = {
    count: count + 1,
    firstAt: current.firstAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await storePut(env, key, next, 48 * 60 * 60);
  return { count: next.count, limit };
}

function providerErrorMessage(provider, data) {
  const error = data?.error || data;
  const message = typeof error === 'string' ? error : error?.message;
  const code = typeof error === 'object' ? error?.code : '';
  if (provider === 'openai' && (code === 'insufficient_quota' || /quota|billing/i.test(message || ''))) {
    return 'OpenAI quota or billing blocked this request for the selected API key/project.';
  }
  if (provider === 'groq' && /credit|quota|billing|balance|spend|limit/i.test(message || '')) {
    return 'Groq quota or billing blocked this request for the selected API key/project.';
  }
  if (provider === 'cloudflare' && /credit|quota|billing|balance|spend|limit/i.test(message || '')) {
    return 'Cloudflare Workers AI quota or billing blocked this request.';
  }
  if (provider === 'anthropic' && /credit|quota|billing|balance/i.test(message || '')) {
    return 'Anthropic quota or billing blocked this request for the selected API key/project.';
  }
  if (message) return message;
  if (provider === 'anthropic') return 'Anthropic request failed';
  if (provider === 'groq') return 'Groq request failed';
  if (provider === 'cloudflare') return 'Cloudflare Workers AI request failed';
  return 'OpenAI request failed';
}

function cloudflareCompatibleSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'string' };
  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
    ? schema.anyOf
    : null;
  if (variants) {
    const nonNull = variants.filter(variant => variant?.type !== 'null');
    const preferred = nonNull.find(variant => variant?.type === 'boolean')
      || nonNull.find(variant => variant?.type === 'number' || variant?.type === 'integer')
      || nonNull.find(variant => variant?.type === 'string')
      || nonNull.find(variant => variant?.type === 'object')
      || nonNull[0];
    return cloudflareCompatibleSchema(preferred || { type: 'string' });
  }
  const out = { ...schema };
  if (Array.isArray(out.type)) out.type = out.type.filter(type => type !== 'null')[0] || 'string';
  delete out.oneOf;
  delete out.anyOf;
  if (out.type === 'object') {
    const properties = {};
    for (const [name, propSchema] of Object.entries(out.properties || {})) {
      properties[name] = cloudflareCompatibleSchema(propSchema);
    }
    out.properties = properties;
  }
  if (out.type === 'array') out.items = cloudflareCompatibleSchema(out.items || { type: 'string' });
  return out;
}

function cloudflareToolDefinition(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: cloudflareCompatibleSchema(tool.inputSchema || { type: 'object', properties: {} }),
    },
  };
}

function parseCloudflareToolArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function normalizeCloudflareToolCall(call, index = 0) {
  if (!call || typeof call !== 'object') return null;
  const fn = call.function && typeof call.function === 'object' ? call.function : null;
  const name = String(call.name || fn?.name || '').trim();
  if (!name) return null;
  const id = String(call.id || 'cf_tool_' + index);
  const args = parseCloudflareToolArguments(call.arguments ?? fn?.arguments);
  return {
    id,
    name,
    arguments: args,
    providerCall: {
      id,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    },
  };
}

function cloudflareToolCalls(response) {
  const result = response?.result && typeof response.result === 'object' ? response.result : response;
  const direct = Array.isArray(result?.choices?.[0]?.message?.tool_calls)
    ? result.choices[0].message.tool_calls
    : Array.isArray(result?.tool_calls)
    ? result.tool_calls
    : [];
  return direct.map(normalizeCloudflareToolCall).filter(Boolean);
}

async function runCloudflareChat({ env, deps, auth, model, messages, chatTools, maxOutputTokens }) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    const err = new Error('Cloudflare Workers AI binding is not configured');
    err.status = 503;
    throw err;
  }
  const tools = chatTools.map(cloudflareToolDefinition);
  const workingMessages = messages.map(message => ({ role: message.role, content: message.content }));
  const output = [];
  let finalResponse = null;

  for (let turn = 0; turn < 6; turn += 1) {
    const response = await env.AI.run(model, {
      messages: workingMessages,
      tools,
      temperature: 0,
      max_tokens: maxOutputTokens,
    });
    finalResponse = response || {};
    const calls = cloudflareToolCalls(finalResponse);
    if (!calls.length) break;
    workingMessages.push({
      role: 'assistant',
      content: '',
      tool_calls: calls.map(call => call.providerCall),
    });
    for (const call of calls) {
      const data = await executeTool(call.name, call.arguments, env, deps, auth);
      const toolOutput = {
        type: 'mcp_call',
        name: call.name,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        },
      };
      output.push(toolOutput);
      workingMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(data, null, 2) });
    }
  }

  return {
    provider: 'cloudflare',
    model,
    response: extractCloudflareText(finalResponse),
    output_text: extractCloudflareText(finalResponse),
    output,
    usage: finalResponse?.usage || null,
    raw_response: finalResponse,
  };
}

export async function mintInternalMcpToken(env, { userId, scopes = [MCP_READ_SCOPE] }) {
  const tokens = await issueMcpTokens(env, { userId, clientId: MCP_CHAT_CLIENT_ID, scopes });
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

export async function handleMcpPreviewRequest(request, env, deps) {
  if (request.method !== 'POST') return deps.json({ error: 'POST required' }, 405, request);
  let clerkAuth = null;
  try {
    clerkAuth = await deps.authenticate(request, env);
  } catch (e) {
    return deps.json({ error: e.message || 'unauthorized' }, 401, request);
  }
  const body = await request.json().catch(() => ({}));
  const toolName = String(body.toolName || body.name || 'preview_add_inventory_item');
  if (!toolName.startsWith('preview_')) {
    return deps.json({ error: 'only preview tools are allowed' }, 400, request);
  }
  const auth = { userId: clerkAuth.userId, scopes: [...MCP_SCOPES] };
  try {
    const args = body.arguments && typeof body.arguments === 'object' ? body.arguments : (body.args || {});
    return deps.json(await executeTool(toolName, args, env, deps, auth), 200, request);
  } catch (e) {
    return deps.json({ error: e.message || 'preview failed', data: e.data || null }, e.status || 400, request);
  }
}

export async function handleByokChatRequest(request, env, deps) {
  if (request.method !== 'POST') return deps.json({ error: 'POST required' }, 405, request);
  if (!enabledFlag(env.MTGCOLLECTION_CHAT_ENABLED, true)) {
    return deps.json({ error: 'hosted chat is disabled' }, 503, request);
  }
  let clerkAuth = null;
  try {
    clerkAuth = await deps.authenticate(request, env);
  } catch (e) {
    return deps.json({ error: e.message || 'unauthorized' }, 401, request);
  }
  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || env.MTGCOLLECTION_CHAT_PROVIDER || 'groq').toLowerCase();
  const providedApiKey = String(body.apiKey || '').trim();
  const hostedApiKey = chatProviderApiKey(env, provider);
  const apiKey = providedApiKey || hostedApiKey;
  const hosted = provider === 'cloudflare' || !providedApiKey;
  const messages = normalizeChatMessages(body.messages);
  if (!['cloudflare', 'groq', 'openai', 'anthropic'].includes(provider)) return deps.json({ error: 'provider must be cloudflare, groq, openai, or anthropic' }, 400, request);
  if (provider !== 'cloudflare' && !apiKey) return deps.json({ error: 'chat provider key is not configured' }, 400, request);
  if (!messages.length) return deps.json({ error: 'messages are required' }, 400, request);
  const chatTools = visibleToolsForAuth({ clientId: MCP_CHAT_CLIENT_ID, scopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE] });
  const allowedToolNames = chatTools.map(tool => tool.name);
  const mcpToken = provider === 'cloudflare'
    ? ''
    : await mintInternalMcpToken(env, { userId: clerkAuth.userId, scopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE] });
  const mcpUrl = provider === 'cloudflare' ? '' : publicOrigin(request, env) + '/mcp';
  let usage = null;

  try {
    if (hosted) usage = await assertHostedChatQuota(env, clerkAuth.userId);
    const model = chatModel(env, provider, body);
    const maxOutputTokens = chatMaxOutputTokens(env, body);

    if (provider === 'cloudflare') {
      const data = await runCloudflareChat({
        env,
        deps,
        auth: { userId: clerkAuth.userId, scopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE], clientId: MCP_CHAT_CLIENT_ID },
        model,
        messages,
        chatTools,
        maxOutputTokens,
      });
      return chatSuccessResponse(deps, request, {
        provider,
        model,
        hosted,
        usage,
        data,
        messages,
        text: extractCloudflareText(data),
      });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: messages,
          max_output_tokens: maxOutputTokens,
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
      if (!res.ok) throw new Error(providerErrorMessage(provider, data));
      return chatSuccessResponse(deps, request, {
        provider,
        model,
        hosted,
        usage,
        data,
        messages,
        text: extractOpenAiText(data),
      });
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: messages,
          max_output_tokens: maxOutputTokens,
          tools: [{
            type: 'mcp',
            server_label: 'mtgcollection',
            server_description: 'Read and preview safe changes to an MTG Collection account.',
            server_url: mcpUrl,
            headers: { Authorization: 'Bearer ' + mcpToken },
            require_approval: 'never',
            allowed_tools: allowedToolNames,
          }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(providerErrorMessage(provider, data));
      return chatSuccessResponse(deps, request, {
        provider,
        model,
        hosted,
        usage,
        data,
        messages,
        text: extractOpenAiText(data),
      });
    }

    if (provider === 'anthropic') {
      const toolConfigs = {};
      for (const tool of chatTools) {
        toolConfigs[tool.name] = { enabled: true };
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
          model,
          max_tokens: maxOutputTokens,
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
      if (!res.ok) throw new Error(providerErrorMessage(provider, data));
      return chatSuccessResponse(deps, request, {
        provider,
        model,
        hosted,
        usage,
        data,
        messages,
        text: extractAnthropicText(data),
      });
    }
  } catch (e) {
    const status = e.status || 502;
    return deps.json({
      error: scrubSecrets(e.message || String(e), [providedApiKey, hostedApiKey]),
      data: e.data || null,
    }, status, request);
  }
}
