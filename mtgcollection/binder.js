// Binder view — pure helpers for slicing a sorted card list into
// fixed-size pages. The list is expected to be pre-sorted upstream;
// this helper just paginates and pads the trailing page with nulls so
// each page is always rectangular.
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

// Sort cards for binder display: name asc, then setCode asc, then collector number.
export function sortForBinder(cards) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  list.sort((a, b) => {
    const an = (a.resolvedName || a.name || '').toLowerCase();
    const bn = (b.resolvedName || b.name || '').toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    const as = (a.setCode || '').toLowerCase();
    const bs = (b.setCode || '').toLowerCase();
    if (as !== bs) return as.localeCompare(bs);
    const ac = String(a.cn || '');
    const bc = String(b.cn || '');
    // try numeric compare first
    const an2 = parseInt(ac, 10);
    const bn2 = parseInt(bc, 10);
    if (!Number.isNaN(an2) && !Number.isNaN(bn2) && an2 !== bn2) return an2 - bn2;
    return ac.localeCompare(bc);
  });
  return list;
}
