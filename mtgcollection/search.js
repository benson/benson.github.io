import { state } from './state.js';
import { normalizeLocation } from './collection.js';
import { render } from './view.js';

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
      result = normalizeLocation(c.location || '').includes(v.toLowerCase());
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

export function filteredSorted() {
  const q = document.getElementById('searchInput').value.trim();
  const tokens = tokenizeSearch(q);
  const set = document.getElementById('filterSet').value;
  const rarity = document.getElementById('filterRarity').value;
  const finish = document.getElementById('filterFoil').value;
  const location = document.getElementById('filterLocation').value;
  const sortBy = document.getElementById('sortBy').value;

  let list = state.collection.filter(c => {
    if (!matchSearch(c, tokens)) return false;
    if (set && c.setCode !== set) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (finish && c.finish !== finish) return false;
    if (location && normalizeLocation(c.location) !== location) return false;
    return true;
  });

  list.sort((a, b) => {
    const an = (a.resolvedName || a.name || '').toLowerCase();
    const bn = (b.resolvedName || b.name || '').toLowerCase();
    if (sortBy === 'name') return an.localeCompare(bn);
    if (sortBy === 'set') return (a.setCode || '').localeCompare(b.setCode || '') || an.localeCompare(bn);
    if (sortBy === 'price-desc') return (b.price || 0) - (a.price || 0);
    if (sortBy === 'price-asc') return (a.price || 0) - (b.price || 0);
    if (sortBy === 'cmc') return (a.cmc ?? 999) - (b.cmc ?? 999);
    return 0;
  });
  return list;
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
  searchHelpBtn.addEventListener('click', e => {
    e.stopPropagation();
    searchHelpPopover.classList.toggle('visible');
  });
  document.addEventListener('click', e => {
    if (!searchHelpPopover.classList.contains('visible')) return;
    if (e.target.closest('#searchHelpPopover') || e.target.closest('#searchHelpBtn')) return;
    searchHelpPopover.classList.remove('visible');
  });

  searchInputEl.addEventListener('input', () => {
    syncSearchClearBtn();
    clearTimeout(urlStateDebounce);
    urlStateDebounce = setTimeout(syncUrlFromSearch, 250);
  });

  ['searchInput', 'filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'sortBy'].forEach(id => {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });
}
