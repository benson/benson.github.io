// Shared MTG utilities for booster, set, card lookup, and TCG helpers.

const SCRYFALL_API = 'https://api.scryfall.com';
const SCRYFALL_ACCEPT = 'application/json;q=0.9,*/*;q=0.8';
const SCRYFALL_DELAY_MS = 200;
const SCRYFALL_HEADERS = { Accept: SCRYFALL_ACCEPT };

if (typeof window === 'undefined') {
  SCRYFALL_HEADERS['User-Agent'] = 'bensonperry-shared-mtg/2.0 (https://bensonperry.com)';
}

const NODE_SHARED_BASE_URL = 'https://bensonperry.com/shared/';
const SHARED_BASE_URL = typeof window === 'undefined'
  ? NODE_SHARED_BASE_URL
  : new URL('.', import.meta.url).href;

const SETS_URL = new URL('sets.json', SHARED_BASE_URL).href;
const BOOSTER_MODEL_BASE_URL = new URL('boosters/', SHARED_BASE_URL).href;
const WINDOWS_RESERVED_FILENAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export const COLLECTOR_BOOSTER_START = '2019-10-04';
export const SET_BOOSTER_START = '2020-09-25';
export const PLAY_BOOSTER_START = '2024-02-09';
export const FOIL_START = '1999-02-15';

export const JUMPSTART_SETS = new Set(['jmp', 'j22', 'j25']);
export const DRAFT_ONLY_SETS = new Set(['mb2', 'mh1', 'mh2', 'cmm', 'clb', '2xm', '2x2', 'tsr', 'uma', 'ima', 'a25', 'mm3', 'ema', 'mm2', 'mma']);

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function boosterArtifactFileName(setCode) {
  const code = String(setCode || '').toLowerCase();
  return (WINDOWS_RESERVED_FILENAMES.has(code) ? `_${code}` : code) + '.json';
}

function getRetryDelayMs(response, attempt) {
  const retryAfter = response.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return seconds * 1000;

    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(dateMs - Date.now(), SCRYFALL_DELAY_MS);
  }

  return Math.min(2000 * attempt, 30000);
}

export async function fetchWithRetry(url, retries = 6, options = {}) {
  let lastError = null;

  for (let i = 0; i < retries; i++) {
    const attempt = i + 1;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...SCRYFALL_HEADERS,
          ...(options.headers || {}),
        },
      });
      if (response.status === 429) {
        lastError = new Error('HTTP 429 after ' + attempt + ' attempt(s)');
        if (attempt >= retries) break;
        await delay(getRetryDelayMs(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await delay(500 * attempt);
    }
  }

  throw lastError || new Error('Failed to fetch ' + url);
}

export function getBoosterEra(releaseDate) {
  if (releaseDate >= PLAY_BOOSTER_START) return 'play';
  if (releaseDate >= SET_BOOSTER_START) return 'set';
  if (releaseDate >= COLLECTOR_BOOSTER_START) return 'collector-era';
  return 'draft';
}

export function hasCollectorBoosters(releaseDate) {
  return releaseDate >= COLLECTOR_BOOSTER_START;
}

export function hasFoils(releaseDate) {
  return releaseDate >= FOIL_START;
}

export function isJumpstartSet(setCode) {
  return JUMPSTART_SETS.has(setCode);
}

let setsCache = null;
const boosterModelCache = {};
const scryfallCollectionCache = new Map();

