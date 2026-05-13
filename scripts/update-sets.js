const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MTGJSON_API = 'https://mtgjson.com/api/v5';
const OUT_DIR = path.join(__dirname, '..', 'shared');
const BOOSTERS_DIR = path.join(OUT_DIR, 'boosters');
const WINDOWS_RESERVED_FILENAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function boosterArtifactFileName(setCode) {
  const code = normalizeCode(setCode);
  return (WINDOWS_RESERVED_FILENAMES.has(code) ? `${code}_` : code) + '.json';
}
const CONCURRENCY = Number(process.env.MTGJSON_CONCURRENCY || 8);

const LIMITED_PRIORITY = ['play', 'draft', 'default', 'set', 'jumpstart'];
const ARENA_ONLY = /^arena(?:-|$)|-arena$/i;

const SPECIAL_SET_CODES = new Set(['spg', 'big']);
const EXTRA_SHEET_PATTERN = /(?:^|[^a-z])(thelist|the-list|specialguest|special-guest)(?:[^a-z]|$)/i;

const setCache = new Map();

function normalizeCode(code) {
  return String(code || '').toLowerCase();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function fetchSetFile(code) {
  const normalized = String(code || '').toUpperCase();
  if (!setCache.has(normalized)) {
    setCache.set(normalized, fetchJson(`${MTGJSON_API}/${encodeURIComponent(normalized)}.json`).then(json => json.data));
  }
  return setCache.get(normalized);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isPaperBoosterKey(key) {
  return !ARENA_ONLY.test(key);
}

function chooseLimitedBoosterType(keys) {
  return LIMITED_PRIORITY.find(type => keys.includes(type)) || null;
}

function boosterLabel(actualType) {
  if (actualType === 'draft') return 'draft booster';
  if (actualType === 'jumpstart') return 'jumpstart';
  if (actualType === 'set') return 'set booster';
  if (actualType === 'default') return 'booster';
  return 'play';
}

function buildAppBoosterMap(boosterKeys) {
  const paperKeys = boosterKeys.filter(isPaperBoosterKey);
  const limited = chooseLimitedBoosterType(paperKeys);
  const map = {};
  if (limited) map.play = limited;
  if (paperKeys.includes('collector')) map.collector = 'collector';
  return map;
}

function normalizeCard(card) {
  const ids = card.identifiers || {};
  return {
    uuid: card.uuid,
    name: card.name,
    setCode: normalizeCode(card.setCode),
    number: String(card.number || ''),
    rarity: String(card.rarity || '').toLowerCase(),
    manaValue: card.manaValue ?? card.convertedManaCost ?? 0,
    cmc: card.convertedManaCost ?? card.manaValue ?? 0,
    colors: card.colors || [],
    colorIdentity: card.colorIdentity || [],
    type: card.type || '',
    types: card.types || [],
    supertypes: card.supertypes || [],
    subtypes: card.subtypes || [],
    layout: card.layout || 'normal',
    finishes: card.finishes || [],
    identifiers: {
      scryfallId: ids.scryfallId || null,
      scryfallOracleId: ids.scryfallOracleId || null,
      tcgplayerProductId: ids.tcgplayerProductId || null,
    },
  };
}

function normalizeSheet(sheet) {
  return {
    cards: sheet.cards || {},
    totalWeight: sheet.totalWeight || Object.values(sheet.cards || {}).reduce((sum, weight) => sum + Number(weight || 0), 0),
    foil: Boolean(sheet.foil),
    fixed: Boolean(sheet.fixed),
    allowDuplicates: Boolean(sheet.allowDuplicates),
    balanceColors: Boolean(sheet.balanceColors),
  };
}

function normalizeBoosterConfig(config) {
  const sheets = {};
  for (const [name, sheet] of Object.entries(config.sheets || {})) {
    sheets[name] = normalizeSheet(sheet);
  }

  return {
    name: config.name || null,
    sourceSetCodes: (config.sourceSetCodes || []).map(normalizeCode),
    boostersTotalWeight: config.boostersTotalWeight || (config.boosters || []).reduce((sum, booster) => sum + Number(booster.weight || 0), 0),
    boosters: (config.boosters || []).map(booster => ({
      weight: Number(booster.weight || 0),
      contents: Object.fromEntries(
        Object.entries(booster.contents || {}).map(([sheetName, count]) => [sheetName, Number(count || 0)])
      ),
    })),
    sheets,
  };
}

function getReferencedUuids(boosters) {
  const uuids = new Set();
  for (const config of Object.values(boosters)) {
    for (const sheet of Object.values(config.sheets || {})) {
      for (const uuid of Object.keys(sheet.cards || {})) uuids.add(uuid);
    }
  }
  return uuids;
}

function indexCards(setData, needed, out) {
  for (const card of setData.cards || []) {
    if (needed.has(card.uuid) && !out[card.uuid]) {
      out[card.uuid] = normalizeCard(card);
    }
  }
}

function classifySheet(sheetName, sheet, cards) {
  const labels = new Set();
  const normalizedName = String(sheetName || '');

  if (EXTRA_SHEET_PATTERN.test(normalizedName)) labels.add('the list');

  for (const uuid of Object.keys(sheet.cards || {})) {
    const code = cards[uuid]?.setCode;
    if (code === 'spg') labels.add('special guests');
    if (code === 'big') labels.add('the big score');
  }

  return [...labels];
}

function formatExtraLabel(labels) {
  const set = new Set(labels);
  if (set.has('the big score') && set.has('special guests')) return 'the big score / special guests';
  if (set.has('the list') && set.has('special guests')) return 'the list / special guests';
  if (set.has('the list') && set.has('the big score')) return 'the list / the big score';
  if (set.has('the list')) return 'the list';
  if (set.has('the big score')) return 'the big score';
  if (set.has('special guests')) return 'special guests';
  return null;
}

function annotateExtras(record) {
  const summaryLabels = new Set();
  const extraSheetsByBoosterType = {};

  for (const [type, config] of Object.entries(record.boosters)) {
    const sheetLabels = {};
    for (const [sheetName, sheet] of Object.entries(config.sheets || {})) {
      const labels = classifySheet(sheetName, sheet, record.cards);
      if (labels.length > 0) {
        sheetLabels[sheetName] = labels;
        labels.forEach(label => summaryLabels.add(label));
      }
    }
    if (Object.keys(sheetLabels).length > 0) {
      extraSheetsByBoosterType[type] = sheetLabels;
    }
  }

  record.extraSheetsByBoosterType = extraSheetsByBoosterType;
  record.extraSheetLabel = formatExtraLabel(summaryLabels);
}

async function buildRecord(setData) {
  const boosterKeys = Object.keys(setData.booster || {}).sort();
  const appBoosterMap = buildAppBoosterMap(boosterKeys);
  if (Object.keys(appBoosterMap).length === 0) return null;

  const boosters = {};
  for (const [type, config] of Object.entries(setData.booster || {})) {
    boosters[type] = normalizeBoosterConfig(config);
  }

  const needed = getReferencedUuids(boosters);
  const cards = {};
  indexCards(setData, needed, cards);

  const sourceCodes = new Set([normalizeCode(setData.code)]);
  for (const config of Object.values(boosters)) {
    for (const sourceCode of config.sourceSetCodes || []) sourceCodes.add(sourceCode);
  }
  for (const code of SPECIAL_SET_CODES) sourceCodes.add(code);
  sourceCodes.add('plst');

  for (const sourceCode of sourceCodes) {
    if (!sourceCode || sourceCode === normalizeCode(setData.code)) continue;
    try {
      const sourceSet = await fetchSetFile(sourceCode);
      indexCards(sourceSet, needed, cards);
    } catch (error) {
      console.warn(`Warning: could not load MTGJSON source set ${sourceCode.toUpperCase()} for ${setData.code}: ${error.message}`);
    }
  }

  const unresolved = [...needed].filter(uuid => !cards[uuid]);
  const limitedActual = appBoosterMap.play || null;
  const appTypes = Object.keys(appBoosterMap);

  const record = {
    version: 1,
    set: {
      code: normalizeCode(setData.code),
      name: setData.name,
      releaseDate: setData.releaseDate,
      type: setData.type,
    },
    boosterTypes: appTypes,
    mtgjsonBoosterTypes: boosterKeys,
    appBoosterMap,
    defaultBoosterType: appTypes.includes('play') ? 'play' : appTypes[0],
    limitedBoosterType: limitedActual,
    limitedLabel: boosterLabel(limitedActual),
    boosters,
    cards,
    unresolved,
  };

  annotateExtras(record);
  return record;
}

function isVisibleSet(setData, record) {
  if (!record) return false;
  if (setData.isOnlineOnly) return false;
  if (setData.isPartialPreview) return false;
  return true;
}

function setSummary(record) {
  return {
    code: record.set.code,
    name: record.set.name,
    released: record.set.releaseDate,
    boosterTypes: record.boosterTypes,
    defaultBoosterType: record.defaultBoosterType,
    limitedBoosterType: record.limitedBoosterType,
    limitedLabel: record.limitedLabel,
    mtgjsonBoosterTypes: record.mtgjsonBoosterTypes,
    extraSheetLabel: record.extraSheetLabel,
  };
}

async function findCardsInAllPrintings(missingUuids) {
  if (missingUuids.size === 0) return {};

  let parser;
  let pick;
  let streamObject;
  try {
    ({ parser } = require('stream-json'));
    ({ pick } = require('stream-json/filters/Pick'));
    ({ streamObject } = require('stream-json/streamers/StreamObject'));
  } catch (error) {
    console.warn('Warning: stream-json is unavailable; unresolved MTGJSON UUIDs will remain unresolved.');
    return {};
  }

  console.log(`Resolving ${missingUuids.size} UUID(s) from AllPrintings fallback...`);
  const found = {};
  const res = await fetch(`${MTGJSON_API}/AllPrintings.json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AllPrintings fallback failed: HTTP ${res.status}`);

  return new Promise((resolve, reject) => {
    const stream = Readable.fromWeb(res.body)
      .pipe(parser())
      .pipe(pick({ filter: 'data' }))
      .pipe(streamObject());

    stream.on('data', ({ value }) => {
      for (const card of value.cards || []) {
        if (missingUuids.has(card.uuid) && !found[card.uuid]) {
          found[card.uuid] = normalizeCard(card);
          if (Object.keys(found).length === missingUuids.size) {
            stream.destroy();
          }
        }
      }
    });
    stream.on('close', () => resolve(found));
    stream.on('end', () => resolve(found));
    stream.on('error', reject);
  });
}

function filterSets(records, today = new Date()) {
  const todayDate = new Date(today);
  return records
    .filter(record => record && new Date(record.set.releaseDate) <= todayDate)
    .sort((a, b) => new Date(b.set.releaseDate) - new Date(a.set.releaseDate))
    .map(setSummary);
}

async function buildMtgjsonArtifacts() {
  fs.mkdirSync(BOOSTERS_DIR, { recursive: true });

  console.log('Fetching MTGJSON SetList...');
  const setList = (await fetchJson(`${MTGJSON_API}/SetList.json`)).data || [];
  const candidates = setList.filter(set => !set.isOnlineOnly);
  console.log(`Found ${candidates.length} non-online candidate set(s).`);

  const records = [];
  await mapLimit(candidates, CONCURRENCY, async (setListEntry) => {
    try {
      const setData = await fetchSetFile(setListEntry.code);
      const record = await buildRecord(setData);
      if (isVisibleSet(setData, record)) records.push(record);
    } catch (error) {
      console.warn(`Warning: skipping ${setListEntry.code}: ${error.message}`);
    }
  });

  const missing = new Set();
  for (const record of records) {
    for (const uuid of record.unresolved || []) missing.add(uuid);
  }

  if (missing.size > 0) {
    const fallbackCards = await findCardsInAllPrintings(missing);
    for (const record of records) {
      for (const uuid of record.unresolved || []) {
        if (fallbackCards[uuid]) record.cards[uuid] = fallbackCards[uuid];
      }
      record.unresolved = (record.unresolved || []).filter(uuid => !record.cards[uuid]);
      annotateExtras(record);
    }
  }

  const unresolvedRecords = records.filter(record => record.unresolved?.length > 0);
  if (unresolvedRecords.length > 0) {
    const sample = unresolvedRecords.slice(0, 10).map(record => `${record.set.code}: ${record.unresolved.length}`).join(', ');
    throw new Error(`Unresolved MTGJSON booster UUIDs remain (${sample})`);
  }

  for (const record of records) {
    const outPath = path.join(BOOSTERS_DIR, boosterArtifactFileName(record.set.code));
    delete record.unresolved;
    fs.writeFileSync(outPath, JSON.stringify(record));
  }

  const sets = filterSets(records);
  fs.writeFileSync(path.join(OUT_DIR, 'sets.json'), JSON.stringify(sets, null, 2) + '\n');

  const manifest = {
    version: 1,
    source: 'mtgjson',
    generatedAt: new Date().toISOString(),
    setCount: sets.length,
    artifactCount: records.length,
    mtgjsonApi: MTGJSON_API,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'mtgjson-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const metadataPath = path.join(OUT_DIR, 'metadata.json');
  const metadata = {
    version: 2,
    source: 'mtgjson',
    generatedAt: manifest.generatedAt,
    sets: Object.fromEntries(records.map(record => [
      record.set.code,
      {
        extraSheetLabel: record.extraSheetLabel,
        boosterTypes: record.boosterTypes,
        limitedBoosterType: record.limitedBoosterType,
      },
    ])),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

  console.log(`Wrote ${sets.length} visible set(s), ${records.length} booster artifact(s).`);
  return { sets, records, manifest };
}

module.exports = {
  buildMtgjsonArtifacts,
  buildAppBoosterMap,
  buildRecord,
  filterSets,
  normalizeCard,
  normalizeBoosterConfig,
};

if (require.main === module) {
  buildMtgjsonArtifacts().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
