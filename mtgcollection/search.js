import { state } from './state.js';
import { normalizeLocation, locationKey, formatLocationLabel } from './collection.js';
import { render } from './view.js';
import { save } from './persistence.js';
import { getMultiselectValue, setMultiselectValue, initMultiselect } from './multiselect.js';

const SEARCH_FIELD_ALIASES = {
  n: 'name', name: 'name',
  t: 'type', type: 'type',
  c: 'colors', color: 'colors', colors: 'colors',
  ci: 'ci', identity: 'ci',
  cmc: 'cmc', mv: 'cmc',
  o: 'oracle', oracle: 'oracle', text: 'oracle',
  r: 'rarity', rarity: 'rarity',
  loc: 'loc', location: 'loc',
  tag: 'tag', tags: 'tag',
  s: 'set', set: 'set',
  f: 'finish', finish: 'finish',
  qty: 'qty',
  cond: 'cond', condition: 'cond',
  lang: 'lang', language: 'lang',
};
const RARITY_SHORT = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic' };

export function tokenizeSearch(query) {
  const tokens = [];
  let i = 0;
  const s = query;
  const isSpace = ch => /\s/.test(ch);
  while (i < s.length) {
    while (i < s.length && isSpace(s[i])) i++;
    if (i >= s.length) break;
    let neg = false;
    if (s[i] === '-' && i + 1 < s.length && !isSpace(s[i + 1])) { neg = true; i++; }
    const fieldStart = i;
    while (i < s.length && /[a-zA-Z]/.test(s[i])) i++;
    const fieldRaw = s.slice(fieldStart, i).toLowerCase();
    let op = null;
    if (i < s.length && (s[i] === ':' || s[i] === '<' || s[i] === '>' || s[i] === '=')) {
      if (s[i] === '<' || s[i] === '>') {
        op = s[i++];
        if (s[i] === '=') op += s[i++];
      } else {
        op = s[i++];
      }
    } else {
      i = fieldStart;
    }
    let value = '';
    if (i < s.length && s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') value += s[i++];
      if (i < s.length && s[i] === '"') i++;
    } else {
      while (i < s.length && !isSpace(s[i])) value += s[i++];
    }
    if (op && SEARCH_FIELD_ALIASES[fieldRaw]) {
      tokens.push({ field: SEARCH_FIELD_ALIASES[fieldRaw], op, value, neg });
    } else if (value) {
      tokens.push({ field: 'name', op: ':', value, neg });
    }
  }
  return tokens;
}

function compareNum(a, op, b) {
  switch (op) {
    case ':': case '=': return a === b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
  }
  return false;
}

function colorSetFromValue(value) {
  const lower = value.toLowerCase();
  if (lower === 'colorless' || lower === 'c') return new Set();
  return new Set(lower.replace(/[^wubrg]/g, '').split(''));
}

function matchToken(c, token) {
  let result = false;
  const v = token.value;
  switch (token.field) {
    case 'name': {
      const name = (c.resolvedName || c.name || '').toLowerCase();
      result = name.includes(v.toLowerCase());
      break;
    }
    case 'type': {
      result = (c.typeLine || '').toLowerCase().includes(v.toLowerCase());
      break;
    }
    case 'colors':
    case 'ci': {
      const arr = (token.field === 'ci' ? c.colorIdentity : c.colors) || [];
      const cardSet = new Set(arr.map(x => x.toLowerCase()));
      const wanted = colorSetFromValue(v);
      if (wanted.size === 0) {
        result = cardSet.size === 0;
      } else {
        result = [...wanted].every(w => cardSet.has(w));
      }
      break;
    }
    case 'cmc': {
      const cmc = c.cmc;
      if (cmc == null) { result = false; break; }
      const target = parseFloat(v);
      if (isNaN(target)) { result = false; break; }
      result = compareNum(cmc, token.op, target);
      break;
    }
    case 'oracle': {
      result = (c.oracleText || '').toLowerCase().includes(v.toLowerCase());
      break;
    }
    case 'rarity': {
      const r = (c.rarity || '').toLowerCase();
      const want = v.toLowerCase();
      result = r === want || r === RARITY_SHORT[want];
      break;
    }
    case 'loc': {
      const loc = normalizeLocation(c.location);
      if (!loc) { result = false; break; }
      const want = v.toLowerCase();
      // Match against the joined "type:name" label so substrings of either
      // field, AND the full typed label like "binder:rares", all match.
      const label = loc.type + ':' + loc.name;
      result = label.includes(want);
      break;
    }
    case 'tag': {
      const cardTags = c.tags || [];
      const want = v.toLowerCase();
      result = cardTags.some(t => t.toLowerCase().includes(want));
      break;
    }
    case 'set': {
      result = (c.setCode || '').toLowerCase() === v.toLowerCase();
      break;
    }
    case 'finish': {
      result = (c.finish || '').toLowerCase() === v.toLowerCase();
      break;
    }
    case 'qty': {
      const target = parseFloat(v);
      if (isNaN(target)) { result = false; break; }
      result = compareNum(c.qty || 0, token.op, target);
      break;
    }
    case 'cond': {
      const cn = (c.condition || '').toLowerCase().replace(/_/g, ' ');
      result = cn.includes(v.toLowerCase().replace(/_/g, ' '));
      break;
    }
    case 'lang': {
      result = (c.language || '').toLowerCase() === v.toLowerCase();
      break;
    }
  }
  return token.neg ? !result : result;
}