async function readSiblingJson(relativePath) {
  if (typeof window !== 'undefined' || !import.meta.url.startsWith('file:')) return null;

  try {
    const [{ existsSync, readFileSync }, { fileURLToPath }, pathModule] = await Promise.all([
      import('fs'),
      import('url'),
      import('path'),
    ]);
    const dir = pathModule.dirname(fileURLToPath(import.meta.url));
    const filePath = pathModule.join(dir, relativePath);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

export async function fetchSets() {
  if (setsCache) return setsCache;
  const local = await readSiblingJson('sets.json');
  if (local) {
    setsCache = local;
    return setsCache;
  }
  const response = await fetch(SETS_URL);
  if (!response.ok) throw new Error('sets.json HTTP ' + response.status);
  setsCache = await response.json();
  return setsCache;
}

export async function loadBoosterModel(setCode) {
  const code = String(setCode || '').toLowerCase();
  if (!code) return null;
  if (boosterModelCache[code] !== undefined) return boosterModelCache[code];

  try {
    const fileName = boosterArtifactFileName(code);
    const local = await readSiblingJson('boosters/' + fileName);
    if (local) {
      boosterModelCache[code] = local;
      return boosterModelCache[code];
    }

    const response = await fetch(new URL(fileName, BOOSTER_MODEL_BASE_URL).href);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    boosterModelCache[code] = await response.json();
  } catch (error) {
    boosterModelCache[code] = null;
  }
  return boosterModelCache[code];
}

function resolveActualBoosterType(model, boosterType = 'play') {
  if (!model) return null;
  const requested = boosterType || model.defaultBoosterType || 'play';
  return model.appBoosterMap?.[requested] || (model.boosters?.[requested] ? requested : null);
}

export async function getBoosterTypes(setCode) {
  const model = await loadBoosterModel(setCode);
  return model?.boosterTypes || [];
}

export async function hasBoosterData(setCode) {
  return Boolean(await loadBoosterModel(setCode));
}

export function getAvailableBoosterTypes(setCode, releaseDate, setInfo = null) {
  if (setInfo?.boosterTypes) return setInfo.boosterTypes;
  if (JUMPSTART_SETS.has(setCode)) return ['play'];
  if (releaseDate >= PLAY_BOOSTER_START) return ['play', 'collector'];
  if (releaseDate >= COLLECTOR_BOOSTER_START) return ['play', 'collector'];
  return ['play'];
}

function getCardByUuid(model, uuid) {
  return model?.cards?.[uuid] || null;
}

function mtgjsonToScryfallLike(card, extras = {}) {
  const scryfallId = card.identifiers?.scryfallId || null;
  const imageUris = scryfallId ? makeScryfallImageUris(scryfallId) : undefined;
  const tcgplayerId = card.identifiers?.tcgplayerProductId
    ? Number(card.identifiers.tcgplayerProductId)
    : undefined;

  return {
    id: scryfallId || card.uuid,
    mtgjson_uuid: card.uuid,
    name: card.name,
    set: card.setCode,
    rarity: card.rarity,
    cmc: card.cmc ?? card.manaValue ?? 0,
    colors: card.colors || [],
    type_line: card.type || '',
    collector_number: card.number,
    finishes: card.finishes || [],
    image_uris: imageUris,
    scryfall_uri: scryfallId ? 'https://scryfall.com/card/' + scryfallId : '',
    tcgplayer_id: tcgplayerId,
    ...normalizeExtras(card, extras),
  };
}

function makeScryfallImageUris(scryfallId) {
  const a = scryfallId.slice(0, 1);
  const b = scryfallId.slice(1, 2);
  const base = 'https://cards.scryfall.io';
  return {
    small: `${base}/small/front/${a}/${b}/${scryfallId}.jpg`,
    normal: `${base}/normal/front/${a}/${b}/${scryfallId}.jpg`,
    large: `${base}/large/front/${a}/${b}/${scryfallId}.jpg`,
    png: `${base}/png/front/${a}/${b}/${scryfallId}.png`,
    art_crop: `${base}/art_crop/front/${a}/${b}/${scryfallId}.jpg`,
    border_crop: `${base}/border_crop/front/${a}/${b}/${scryfallId}.jpg`,
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchScryfallCollectionByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  const missing = unique.filter(id => !scryfallCollectionCache.has(id));

  for (const chunk of chunkArray(missing, 75)) {
    if (chunk.length === 0) continue;
    await delay(SCRYFALL_DELAY_MS);
    const data = await fetchWithRetry(SCRYFALL_API + '/cards/collection', 6, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map(id => ({ id })) }),
    });
    for (const card of data.data || []) {
      scryfallCollectionCache.set(card.id, card);
    }
    for (const notFound of data.not_found || []) {
      if (notFound.id) scryfallCollectionCache.set(notFound.id, null);
    }
  }

  for (const id of unique) out.set(id, scryfallCollectionCache.get(id) || null);
  return out;
}

