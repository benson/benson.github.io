const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

async function fetchBase64(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${btoa(binary)}`;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  const credentials = {
    SPOTIFY_CLIENT_ID: clientId,
    SPOTIFY_CLIENT_SECRET: clientSecret,
    SPOTIFY_REFRESH_TOKEN: refreshToken,
  };
  const configured = Object.values(credentials).filter(Boolean).length;
  if (!configured) return null;
  if (configured !== Object.keys(credentials).length) {
    const missing = Object.entries(credentials)
      .filter(([, value]) => !value)
      .map(([name]) => name)
      .join(', ');
    throw new Error(`spotify credentials are incomplete (missing ${missing})`);
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    const code = data.error || `http_${res.status}`;
    const description = data.error_description ? `: ${data.error_description}` : '';
    const recovery = code === 'invalid_grant'
      ? ' Reauthorize Spotify and replace the SPOTIFY_REFRESH_TOKEN repository secret.'
      : '';
    throw new Error(`spotify token refresh failed (${code})${description}.${recovery}`);
  }
  return data.access_token;
}

async function buildSpotify(token) {
  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify recent: ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const albums = [];
  for (const item of data.items) {
    const t = item.track;
    const albumId = t.album.id;
    if (seen.has(albumId)) continue;
    seen.add(albumId);
    const artUrl = t.album.images.find(i => i.width <= 64)?.url
      || t.album.images[t.album.images.length - 1]?.url || '';
    albums.push({
      album: t.album.name,
      artist: t.artists.map(a => a.name).join(', '),
      artUrl,
      url: t.album.external_urls.spotify,
    });
    if (albums.length >= 5) break;
  }

  let html = '<div id="spotify-recent">\n';
  for (const a of albums) {
    const art = a.artUrl ? await fetchBase64(a.artUrl) : '';
    html += `      <a class="album-wrap" href="${esc(a.url)}" target="_blank">`;
    html += `<img class="album-icon" src="${art}" alt="${esc(a.album)}">`;
    html += `<div class="album-tip"><span class="tip-track">${esc(a.album)}</span><span>${esc(a.artist)}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';

  console.log(`spotify recent: ${albums.length} albums inlined`);
  return html;
}

async function buildOnRepeat(token) {
  const res = await fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=20', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify top: ${res.status}`);
  const data = await res.json();

  if (!data.items || !data.items.length) return null;

  const seen = new Set();
  const albums = [];
  for (const t of data.items) {
    const albumId = t.album.id;
    if (seen.has(albumId)) continue;
    seen.add(albumId);
    albums.push({
      album: t.album.name,
      artist: t.artists.map(a => a.name).join(', '),
      artUrl: t.album.images.find(i => i.width <= 64)?.url
        || t.album.images[t.album.images.length - 1]?.url || '',
      url: t.album.external_urls.spotify,
    });
    if (albums.length >= 5) break;
  }

  let html = '<div id="spotify-top">\n';
  for (const a of albums) {
    const art = a.artUrl ? await fetchBase64(a.artUrl) : '';
    html += `      <a class="album-wrap" href="${esc(a.url)}" target="_blank">`;
    html += `<img class="album-icon" src="${art}" alt="${esc(a.album)}">`;
    html += `<div class="album-tip"><span class="tip-track">${esc(a.album)}</span><span>${esc(a.artist)}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';

  console.log(`spotify on repeat: ${data.items.length} tracks inlined`);
  return html;
}

async function buildLeague() {
  const leaguePath = path.join(ROOT, 'league-history.json');
  if (!fs.existsSync(leaguePath)) {
    console.log('league: no league-history.json');
    return null;
  }

  const data = JSON.parse(fs.readFileSync(leaguePath, 'utf8'));
  if (!data.recent || !data.recent.length || !data.ddragonVersion) return null;

  let html = '<div id="league-recent">\n';
  for (const g of data.recent) {
    const imgUrl = `https://ddragon.leagueoflegends.com/cdn/${data.ddragonVersion}/img/champion/${g.champion}.png`;
    const art = await fetchBase64(imgUrl);
    const dpm = g.minutes ? Math.round(g.damage / g.minutes).toLocaleString() : '0';
    const winClass = g.win ? '' : ' loss';
    const tipClass = g.win ? 'tip-win' : 'tip-loss';
    const tipText = g.win ? 'win' : 'loss';

    html += `      <div class="champ-wrap" tabindex="0">`;
    html += `<img class="champ-icon${winClass}" src="${art}" alt="${g.champion}">`;
    html += `<div class="champ-tip"><span class="${tipClass}">${tipText}</span><span>${g.kills}/${g.deaths}/${g.assists}</span><span>${dpm} dpm</span></div>`;
    html += `</div>\n`;
  }
  html += '    </div>';

  console.log(`league: ${data.recent.length} games inlined`);
  return html;
}

async function main() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');

  const spotifyToken = await getSpotifyToken();

  if (spotifyToken) {
    try {
      const spotifyHtml = await buildSpotify(spotifyToken);
      if (spotifyHtml) {
        html = html.replace(
          /<!-- SPOTIFY_START -->[\s\S]*?<!-- SPOTIFY_END -->/,
          `<!-- SPOTIFY_START -->\n    ${spotifyHtml}\n    <!-- SPOTIFY_END -->`
        );
      }
    } catch (err) {
      console.error('spotify recent error:', err.message);
    }

    try {
      const onRepeatHtml = await buildOnRepeat(spotifyToken);
      if (onRepeatHtml) {
        html = html.replace(
          /<!-- ONREPEAT_START -->[\s\S]*?<!-- ONREPEAT_END -->/,
          `<!-- ONREPEAT_START -->\n    ${onRepeatHtml}\n    <!-- ONREPEAT_END -->`
        );
      }
    } catch (err) {
      console.error('spotify on repeat error:', err.message);
    }
  }

  try {
    const leagueHtml = await buildLeague();
    if (leagueHtml) {
      html = html.replace(
        /<!-- LEAGUE_START -->[\s\S]*?<!-- LEAGUE_END -->/,
        `<!-- LEAGUE_START -->\n    ${leagueHtml}\n    <!-- LEAGUE_END -->`
      );
    }
  } catch (err) {
    console.error('league error:', err.message);
  }

  fs.writeFileSync(HTML_PATH, html);
  console.log('wrote index.html');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { getSpotifyToken, main };
