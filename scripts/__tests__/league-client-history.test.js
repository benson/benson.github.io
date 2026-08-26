const test = require('node:test');
const assert = require('node:assert/strict');

const collector = require('../league-client-collector');
const generator = require('../generate-league-history');

test('parses quoted League client credentials without retaining quote characters', () => {
  assert.deepEqual(
    collector.parseLcuCredentials('"--remoting-auth-token=secret-token" "--app-port=54321"'),
    { port: 54321, token: 'secret-token' }
  );
});

test('maps special-mode champion aliases to Data Dragon icon keys', () => {
  assert.equal(collector.dataDragonChampionKey({ alias: 'Jade_Teemo' }), 'Teemo');
  assert.equal(collector.dataDragonChampionKey({ alias: 'Kiwi_Nunu' }), 'Nunu');
  assert.equal(collector.dataDragonChampionKey({ alias: 'MonkeyKing' }), 'MonkeyKing');
});

test('normalizes an LCU match to stats for only the current summoner', () => {
  const game = {
    gameId: 123,
    gameCreation: 1_777_000_000_000,
    gameDuration: 901,
    gameMode: 'JADE',
    queueId: 4310,
    participantIdentities: [
      { participantId: 1, player: { puuid: 'someone-else' } },
      { participantId: 2, player: { puuid: 'me' } },
    ],
    participants: [
      { participantId: 1, championId: 1, stats: { kills: 99 } },
      {
        participantId: 2,
        championId: 60017,
        stats: { win: true, kills: 12, deaths: 10, assists: 7, totalDamageDealtToChampions: 23456 },
      },
    ],
  };
  const normalized = collector.normalizeLcuMatch(
    game,
    { puuid: 'me' },
    new Map([[60017, { alias: 'Jade_Teemo' }]]),
    new Map()
  );

  assert.deepEqual(normalized, {
    gameId: '123',
    startedAt: 1_777_000_000_000,
    queueId: 4310,
    gameMode: 'JADE',
    queue: 'league classic',
    champion: 'Teemo',
    win: true,
    kills: 12,
    deaths: 10,
    assists: 7,
    damage: 23456,
    minutes: 15,
  });
  assert.equal(JSON.stringify(normalized).includes('puuid'), false);
  assert.equal(JSON.stringify(normalized).includes('someone-else'), false);
});

test('merges client-only matches and lets official data replace duplicate games', () => {
  const now = 1_777_000_000_000;
  const client = [{
    gameId: '123', startedAt: now - 1000, queueId: 4310, gameMode: 'JADE', queue: 'league classic',
    champion: 'Teemo', win: false, kills: 1, deaths: 2, assists: 3, damage: 4, minutes: 5,
  }, {
    gameId: '124', startedAt: now - 500, queueId: 2400, gameMode: 'KIWI', queue: 'aram mayhem',
    champion: 'Nunu', win: true, kills: 5, deaths: 4, assists: 3, damage: 2000, minutes: 12,
  }];
  const official = [{ ...client[0], gameId: 'NA1_123', win: true, kills: 10 }];

  const merged = generator.mergeMatches(official, client, now);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(game => game.gameId === 'NA1_123').win, true);
  assert.equal(merged.find(game => generator.canonicalGameId(game.gameId) === '123').kills, 10);
});

test('builds a readable summary across supported and client-only modes', () => {
  const matches = [
    { queue: 'league classic', win: true },
    { queue: 'aram mayhem', win: false },
    { queue: 'aram mayhem', win: true },
  ];
  assert.equal(
    generator.buildBlurb(matches),
    'played 2 aram mayhem games and 1 league classic game in the last week, went 2-1 overall'
  );
});