function normalizeExtras(card, extras = {}) {
  const finishOdds = extras.finishes || (extras.finish ? { [extras.finish]: extras.packOdds || 0 } : {});
  return {
    mtgjson_uuid: card.uuid,
    _mtgjsonUuid: card.uuid,
    _finishOdds: finishOdds,
    _packOdds: extras.packOdds || Object.values(finishOdds).reduce((sum, odds) => sum + Number(odds || 0), 0),
    _isExtra: Boolean(extras.isExtra),
    _mtgjson: {
      uuid: card.uuid,
      finish: extras.finish || null,
      finishes: finishOdds,
      packOdds: extras.packOdds || 0,
      isExtra: Boolean(extras.isExtra),
      sheetName: extras.sheetName || null,
    },
  };
}

async function enrichCardItemsWithScryfall(items) {
  const ids = items.map(item => item.card.identifiers?.scryfallId).filter(Boolean);
  const scryfallById = await fetchScryfallCollectionByIds(ids);

  return items.map(({ card, extras = {} }) => {
    const scryfallId = card.identifiers?.scryfallId;
    const enriched = scryfallId ? scryfallById.get(scryfallId) : null;
    const mtgjsonExtras = normalizeExtras(card, extras);
    if (!enriched) return mtgjsonToScryfallLike(card, extras);
    return {
      ...enriched,
      ...mtgjsonExtras,
    };
  });
}

async function enrichCardsWithScryfall(cards, extrasByUuid = {}) {
  return enrichCardItemsWithScryfall(cards.map(card => ({
    card,
    extras: extrasByUuid[card.uuid] || {},
  })));
}

function weightedPick(entries, totalWeight, random) {
  const total = totalWeight || entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1] || null;
}

function sheetEntries(sheet) {
  return Object.entries(sheet.cards || {})
    .map(([uuid, weight]) => ({ uuid, weight: Number(weight || 0) }))
    .filter(entry => entry.weight > 0);
}

function drawFromSheet(sheet, count, random) {
  const entries = sheetEntries(sheet);
  if (entries.length === 0 || count <= 0) return [];

  if (sheet.fixed) {
    const fixed = [];
    for (const entry of entries) {
      const copies = Math.max(0, Math.round(entry.weight));
      for (let i = 0; i < copies; i++) fixed.push(entry.uuid);
    }
    if (fixed.length >= count) return fixed.slice(0, count);

    const fill = drawWeightedWithReplacement(entries, count - fixed.length, random);
    return fixed.concat(fill);
  }

  if (sheet.allowDuplicates) {
    return drawWeightedWithReplacement(entries, count, random);
  }

  return drawWeightedWithoutReplacement(entries, count, random);
}

function drawWeightedWithReplacement(entries, count, random) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const entry = weightedPick(entries, total, random);
    if (entry) picked.push(entry.uuid);
  }
  return picked;
}

function drawWeightedWithoutReplacement(entries, count, random) {
  const pool = entries.map(entry => ({ ...entry }));
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    const entry = weightedPick(pool, total, random);
    if (!entry) break;
    picked.push(entry.uuid);
    pool.splice(pool.findIndex(candidate => candidate.uuid === entry.uuid), 1);
  }
  return picked;
}

function pickBoosterVariant(config, random) {
  const boosters = config.boosters || [];
  return weightedPick(
    boosters.map(booster => ({ booster, weight: Number(booster.weight || 0) })),
    config.boostersTotalWeight,
    random
  )?.booster || boosters[0] || null;
}

function isExtraSheet(model, actualType, sheetName) {
  return Boolean(model.extraSheetsByBoosterType?.[actualType]?.[sheetName]);
}

export async function generateSealedPoolFromMtgjson(setCode, boosterType = 'play', numPacks = 6, seed = null) {
  const model = await loadBoosterModel(setCode);
  const actualType = resolveActualBoosterType(model, boosterType);
  const config = actualType ? model.boosters?.[actualType] : null;
  if (!model || !config) return [];

  const random = seed ? seededRandom(seed) : Math.random;
  const picked = [];

  for (let pack = 0; pack < numPacks; pack++) {
    const variant = pickBoosterVariant(config, random);
    if (!variant) continue;

    for (const [sheetName, count] of Object.entries(variant.contents || {})) {
      const sheet = config.sheets?.[sheetName];
      if (!sheet) continue;

      for (const uuid of drawFromSheet(sheet, Number(count || 0), random)) {
        const card = getCardByUuid(model, uuid);
        if (!card) continue;
        picked.push({
          card,
          extras: {
            finish: sheet.foil ? 'foil' : 'nonfoil',
            isExtra: isExtraSheet(model, actualType, sheetName),
            sheetName,
          },
        });
      }
    }
  }

  return enrichCardItemsWithScryfall(picked);
}

