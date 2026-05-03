// mtgcollection share worker
// ----------------------------
// Minimal CF Worker that hosts opaque-ID JSON snapshots in KV.
// No auth. The capability *is* knowing the ID:
//   POST   /share        → create a new share, body is the payload, returns {id}
//   GET    /share/:id    → fetch the snapshot
//   PUT    /share/:id    → overwrite the snapshot at that ID (used for auto-mirror)
//   DELETE /share/:id    → remove (creator clicked "stop sharing")
//
// "Anyone with the ID can overwrite" is fine because the ID is unguessable
// (12 chars of crypto random) and the only thing you can do is replace a
// snapshot you yourself created. There's no sensitive operation to gate.

const ALLOWED_ORIGINS = [
  'https://bensonperry.com',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

// Snapshots auto-expire after 30 days. KV TTL is set per write so updates
// rolling-window-extend the lifetime — an actively-shared deck stays alive,
// a forgotten one falls off.
const TTL_SECONDS = 30 * 24 * 60 * 60;

// 5MB cap. A typical deck is 50-200KB; full-collection share (slice 2) might
// be 1-2MB. KV limit is 25MB but we want to fail loud, not store junk.
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

// 12 chars of base32-ish (URL-safe random) → ~6.7 trillion namespace.
function generateShareId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

const SHARE_KEY_PREFIX = 'share:';
const ID_PATTERN = /^[a-zA-Z0-9_-]{6,32}$/;

async function readBody(request) {
  // Workers don't expose Content-Length reliably; read once into a string and
  // measure. If the body is huge this still buffers, but the cap below
  // catches it before we try to write to KV.
  const body = await request.text();
  if (body.length > MAX_PAYLOAD_BYTES) {
    throw new Error('payload too large (max ' + MAX_PAYLOAD_BYTES + ' bytes)');
  }
  // Validate it's parseable JSON. We don't enforce a schema — the client and
  // viewer are the same code, so the format contract lives there.
  JSON.parse(body);
  return body;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // POST /share — create
    if (path === '/share' && request.method === 'POST') {
      try {
        const body = await readBody(request);
        const id = generateShareId();
        await env.SHARES.put(SHARE_KEY_PREFIX + id, body, { expirationTtl: TTL_SECONDS });
        return json({ id }, 200, request);
      } catch (e) {
        return text('bad request: ' + e.message, 400, request);
      }
    }

    // /share/:id routes
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
          const body = await readBody(request);
          // Allow update without a prior existence check — the ID itself is
          // the capability. Idempotent. Refresh the TTL on every update so an
          // actively-shared deck never expires while the creator's editing.
          await env.SHARES.put(key, body, { expirationTtl: TTL_SECONDS });
          return json({ ok: true }, 200, request);
        } catch (e) {
          return text('bad request: ' + e.message, 400, request);
        }
      }

      if (request.method === 'DELETE') {
        await env.SHARES.delete(key);
        return json({ ok: true }, 200, request);
      }
    }

    return text('not found', 404, request);
  },
};
