// Shared MTG utilities for booster pack logic
// Used by packcracker and poolbuilder

const SCRYFALL_API = 'https://api.scryfall.com';

// ============ Booster Era Dates ============

export const COLLECTOR_BOOSTER_START = '2019-10-04'; // Throne of Eldraine
export const SET_BOOSTER_START = '2020-09-25';       // Zendikar Rising
export const PLAY_BOOSTER_START = '2024-02-09';      // Murders at Karlov Manor
export const FOIL_START = '1999-02-15';              // Urza's Legacy

// ============ Special Set Handling ============

// Jumpstart sets have their own booster type (themed half-decks)
export const JUMPSTART_SETS = new Set(['jmp', 'j22', 'j25']);

// Sets with only one booster type (no collector variant)
// These are special products that don't follow the standard booster structure
export const DRAFT_ONLY_SETS = new Set(['mb2', 'mh1', 'mh2', 'cmm', 'clb', '2xm', '2x2', 'tsr', 'uma', 'ima', 'a25', 'mm3', 'ema', 'mm2', 'mma']);

// Special Guests collector number ranges by set
export const SPECIAL_GUESTS_RANGES = {
  'lci': [1, 18],
  'mkm': [19, 28],
  'otj': [29, 38],
  'mh3': [39, 53],
  'blb': [54, 63],
  'dsk': [64, 73],
  'fdn': [74, 83],
  'dft': [84, 103],
  'tdm': [104, 118],
  'eoe': [119, 128],
  'fin': [129, 148],
};

// Sets with The Big Score bonus sheet
export const SETS_WITH_BIG_SCORE = new Set(['otj']);

// Sets with separate "bonus sheet" sets that appear in boosters
// Maps main set code to bonus set code
export const BONUS_SHEET_SETS = {
  'otj': 'otp',  // Outlaws of Thunder Junction -> Breaking News (1 per pack!)
  'tla': 'tle',  // Avatar: The Last Airbender -> Avatar Eternal (source material cards)
  'spm': 'mar',  // Marvel's Spider-Man -> Marvel Universe (source material cards)
  'eoe': 'eos',  // Edge of Eternities -> Stellar Sights (premium land reprints)
  'fin': 'fca',  // Final Fantasy -> Through the Ages (classic reprints with FF artwork)
};

// Sets with Special Guests that we can accurately track
export const SETS_WITH_SPECIAL_GUESTS = new Set(Object.keys(SPECIAL_GUESTS_RANGES));

// Sets where retro frame cards appear in Play Boosters (not collector-exclusive)
// These need special handling because Scryfall marks them booster:false
export const SETS_WITH_RETRO_IN_BOOSTERS = new Set(['mh3']);

// ============ Collector Booster Exclusives ============
// Source of truth: ./collector-exclusives.json (used by cache scripts)
// Keep these in sync when adding new foil types

// Promo types that are collector booster exclusives
export const COLLECTOR_EXCLUSIVE_PROMOS = [
  'fracturefoil', 'texturedfoil', 'ripplefoil',
  'halofoil', 'confettifoil', 'galaxyfoil', 'surgefoil',
  'raisedfoil', 'headliner'
];

// Frame effects that are collector booster exclusives
export const COLLECTOR_EXCLUSIVE_FRAMES = ['inverted', 'extendedart'];

// ============ Utilities ============

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        await delay(1000);
        continue;
      }
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(100 * (i + 1));
    }
  }
}

// ============ Booster Type Detection ============

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

export function getAvailableBoosterTypes(setCode, releaseDate) {
  if (JUMPSTART_SETS.has(setCode)) {
    return ['jumpstart'];
  }

  if (releaseDate >= PLAY_BOOSTER_START) {
    return ['play', 'collector'];
  }

  if (releaseDate >= COLLECTOR_BOOSTER_START) {
    return ['draft', 'collector'];
  }

  return ['draft'];
}

// ============ Card Fetching ============

