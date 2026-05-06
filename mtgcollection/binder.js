import { collectionKey } from './collection.js';

// Binder view - pure helpers for slicing and ordering card lists into
// fixed-size pages. "Binder order" is the owner's canonical pocket order;
// every other sort/filter is a temporary viewing lens.
export const BINDER_SIZES = {
  '4x3': { cols: 4, rows: 3, slots: 12 },
  '3x3': { cols: 3, rows: 3, slots: 9 },
  '2x2': { cols: 2, rows: 2, slots: 4 },
};
export const BINDER_LIST_SIZE = 'list';
export const BINDER_LAYOUTS = [...Object.keys(BINDER_SIZES), BINDER_LIST_SIZE];

export function binderSlotCount(size) {
  return (BINDER_SIZES[size] || BINDER_SIZES['4x3']).slots;
}

export function paginateForBinder(cards, slotsPerPage) {
  if (!Number.isInteger(slotsPerPage) || slotsPerPage <= 0) {
    throw new Error('slotsPerPage must be a positive integer');
  }
  const list = Array.isArray(cards) ? cards : [];
  if (list.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < list.length; i += slotsPerPage) {
    const slice = list.slice(i, i + slotsPerPage);
    while (slice.length < slotsPerPage) slice.push(null);
    pages.push(slice);
  }
  return pages;
}

export function binderCardKey(card) {
  return card ? collectionKey(card) : '';
}

function nameSort(a, b) {
  const an = (a.resolvedName || a.name || '').toLowerCase();
  const bn = (b.resolvedName || b.name || '').toLowerCase();
  if (an !== bn) return an.localeCompare(bn);
  const as = (a.setCode || '').toLowerCase();
  const bs = (b.setCode || '').toLowerCase();
  if (as !== bs) return as.localeCompare(bs);
  const ac = String(a.cn || '');
  const bc = String(b.cn || '');
  const an2 = parseInt(ac, 10);
  const bn2 = parseInt(bc, 10);
  if (!Number.isNaN(an2) && !Number.isNaN(bn2) && an2 !== bn2) return an2 - bn2;
  return ac.localeCompare(bc);
}

function cardColorSet(card) {
  const values = Array.isArray(card.colors) && card.colors.length
    ? card.colors
    : Array.isArray(card.colorIdentity) ? card.colorIdentity : [];
  return new Set(values.map(v => String(v).toLowerCase()));
}

function cardMatchesColor(card, color) {
  if (!color) return true;
  const colors = cardColorSet(card);
  if (color === 'colorless') return colors.size === 0;
  if (color === 'multicolor') return colors.size > 1;
  return colors.has(color);
}

function cardMatchesType(card, type) {
  if (!type) return true;
  const line = String(card.typeLine || '').toLowerCase();
  if (type === 'spell') return line.includes('instant') || line.includes('sorcery');
  return line.includes(type);
}

export function binderHasLens(stateRef = {}) {
  return Boolean(
    stateRef.binderSearch
    || stateRef.binderColorFilter
    || stateRef.binderTypeFilter
    || (stateRef.binderSort && stateRef.binderSort !== 'binder')
  );
}

export function filterForBinderLens(cards, stateRef = {}) {
  const query = String(stateRef.binderSearch || '').trim().toLowerCase();
  const color = String(stateRef.binderColorFilter || '');
  const type = String(stateRef.binderTypeFilter || '');
  return (Array.isArray(cards) ? cards : []).filter(card => {
    if (query) {
      const haystack = [
        card.resolvedName || card.name || '',
        card.typeLine || '',
        card.oracleText || '',
        card.setCode || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!cardMatchesColor(card, color)) return false;
    if (!cardMatchesType(card, type)) return false;
    return true;
  });
}

export function normalizedBinderOrder(container, cards, slotsPerPage = 0) {
  const cardList = Array.isArray(cards) ? cards : [];
  const cardByKey = new Map();
  for (const card of cardList) {
    const key = binderCardKey(card);
    if (key && !cardByKey.has(key)) cardByKey.set(key, card);
  }
  const used = new Set();
  const raw = Array.isArray(container?.binderOrder) ? container.binderOrder : [];
  const order = raw.map(value => {
    const key = value == null || value === '' ? null : String(value);
    if (!key || !cardByKey.has(key) || used.has(key)) return null;
    used.add(key);
    return key;
  });
  const missing = cardList
    .filter(card => {
      const key = binderCardKey(card);
      return key && !used.has(key);
    })
    .sort(nameSort);
  for (const card of missing) {
    const key = binderCardKey(card);
    order.push(key);
    used.add(key);
  }

  const perPage = Number.isInteger(slotsPerPage) && slotsPerPage > 0 ? slotsPerPage : 0;
  if (perPage > 0) {
    const minSlots = Math.max(perPage, Math.ceil(Math.max(order.length, 1) / perPage) * perPage);
    while (order.length < minSlots) order.push(null);
  }
  return order;
}

export function cardsFromBinderOrder(container, cards, { preserveEmptySlots = false, slotsPerPage = 0 } = {}) {
  const cardList = Array.isArray(cards) ? cards : [];
  const cardByKey = new Map(cardList.map(card => [binderCardKey(card), card]));
  const order = normalizedBinderOrder(container, cardList, preserveEmptySlots ? slotsPerPage : 0);
  const ordered = [];
  for (const key of order) {
    if (key && cardByKey.has(key)) ordered.push(cardByKey.get(key));
    else if (preserveEmptySlots) ordered.push(null);
  }
  if (!preserveEmptySlots) return ordered;
  return ordered.length ? ordered : Array(slotsPerPage).fill(null);
}

export function sortForBinder(cards, {
  container = null,
  sortMode = 'name',
  collection = [],
} = {}) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  if (sortMode === 'binder') return cardsFromBinderOrder(container, list);
  if (sortMode === 'price-desc' || sortMode === 'price-asc') {
    const dir = sortMode === 'price-desc' ? -1 : 1;
    list.sort((a, b) => dir * ((Number(a.price) || 0) - (Number(b.price) || 0)) || nameSort(a, b));
    return list;
  }
  if (sortMode === 'recent') {
    list.sort((a, b) => (collection.indexOf(b) - collection.indexOf(a)) || nameSort(a, b));
    return list;
  }
  list.sort(nameSort);
  return list;
}
