// Authenticated transport to the biblioplex worker.
//  - reads:  GET /sync/bootstrap (full snapshot)
//  - writes: POST /sync/push (granular ops built locally from a diff)
//  - tools:  POST /mcp JSON-RPC (search_card_printings, preview_*/apply, undo)
// Refreshes the access token proactively (near expiry) and reactively (on 401),
// persisting rotated tokens. The token is sent only in the Authorization header.
import { refreshTokens } from './oauth.mjs';
import { CliError, authError, rateLimitError } from './errors.mjs';
import { CLIENT_LABEL } from './constants.mjs';

export class Session {
  constructor({ base, credentials, persist, fetchImpl = fetch }) {
    this.base = base;
    this.creds = credentials;
    this.persist = persist || (() => {});
    this.fetchImpl = fetchImpl;
    this._rpcId = 0;
  }

  get scopes() { return (this.creds?.scope || '').split(/\s+/).filter(Boolean); }
  hasScope(scope) { return this.scopes.includes(scope); }

  async _refresh() {
    if (!this.creds?.refreshToken) throw authError('session expired — run `bp login`');
    this._absorb(await refreshTokens({ base: this.base, refreshToken: this.creds.refreshToken, fetchImpl: this.fetchImpl }));
  }

  _absorb(tokens) {
    this.creds = {
      ...this.creds,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || this.creds.refreshToken,
      accessExpiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      scope: tokens.scope || this.creds.scope,
    };
    this.persist(this.creds);
  }

  async _authedFetch(path, opts = {}, retried = false) {
    if (!this.creds?.accessToken) throw authError();
    if (!retried && this.creds.accessExpiresAt && this.creds.accessExpiresAt - Date.now() < 30000) {
      await this._refresh();
    }
    const headers = { ...(opts.headers || {}), Authorization: 'Bearer ' + this.creds.accessToken };
    const res = await this.fetchImpl(this.base + path, { ...opts, headers });
    if (res.status === 401 && !retried) { await this._refresh(); return this._authedFetch(path, opts, true); }
    if (res.status === 401) throw authError('session expired — run `bp login`');
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error === 'insufficient_scope'
        ? 'this session lacks write access — run `bp login --write`'
        : (body.error || 'forbidden');
      throw new CliError(msg, 1, body);
    }
    if (res.status === 429) throw rateLimitError();
    return res;
  }

  async bootstrap() {
    const res = await this._authedFetch('/sync/bootstrap');
    if (!res.ok) throw new CliError('could not load collection (' + res.status + ')');
    return res.json();
  }

  async push({ ops, baseRevision }) {
    const res = await this._authedFetch('/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: CLIENT_LABEL, baseRevision, requireBaseRevision: true, ops }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      const err = new CliError('the cloud collection changed since this command started', 1, data);
      err.conflict = true;
      throw err;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new CliError('push failed: ' + (data.error || res.status), 1, data);
    }
    return res.json();
  }

  async mcp(method, params = {}) {
    const id = ++this._rpcId;
    const res = await this._authedFetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    if (!res.ok) throw new CliError('mcp request failed (' + res.status + ')');
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      if (data.error.code === -32003 || /insufficient_scope/.test(data.error.message || '')) {
        throw new CliError('this session lacks write access — run `bp login --write`', 1, data.error);
      }
      throw new CliError(data.error.message || 'mcp error', 1, data.error);
    }
    return data.result;
  }

  async callTool(name, args = {}) {
    const result = await this.mcp('tools/call', { name, arguments: args });
    if (result?.isError) {
      const text = (result.content || []).map(c => c.text).filter(Boolean).join(' ');
      throw new CliError(text || ('tool ' + name + ' failed'), 1, result);
    }
    return result?.structuredContent ?? result ?? null;
  }
}