export async function calculateBoosterExpectedValues(setCode, boosterType = 'play') {
  const model = await loadBoosterModel(setCode);
  const actualType = resolveActualBoosterType(model, boosterType);
  const config = actualType ? model.boosters?.[actualType] : null;
  if (!model || !config) return { setCode, boosterType, actualBoosterType: null, cards: {} };

  const expected = {};

  for (const variant of config.boosters || []) {
    const variantOdds = config.boostersTotalWeight
      ? Number(variant.weight || 0) / config.boostersTotalWeight
      : 0;

    for (const [sheetName, count] of Object.entries(variant.contents || {})) {
      const sheet = config.sheets?.[sheetName];
      if (!sheet) continue;
      const entries = sheetEntries(sheet);
      const total = sheet.totalWeight || entries.reduce((sum, entry) => sum + entry.weight, 0);
      if (total <= 0) continue;

      const finish = sheet.foil ? 'foil' : 'nonfoil';
      const extra = isExtraSheet(model, actualType, sheetName);

      for (const entry of entries) {
        const expectedCopies = variantOdds * Number(count || 0) * (entry.weight / total);
        if (!expected[entry.uuid]) {
          expected[entry.uuid] = {
            uuid: entry.uuid,
            card: model.cards?.[entry.uuid] || null,
            finishes: {},
            expectedCopies: 0,
            isExtra: false,
            sheetNames: [],
          };
        }
        expected[entry.uuid].expectedCopies += expectedCopies;
        expected[entry.uuid].finishes[finish] = (expected[entry.uuid].finishes[finish] || 0) + expectedCopies;
        expected[entry.uuid].isExtra = expected[entry.uuid].isExtra || extra;
        if (!expected[entry.uuid].sheetNames.includes(sheetName)) expected[entry.uuid].sheetNames.push(sheetName);
      }
    }
  }

  return {
    setCode: model.set.code,
    boosterType,
    actualBoosterType: actualType,
    cards: expected,
  };
}

export async function getBoosterPools(setCode, boosterType = 'play') {
  const odds = await calculateBoosterExpectedValues(setCode, boosterType);
  return Object.values(odds.cards).map(entry => entry.card).filter(Boolean);
}

export async function fetchSetCards(setCode, boosterType = 'play', options = {}) {
  const { minPrice = 0, includeSpecialGuests = true } = options;
  const odds = await calculateBoosterExpectedValues(setCode, boosterType);
  const entries = Object.values(odds.cards)
    .filter(entry => includeSpecialGuests || !entry.isExtra)
    .filter(entry => entry.card);

  const extrasByUuid = {};
  for (const entry of entries) {
    const finish = entry.finishes.foil ? 'foil' : 'nonfoil';
    extrasByUuid[entry.uuid] = {
      finish,
      finishes: entry.finishes,
      packOdds: entry.expectedCopies,
      isExtra: entry.isExtra,
      sheetName: entry.sheetNames[0],
    };
  }

  const enriched = await enrichCardsWithScryfall(entries.map(entry => entry.card), extrasByUuid);
  if (!minPrice) return enriched;

  return enriched.filter(card => {
    const prices = card.prices || {};
    return Number(prices.usd || 0) >= minPrice ||
      Number(prices.usd_foil || 0) >= minPrice ||
      Number(prices.usd_etched || 0) >= minPrice;
  });
}

