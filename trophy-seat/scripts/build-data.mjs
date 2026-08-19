import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
const FORMAT = 'PremierDraft';
const DEFAULT_LIMIT = 50;
const DEFAULT_SET = 'HOB';
const PUBLIC_DATA_ROOT = 'https://17lands-public.s3.amazonaws.com/analysis_data/draft_data';
const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'trophy-seat/1.2 (https://bensonperry.com/trophy-seat/)',
};
const SETS = [
  { code: 'HOB', name: 'The Hobbit', legacy: true },
  { code: 'MSH', name: 'Marvel Super Heroes' },
  { code: 'SOS', name: 'Secrets of Strixhaven' },
];

let lastRequestAt = 0;

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

async function fileExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

async function paceRequest(delay = 1600) {
  const wait = Math.max(0, delay - (Date.now() - lastRequestAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function fetchWithRetries(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError;
}

async function fetchJson(url, cachePath, delay = 1600) {
  const cached = await readCache(cachePath);
  if (cached) return cached;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await paceRequest(delay);
    const response = await fetchWithRetries(url, { headers: REQUEST_HEADERS });
    if (response.ok) {
      const data = await response.json();
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify(data));
      return data;
    }

    const canRetry = response.status === 429
      || (response.status === 403 && url.startsWith('https://www.17lands.com/'));
    if (!canRetry || attempt === 4) throw new Error(`Request failed (${response.status}): ${url}`);
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    const fallback = url.startsWith('https://www.17lands.com/') ? attempt * 20_000 : attempt * 3_000;
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : fallback;
    console.log(`Rate limited; pausing ${Math.round(wait / 1000)}s before retry ${attempt + 1}/4`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  throw new Error(`Request failed: ${url}`);
}

async function downloadPublicDrafts(setCode) {
  const filename = `draft_data_public.${setCode}.${FORMAT}.csv.gz`;
  const path = join(PROJECT_ROOT, '.cache', '17lands-public', filename);
  const partialPath = `${path}.partial`;
  if (await fileExists(path)) return path;

  const url = `${PUBLIC_DATA_ROOT}/${filename}`;
  console.log(`Downloading licensed 17Lands public draft data for ${setCode}`);
  const response = await fetchWithRetries(url, { headers: REQUEST_HEADERS });
  if (!response.ok || !response.body) throw new Error(`Public dataset failed (${response.status}): ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await unlink(partialPath).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
  await rename(partialPath, path);
  return path;
}

function parseCsvPrefix(line, fieldCount) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(value);
      value = '';
      if (fields.length >= fieldCount) return fields;
    } else value += character;
  }
  fields.push(value);
  return fields;
}

async function trophyCandidates(setCode, targetCount) {
  const path = await downloadPublicDrafts(setCode);
  const drafts = new Map();
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let headerFields = null;
  let packColumns = [];

  for await (const line of lines) {
    if (!headerFields) {
      headerFields = parseCsvPrefix(line, Number.MAX_SAFE_INTEGER);
      packColumns = headerFields
        .map((name, index) => ({ name: name.startsWith('pack_card_') ? name.slice(10) : '', index }))
        .filter(column => column.name);
      continue;
    }
    const fields = parseCsvPrefix(line, 10);
    const [expansion, eventType, draftId, draftTime, rank, wins, losses, packNumber, pickNumber, pick] = fields;
    if (expansion !== setCode || eventType !== FORMAT || Number(wins) !== 7 || Number(losses) > 2) continue;
    const existing = drafts.get(draftId) || { sourceId: draftId, rows: 0, draftTime, rank };
    existing.rows += 1;
    if (Number(packNumber) === 0 && Number(pickNumber) === 0) {
      const row = parseCsvPrefix(line, Number.MAX_SAFE_INTEGER);
      existing.firstPick = pick;
      existing.firstPickCards = packColumns.flatMap(column => (
        Array.from({ length: Number(row[column.index]) || 0 }, () => column.name)
      ));
    }
    drafts.set(draftId, existing);
  }

  return [...drafts.values()]
    .filter(draft => draft.rows >= 40 && draft.firstPickCards?.length >= 12)
    .sort((left, right) => right.draftTime.localeCompare(left.draftTime))
    .slice(0, Math.max(targetCount + 30, targetCount * 2));
}

async function fetchSeat(setCode, candidate) {
  const { sourceId } = candidate;
  const cacheRoot = join(PROJECT_ROOT, '.cache', 'trophy-logs', setCode.toLowerCase());
  const draftUrl = `https://www.17lands.com/data/draft?draft_id=${sourceId}`;
  const previewUrl = `https://www.17lands.com/data/event_preview?draft_id=${sourceId}`;
  const draft = await fetchJson(draftUrl, join(cacheRoot, `${sourceId}-draft.json`));
  const preview = await fetchJson(previewUrl, join(cacheRoot, `${sourceId}-preview.json`));

  if (draft.expansion !== setCode || preview.expansion !== setCode) {
    throw new Error(`Seat ${sourceId} is not ${setCode}`);
  }
  if (Number(preview.wins) !== 7 || Number(preview.losses) > 2) {
    throw new Error(`Seat ${sourceId} is not a 7-0, 7-1, or 7-2 trophy`);
  }
  if (!Array.isArray(draft.picks) || draft.picks.length < 40) {
    throw new Error(`Seat ${sourceId} does not contain a complete draft log`);
  }
  if (candidate.firstPick !== draft.picks[0]?.pick?.name
    || !candidate.firstPickCards.includes(candidate.firstPick)) {
    throw new Error(`Seat ${sourceId} does not match its exact public opening pack`);
  }

  const deckIndex = (preview.decks?.length || 0) - 1;
  const deck = preview.decks?.[deckIndex];
  if (!deck) throw new Error(`Seat ${sourceId} has no recorded final build`);
  return { sourceId, deckIndex, draft, preview, deck, firstPickCards: candidate.firstPickCards };
}

async function fetchScryfallCards(setCode) {
  const cacheFile = join(PROJECT_ROOT, '.cache', `scryfall-${setCode}.json`);
  const cached = await readCache(cacheFile);
  if (cached) return cached;

  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${setCode} unique:prints`)}`;
  while (url) {
    const data = await fetchJson(url, join(PROJECT_ROOT, '.cache', 'scryfall-pages', `${setCode}-${cards.length}.json`), 120);
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  await writeFile(cacheFile, JSON.stringify(cards));
  return cards;
}

async function fetchScryfallCardByName(name) {
  const key = createHash('sha256').update(name).digest('hex').slice(0, 16);
  const cacheFile = join(PROJECT_ROOT, '.cache', 'scryfall-named', `${key}.json`);
  return fetchJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, cacheFile, 250);
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
  for (const name of seat.firstPickCards || []) names.add(name);
  for (const pick of seat.draft.picks) {
    if (pick.pick?.name) names.add(pick.pick.name);
    for (const card of pick.available || []) names.add(card.name);
  }
  for (const card of Object.values(seat.preview.cards || {})) names.add(card.name);
  return names;
}

async function buildCardMetadata(seats, rawCards) {
  const byName = scryfallIndex(rawCards);
  const usedNames = new Set(seats.flatMap(seat => [...cardNamesFromSeat(seat)]));
  const output = {};

  for (const name of [...usedNames].sort()) {
    let card = byName.get(normalizedName(name));
    if (!card) {
      console.log(`Reading Scryfall metadata for cross-set card: ${name}`);
      card = await fetchScryfallCardByName(name);
      byName.set(normalizedName(name), card);
    }
    const imageUris = card.image_uris || card.card_faces?.[0]?.image_uris || {};
    if (!imageUris.normal) throw new Error(`Missing Scryfall image for ${name}`);
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

function publicDraft(seat, setCode) {
  const firstEight = seat.draft.picks.slice(0, 8);
  if (firstEight.some(pick => !pick.pick?.name || !(pick.available || []).some(card => card.name === pick.pick.name))) {
    throw new Error(`Seat ${seat.sourceId} has incomplete first-eight pack data`);
  }
  return {
    id: `${setCode.toLowerCase()}-${createHash('sha256').update(seat.sourceId).digest('hex').slice(0, 10)}`,
    date: String(seat.preview.first_pick_time || '').slice(0, 10),
    rank: seat.preview.end_rank || 'unknown rank',
    record: `${seat.preview.wins}-${seat.preview.losses}`,
    sourceUrl: `https://www.17lands.com/draft/${seat.sourceId}`,
    picks: seat.draft.picks.map((pick, index) => ({
      pack: Number(pick.pack_number) + 1,
      pick: Number(pick.pick_number) + 1,
      choice: pick.pick.name,
      cards: index === 0 ? seat.firstPickCards : pick.available.map(card => card.name),
    })),
    deck: finalDeck(seat),
  };
}

async function buildPublicSet(config, limit) {
  const candidates = await trophyCandidates(config.code, limit);
  const seats = [];
  for (const candidate of candidates) {
    if (seats.length >= limit) break;
    try {
      console.log(`Validating ${config.code} trophy seat ${seats.length + 1}/${limit}`);
      seats.push(await fetchSeat(config.code, candidate));
    } catch (error) {
      console.warn(`Skipping ${config.code} ${candidate.sourceId}: ${error.message}`);
    }
  }
  if (!seats.length) throw new Error(`No complete ${config.code} trophy seats were found`);

  const cards = await buildCardMetadata(seats, await fetchScryfallCards(config.code.toLowerCase()));
  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    set: { code: config.code, name: config.name },
    format: FORMAT,
    description: `Exact anonymous 7-win ${config.code} Premier Draft logs discovered in the licensed 17Lands public dataset.`,
    source: {
      provider: '17Lands',
      page: 'https://www.17lands.com/public_datasets',
      usageGuidelines: 'https://www.17lands.com/usage_guidelines',
    },
    cards,
    drafts: seats.map(seat => publicDraft(seat, config.code)),
  };
}

async function writeDataset(dataset) {
  const path = join(PROJECT_ROOT, 'data', `${dataset.set.code.toLowerCase()}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(dataset));
  console.log(`Wrote ${dataset.drafts.length} verified ${dataset.set.code} trophy seats to ${path}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestedCodes = String(args.sets || SETS.map(set => set.code).join(','))
    .split(',')
    .map(code => code.trim().toUpperCase())
    .filter(Boolean);
  const limit = Number(args.limit || DEFAULT_LIMIT);
  const datasets = [];

  for (const config of SETS) {
    if (!requestedCodes.includes(config.code)) continue;
    if (config.legacy) {
      datasets.push(JSON.parse(await readFile(join(PROJECT_ROOT, 'data', 'hob.json'), 'utf8')));
      continue;
    }
    const outputPath = join(PROJECT_ROOT, 'data', `${config.code.toLowerCase()}.json`);
    const existing = await readCache(outputPath);
    const completeOpeningPacks = existing?.drafts?.every(draft => draft.picks?.[0]?.cards?.length >= 12);
    if (existing?.drafts?.length >= limit && completeOpeningPacks) {
      console.log(`Reusing ${existing.drafts.length} verified ${config.code} trophy seats`);
      datasets.push(existing);
      continue;
    }
    const dataset = await buildPublicSet(config, limit);
    await writeDataset(dataset);
    datasets.push(dataset);
  }

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    defaultSet: DEFAULT_SET,
    sets: datasets.map(dataset => ({
      code: dataset.set.code,
      name: dataset.set.name,
      draftCount: dataset.drafts.length,
      dataUrl: `./data/${dataset.set.code.toLowerCase()}.json?v=1`,
    })),
  };
  await writeFile(join(PROJECT_ROOT, 'data', 'index.json'), JSON.stringify(catalog));
  console.log(`Wrote catalog with ${catalog.sets.reduce((sum, set) => sum + set.draftCount, 0)} verified seats`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
