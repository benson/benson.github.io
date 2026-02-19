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

    try {
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
      const recent = [];
      for (const item of data.items) {
        const t = item.track;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        recent.push({
          name: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          album: t.album.name,
          art: t.album.images.find(i => i.width <= 300)?.url || t.album.images[0]?.url || '',
          url: t.external_urls.spotify,
        });
        if (recent.length >= 5) break;
      }

      return new Response(JSON.stringify({ recent }), {
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