// Check if a card is a collector booster exclusive
// If setConfig is provided, use it; otherwise fall back to generic rules
export function isCollectorExclusive(card, setConfig = null) {
  // If we have a set config, use it for accurate determination
  if (setConfig) {
    const inPlayBooster = isInPlayBooster(card, setConfig);
    if (inPlayBooster === true) return false;  // explicitly in play booster
    if (inPlayBooster === false) {
      const inCollectorExclusive = isCollectorExclusiveByConfig(card, setConfig);
      if (inCollectorExclusive === true) return true;
    }
  }

  // Fall back to generic rules based on promo types and frame effects
  const promos = card.promo_types || [];
  const frames = card.frame_effects || [];
  const hasExclusivePromo = promos.some(p => COLLECTOR_EXCLUSIVE_PROMOS.includes(p));
  const hasExclusiveFrame = frames.some(f => COLLECTOR_EXCLUSIVE_FRAMES.includes(f));
  return hasExclusivePromo || hasExclusiveFrame;
}

// Fetch cards from Scryfall for a set
// boosterType: 'play' | 'draft' | 'collector'
// Returns array of Scryfall card objects
export async function fetchSetCards(setCode, boosterType = 'play', options = {}) {
  const { minPrice = 0, includeSpecialGuests = false } = options;

  let query = 'set:' + setCode + ' lang:en';

  // Jumpstart sets don't use is:booster filter
  if (boosterType !== 'collector' && !JUMPSTART_SETS.has(setCode)) {
    query += ' is:booster -is:boosterfun';
  }

  // Price filter (if specified)
  if (minPrice > 0) {
    query += ' (usd>=' + minPrice + ' OR usd_foil>=' + minPrice + ')';
  }

  const url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(query) + '&unique=prints&order=usd&dir=desc';

  let cards = [];
  try {
    let data = await fetchWithRetry(url);
    cards = data.data || [];

    // Handle pagination
    while (data.has_more && data.next_page) {
      await delay(100);
      data = await fetchWithRetry(data.next_page);
      cards = cards.concat(data.data || []);
    }
  } catch (error) {
    if (error.message !== 'HTTP 404') throw error;
  }

  // Filter out collector exclusives for play/draft boosters
  if (boosterType !== 'collector') {
    cards = cards.filter(card => !isCollectorExclusive(card));
  }

  // Add Special Guests if requested
  if (includeSpecialGuests && SETS_WITH_SPECIAL_GUESTS.has(setCode)) {
    const specialGuests = await fetchSpecialGuestsCards(setCode, minPrice);
    cards = cards.concat(specialGuests);
  }

  return cards;
}

// Fetch Special Guests cards for a set
export async function fetchSpecialGuestsCards(setCode, minPrice = 0) {
  let allCards = [];

  const range = SPECIAL_GUESTS_RANGES[setCode];
  if (range) {
    try {
      let query = 'set:spg cn>=' + range[0] + ' cn<=' + range[1];
      if (minPrice > 0) {
        query += ' (usd>=' + minPrice + ' OR usd_foil>=' + minPrice + ')';
      }
      const url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(query);
      const data = await fetchWithRetry(url);
      allCards = allCards.concat(data.data || []);
    } catch (e) {
      // Ignore 404s
    }
  }

  // For OTJ, also fetch The Big Score
  if (SETS_WITH_BIG_SCORE.has(setCode)) {
    try {
      let query = 'set:big';
      if (minPrice > 0) {
        query += ' (usd>=' + minPrice + ' OR usd_foil>=' + minPrice + ')';
      }
      const url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(query);
      const data = await fetchWithRetry(url);
      allCards = allCards.concat(data.data || []);
    } catch (e) {
      // Ignore 404s
    }
  }

  return allCards;
}

