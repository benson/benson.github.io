const CACHE_KEY = 'https://spotify-recent.brostar.workers.dev/cached-v2';
const CACHE_TTL = 3600;

async function fetchSpotify(env) {
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('no access token');

  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  });
  if (!res.ok) throw new Error(`spotify ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const tracks = [];
  for (const item of data.items) {
    const t = item.track;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const artUrl = t.album.images.find(i => i.width <= 64)?.url
      || t.album.images[t.album.images.length - 1]?.url || '';
    tracks.push({
      name: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      artUrl,
      url: t.external_urls.spotify,
    });
    if (tracks.length >= 5) break;
  }

  const recent = await Promise.all(tracks.map(async (t) => {
    let art = '';
    if (t.artUrl) {
      try {
        const imgRes = await fetch(t.artUrl);
        const buf = await imgRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        const type = imgRes.headers.get('content-type') || 'image/jpeg';
        art = `data:${type};base64,${b64}`;
      } catch {
        art = t.artUrl;
      }
    }
    return { name: t.name, artist: t.artist, art, url: t.url };
  }));

  return { recent };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin.includes('bensonperry.com') || origin.includes('127.0.0.1') || origin.includes('localhost');
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'https://bensonperry.com',
      'Access-Control-Allow-Methods': 'GET',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const cache = caches.default;
    const cacheReq = new Request(CACHE_KEY);
    let cached = await cache.match(cacheReq);

    if (cached) {
      return new Response(cached.body, {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    try {
      const data = await fetchSpotify(env);
      const body = JSON.stringify(data);

      const resp = new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });
      await cache.put(cacheReq, resp.clone());

      return new Response(body, {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    } catch (err) {
      return new Response(JSON.stringify({ recent: [], error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  },
};
