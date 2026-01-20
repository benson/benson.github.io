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

// Sets with Special Guests that we can accurately track
export const SETS_WITH_SPECIAL_GUESTS = new Set(Object.keys(SPECIAL_GUESTS_RANGES));

// ============ Collector Booster Exclusives ============

// Promo types that are collector booster exclusives
export const COLLECTOR_EXCLUSIVE_PROMOS = [
  'fracturefoil', 'texturedfoil', 'ripplefoil',
  'halofoil', 'confettifoil', 'galaxyfoil', 'surgefoil'
];

// Frame effects that are collector booster exclusives
export const COLLECTOR_EXCLUSIVE_FRAMES = ['inverted'];

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
export function isCollectorExclusive(card) {
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
  let query = 'set:' + setCode + ' lang:en';

  // For play/draft boosters, only get cards that appear in boosters
  if (boosterType !== 'collector' && !JUMPSTART_SETS.has(setCode)) {
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

  // Filter out collector exclusives for play/draft boosters
  if (boosterType !== 'collector') {
    cards = cards.filter(card => !isCollectorExclusive(card));
  }

  return cards;
}

// ============ Sealed Pool Generation ============

// Generate a sealed pool (6 boosters worth of cards)
// Uses simplified rarity distribution that works for most sets
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
    // ~1 in 7 chance of mythic instead of rare
    const isMythic = random() < (1/7) && byRarity.mythic.length > 0;
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
