const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// cache blizzard token in memory (lasts until worker evicts)
let blizzardToken = null;
let blizzardTokenExpiry = 0;

async function getBlizzardToken(env) {
  if (blizzardToken && Date.now() < blizzardTokenExpiry) return blizzardToken;

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(env.BLIZZARD_CLIENT_ID + ':' + env.BLIZZARD_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`blizzard auth failed: ${res.status}`);

  const data = await res.json();
  blizzardToken = data.access_token;
  blizzardTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return blizzardToken;
}

async function blizzardApi(env, region, path, namespace) {
  const token = await getBlizzardToken(env);
  const url = `https://${region}.api.blizzard.com${path}?namespace=${namespace}-${region}&locale=en_US`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`blizzard ${res.status}: ${text}`);
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // GET /character?region=us&realm=area-52&name=charname
    if (request.method === 'GET' && path === '/character') {
      return handleCharacter(url, env);
    }

    // POST /chat — anthropic proxy
    if (request.method === 'POST' && (path === '/chat' || path === '/')) {
      return handleChat(request, env);
    }

    return json({ error: 'not found' }, 404);
  },
};

async function handleCharacter(url, env) {
  const region = url.searchParams.get('region') || 'us';
  const realm = url.searchParams.get('realm');
  const name = url.searchParams.get('name');

  if (!realm || !name) return json({ error: 'realm and name required' }, 400);

  const realmSlug = realm.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const nameSlug = name.toLowerCase();
  const base = `/profile/wow/character/${realmSlug}/${nameSlug}`;

  try {
    const [profile, equipment, quests, reps, professions, stats, media] = await Promise.all([
      blizzardApi(env, region, base, 'profile'),
      blizzardApi(env, region, `${base}/equipment`, 'profile'),
      blizzardApi(env, region, `${base}/quests/completed`, 'profile'),
      blizzardApi(env, region, `${base}/reputations`, 'profile'),
      blizzardApi(env, region, `${base}/professions`, 'profile'),
      blizzardApi(env, region, `${base}/statistics`, 'profile'),
      blizzardApi(env, region, `${base}/character-media`, 'profile'),
    ]);

    // fetch spec + class icons
    const specId = profile.active_spec?.key?.href;
    const classId = profile.character_class?.key?.href;
    let specIcon = null, classIcon = null;
    try {
      const token = await getBlizzardToken(env);
      const [specMedia, classMedia] = await Promise.all([
        specId ? fetch(specId.replace('playable-specialization', 'media/playable-specialization'), { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()) : null,
        classId ? fetch(classId.replace('playable-class', 'media/playable-class'), { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()) : null,
      ]);
      specIcon = specMedia?.assets?.[0]?.value || null;
      classIcon = classMedia?.assets?.[0]?.value || null;
    } catch { /* icons are optional */ }

    return json({ profile, equipment, quests, reputations: reps, professions, stats, media, specIcon, classIcon });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { messages, system } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages required' }, 400);
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: system || '',
      messages,
      stream: true,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return json({ error: `anthropic api error: ${anthropicRes.status}` }, anthropicRes.status);
  }

  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
    },
  });
}
