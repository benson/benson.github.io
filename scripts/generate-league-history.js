const fs = require('fs');
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const GAME_NAME = 'sick beak';
const TAG_LINE = 'NA 1';

const QUEUE_NAMES = {
  420: 'ranked',
  440: 'ranked flex',
  450: 'aram',
  720: 'aram',
  400: 'normal',
  490: 'normal',
};

function queueLabel(queueId) {
  return QUEUE_NAMES[queueId] || 'other';
}

async function api(url) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': RIOT_API_KEY },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${url}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildBlurb(matches, puuid) {
  if (matches.length === 0) return 'no games this week';

  const groups = {};
  let totalWins = 0;
  let totalLosses = 0;

  for (const m of matches) {
    const me = m.info.participants.find(p => p.puuid === puuid);
    if (!me) continue;
    const mode = queueLabel(m.info.queueId);
    groups[mode] = (groups[mode] || 0) + 1;
    if (me.win) totalWins++;
    else totalLosses++;
  }

  const parts = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => `${count} ${mode} game${count === 1 ? '' : 's'}`);

  const gamesStr = parts.length === 1
    ? parts[0]
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];

  const total = totalWins + totalLosses;
  const record = `${totalWins}-${totalLosses}`;
  const suffix = parts.length > 1 ? ' overall' : '';

  return `played ${gamesStr} in the last week, went ${record}${suffix}`;
}

async function main() {
  if (!RIOT_API_KEY) {
    console.error('RIOT_API_KEY not set');
    fs.writeFileSync('league-history.json', JSON.stringify({
      blurb: 'no games this week',
      recent: [],
      date: new Date().toISOString().slice(0, 10),
    }, null, 2) + '\n');
    process.exit(0);
  }

  try {
    const account = await api(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(GAME_NAME)}/${TAG_LINE}`
    );
    const puuid = account.puuid;
    console.log('got puuid');

    const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const matchIds = await api(
      `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${weekAgo}&count=20`
    );
    console.log(`found ${matchIds.length} matches`);

    const matches = [];
    for (const id of matchIds) {
      const match = await api(
        `https://americas.api.riotgames.com/lol/match/v5/matches/${id}`
      );
      matches.push(match);
      await sleep(100);
    }

    const blurb = buildBlurb(matches, puuid);
    console.log('blurb:', blurb);

    const recent = matches.slice(0, 5).map(m => {
      const me = m.info.participants.find(p => p.puuid === puuid);
      return { champion: me?.championName || 'Unknown', win: me?.win || false };
    });

    const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
    const ddragonVersion = versions[0];

    const output = {
      blurb,
      recent,
      ddragonVersion,
      date: new Date().toISOString().slice(0, 10),
    };

    fs.writeFileSync('league-history.json', JSON.stringify(output, null, 2) + '\n');
    console.log('wrote league-history.json');
  } catch (err) {
    console.error('error:', err.message);
    fs.writeFileSync('league-history.json', JSON.stringify({
      blurb: 'no games this week',
      recent: [],
      date: new Date().toISOString().slice(0, 10),
    }, null, 2) + '\n');
  }
}

main();
