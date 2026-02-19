const fs = require('fs');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

async function getAccessToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('no access token: ' + JSON.stringify(data));
  return data.access_token;
}

function fallback() {
  fs.writeFileSync('spotify-history.json', JSON.stringify({
    recent: [],
    date: new Date().toISOString().slice(0, 10),
  }, null, 2) + '\n');
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('spotify credentials not set');
    fallback();
    process.exit(0);
  }

  try {
    const token = await getAccessToken();
    console.log('got access token');

    const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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

    console.log(`found ${recent.length} unique recent tracks`);

    const output = {
      recent,
      date: new Date().toISOString().slice(0, 10),
    };

    fs.writeFileSync('spotify-history.json', JSON.stringify(output, null, 2) + '\n');
    console.log('wrote spotify-history.json');
  } catch (err) {
    console.error('error:', err.message);
    fallback();
  }
}

main();
