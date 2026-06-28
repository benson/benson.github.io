// Pure, DOM-free search / match / sort core.
// Imported by the web app (search.js) and the biblioplex CLI so both share one
// implementation of the query grammar and sort order. Depends only on
// collection.js (which depends only on state.js) — no document/window/localStorage.
import { normalizeLocation, locationKey, formatLocationLabel } from './collection.js';

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
      const want = v.toLowerCase().replace(/^(binder|box):/, 'container:');
      // Match against the joined "type:name" label so substrings of either
      // field, AND the full typed label like "container:rares", all match.
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

export const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };
export const CONDITION_ORDER = { near_mint: 0, lightly_played: 1, moderately_played: 2, heavily_played: 3, damaged: 4 };

export function compareCards(a, b, field) {
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
