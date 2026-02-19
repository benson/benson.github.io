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

async function buildSpotify() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.log('spotify: skipping (no credentials)');
    return null;
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('spotify: no access token');

  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  });
  if (!res.ok) throw new Error(`spotify: ${res.status}`);
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

  let html = '<div id="spotify-recent">\n';
  for (const t of tracks) {
    const art = t.artUrl ? await fetchBase64(t.artUrl) : '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    html += `      <a class="album-wrap" href="${esc(t.url)}" target="_blank">`;
    html += `<img class="album-icon" src="${art}" alt="${esc(t.name)}">`;
    html += `<div class="album-tip"><span class="tip-track">${esc(t.name)}</span><span>${esc(t.artist)}</span></div>`;
    html += `</a>\n`;
  }
  html += '    </div>';

  console.log(`spotify: ${tracks.length} tracks inlined`);
  return html;
}

async function buildLeague() {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    console.log('league: skipping (no credentials)');
    return null;
  }

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

    html += `      <div class="champ-wrap">`;
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

  try {
    const spotifyHtml = await buildSpotify();
    if (spotifyHtml) {
      html = html.replace(
        /<!-- SPOTIFY_START -->[\s\S]*?<!-- SPOTIFY_END -->/,
        `<!-- SPOTIFY_START -->\n    ${spotifyHtml}\n    <!-- SPOTIFY_END -->`
      );
    }
  } catch (err) {
    console.error('spotify error:', err.message);
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

main();
