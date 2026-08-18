import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
const DEFAULT_EXPANSION = 'SOS';
const DEFAULT_FORMAT = 'PremierDraft';
const DEFAULT_LIMIT = 32;
const DATASET_ROOT = 'https://17lands-public.s3.amazonaws.com/analysis_data';
const SCRYFALL_SET_CODES = ['sos', 'soa', 'soc', 'spg'];
const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const SCRYFALL_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'trophy-seat/1.0 (https://bensonperry.com/trophy-seat/)',
};

export function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Unterminated quoted CSV field');
  fields.push(field);
  return fields;
}

export function expandCardCounts(fields, columns) {
  const cards = [];
  for (const column of columns) {
    const count = Number(fields[column.index]) || 0;
    for (let copy = 0; copy < count; copy += 1) cards.push(column.cardName);
  }
  return cards;
}

export function isTrophyRecord(wins, losses) {
  return Number(wins) === 7 && Number(losses) <= 2;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function datasetUrl(kind, expansion, format) {
  return `${DATASET_ROOT}/${kind}/${kind}_public.${expansion}.${format}.csv.gz`;
}

function cachePath(kind, expansion, format) {
  return join(PROJECT_ROOT, '.cache', `${kind}_public.${expansion}.${format}.csv.gz`);
}

async function ensureDownload(url, outputPath) {
  try {
    await access(outputPath);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  console.log(`Downloading ${url}`);
  const response = await fetch(url, { headers: SCRYFALL_HEADERS });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

function buildColumnMap(header) {
  return new Map(header.map((name, index) => [name, index]));
}

async function readTrophyDrafts(filePath, targetCount) {
  const reader = createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let columns;
  let packColumns;
  let current;
  const drafts = [];
  let rowsRead = 0;

  function finishCurrent() {
    if (!current) return;
    current.picks.sort((left, right) => (
      left.packNumber - right.packNumber || left.pickNumber - right.pickNumber
    ));
    const firstEight = current.picks.filter(pick => pick.packNumber === 0 && pick.pickNumber < 8);
    if (firstEight.length === 8 && current.picks.length >= 40) drafts.push(current);
    current = null;
  }

  for await (const line of reader) {
    if (!columns) {
      const header = parseCsvLine(line.replace(/^\uFEFF/, ''));
      columns = buildColumnMap(header);
      packColumns = header
        .map((name, index) => ({ name, index }))
        .filter(column => column.name.startsWith('pack_card_'))
        .map(column => ({ index: column.index, cardName: column.name.slice('pack_card_'.length) }));
      continue;
    }

    if (!line || /^\0+$/.test(line)) continue;
    rowsRead += 1;
    const fields = parseCsvLine(line);
    if (!isTrophyRecord(fields[columns.get('event_match_wins')], fields[columns.get('event_match_losses')])) {
      continue;
    }

    const draftId = fields[columns.get('draft_id')];
    if (current && current.sourceId !== draftId) {
      finishCurrent();
      if (drafts.length >= targetCount) {
        reader.close();
        break;
      }
    }

    if (!current) {
      current = {
        sourceId: draftId,
        date: fields[columns.get('draft_time')].slice(0, 10),
        rank: fields[columns.get('rank')] || 'unknown',
        wins: Number(fields[columns.get('event_match_wins')]),
        losses: Number(fields[columns.get('event_match_losses')]),
        picks: [],
      };
    }

    current.picks.push({
      packNumber: Number(fields[columns.get('pack_number')]),
      pickNumber: Number(fields[columns.get('pick_number')]),
      choice: fields[columns.get('pick')],
      pack: expandCardCounts(fields, packColumns),
    });
  }

  if (drafts.length < targetCount) finishCurrent();
  console.log(`Read ${rowsRead.toLocaleString()} draft rows; found ${drafts.length} trophy drafts`);
  return drafts.slice(0, targetCount);
}

function cardCounts(fields, columns) {
  return columns
    .map(column => ({ name: column.cardName, count: Number(fields[column.index]) || 0 }))
    .filter(card => card.count > 0);
}

async function readFinalDecks(filePath, draftIds) {
  const reader = createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let columns;
  let deckColumns;
  let sideboardColumns;
  let rowsRead = 0;
  const decks = new Map();

  for await (const line of reader) {
    if (!columns) {
      const header = parseCsvLine(line.replace(/^\uFEFF/, ''));
      columns = buildColumnMap(header);
      deckColumns = header
        .map((name, index) => ({ name, index }))
        .filter(column => column.name.startsWith('deck_'))
        .map(column => ({ index: column.index, cardName: column.name.slice('deck_'.length) }));
      sideboardColumns = header
        .map((name, index) => ({ name, index }))
        .filter(column => column.name.startsWith('sideboard_'))
        .map(column => ({ index: column.index, cardName: column.name.slice('sideboard_'.length) }));
      continue;
    }

    if (!line || /^\0+$/.test(line)) continue;
    rowsRead += 1;
    const fields = parseCsvLine(line);
    const draftId = fields[columns.get('draft_id')];
    if (!draftIds.has(draftId)) continue;

    const buildIndex = Number(fields[columns.get('build_index')]) || 0;
    const existing = decks.get(draftId);
    if (existing && existing.buildIndex > buildIndex) continue;

    decks.set(draftId, {
      buildIndex,
      mainColors: (fields[columns.get('main_colors')] || '').split('').filter(Boolean),
      splashColors: (fields[columns.get('splash_colors')] || '').split('').filter(Boolean),
      main: cardCounts(fields, deckColumns),
      sideboard: cardCounts(fields, sideboardColumns),
    });
  }

  console.log(`Read ${rowsRead.toLocaleString()} game rows; found ${decks.size} final decks`);
  return decks;
}

async function fetchScryfallCards(setCodes) {
  const cacheFile = join(PROJECT_ROOT, '.cache', `scryfall-${setCodes.join('-')}.json`);
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const cards = [];
  for (const setCode of setCodes) {
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${setCode} unique:prints`)}`;
    while (url) {
      await new Promise(resolve => setTimeout(resolve, 120));
      const response = await fetch(url, { headers: SCRYFALL_HEADERS });
      if (!response.ok) throw new Error(`Scryfall failed (${response.status}): ${url}`);
      const data = await response.json();
      cards.push(...data.data);
      url = data.has_more ? data.next_page : null;
    }
  }

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
  return Number.parseInt(left.collector_number, 10) <= Number.parseInt(right.collector_number, 10) ? left : right;
}

function buildCardMetadata(rawCards, usedNames) {
  const byName = new Map();
  for (const card of rawCards) {
    byName.set(normalizedName(card.name), preferredCard(byName.get(normalizedName(card.name)), card));
    for (const face of card.card_faces || []) {
      if (face.name) byName.set(normalizedName(face.name), preferredCard(byName.get(normalizedName(face.name)), card));
    }
  }

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

function publicDraft(draft, finalDeck) {
  return {
    id: `sos-${createHash('sha256').update(draft.sourceId).digest('hex').slice(0, 10)}`,
    date: draft.date,
    rank: draft.rank,
    record: `${draft.wins}-${draft.losses}`,
    picks: draft.picks.map(pick => ({
      pack: pick.packNumber + 1,
      pick: pick.pickNumber + 1,
      choice: pick.choice,
      cards: pick.pack,
    })),
    deck: finalDeck,
  };
}

function collectUsedNames(drafts) {
  const names = new Set();
  for (const draft of drafts) {
    for (const pick of draft.picks) {
      names.add(pick.choice);
      for (const card of pick.pack) names.add(card);
    }
    for (const card of draft.deck.main) names.add(card.name);
    for (const card of draft.deck.sideboard) names.add(card.name);
  }
  return names;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expansion = String(args.expansion || DEFAULT_EXPANSION).toUpperCase();
  const format = String(args.format || DEFAULT_FORMAT);
  const limit = Number(args.limit || DEFAULT_LIMIT);
  const draftFile = cachePath('draft_data', expansion, format);
  const gameFile = cachePath('game_data', expansion, format);

  await ensureDownload(datasetUrl('draft_data', expansion, format), draftFile);
  await ensureDownload(datasetUrl('game_data', expansion, format), gameFile);

  const sourceDrafts = await readTrophyDrafts(draftFile, limit + 8);
  const draftIds = new Set(sourceDrafts.map(draft => draft.sourceId));
  const finalDecks = await readFinalDecks(gameFile, draftIds);
  const completeDrafts = sourceDrafts
    .filter(draft => finalDecks.has(draft.sourceId))
    .slice(0, limit)
    .map(draft => ({ ...draft, deck: finalDecks.get(draft.sourceId) }));

  if (completeDrafts.length < limit) {
    throw new Error(`Only ${completeDrafts.length} trophy drafts had final deck data; requested ${limit}`);
  }

  const rawCards = await fetchScryfallCards(SCRYFALL_SET_CODES);
  const cards = buildCardMetadata(rawCards, collectUsedNames(completeDrafts));
  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    set: { code: expansion, name: 'Secrets of Strixhaven' },
    format,
    description: 'Anonymous 7-win Premier Drafts from the public 17Lands dataset.',
    source: {
      provider: '17Lands',
      page: 'https://www.17lands.com/public_datasets',
      draftDataset: datasetUrl('draft_data', expansion, format),
      gameDataset: datasetUrl('game_data', expansion, format),
      license: 'https://creativecommons.org/licenses/by/4.0/',
    },
    cards,
    drafts: completeDrafts.map(draft => publicDraft(draft, draft.deck)),
  };

  const outputPath = join(PROJECT_ROOT, 'data', 'drafts.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output));
  console.log(`Wrote ${completeDrafts.length} trophy drafts and ${Object.keys(cards).length} cards to ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
