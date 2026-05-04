import { SHARE_API_URL } from './share.js';

export const SYNC_API_URL = (typeof window !== 'undefined' && window.MTGCOLLECTION_SYNC_API_URL)
  || SHARE_API_URL;

function headers(token, extra = {}) {
  const out = { ...extra };
  if (token) out.Authorization = 'Bearer ' + token;
  return out;
}

async function readJsonResponse(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const err = new Error(data?.error || text || ('request failed: ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function createSyncClient({ apiUrl = SYNC_API_URL, getToken = async () => null } = {}) {
  async function authedFetch(path, options = {}) {
    const token = await getToken();
    const devUser = typeof window !== 'undefined' ? window.MTGCOLLECTION_SYNC_DEV_USER : '';
    const requestHeaders = headers(token, options.headers || {});
    if (!token && devUser) requestHeaders['X-Debug-User'] = String(devUser);
    try {
      return await fetch(apiUrl + path, {
        ...options,
        headers: requestHeaders,
      }).then(readJsonResponse);
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error('sync service is unreachable at ' + apiUrl);
      }
      throw e;
    }
  }

  return {
    bootstrap() {
      return authedFetch('/sync/bootstrap');
    },
    claim(snapshot) {
      return authedFetch('/sync/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot }),
      });
    },
    pull(since = 0) {
      return authedFetch('/sync/pull?since=' + encodeURIComponent(String(since || 0)));
    },
    push({ clientId, baseRevision, ops, snapshot }) {
      return authedFetch('/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, baseRevision, ops, snapshot }),
      });
    },
    async openLive({ onMessage, onClose } = {}) {
      const token = await getToken();
      const url = new URL(apiUrl + '/sync/live');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      if (token) url.searchParams.set('token', token);
      else if (typeof window !== 'undefined' && window.MTGCOLLECTION_SYNC_DEV_USER) {
        url.searchParams.set('debugUser', String(window.MTGCOLLECTION_SYNC_DEV_USER));
      }
      const ws = new WebSocket(url.href);
      ws.addEventListener('message', event => {
        try { onMessage?.(JSON.parse(event.data)); } catch (e) {}
      });
      ws.addEventListener('close', event => onClose?.(event));
      ws.addEventListener('error', event => onClose?.(event));
      return ws;
    },
  };
}
