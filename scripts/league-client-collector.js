const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const DEFAULT_REPOSITORY = 'benson/benson.github.io';
const DEFAULT_REMOTE_PATH = 'league-client-history.json';
const HISTORY_LIMIT = 100;
let ghExecutable = 'gh.exe';
let scheduledLogDirectory = null;

const QUEUE_NAMES = {
  400: 'normal', 420: 'ranked', 440: 'ranked flex', 450: 'aram', 490: 'normal', 720: 'aram',
  1700: 'arena', 1710: 'arena', 2300: 'brawl', 2400: 'aram mayhem', 2450: 'aram mayhem',
  4310: 'league classic',
};

function parseArgs(argv) {
  const args = { publish: false, dryRun: false, scheduled: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--publish') args.publish = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--scheduled') args.scheduled = true;
    else if (arg === '--repository') args.repository = argv[++index];
    else if (arg === '--gh-path') args.remotePath = argv[++index];
    else if (arg === '--gh-executable') args.ghExecutable = argv[++index];
    else if (arg === '--log-directory') args.logDirectory = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function parseLcuCredentials(commandLine) {
  const port = /--app-port=(?:"([0-9]+)"|([0-9]+))/.exec(commandLine)?.slice(1).find(Boolean);
  const token = /--remoting-auth-token=(?:"([^"]+)"|([^\s"]+))/.exec(commandLine)?.slice(1).find(Boolean);
  if (!port || !token) return null;
  return { port: Number(port), token };
}

function discoverLcuCredentials() {
  const command = [
    "$process = Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine",
    'if ($process) { [Console]::Out.Write($process) }',
  ].join('; ');
  const commandLine = execFileSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
    { encoding: 'utf8', windowsHide: true }
  );
  return parseLcuCredentials(commandLine);
}

function lcuRequest(credentials, endpoint) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: '127.0.0.1',
      port: credentials.port,
      path: endpoint,
      method: 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`riot:${credentials.token}`).toString('base64')}` },
      rejectUnauthorized: false,
      timeout: 30_000,
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`League client returned HTTP ${response.statusCode} for ${endpoint}`));
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (error) {
          reject(new Error(`League client returned invalid JSON for ${endpoint}: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`League client request timed out for ${endpoint}`)));
    request.on('error', reject);
    request.end();
  });
}

function dataDragonChampionKey(champion) {
  const alias = String(champion?.alias || '').replace(/^(Jade|Kiwi)_/i, '');
  if (alias) return alias;
  return String(champion?.name || 'Unknown').replace(/[^A-Za-z0-9]/g, '') || 'Unknown';
}

function queueLabel(queueId, queue, gameMode) {
  if (QUEUE_NAMES[queueId]) return QUEUE_NAMES[queueId];
  return String(queue?.name || gameMode || 'other').toLowerCase().replaceAll('_', ' ');
}

function participantForSummoner(game, summoner) {
  const identity = (game.participantIdentities || []).find(item => {
    const player = item.player || {};
    return (summoner.puuid && player.puuid === summoner.puuid)
      || (summoner.summonerId && String(player.summonerId) === String(summoner.summonerId))
      || (summoner.accountId && String(player.accountId) === String(summoner.accountId));
  });
  if (identity) {
    return (game.participants || []).find(item => item.participantId === identity.participantId);
  }
  return (game.participants || []).find(item => item.stats?.playerScore0 !== undefined)
    || game.participants?.[0];
}

function normalizeLcuMatch(game, summoner, championById = new Map(), queueById = new Map()) {
  const participant = participantForSummoner(game, summoner);
  if (!participant) return null;
  const stats = participant.stats || {};
  const champion = championById.get(Number(participant.championId));
  const queue = queueById.get(Number(game.queueId));
  const durationSeconds = Number(game.gameDuration || stats.timePlayed || 0);
  return {
    gameId: String(game.gameId),
    startedAt: Number(game.gameCreation || game.gameCreationDate || 0),
    queueId: Number(game.queueId || 0),
    gameMode: game.gameMode || '',
    queue: queueLabel(Number(game.queueId), queue, game.gameMode),
    champion: dataDragonChampionKey(champion || { name: `Champion${participant.championId}` }),
    win: stats.win === true || String(stats.win).toLowerCase() === 'win',
    kills: Number(stats.kills || 0),
    deaths: Number(stats.deaths || 0),
    assists: Number(stats.assists || 0),
    damage: Number(stats.totalDamageDealtToChampions || 0),
    minutes: Math.max(1, Math.round(durationSeconds / 60)),
  };
}