// Fetch ALL cards from a set (for sealed pool generation)
// No price filter, includes all rarities
export async function fetchAllSetCards(setCode, boosterType = 'play') {
  // Load set config for accurate filtering (only loads this set, not all sets)
  const setConfig = await fetchSetConfig(setCode);

  // If we have a set config with play booster ranges, fetch all cards and filter client-side
  // Otherwise use Scryfall's is:booster filter
  let query = 'set:' + setCode + ' lang:en';

  const hasSetConfig = setConfig?.playBooster?.includeCollectorNumbers;

  if (!hasSetConfig && boosterType !== 'collector' && !JUMPSTART_SETS.has(setCode)) {
    query += ' is:booster';
  }

  const url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(query) + '&unique=prints';

  let cards = [];
  try {
    let data = await fetchWithRetry(url);
    cards = data.data || [];

    // Handle pagination
    while (data.has_more && data.next_page) {
      await delay(100);
      data = await fetchWithRetry(data.next_page);
      cards = cards.concat(data.data || []);
    }
  } catch (error) {
    if (error.message !== 'HTTP 404') throw error;
  }

  // Filter for play/draft boosters
  if (boosterType !== 'collector') {
    if (hasSetConfig) {
      // Use set config: include cards in play booster ranges OR cards with booster:true that aren't collector-exclusive
      cards = cards.filter(card => {
        const inPlayBooster = isInPlayBooster(card, setConfig);
        if (inPlayBooster === true) return true;
        if (isCollectorExclusiveByConfig(card, setConfig) === true) return false;
        // Fall back to Scryfall's booster flag and generic exclusion rules
        return card.booster && !isCollectorExclusive(card);
      });
    } else {
      // No config, use generic rules
      cards = cards.filter(card => !isCollectorExclusive(card));
    }
  }

  return cards;
}

// ============ Sealed Pool Generation ============

// Generate a sealed pool using booster-data slot definitions
// Falls back to simplified generation if no booster data available
export async function generateSealedPoolFromBoosterData(setCode, cards, numPacks = 6, seed = null) {
  const random = seed ? seededRandom(seed) : Math.random;

  // Try to load booster data
  const index = await loadBoosterIndex();
  const types = index.boosters[setCode];

  if (!types) {
    // No booster data, use legacy generation
    return generateSealedPool(cards, seed);
  }

  const boosterType = types.includes('play') ? 'play' : types.includes('draft') ? 'draft' : null;
  if (!boosterType) {
    return generateSealedPool(cards, seed);
  }

  const boosterFile = await loadBoosterFile(setCode, boosterType);
  if (!boosterFile?.slots) {
    return generateSealedPool(cards, seed);
  }

  // Pre-filter cards by collector number ranges and group by rarity
  const cardsByRarityInPool = {};
  for (const slot of boosterFile.slots) {
    if (!slot.pool || !slot.rarities) continue;

    // Get all CN ranges for this slot
    const ranges = [];
    for (const finishRanges of Object.values(slot.pool)) {
      ranges.push(...finishRanges);
    }

    for (const rarity of slot.rarities) {
      if (!cardsByRarityInPool[rarity]) {
        cardsByRarityInPool[rarity] = [];
      }

      // Find cards matching this rarity and in the CN ranges
      const matching = cards.filter(card => {
        if (card.rarity !== rarity) return false;
        return ranges.some(range => isInRange(card.collector_number, range));
      });

      // Add unique cards
      for (const card of matching) {
        if (!cardsByRarityInPool[rarity].some(c => c.id === card.id)) {
          cardsByRarityInPool[rarity].push(card);
        }
      }
    }
  }

  // Fallback pools for slots without specific rarities
  const allInPool = cards.filter(card => {
    for (const slot of boosterFile.slots) {
      if (!slot.pool) continue;
      const ranges = [];
      for (const finishRanges of Object.values(slot.pool)) {
        ranges.push(...finishRanges);
      }
      if (ranges.some(range => isInRange(card.collector_number, range))) {
        return true;
      }
    }
    return false;
  });

  const pool = [];

  // Generate packs
  for (let pack = 0; pack < numPacks; pack++) {
    for (const slot of boosterFile.slots) {
      // Skip slots without pools or counts (like notes-only slots)
      if (!slot.pool || !slot.count) continue;

      const count = slot.count;

      for (let i = 0; i < count; i++) {
        let card = null;

        if (slot.rarities) {
          // Determine rarity for this card
          let rarity;
          if (slot.rarities.includes('mythic') && slot.rarities.includes('rare')) {
            // Use mythicRate if specified, default to 1/8 (0.125)
            const mythicRate = slot.mythicRate ?? 0.125;
            const hasMythics = (cardsByRarityInPool.mythic?.length ?? 0) > 0;
            rarity = (hasMythics && random() < mythicRate) ? 'mythic' : 'rare';
          } else {
            // Pick from available rarities
            rarity = slot.rarities[Math.floor(random() * slot.rarities.length)];
          }

          const rarityPool = cardsByRarityInPool[rarity] || [];
          if (rarityPool.length > 0) {
            card = pickRandom(rarityPool, random);
          }
        } else {
          // Wildcard slot - pick any card from the pool ranges
          const ranges = [];
          for (const finishRanges of Object.values(slot.pool)) {
            ranges.push(...finishRanges);
          }

          const slotCards = allInPool.filter(c =>
            ranges.some(range => isInRange(c.collector_number, range))
          );

          if (slotCards.length > 0) {
            card = pickRandom(slotCards, random);
          }
        }

        if (card) {
          pool.push(card);
        }
      }
    }
  }

  return pool;
}

