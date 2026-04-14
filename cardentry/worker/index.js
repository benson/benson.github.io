// Card entry queue worker
// Accepts card submissions from the phone, serves them to Claude Code for TCG Player listing

const ALLOWED_ORIGINS = [
  'https://bensonperry.com',
  'http://localhost:3000',
  'http://localhost:8766',
  'http://127.0.0.1:3000',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // POST /submit — queue a batch of cards for listing
    if (path === '/submit' && request.method === 'POST') {
      const body = await request.json();
      if (!Array.isArray(body.cards) || body.cards.length === 0) {
        return json({ error: 'cards array required' }, request, 400);
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const submission = {
        id,
        cards: body.cards,
        submittedAt: new Date().toISOString(),
        status: 'pending',
      };
      await env.CARDS.put(`pending:${id}`, JSON.stringify(submission));
      return json({ ok: true, id, count: body.cards.length }, request);
    }

    // GET /pending — list all pending submissions
    if (path === '/pending' && request.method === 'GET') {
      const list = await env.CARDS.list({ prefix: 'pending:' });
      const submissions = [];
      for (const key of list.keys) {
        const data = await env.CARDS.get(key.name, 'json');
        if (data) submissions.push(data);
      }
      return json({ submissions }, request);
    }

    // POST /complete/:id — mark a submission as processed
    if (path.startsWith('/complete/') && request.method === 'POST') {
      const id = path.split('/complete/')[1];
      const key = `pending:${id}`;
      const data = await env.CARDS.get(key, 'json');
      if (!data) {
        return json({ error: 'not found' }, request, 404);
      }
      data.status = 'completed';
      data.completedAt = new Date().toISOString();
      await env.CARDS.put(`completed:${id}`, JSON.stringify(data));
      await env.CARDS.delete(key);
      return json({ ok: true, id }, request);
    }

    // DELETE /pending/:id — cancel a pending submission
    if (path.startsWith('/pending/') && request.method === 'DELETE') {
      const id = path.split('/pending/')[1];
      await env.CARDS.delete(`pending:${id}`);
      return json({ ok: true }, request);
    }

    // POST /csv — store a generated TCG Player CSV for automated upload
    if (path === '/csv' && request.method === 'POST') {
      const body = await request.json();
      if (!body.csv) {
        return json({ error: 'csv content required' }, request, 400);
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const entry = {
        id,
        csv: body.csv,
        cardCount: body.cardCount || 0,
        submittedAt: new Date().toISOString(),
        scheduledFor: body.scheduledFor || null,
        status: 'pending',
      };
      await env.CARDS.put(`csv:${id}`, JSON.stringify(entry));
      return json({ ok: true, id, scheduledFor: entry.scheduledFor }, request);
    }

    // GET /csv/pending — list CSVs ready for upload (scheduledFor <= now or null)
    if (path === '/csv/pending' && request.method === 'GET') {
      const list = await env.CARDS.list({ prefix: 'csv:' });
      const ready = [];
      const now = new Date().toISOString();
      for (const key of list.keys) {
        const data = await env.CARDS.get(key.name, 'json');
        if (!data || data.status !== 'pending') continue;
        if (data.scheduledFor && data.scheduledFor > now) continue;
        ready.push(data);
      }
      return json({ uploads: ready }, request);
    }

    // POST /csv/complete/:id — mark a CSV upload as done
    if (path.startsWith('/csv/complete/') && request.method === 'POST') {
      const id = path.split('/csv/complete/')[1];
      const key = `csv:${id}`;
      const data = await env.CARDS.get(key, 'json');
      if (!data) return json({ error: 'not found' }, request, 404);
      data.status = 'completed';
      data.completedAt = new Date().toISOString();
      await env.CARDS.put(key, JSON.stringify(data));
      return json({ ok: true, id }, request);
    }

    return json({ error: 'not found' }, request, 404);
  },
};