export function generateSealedPool(cards, seed = null) {
  const random = seed ? seededRandom(seed) : Math.random;
  const byRarity = {
    common: cards.filter(c => c.rarity === 'common'),
    uncommon: cards.filter(c => c.rarity === 'uncommon'),
    rare: cards.filter(c => c.rarity === 'rare'),
    mythic: cards.filter(c => c.rarity === 'mythic'),
  };
  const pool = [];

  for (let pack = 0; pack < 6; pack++) {
    const isMythic = random() < 0.125 && byRarity.mythic.length > 0;
    const rarePool = isMythic ? byRarity.mythic : byRarity.rare;
    if (rarePool.length > 0) pool.push(pickRandom(rarePool, random));
    for (let i = 0; i < 3; i++) if (byRarity.uncommon.length > 0) pool.push(pickRandom(byRarity.uncommon, random));
    for (let i = 0; i < 10; i++) if (byRarity.common.length > 0) pool.push(pickRandom(byRarity.common, random));
  }

  return pool;
}

function pickRandom(arr, random = Math.random) {
  return arr[Math.floor(random() * arr.length)];
}

function seededRandom(seed) {
  if (typeof seed === 'string') seed = hashString(seed);
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function getDailySeed(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  return 'daily-' + dateStr;
}

export function pickDailySet(sets, date = new Date()) {
  const seed = getDailySeed(date);
  const dateStr = seed.replace('daily-', '');
  const recentSets = sets.filter(s => s.released && s.released >= '2020-01-01' && (s.boosterTypes || []).includes('play'));
  const source = recentSets.length > 0 ? recentSets : sets;
  const dayIndex = hashDate(dateStr) % source.length;
  return source[dayIndex];
}

function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function createSetAutocomplete({ inputEl, dropdownEl, hiddenEl, onSelect, sets }) {
  let highlightedIndex = -1;
  let selectedSetDisplay = '';

  function formatSetDisplay(set) {
    return set.name.toLowerCase() + ' (' + set.released.slice(0, 4) + ')';
  }

  function showDropdown(filter) {
    const filterLower = (filter || '').toLowerCase();
    const filtered = sets.filter(set =>
      set.name.toLowerCase().includes(filterLower) ||
      set.code.toLowerCase().includes(filterLower)
    ).slice(0, 200);

    if (filtered.length === 0) {
      dropdownEl.classList.add('hidden');
      return;
    }

    dropdownEl.innerHTML = filtered.map(set =>
      '<div class="option" data-code="' + set.code + '">' +
        set.name.toLowerCase() +
        '<span class="year">(' + set.released.slice(0, 4) + ')</span>' +
      '</div>'
    ).join('');

    dropdownEl.querySelectorAll('.option').forEach(opt => {
      opt.addEventListener('click', () => selectSet(opt.dataset.code));
    });

    dropdownEl.classList.remove('hidden');
  }

  function selectSet(code) {
    const set = sets.find(s => s.code === code);
    if (!set) return;
    const displayText = formatSetDisplay(set);
    inputEl.value = displayText;
    selectedSetDisplay = displayText;
    if (hiddenEl) hiddenEl.value = code;
    dropdownEl.classList.add('hidden');
    highlightedIndex = -1;
    inputEl.blur();
    if (onSelect) onSelect(set);
  }

  function updateHighlight(options) {
    options.forEach((opt, i) => opt.classList.toggle('highlighted', i === highlightedIndex));
    if (options[highlightedIndex]) options[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }

  inputEl.addEventListener('focus', () => {
    selectedSetDisplay = inputEl.value;
    inputEl.value = '';
    inputEl.placeholder = 'type to search...';
    showDropdown('');
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => {
      if (!inputEl.value && selectedSetDisplay) {
        inputEl.value = selectedSetDisplay;
        inputEl.placeholder = '';
      }
    }, 150);
  });

  inputEl.addEventListener('input', () => {
    highlightedIndex = -1;
    showDropdown(inputEl.value);
  });

  inputEl.addEventListener('keydown', (e) => {
    const options = dropdownEl.querySelectorAll('.option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
      updateHighlight(options);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight(options);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && options[highlightedIndex]) selectSet(options[highlightedIndex].dataset.code);
    } else if (e.key === 'Escape') {
      dropdownEl.classList.add('hidden');
      inputEl.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) dropdownEl.classList.add('hidden');
  });

  return {
    selectSet,
    setInitialSet(set) {
      const displayText = formatSetDisplay(set);
      inputEl.value = displayText;
      selectedSetDisplay = displayText;
      if (hiddenEl) hiddenEl.value = set.code;
    },
  };
}

export const TCG_CONDITIONS = [
  'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'
];