// Generate a sealed pool (6 boosters worth of cards)
// Legacy function - uses simplified rarity distribution
export function generateSealedPool(cards, seed = null) {
  // Use seeded random if provided
  const random = seed ? seededRandom(seed) : Math.random;

  // Group cards by rarity
  const byRarity = {
    common: cards.filter(c => c.rarity === 'common'),
    uncommon: cards.filter(c => c.rarity === 'uncommon'),
    rare: cards.filter(c => c.rarity === 'rare'),
    mythic: cards.filter(c => c.rarity === 'mythic'),
  };

  const pool = [];

  // Generate 6 packs
  for (let pack = 0; pack < 6; pack++) {
    // Each pack: 1 rare/mythic, 3 uncommons, 10 commons (simplified)
    // ~1 in 8 chance of mythic instead of rare (0.125)
    const isMythic = random() < 0.125 && byRarity.mythic.length > 0;
    const rarePool = isMythic ? byRarity.mythic : byRarity.rare;

    if (rarePool.length > 0) {
      pool.push(pickRandom(rarePool, random));
    }

    // 3 uncommons
    for (let i = 0; i < 3; i++) {
      if (byRarity.uncommon.length > 0) {
        pool.push(pickRandom(byRarity.uncommon, random));
      }
    }

    // 10 commons
    for (let i = 0; i < 10; i++) {
      if (byRarity.common.length > 0) {
        pool.push(pickRandom(byRarity.common, random));
      }
    }
  }

  return pool;
}

// Pick a random card from an array
function pickRandom(arr, random = Math.random) {
  return arr[Math.floor(random() * arr.length)];
}

