// squirrel-cam capture endpoint.
// the phone POSTs detection frames to /capture; they're stored in a KV
// namespace (no R2 / no card needed). pulling them back for retraining is
// gated behind ADMIN_SECRET.
const ALLOW_ORIGIN = 'https://bensonperry.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function allKeys(env) {
  const out = [];
  let cursor;
  while (true) {
    const r = await env.FRAMES.list({ limit: 1000, cursor });
    for (const k of r.keys) out.push(k.name);
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return out;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname;

    // POST /capture?reason=fired&score=72   (body = raw jpeg bytes)
    if (req.method === 'POST' && p === '/capture') {
      if (req.headers.get('Origin') !== ALLOW_ORIGIN) return json({ error: 'bad origin' }, 403);
      if (url.searchParams.get('t') !== env.CAPTURE_TOKEN) return json({ error: 'bad token' }, 403);
      const reason = (url.searchParams.get('reason') || 'cap').replace(/[^a-z]/g, '').slice(0, 10);
      const score = (url.searchParams.get('score') || '0').replace(/[^0-9]/g, '').slice(0, 3);
      const buf = await req.arrayBuffer();
      if (buf.byteLength < 500 || buf.byteLength > 2_000_000) return json({ error: 'bad size' }, 400);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `frame_${ts}_${reason}_${score}.jpg`;
      await env.FRAMES.put(key, buf);
      return json({ ok: true, key });
    }

    // everything below is admin-only (pull frames back for retraining)
    const authed = req.headers.get('Authorization') === `Bearer ${env.ADMIN_SECRET}`;

    if (req.method === 'GET' && p === '/list') {
      if (!authed) return json({ error: 'unauthorized' }, 401);
      const keys = await allKeys(env);
      return json({ count: keys.length, keys: keys.map(k => ({ key: k })) });
    }

    if (req.method === 'GET' && p.startsWith('/frame/')) {
      if (!authed) return new Response('unauthorized', { status: 401, headers: CORS });
      const val = await env.FRAMES.get(decodeURIComponent(p.slice('/frame/'.length)), 'arrayBuffer');
      if (!val) return new Response('not found', { status: 404, headers: CORS });
      return new Response(val, { headers: { 'Content-Type': 'image/jpeg', ...CORS } });
    }

    if (req.method === 'POST' && p === '/clear') {
      if (!authed) return json({ error: 'unauthorized' }, 401);
      const keys = await allKeys(env);
      for (const k of keys) await env.FRAMES.delete(k);
      return json({ deleted: keys.length });
    }

    return json({ error: 'not found' }, 404);
  },
};