async function collectMatches(credentials) {
  const [summoner, history, queues] = await Promise.all([
    lcuRequest(credentials, '/lol-summoner/v1/current-summoner'),
    lcuRequest(credentials, `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${HISTORY_LIMIT - 1}`),
    lcuRequest(credentials, '/lol-game-queues/v1/queues').catch(() => []),
  ]);
  const games = history?.games?.games || history?.games || [];
  const queueById = new Map((queues || []).map(queue => [Number(queue.id), queue]));
  const championIds = [...new Set(games.flatMap(game =>
    (game.participants || []).map(participant => Number(participant.championId)).filter(Boolean)
  ))];
  const championById = new Map();
  for (const championId of championIds) {
    try {
      const champion = await lcuRequest(credentials, `/lol-game-data/assets/v1/champions/${championId}.json`);
      championById.set(championId, champion);
    } catch {
      // A numeric fallback is preferable to dropping an otherwise complete match.
    }
  }

  return games
    .map(game => normalizeLcuMatch(game, summoner, championById, queueById))
    .filter(Boolean)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, HISTORY_LIMIT);
}

function ghApi(args, input) {
  const result = spawnSync(ghExecutable, ['api', ...args], {
    encoding: 'utf8',
    input,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'GitHub CLI failed').trim());
  }
  return result.stdout;
}

function readRemoteCache(repository, remotePath) {
  try {
    const raw = ghApi([`repos/${repository}/contents/${remotePath}`, '-X', 'GET', '-f', 'ref=master']);
    const response = JSON.parse(raw);
    return {
      sha: response.sha,
      data: JSON.parse(Buffer.from(response.content, 'base64').toString('utf8')),
    };
  } catch (error) {
    if (/404|Not Found/i.test(error.message)) return { sha: null, data: { games: [] } };
    throw error;
  }
}

function mergeCachedGames(previousGames, collectedGames) {
  const byId = new Map();
  for (const game of [...(previousGames || []), ...(collectedGames || [])]) {
    if (game?.gameId) byId.set(String(game.gameId), game);
  }
  return [...byId.values()]
    .sort((a, b) => Number(b.startedAt) - Number(a.startedAt))
    .slice(0, HISTORY_LIMIT);
}

function sameGames(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function publishCache(repository, remotePath, collectedGames) {
  const remote = readRemoteCache(repository, remotePath);
  const games = mergeCachedGames(remote.data.games, collectedGames);
  if (sameGames(remote.data.games, games)) return { changed: false, count: games.length };

  const document = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    games,
  };
  const body = {
    message: 'update League client match history',
    content: Buffer.from(`${JSON.stringify(document, null, 2)}\n`).toString('base64'),
    branch: 'master',
    ...(remote.sha ? { sha: remote.sha } : {}),
  };
  ghApi([`repos/${repository}/contents/${remotePath}`, '-X', 'PUT', '--input', '-'], JSON.stringify(body));
  return { changed: true, count: games.length };
}

function appendScheduledLog(message) {
  const directory = scheduledLogDirectory
    || path.join(process.env.LOCALAPPDATA || __dirname, 'BensonHomepage');
  fs.mkdirSync(directory, { recursive: true });
  const logPath = path.join(directory, 'league-client-collector.log');
  let lines = [];
  if (fs.existsSync(logPath)) lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
  lines.push(`${new Date().toISOString()} ${message}`);
  fs.writeFileSync(logPath, `${lines.slice(-500).join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ghExecutable = args.ghExecutable || ghExecutable;
  scheduledLogDirectory = args.logDirectory || scheduledLogDirectory;
  let credentials;
  try {
    credentials = discoverLcuCredentials();
  } catch {
    credentials = null;
  }
  if (!credentials) {
    if (args.scheduled) appendScheduledLog('League client is closed; skipped');
    else console.log('League client is closed; nothing to collect.');
    return;
  }

  const games = await collectMatches(credentials);
  const summary = `collected ${games.length} matches (${games.filter(game => game.queueId === 2400 || game.queueId === 2450 || game.queueId === 4310).length} client-only-mode candidates)`;
  if (args.dryRun || !args.publish) {
    console.log(summary);
    console.log(games.slice(0, 5).map(game => ({
      gameId: game.gameId,
      queue: game.queue,
      champion: game.champion,
      win: game.win,
      kda: `${game.kills}/${game.deaths}/${game.assists}`,
    })));
  }
  if (args.publish) {
    const result = publishCache(
      args.repository || DEFAULT_REPOSITORY,
      args.remotePath || DEFAULT_REMOTE_PATH,
      games
    );
    const publishSummary = result.changed
      ? `${summary}; published ${result.count} cached matches`
      : `${summary}; remote cache already current`;
    if (args.scheduled) appendScheduledLog(publishSummary);
    else console.log(publishSummary);
  }
}

if (require.main === module) {
  main().catch(error => {
    const safeMessage = String(error.message).replace(/--remoting-auth-token=[^\s]+/g, '--remoting-auth-token=[redacted]');
    if (process.argv.includes('--scheduled')) appendScheduledLog(`error: ${safeMessage}`);
    else console.error(safeMessage);
    process.exitCode = 1;
  });
}

module.exports = {
  collectMatches,
  dataDragonChampionKey,
  discoverLcuCredentials,
  lcuRequest,
  mergeCachedGames,
  normalizeLcuMatch,
  parseArgs,
  parseLcuCredentials,
  queueLabel,
  sameGames,
};
