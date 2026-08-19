import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
const DEFAULT_LIMIT = 32;
const EXPANSION = 'HOB';
const FORMAT = 'PremierDraft';
const SET_NAME = 'The Hobbit';
const TROPHY_PAGE = 'https://www.17lands.com/trophy_decks?expansion=HOB&format=PremierDraft';
const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'trophy-seat/1.1 (https://bensonperry.com/trophy-seat/)',
};

// A small, fixed snapshot of public individual draft logs linked from the HOB
// Trophy Decks page. Keeping the IDs explicit avoids live scraping and makes
// every production seat reproducible. deckIndex is the build linked by 17Lands.
const HOB_TROPHY_SEATS = [
  ['13a97e7703424513ba770488fb3750a3', 0],
  ['359c5a654ba44fc9a6cd04acf30442fd', 0],
  ['b65b790aca464a5a986789e0ea7d67df', 0],
  ['e7dc4916ed914327b25d32013a054a9a', 0],
  ['aa121a5396904115a946a89bdb8a19c7', 0],
  ['9b5707f3f2014282a8f5b5dbadcb8009', 3],
  ['777aab403c2d49d8802345ed3f351729', 0],
  ['9bcb39aeed6f47fea3aea2000093f457', 1],
  ['8ed73547049b4342b9ce3796f4613a67', 0],
  ['70f426f68d1f43389a469ed1190c9c2f', 0],
  ['3684ccf84b1f4765a559a349898c4087', 0],
  ['7d2a773b29064417b32b1c7173238dae', 0],
  ['68a50377d429418da50ad54c51e7778e', 0],
  ['2fe2da0b201e4003b452c55ef5d20f68', 0],
  ['f79e23b9a7d74559b662cfa2722a2c46', 0],
  ['d3767ac88a674998aa6ed3cdae762835', 0],
  ['b799fe13c65342958b5086dbc73b4eec', 0],
  ['118a27627b8f4b9083ffa9d717129887', 0],
  ['d61ebbe5953c4f9a822cdb84fc5e7908', 0],
  ['465ae87e306640fdabe714716b414f27', 1],
  ['380ee81f36714fad8cb820b32e12f02a', 0],
  ['4f487253ef644485963982dd87b30d50', 0],
  ['5df9d2995fbb49029a65d9888a37d694', 2],
  ['4300c575ac0e4691949ac6f3b3752478', 0],
  ['f5210001e2e1422a9c8af948c39ed77b', 0],
  ['7e8a06a498fc4f449103ede14fff1bed', 0],
  ['da6d7e3393214a898dc3f0d048d2a130', 0],
  ['de751de97bbf43d28b2885389271bbeb', 0],
  ['1fcc714aa7974ef1b0463488340be4ef', 0],
  ['9f7fe580209d412893265ccbe685b192', 0],
  ['013a94aa3fa1420da2c7464e0bf0706d', 0],
  ['5e4f3452ab20423f9f89bebb4c0c2f8a', 0],
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[value.slice(2)] = true;
    else {
      args[value.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

async function readCache(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function fetchJson(url, cachePath) {
  const cached = await readCache(cachePath);
  if (cached) return cached;

  await new Promise(resolve => setTimeout(resolve, 180));
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  const data = await response.json();
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data));
  return data;
}

async function fetchSeat(sourceId, deckIndex) {
  const cacheRoot = join(PROJECT_ROOT, '.cache', 'hob-trophy-logs');
  const draftUrl = `https://www.17lands.com/data/draft?draft_id=${sourceId}`;
  const previewUrl = `https://www.17lands.com/data/event_preview?draft_id=${sourceId}`;
  const [draft, preview] = await Promise.all([
    fetchJson(draftUrl, join(cacheRoot, `${sourceId}-draft.json`)),
    fetchJson(previewUrl, join(cacheRoot, `${sourceId}-preview.json`)),
  ]);

  if (draft.expansion !== EXPANSION || preview.expansion !== EXPANSION) {
    throw new Error(`Seat ${sourceId} is not ${EXPANSION}`);
  }
  if (Number(preview.wins) !== 7 || Number(preview.losses) > 2) {
    throw new Error(`Seat ${sourceId} is not a 7-0, 7-1, or 7-2 trophy`);
  }
  if (!Array.isArray(draft.picks) || draft.picks.length < 40) {
    throw new Error(`Seat ${sourceId} does not contain a complete draft log`);
  }

  const deck = preview.decks?.[deckIndex];
  if (!deck) throw new Error(`Seat ${sourceId} has no deck ${deckIndex}`);
  return { sourceId, deckIndex, draft, preview, deck };
}

async function fetchScryfallCards(setCode) {
  const cacheFile = join(PROJECT_ROOT, '.cache', `scryfall-${setCode}.json`);
  const cached = await readCache(cacheFile);
  if (cached) return cached;

  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${setCode} unique:prints`)}`;
  while (url) {
    await new Promise(resolve => setTimeout(resolve, 120));
    const response = await fetch(url, { headers: REQUEST_HEADERS });
    if (!response.ok) throw new Error(`Scryfall failed (${response.status}): ${url}`);
    const data = await response.json();
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cards));
  return cards;
}

function normalizedName(name) {
  return String(name)
    .replace(/^A-/, '')
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function preferredCard(left, right) {
  if (!left) return right;
  const leftArena = left.arena_id ? 0 : 1;
  const rightArena = right.arena_id ? 0 : 1;
  if (leftArena !== rightArena) return leftArena < rightArena ? left : right;
  return Number.parseInt(left.collector_number, 10) <= Number.parseInt(right.collector_number, 10)
    ? left
    : right;
}

function scryfallIndex(rawCards) {
  const byName = new Map();
  for (const card of rawCards) {
    byName.set(normalizedName(card.name), preferredCard(byName.get(normalizedName(card.name)), card));
    for (const face of card.card_faces || []) {
      if (face.name) byName.set(normalizedName(face.name), preferredCard(byName.get(normalizedName(face.name)), card));
    }
  }
  return byName;
}

function cardNamesFromSeat(seat) {
  const names = new Set();
  for (const pick of seat.draft.picks) {
    if (pick.pick?.name) names.add(pick.pick.name);
    for (const card of pick.available || []) names.add(card.name);
  }
  for (const card of Object.values(seat.preview.cards || {})) names.add(card.name);
  return names;
}

function buildCardMetadata(seats, rawCards) {
  const byName = scryfallIndex(rawCards);
  const usedNames = new Set(seats.flatMap(seat => [...cardNamesFromSeat(seat)]));
  const output = {};
  const missing = [];

  for (const name of [...usedNames].sort()) {
    const card = byName.get(normalizedName(name));
    if (!card) {
      missing.push(name);
      continue;
    }
    const imageUris = card.image_uris || card.card_faces?.[0]?.image_uris || {};
    output[name] = {
      name,
      basic: BASIC_LANDS.has(name),
      set: card.set,
      rarity: card.rarity,
      manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
      manaValue: card.cmc,
      colors: card.colors || card.card_faces?.flatMap(face => face.colors || []) || [],
      typeLine: card.type_line,
      imageSmall: imageUris.small,
      imageNormal: imageUris.normal,
      scryfall: card.scryfall_uri,
    };
  }
  if (missing.length) throw new Error(`Missing Scryfall cards: ${missing.join(', ')}`);
  return output;
}

function countCards(ids, cardsById) {
  const counts = new Map();
  for (const id of ids || []) {
    const name = cardsById[String(id)]?.name;
    if (!name) throw new Error(`Missing 17Lands card metadata for Arena card ${id}`);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

function finalDeck(seat) {
  const groups = new Map((seat.deck.groups || []).map(group => [group.name.toLowerCase(), group.cards]));
  const colors = String(seat.deck.colors || '');
  return {
    mainColors: [...colors].filter(color => color === color.toUpperCase()),
    splashColors: [...colors].filter(color => color !== color.toUpperCase()).map(color => color.toUpperCase()),
    main: countCards(groups.get('maindeck'), seat.preview.cards),
    sideboard: countCards(groups.get('sideboard'), seat.preview.cards),
  };
}

function publicDraft(seat) {
  const firstEight = seat.draft.picks.slice(0, 8);
  if (firstEight.some(pick => !pick.pick?.name || !(pick.available || []).some(card => card.name === pick.pick.name))) {
    throw new Error(`Seat ${seat.sourceId} has incomplete first-eight pack data`);
  }
  return {
    id: `hob-${createHash('sha256').update(seat.sourceId).digest('hex').slice(0, 10)}`,
    date: String(seat.preview.first_pick_time || '').slice(0, 10),
    rank: seat.preview.end_rank || 'unknown rank',
    record: `${seat.preview.wins}-${seat.preview.losses}`,
    sourceUrl: `https://www.17lands.com/draft/${seat.sourceId}`,
    picks: seat.draft.picks.map(pick => ({
      pack: Number(pick.pack_number) + 1,
      pick: Number(pick.pick_number) + 1,
      choice: pick.pick.name,
      cards: pick.available.map(card => card.name),
    })),
    deck: finalDeck(seat),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || DEFAULT_LIMIT);
  const sources = HOB_TROPHY_SEATS.slice(0, limit);
  if (sources.length < limit) throw new Error(`Only ${sources.length} HOB seats are configured; requested ${limit}`);

  const seats = [];
  for (const [sourceId, deckIndex] of sources) {
    console.log(`Reading HOB trophy seat ${seats.length + 1}/${sources.length}`);
    seats.push(await fetchSeat(sourceId, deckIndex));
  }

  const cards = buildCardMetadata(seats, await fetchScryfallCards('hob'));
  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    set: { code: EXPANSION, name: SET_NAME },
    format: FORMAT,
    description: 'Anonymous 7-win HOB Premier Drafts from public individual 17Lands trophy logs.',
    source: {
      provider: '17Lands',
      page: TROPHY_PAGE,
      usageGuidelines: 'https://www.17lands.com/usage_guidelines',
    },
    cards,
    drafts: seats.map(publicDraft),
  };

  const outputPath = join(PROJECT_ROOT, 'data', 'drafts.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`Wrote ${output.drafts.length} HOB trophy drafts and ${Object.keys(cards).length} cards to ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