export function matchSearch(c, tokens) {
  if (tokens.length === 0) return true;
  return tokens.every(t => matchToken(c, t));
}

// Pure helper: applies multiselect filters to a card. Exported for tests.
// Each `*Selected` argument is an array of selected values (empty = no filter).
// `format`, when truthy, is a Scryfall format key (e.g. 'modern', 'commander').
// Cards explicitly marked banned/not_legal in that format are excluded.
// Cards with unknown legality (legacy entries pre-backfill, or in-flight
// scryfall lookups) pass — lenient default avoids hiding cards just because
// the metadata hasn't loaded yet.
export function passesMultiselectFilters(c, { sets, rarities, finishes, locations, tags, format } = {}) {
  if (sets && sets.length && !sets.includes(c.setCode)) return false;
  if (rarities && rarities.length && !rarities.includes(c.rarity)) return false;
  if (finishes && finishes.length && !finishes.includes(c.finish)) return false;
  if (locations && locations.length && !locations.includes(locationKey(c.location))) return false;
  if (tags && tags.length) {
    const cardTags = c.tags || [];
    if (!cardTags.some(t => tags.includes(t))) return false;
  }
  if (format && c.legalities && typeof c.legalities === 'object') {
    const status = c.legalities[format];
    if (status === 'banned' || status === 'not_legal') return false;
  }
  return true;
}

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };
const CONDITION_ORDER = { near_mint: 0, lightly_played: 1, moderately_played: 2, heavily_played: 3, damaged: 4 };

function compareCards(a, b, field) {
  const an = (a.resolvedName || a.name || '').toLowerCase();
  const bn = (b.resolvedName || b.name || '').toLowerCase();
  const fallback = an.localeCompare(bn);
  switch (field) {
    case 'name': return an.localeCompare(bn);
    case 'set': return (a.setCode || '').localeCompare(b.setCode || '') || fallback;
    case 'cn': {
      const ai = parseInt(a.cn || '', 10);
      const bi = parseInt(b.cn || '', 10);
      const aValid = !isNaN(ai), bValid = !isNaN(bi);
      if (aValid && bValid && ai !== bi) return ai - bi;
      return (a.cn || '').localeCompare(b.cn || '') || fallback;
    }
    case 'finish': return (a.finish || '').localeCompare(b.finish || '') || fallback;
    case 'rarity': return ((RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)) || fallback;
    case 'condition': return ((CONDITION_ORDER[a.condition] ?? 99) - (CONDITION_ORDER[b.condition] ?? 99)) || fallback;
    case 'location': return formatLocationLabel(a.location).localeCompare(formatLocationLabel(b.location)) || fallback;
    case 'qty': return (a.qty || 0) - (b.qty || 0) || fallback;
    case 'price': return (a.price || 0) - (b.price || 0) || fallback;
    case 'cmc': return (a.cmc ?? 999) - (b.cmc ?? 999) || fallback;
    default: return fallback;
  }
}