export const TCG_PRINTINGS = [
  'Normal', 'Foil', 'Etched Foil', 'Surge Foil', 'Galaxy Foil',
  'Confetti Foil', 'Gilded Foil', 'Textured Foil', 'Step-and-Compleat Foil',
  'Oil Slick Raised Foil', 'Halo Foil', 'Ripple Foil', 'Double Rainbow Foil',
  'Invisible Ink Foil', 'Fracture Foil', 'Raised Foil'
];

export const TCG_LANGUAGES = [
  'English', 'Chinese (S)', 'Chinese (T)', 'French', 'German',
  'Italian', 'Japanese', 'Korean', 'Portuguese', 'Russian', 'Spanish'
];

export async function fetchCardByCollectorNumber(setCode, collectorNumber) {
  const cn = String(collectorNumber).trim().replace(/^0+(\d)/, '$1');
  const set = setCode.toLowerCase().trim();
  const url = SCRYFALL_API + '/cards/' + encodeURIComponent(set) + '/' + encodeURIComponent(cn);
  try {
    return await fetchWithRetry(url);
  } catch (e) {
    if (!cn.match(/[a-z]$/i)) {
      try {
        return await fetchWithRetry(url + 'a');
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

export async function fetchCardByName(name) {
  const url = SCRYFALL_API + '/cards/named?fuzzy=' + encodeURIComponent(name);
  try {
    return await fetchWithRetry(url);
  } catch (e) {
    return null;
  }
}

export function getCardFinishes(card) {
  if (!card) return [];
  const finishes = card.finishes || [];
  const results = [];
  for (const finish of finishes) {
    const entry = { finish };
    if (finish === 'nonfoil') {
      entry.label = 'Normal';
      entry.price = card.prices?.usd ?? null;
    } else if (finish === 'foil') {
      entry.label = 'Foil';
      entry.price = card.prices?.usd_foil ?? null;
    } else if (finish === 'etched') {
      entry.label = 'Etched Foil';
      entry.price = card.prices?.usd_etched ?? null;
    }
    results.push(entry);
  }
  return results;
}

export function getCardImageUrl(card, size = 'normal') {
  if (!card) return null;
  if (card.image_uris) return card.image_uris[size] || card.image_uris.normal;
  if (card.card_faces?.length > 0 && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris[size] || card.card_faces[0].image_uris.normal;
  }
  return null;
}

export function getCardPrintingType(card, selectedFinish = 'nonfoil') {
  if (selectedFinish === 'nonfoil') return 'Normal';
  if (selectedFinish === 'etched') return 'Etched Foil';
  const promos = card.promo_types || [];
  if (promos.includes('surgefoil')) return 'Surge Foil';
  if (promos.includes('galaxyfoil')) return 'Galaxy Foil';
  if (promos.includes('confettifoil')) return 'Confetti Foil';
  if (promos.includes('texturedfoil')) return 'Textured Foil';
  if (promos.includes('halofoil')) return 'Halo Foil';
  if (promos.includes('ripplefoil')) return 'Ripple Foil';
  if (promos.includes('fracturefoil')) return 'Fracture Foil';
  if (promos.includes('raisedfoil')) return 'Raised Foil';
  return 'Foil';
}

const SKU_BASE_URL = 'https://bensonperry.com/cardentry/skus';
const SKU_BUCKET_SIZE = 100000;
const skuBucketCache = {};

export async function loadSkuBucket(productId) {
  const bucketStart = Math.floor(productId / SKU_BUCKET_SIZE) * SKU_BUCKET_SIZE;
  if (skuBucketCache[bucketStart]) return skuBucketCache[bucketStart];
  const url = SKU_BASE_URL + '/' + bucketStart + '.json';
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    skuBucketCache[bucketStart] = data;
    return data;
  } catch (e) {
    return null;
  }
}

export function findSkuId(bucket, productId, condition, finish) {
  if (!bucket) return null;
  const skus = bucket[String(productId)];
  if (!skus) return null;
  const mtgCondition = condition.toUpperCase();
  const mtgPrinting = finish === 'nonfoil' ? 'NON FOIL' : 'FOIL';
  const match = skus.find(s => s.c === mtgCondition && s.p === mtgPrinting);
  return match ? match.s : null;
}
