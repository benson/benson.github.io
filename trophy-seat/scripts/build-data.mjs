import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { validateDataset } from '../model.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
const FORMAT = 'PremierDraft';
const DEFAULT_LIMIT = 50;
const PUBLIC_DATA_ROOT = 'https://17lands-public.s3.amazonaws.com/analysis_data/draft_data';
const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'trophy-seat/1.2 (https://bensonperry.com/trophy-seat/)',
};
const FILTERS_URL = 'https://www.17lands.com/data/filters';
const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';

export class NoCompleteSeatsError extends Error {}
export class IncompleteSeatError extends Error {}

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
    if (!canRetry || attempt === 4) throw Object.assign(new Error(`Request failed (${response.status}): ${url}`), { status: response.status });
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
      const expected = ['expansion', 'event_type', 'draft_id', 'draft_time', 'rank', 'event_match_wins', 'event_match_losses', 'pack_number', 'pick_number', 'pick'];
      if (expected.some((name, index) => headerFields[index] !== name)) {
        throw new Error(`Unexpected public draft schema for ${setCode}`);
      }
      packColumns = headerFields
        .map((name, index) => ({ name: name.startsWith('pack_card_') ? name.slice(10) : '', index }))
        .filter(column => column.name);
      if (!packColumns.length) throw new Error(`Public draft data for ${setCode} has no pack columns`);
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

  if (!headerFields) throw new Error(`Empty public draft data for ${setCode}`);
  return [...drafts.values()]
    .filter(draft => draft.rows >= 40 && draft.firstPickCards?.length >= 12)
    .sort((left, right) => right.draftTime.localeCompare(left.draftTime))
    .slice(0, Math.max(targetCount + 30, targetCount * 2));
}

export async function fetchSeat(setCode, candidate, fetchData = fetchJson) {
  const { sourceId } = candidate;
  const cacheRoot = join(PROJECT_ROOT, '.cache', 'trophy-logs', setCode.toLowerCase());
  const draftUrl = `https://www.17lands.com/data/draft?draft_id=${sourceId}`;
  const previewUrl = `https://www.17lands.com/data/event_preview?draft_id=${sourceId}`;
  let draft;
  let preview;
  try {
    draft = await fetchData(draftUrl, join(cacheRoot, `${sourceId}-draft.json`));
    preview = await fetchData(previewUrl, join(cacheRoot, `${sourceId}-preview.json`));
  } catch (error) {
    if (error.status === 404) throw new IncompleteSeatError(`Seat ${sourceId} is no longer public`);
    throw error;
  }

  if (draft?.expansion !== setCode || preview?.expansion !== setCode) {
    throw new IncompleteSeatError(`Seat ${sourceId} is not ${setCode}`);
  }
  if (Number(preview.wins) !== 7 || ![0, 1, 2].includes(Number(preview.losses))) {
    throw new IncompleteSeatError(`Seat ${sourceId} is not a 7-0, 7-1, or 7-2 trophy`);
  }
  if (!Array.isArray(draft.picks) || draft.picks.length < 40) {
    throw new IncompleteSeatError(`Seat ${sourceId} does not contain a complete draft log`);
  }
  if (candidate.firstPick !== draft.picks[0]?.pick?.name
    || !Array.isArray(candidate.firstPickCards)
    || !candidate.firstPickCards.includes(candidate.firstPick)) {
    throw new IncompleteSeatError(`Seat ${sourceId} does not match its exact public opening pack`);
  }

  const deckIndex = (preview.decks?.length || 0) - 1;
  const deck = preview.decks?.[deckIndex];
  if (!deck) throw new IncompleteSeatError(`Seat ${sourceId} has no recorded final build`);
  const seat = { sourceId, deckIndex, draft, preview, deck, firstPickCards: candidate.firstPickCards };
  publicDraft(seat, setCode);
  return seat;
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

export function sourceImageIndex(seats) {
  const images = new Map();
  for (const seat of seats) {
    const cards = [
      ...seat.draft.picks.flatMap(pick => [pick.pick, ...(pick.available || [])]),
      ...Object.values(seat.preview.cards || {}),
    ];
    for (const card of cards) {
      if (card?.name && /^https:\/\/cards\.17landscapes\.com\//.test(card.image_url || '')) {
        images.set(card.name, card.image_url);
      }
    }
  }
  return images;
}

export function cardImages(name, imageUris, sourceImages) {
  const sourceImage = sourceImages.get(name);
  return {
    imageSmall: sourceImage || imageUris.small,
    imageNormal: sourceImage || imageUris.normal,
  };
}

async function buildCardMetadata(seats, rawCards) {
  const sourceImages = sourceImageIndex(seats);
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
    const images = cardImages(name, imageUris, sourceImages);
    if (!images.imageNormal) throw new Error(`Missing card image for ${name}`);
    output[name] = {
      name,
      basic: BASIC_LANDS.has(name),
      set: card.set,
      rarity: card.rarity,
      manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
      manaValue: card.cmc,
      colors: card.colors || card.card_faces?.flatMap(face => face.colors || []) || [],
      typeLine: card.type_line,
      ...images,
      scryfall: card.scryfall_uri,
    };
  }
  return output;
}