export function filteredSorted() {
  const q = document.getElementById('searchInput').value.trim();
  const tokens = tokenizeSearch(q);
  const sets = getMultiselectValue(document.getElementById('filterSet'));
  const rarities = getMultiselectValue(document.getElementById('filterRarity'));
  const finishes = getMultiselectValue(document.getElementById('filterFoil'));
  const locations = getMultiselectValue(document.getElementById('filterLocation'));
  const tags = getMultiselectValue(document.getElementById('filterTag'));

  const format = state.selectedFormat || '';

  let list = state.collection.filter(c => {
    if (!matchSearch(c, tokens)) return false;
    return passesMultiselectFilters(c, { sets, rarities, finishes, locations, tags, format });
  });

  const field = state.sortField || 'name';
  const dir = state.sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => dir * compareCards(a, b, field));
  return list;
}

// True when any filter has a non-default value (search bar, multiselects,
// format dropdown).
export function hasActiveFilter() {
  const q = document.getElementById('searchInput').value.trim();
  if (q) return true;
  const ids = ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'];
  for (const id of ids) {
    if (getMultiselectValue(document.getElementById(id)).length > 0) return true;
  }
  if (state.selectedFormat) return true;
  return false;
}

export function clearAllFilters() {
  document.getElementById('searchInput').value = '';
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'].forEach(id => {
    setMultiselectValue(document.getElementById(id), []);
  });
  // Also clear the format dropdown
  state.selectedFormat = '';
  const fmtEl = document.getElementById('formatSelect');
  if (fmtEl) fmtEl.value = '';
  document.querySelector('.app-footer')?.classList.remove('format-active');
}

let urlStateDebounce = null;
let searchInputEl = null;
let searchClearBtn = null;

function syncSearchClearBtn() {
  searchClearBtn.classList.toggle('visible', !!searchInputEl.value);
}

function syncUrlFromSearch() {
  const q = searchInputEl.value.trim();
  const url = new URL(window.location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

export function applyUrlStateOnLoad() {
  const params = new URL(window.location.href).searchParams;
  const q = params.get('q');
  if (q) {
    searchInputEl.value = q;
    render();
  }
  syncSearchClearBtn();
}

export function syncClearFiltersBtn() {
  const btn = document.getElementById('clearFiltersBtn');
  if (!btn) return;
  btn.classList.toggle('visible', hasActiveFilter());
}

export function initSearch() {
  searchInputEl = document.getElementById('searchInput');
  searchClearBtn = document.getElementById('searchClearBtn');

  searchClearBtn.addEventListener('click', () => {
    searchInputEl.value = '';
    searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    searchInputEl.focus();
  });

  const searchHelpBtn = document.getElementById('searchHelpBtn');
  const searchHelpPopover = document.getElementById('searchHelpPopover');
  function positionSearchHelpPopover() {
    const wrap = searchHelpBtn.closest('.search-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    searchHelpPopover.style.top = (rect.bottom + 4) + 'px';
    searchHelpPopover.style.left = rect.left + 'px';
  }
  searchHelpBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !searchHelpPopover.classList.contains('visible');
    if (willOpen) positionSearchHelpPopover();
    searchHelpPopover.classList.toggle('visible');
  });
  document.addEventListener('click', e => {
    if (!searchHelpPopover.classList.contains('visible')) return;
    if (e.target.closest('#searchHelpPopover') || e.target.closest('#searchHelpBtn')) return;
    searchHelpPopover.classList.remove('visible');
  });
  window.addEventListener('resize', () => {
    if (searchHelpPopover.classList.contains('visible')) positionSearchHelpPopover();
  });

  searchInputEl.addEventListener('input', () => {
    syncSearchClearBtn();
    clearTimeout(urlStateDebounce);
    urlStateDebounce = setTimeout(syncUrlFromSearch, 250);
  });

  // Initialize multiselect filter controls (build the trigger + popover DOM)
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'].forEach(id => {
    initMultiselect(document.getElementById(id), {
      onChange: () => {
        if (id === 'filterLocation') {
          // Reset shape-override + binder pagination when the active container changes,
          // so viewAsList doesn't bleed across containers.
          state.viewAsList = false;
          state.binderPage = 0;
          save();
        }
        render();
      },
    });
  });

  // Native controls that still emit input/change
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('searchInput').addEventListener('change', render);

  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAllFilters();
      searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      render();
    });
  }
}
