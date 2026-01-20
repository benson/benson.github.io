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

// ============ Sets Loading ============

const SETS_URL = 'https://bensonperry.com/shared/sets.json';

export async function fetchSets() {
  const response = await fetch(SETS_URL);
  return await response.json();
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
