const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT_HISTORY_PATH = path.join(ROOT, 'league-client-history.json');
const OUTPUT_PATH = path.join(ROOT, 'league-history.json');
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const GAME_NAME = 'sick beak';
const TAG_LINE = 'NA 1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const QUEUE_NAMES = {
  400: 'normal',
  420: 'ranked',
  440: 'ranked flex',
  450: 'aram',
  490: 'normal',
  720: 'aram',
  1700: 'arena',
  1710: 'arena',
  2300: 'brawl',
  2400: 'aram mayhem',
  2450: 'aram mayhem',
  4310: 'league classic',
};

function queueLabel(queueId, gameMode = '') {
  if (QUEUE_NAMES[queueId]) return QUEUE_NAMES[queueId];
  const mode = String(gameMode).toLowerCase();
  if (mode === 'aram') return 'aram';
  if (mode === 'classic') return 'normal';
  return mode.replaceAll('_', ' ') || 'other';
}

function canonicalGameId(gameId) {
  return String(gameId ?? '').replace(/^[A-Z0-9]+_/, '');
}

function normalizeOfficialMatch(match, puuid) {
  const me = match.info.participants.find(participant => participant.puuid === puuid);
  if (!me) return null;
  return {
    gameId: canonicalGameId(match.metadata.matchId || match.info.gameId),
    startedAt: Number(match.info.gameStartTimestamp || match.info.gameCreation || 0),
    queueId: Number(match.info.queueId || 0),
    gameMode: match.info.gameMode || '',
    queue: queueLabel(match.info.queueId, match.info.gameMode),
    champion: me.championName || 'Unknown',
    win: Boolean(me.win),
    kills: Number(me.kills || 0),
    deaths: Number(me.deaths || 0),
    assists: Number(me.assists || 0),
    damage: Number(me.totalDamageDealtToChampions || 0),
    minutes: Math.max(1, Math.round(Number(match.info.gameDuration || 0) / 60)),
  };
}

function normalizeClientMatch(match) {
  return {
    gameId: canonicalGameId(match.gameId),
    startedAt: Number(match.startedAt || 0),
    queueId: Number(match.queueId || 0),
    gameMode: match.gameMode || '',
    queue: match.queue || queueLabel(match.queueId, match.gameMode),
    champion: match.champion || 'Unknown',
    win: Boolean(match.win),
    kills: Number(match.kills || 0),
    deaths: Number(match.deaths || 0),
    assists: Number(match.assists || 0),
    damage: Number(match.damage || 0),
    minutes: Math.max(1, Number(match.minutes || 1)),
  };
}

function loadClientMatches(filePath = CLIENT_HISTORY_PATH) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data.games) ? data.games.map(normalizeClientMatch) : [];
  } catch (error) {
    console.error(`client cache ignored: ${error.message}`);
    return [];
  }
}

function mergeMatches(officialMatches, clientMatches, now = Date.now()) {
  const byId = new Map();
  for (const match of clientMatches) {
    if (match.gameId) byId.set(canonicalGameId(match.gameId), normalizeClientMatch(match));
  }
  // Prefer the supported Riot API record when both sources contain the same game.
  for (const match of officialMatches) {
    if (match?.gameId) byId.set(canonicalGameId(match.gameId), match);
  }
  return [...byId.values()]
    .filter(match => match.startedAt >= now - WEEK_MS && match.startedAt <= now + 60 * 60 * 1000)
    .sort((a, b) => b.startedAt - a.startedAt);
}

function buildBlurb(matches) {
  if (!matches.length) return 'no games this week';

  const groups = new Map();
  let wins = 0;
  for (const match of matches) {
    const mode = match.queue || queueLabel(match.queueId, match.gameMode);
    groups.set(mode, (groups.get(mode) || 0) + 1);
    if (match.win) wins++;
  }

  const parts = [...groups.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([mode, count]) => `${count} ${mode} game${count === 1 ? '' : 's'}`);
  const games = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `played ${games} in the last week, went ${wins}-${matches.length - wins}${parts.length > 1 ? ' overall' : ''}`;
}

async function api(url) {
  const response = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${url}`);
  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOfficialMatches() {
  if (!RIOT_API_KEY) {
    console.log('official history skipped: RIOT_API_KEY not set');
    return [];
  }
  const account = await api(
    `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(GAME_NAME)}/${encodeURIComponent(TAG_LINE)}`
  );
  const weekAgo = Math.floor((Date.now() - WEEK_MS) / 1000);
  const matchIds = await api(
    `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${account.puuid}/ids?startTime=${weekAgo}&count=50`
  );
  console.log(`official history: ${matchIds.length} matches`);

  const matches = [];
  for (const id of matchIds) {
    const raw = await api(`https://americas.api.riotgames.com/lol/match/v5/matches/${id}`);
    const normalized = normalizeOfficialMatch(raw, account.puuid);
    if (normalized) matches.push(normalized);
    await sleep(100);
  }
  return matches;
}

async function latestDdragonVersion(fallback) {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return (await response.json())[0];
  } catch (error) {
    console.error(`Data Dragon version lookup failed: ${error.message}`);
    return fallback;
  }
}

async function main() {
  const clientMatches = loadClientMatches();
  console.log(`client cache: ${clientMatches.length} matches`);

  let officialMatches = [];
  try {
    officialMatches = await fetchOfficialMatches();
  } catch (error) {
    console.error(`official history failed: ${error.message}`);
  }

  const merged = mergeMatches(officialMatches, clientMatches);
  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    : {};
  const output = {
    blurb: buildBlurb(merged),
    recent: merged.slice(0, 5),
    ddragonVersion: await latestDdragonVersion(existing.ddragonVersion),
    date: new Date().toISOString().slice(0, 10),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`wrote league-history.json with ${merged.length} matches from both sources`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  WEEK_MS,
  buildBlurb,
  canonicalGameId,
  loadClientMatches,
  mergeMatches,
  normalizeClientMatch,
  normalizeOfficialMatch,
  queueLabel,
};