function countCards(ids, cardsById) {
  const counts = new Map();
  for (const id of ids || []) {
    const name = cardsById?.[String(id)]?.name;
    if (!name) throw new IncompleteSeatError(`Missing 17Lands card metadata for Arena card ${id}`);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

function finalDeck(seat) {
  if (!Array.isArray(seat.deck.groups) || seat.deck.groups.some(group => typeof group?.name !== 'string' || !Array.isArray(group.cards))) {
    throw new IncompleteSeatError(`Seat ${seat.sourceId} has malformed deck groups`);
  }
  const groups = new Map(seat.deck.groups.map(group => [group.name.toLowerCase(), group.cards]));
  if (!groups.get('maindeck')?.length) throw new IncompleteSeatError(`Seat ${seat.sourceId} has no main deck`);
  const colors = String(seat.deck.colors || '');
  return {
    mainColors: [...colors].filter(color => color === color.toUpperCase()),
    splashColors: [...colors].filter(color => color !== color.toUpperCase()).map(color => color.toUpperCase()),
    main: countCards(groups.get('maindeck'), seat.preview.cards),
    sideboard: countCards(groups.get('sideboard'), seat.preview.cards),
  };
}

function publicDraft(seat, setCode) {
  if (seat.draft.picks.some(pick => (
    !pick || typeof pick.pick?.name !== 'string' || !pick.pick.name
    || !Number.isInteger(Number(pick.pack_number)) || Number(pick.pack_number) < 0
    || !Number.isInteger(Number(pick.pick_number)) || Number(pick.pick_number) < 0
    || !Array.isArray(pick.available)
    || pick.available.some(card => typeof card?.name !== 'string' || !card.name)
    || !pick.available.some(card => card.name === pick.pick.name)
  ))) {
    throw new IncompleteSeatError(`Seat ${seat.sourceId} has incomplete pick data`);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(seat.preview.first_pick_time || '')) {
    throw new IncompleteSeatError(`Seat ${seat.sourceId} has no recorded draft date`);
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

async function buildPublicSet(config, limit, existing) {
  const publishedSources = new Set((existing?.drafts || []).map(draft => draft.sourceUrl));
  const needed = Math.max(0, limit - (existing?.drafts.length || 0));
  const candidates = await trophyCandidates(config.code, limit);
  const seats = [];
  for (const candidate of candidates) {
    if (seats.length >= needed) break;
    if (publishedSources.has(`https://www.17lands.com/draft/${candidate.sourceId}`)) continue;
    try {
      console.log(`Validating ${config.code} new trophy seat ${seats.length + 1}/${needed}`);
      seats.push(await fetchSeat(config.code, candidate));
    } catch (error) {
      if (!(error instanceof IncompleteSeatError)) throw error;
      console.warn(`Skipping ${config.code} ${candidate.sourceId}: ${error.message}`);
    }
  }
  if (!seats.length) throw new NoCompleteSeatsError(`No new complete ${config.code} trophy seats were found`);

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
      images: 'Exact card image URLs from 17Lands draft/event logs, with Scryfall image metadata as fallback.',
    },
    cards,
    drafts: seats.map(seat => publicDraft(seat, config.code)),
  };
}

export function mergeDatasets(existing, incoming, limit) {
  if (!existing) return incoming;
  const sources = new Set(existing.drafts.map(draft => draft.sourceUrl));
  const ids = new Set(existing.drafts.map(draft => draft.id));
  const additions = incoming.drafts.filter(draft => {
    if (sources.has(draft.sourceUrl) || ids.has(draft.id)) return false;
    sources.add(draft.sourceUrl);
    ids.add(draft.id);
    return true;
  }).slice(0, Math.max(0, limit - existing.drafts.length));
  if (!additions.length) return existing;
  return {
    ...existing,
    generatedAt: incoming.generatedAt,
    cards: { ...incoming.cards, ...existing.cards },
    drafts: [...existing.drafts, ...additions],
  };
}

export async function refreshDataset(config, limit, existing, build = buildPublicSet) {
  if (existing?.drafts.length >= limit) return existing;
  try {
    return mergeDatasets(existing, await build(config, limit, existing), limit);
  } catch (error) {
    if (!(error instanceof NoCompleteSeatsError)) throw error;
    console.log(`${config.code}: ${error.message}; preserving the published catalog`);
    return existing || null;
  }
}

async function writeDataset(dataset) {
  const path = join(PROJECT_ROOT, 'data', `${dataset.set.code.toLowerCase()}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(dataset));
  console.log(`Wrote ${dataset.drafts.length} verified ${dataset.set.code} trophy seats to ${path}`);
}

export function discoverSets(filters, scryfallSets, catalog, today = new Date().toISOString().slice(0, 10)) {
  if (!filters.formats_by_expansion || typeof filters.formats_by_expansion !== 'object') {
    throw new Error('17Lands format discovery is unavailable');
  }
  const byCode = new Map(scryfallSets.map(set => [set.code.toUpperCase(), set]));
  const existingCodes = new Set(catalog.sets.map(set => set.code));
  const releases = catalog.sets.map(set => byCode.get(set.code)?.released_at).filter(Boolean);
  if (!releases.length) throw new Error('Cannot establish the existing catalog release dates');
  const earliestRelease = releases.sort()[0];
  const codes = new Set([
    ...existingCodes,
    ...Object.entries(filters.formats_by_expansion || {})
      .filter(([, formats]) => formats.includes(FORMAT))
      .map(([code]) => code),
  ]);
  return [...codes].flatMap(code => {
    const set = byCode.get(code);
    if (!/^[A-Z0-9]{3,}$/.test(code) || !set || set.released_at > today) return [];
    if (!existingCodes.has(code)
      && (set.released_at < earliestRelease || !['expansion', 'core', 'draft_innovation'].includes(set.set_type))) return [];
    return [{ code, name: set.name, releaseDate: set.released_at }];
  }).sort((left, right) => right.releaseDate.localeCompare(left.releaseDate) || left.code.localeCompare(right.code));
}

export function buildCatalog(datasets, previous) {
  const sets = datasets.map(dataset => ({
    code: dataset.set.code,
    name: dataset.set.name,
    draftCount: dataset.drafts.length,
    dataUrl: `./data/${dataset.set.code.toLowerCase()}.json?v=${createHash('sha256').update(JSON.stringify(dataset)).digest('hex').slice(0, 12)}`,
  }));
  if (!sets.length) throw new Error('Refusing to publish an empty catalog');
  const content = { version: 1, defaultSet: sets[0].code, sets };
  const unchanged = previous?.defaultSet === content.defaultSet
    && JSON.stringify(previous?.sets) === JSON.stringify(sets);
  return { ...content, generatedAt: unchanged ? previous.generatedAt : new Date().toISOString() };
}

async function readRemoteJson(url) {
  const response = await fetchWithRetries(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Discovery failed (${response.status}): ${url}`);
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestedCodes = args.sets ? String(args.sets).split(',').map(code => code.trim().toUpperCase()).filter(Boolean) : null;
  const limit = Number(args.limit || DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  const catalogPath = join(PROJECT_ROOT, 'data', 'index.json');
  const previous = await readCache(catalogPath);
  if (!previous?.sets?.length) throw new Error('The existing catalog is required to preserve published seats');
  const filters = await readRemoteJson(FILTERS_URL);
  const scryfallSets = await readRemoteJson(SCRYFALL_SETS_URL);
  const configs = discoverSets(filters, scryfallSets.data, previous);
  for (const code of requestedCodes || []) {
    if (!configs.some(config => config.code === code)) throw new Error(`Unknown or unreleased Premier Draft set: ${code}`);
  }
  const datasets = [];

  for (const config of configs) {
    const outputPath = join(PROJECT_ROOT, 'data', `${config.code.toLowerCase()}.json`);
    const existing = await readCache(outputPath);
    if (existing) validateDataset(existing);
    if (existing?.drafts.length >= limit || (existing && requestedCodes && !requestedCodes.includes(config.code))) {
      console.log(`Preserving ${existing.drafts.length} verified ${config.code} trophy seats`);
      datasets.push(existing);
      continue;
    }
    if (requestedCodes && !requestedCodes.includes(config.code)) continue;
    const url = `${PUBLIC_DATA_ROOT}/draft_data_public.${config.code}.${FORMAT}.csv.gz`;
    const availability = await fetchWithRetries(url, { method: 'HEAD', headers: REQUEST_HEADERS });
    if (availability.status === 404 || availability.status === 403) {
      console.log(`No public draft dataset yet for ${config.code}; retaining any published seats`);
      if (existing) datasets.push(existing);
      continue;
    }
    if (!availability.ok) throw new Error(`Dataset availability check failed (${availability.status}): ${url}`);
    const dataset = await refreshDataset(config, limit, existing);
    if (!dataset) continue;
    validateDataset(dataset);
    if (dataset !== existing) await writeDataset(dataset);
    datasets.push(dataset);
  }

  for (const set of previous.sets) {
    if (!datasets.some(dataset => dataset.set.code === set.code)) {
      throw new Error(`Refusing to drop existing set ${set.code}`);
    }
  }
  const catalog = buildCatalog(datasets, previous);
  await writeFile(catalogPath, JSON.stringify(catalog));
  console.log(`Wrote catalog with ${catalog.sets.reduce((sum, set) => sum + set.draftCount, 0)} verified seats`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