// Seeded random number generator (mulberry32)
function seededRandom(seed) {
  // Convert string seed to number if needed
  if (typeof seed === 'string') {
    seed = hashString(seed);
  }

  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Hash a string to a number
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

// Generate a daily seed based on date
export function getDailySeed(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return 'daily-' + dateStr;
}

// Pick today's daily challenge set from a list of sets
export function pickDailySet(sets, date = new Date()) {
  const seed = getDailySeed(date);
  const dateStr = seed.replace('daily-', '');
  const recentSets = sets.filter(s => s.released && s.released >= '2020-01-01');
  const dayIndex = hashDate(dateStr) % recentSets.length;
  return recentSets[dayIndex];
}

function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ============ Sets Loading ============

const SETS_URL = 'https://bensonperry.com/shared/sets.json';
const BOOSTER_DATA_URL = 'https://bensonperry.com/booster-data';

let boosterIndexCache = null;
let boosterFileCache = {};

export async function fetchSets() {
  const response = await fetch(SETS_URL);
  return await response.json();
}

// Load the booster-data index
export async function loadBoosterIndex() {
  if (boosterIndexCache) return boosterIndexCache;
  try {
    const response = await fetch(BOOSTER_DATA_URL + '/index.json');
    boosterIndexCache = await response.json();
  } catch (e) {
    boosterIndexCache = { version: '0.0.0', boosters: {} };
  }
  return boosterIndexCache;
}

// Load a specific booster file
export async function loadBoosterFile(setCode, boosterType) {
  const key = setCode + '-' + boosterType;
  if (boosterFileCache[key]) return boosterFileCache[key];

  try {
    const response = await fetch(BOOSTER_DATA_URL + '/boosters/' + key + '.json');
    boosterFileCache[key] = await response.json();
  } catch (e) {
    boosterFileCache[key] = null;
  }
  return boosterFileCache[key];
}

// Get available booster types for a set from booster-data
export async function getBoosterTypes(setCode) {
  const index = await loadBoosterIndex();
  return index.boosters[setCode] || [];
}

// Check if booster-data has info for a set
export async function hasBoosterData(setCode) {
  const index = await loadBoosterIndex();
  return setCode in index.boosters;
}

// Get all CN ranges that can appear in a booster type
// Returns { nonfoil: [...], foil: [...], ... } with merged ranges from all slots
export async function getBoosterPools(setCode, boosterType) {
  const boosterFile = await loadBoosterFile(setCode, boosterType);
  if (!boosterFile) return null;

  const pools = {};
  for (const slot of boosterFile.slots) {
    if (!slot.pool) continue;
    for (const [finish, ranges] of Object.entries(slot.pool)) {
      if (!pools[finish]) pools[finish] = [];
      pools[finish].push(...ranges);
    }
  }

  // Deduplicate ranges
  for (const finish of Object.keys(pools)) {
    pools[finish] = [...new Set(pools[finish])];
  }

  return pools;
}

// Fetch config for a single set (efficient - only loads what's needed)
export async function fetchSetConfig(setCode) {
  const index = await loadBoosterIndex();
  const types = index.boosters[setCode];
  if (!types) return null;

  const playType = types.includes('play') ? 'play' : types.includes('draft') ? 'draft' : null;
  if (!playType) return null;

  const playFile = await loadBoosterFile(setCode, playType);
  if (!playFile) return null;

  const playRanges = [];
  for (const slot of playFile.slots) {
    if (slot.pool?.nonfoil) playRanges.push(...slot.pool.nonfoil);
    if (slot.pool?.foil) playRanges.push(...slot.pool.foil);
  }

  const config = {
    name: playFile.setName,
    source: playFile.source,
    playBooster: {
      includeCollectorNumbers: [...new Set(playRanges)]
    }
  };

  // Only load collector file if it exists
  if (types.includes('collector')) {
    const collectorFile = await loadBoosterFile(setCode, 'collector');
    if (collectorFile) {
      const collectorRanges = [];
      for (const slot of collectorFile.slots) {
        if (slot.name === 'collectorExclusive' && slot.pool) {
          for (const ranges of Object.values(slot.pool)) {
            collectorRanges.push(...ranges);
          }
        }
      }
      if (collectorRanges.length > 0) {
        config.collectorExclusive = {
          collectorNumbers: [...new Set(collectorRanges)]
        };
      }
    }
  }

  return config;
}

// Legacy: fetchSetConfigs loads ALL sets (use fetchSetConfig for single set)
export async function fetchSetConfigs() {
  const index = await loadBoosterIndex();
  const configs = {};

  for (const setCode of Object.keys(index.boosters)) {
    const types = index.boosters[setCode];
    const playType = types.includes('play') ? 'play' : types.includes('draft') ? 'draft' : null;

    if (playType) {
      const playFile = await loadBoosterFile(setCode, playType);
      const collectorFile = await loadBoosterFile(setCode, 'collector');

      if (playFile) {
        const playRanges = [];
        for (const slot of playFile.slots) {
          if (slot.pool?.nonfoil) playRanges.push(...slot.pool.nonfoil);
          if (slot.pool?.foil) playRanges.push(...slot.pool.foil);
        }

        configs[setCode] = {
          name: playFile.setName,
          source: playFile.source,
          playBooster: {
            includeCollectorNumbers: [...new Set(playRanges)]
          }
        };

        if (collectorFile) {
          const collectorRanges = [];
          for (const slot of collectorFile.slots) {
            if (slot.name === 'collectorExclusive' && slot.pool) {
              for (const ranges of Object.values(slot.pool)) {
                collectorRanges.push(...ranges);
              }
            }
          }
          if (collectorRanges.length > 0) {
            configs[setCode].collectorExclusive = {
              collectorNumbers: [...new Set(collectorRanges)]
            };
          }
        }
      }
    }
  }

  return configs;
}

// Check if a collector number is within a range string like "262-281" or "342"
function isInRange(cn, rangeStr) {
  const cnNum = parseInt(cn, 10);
  if (isNaN(cnNum)) return false;

  if (rangeStr.includes('-')) {
    const [start, end] = rangeStr.split('-').map(n => parseInt(n, 10));
    return cnNum >= start && cnNum <= end;
  }
  return cnNum === parseInt(rangeStr, 10);
}

// Check if a card is in the play booster based on set config
export function isInPlayBooster(card, setConfig) {
  if (!setConfig?.playBooster?.includeCollectorNumbers) return null; // no config, use default logic

  const cn = card.collector_number;
  const ranges = setConfig.playBooster.includeCollectorNumbers;
  return ranges.some(range => isInRange(cn, range));
}

// Check if a card is collector-exclusive based on set config
export function isCollectorExclusiveByConfig(card, setConfig) {
  if (!setConfig?.collectorExclusive?.collectorNumbers) return null; // no config

  const cn = card.collector_number;
  const ranges = setConfig.collectorExclusive.collectorNumbers;
  return ranges.some(range => isInRange(cn, range));
}

// ============ Set Autocomplete ============

// Creates a set autocomplete with consistent behavior
// Options:
//   inputEl: the text input element
//   dropdownEl: the dropdown container element
//   hiddenEl: hidden input for the set code (optional)
//   onSelect: callback when a set is selected (receives set object)
//   sets: array of set objects (from fetchSets)
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
    options.forEach((opt, i) => {
      opt.classList.toggle('highlighted', i === highlightedIndex);
    });
    if (options[highlightedIndex]) {
      options[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Clear input on focus so user can start typing
  inputEl.addEventListener('focus', () => {
    selectedSetDisplay = inputEl.value;
    inputEl.value = '';
    inputEl.placeholder = 'type to search...';
    showDropdown('');
  });

  // Restore selected value on blur if nothing new was selected
  inputEl.addEventListener('blur', () => {
    setTimeout(() => {
      if (!inputEl.value && selectedSetDisplay) {
        inputEl.value = selectedSetDisplay;
        inputEl.placeholder = '';
      }
    }, 150);
  });

  // Filter on input
  inputEl.addEventListener('input', () => {
    highlightedIndex = -1;
    showDropdown(inputEl.value);
  });

  // Keyboard navigation
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
      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        selectSet(options[highlightedIndex].dataset.code);
      }
    } else if (e.key === 'Escape') {
      dropdownEl.classList.add('hidden');
      inputEl.blur();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) {
      dropdownEl.classList.add('hidden');
    }
  });

  // Return methods for external control
  return {
    selectSet,
    setInitialSet(set) {
      const displayText = formatSetDisplay(set);
      inputEl.value = displayText;
      selectedSetDisplay = displayText;
      if (hiddenEl) hiddenEl.value = set.code;
    }
  };
}
