export const TYPE_BUCKETS = [
  ['land',         /\bland\b/i],
  ['creature',     /\bcreature\b/i],
  ['planeswalker', /\bplaneswalker\b/i],
  ['battle',       /\bbattle\b/i],
  ['instant',      /\binstant\b/i],
  ['sorcery',      /\bsorcery\b/i],
  ['enchantment',  /\benchantment\b/i],
  ['artifact',     /\bartifact\b/i],
];
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'];
export const COLOR_SLICES = [
  { key: 'w', label: 'white',     fill: '#f0e7c2' },
  { key: 'u', label: 'blue',      fill: '#9bb9d4' },
  { key: 'b', label: 'black',     fill: '#5a5450' },
  { key: 'r', label: 'red',       fill: '#d68a78' },
  { key: 'g', label: 'green',     fill: '#90b386' },
  { key: 'm', label: 'multicolor',fill: '#d8b870' },
  { key: 'c', label: 'colorless', fill: '#cfcfcf' },
];

export function bucketType(typeLine) {
  if (!typeLine) return 'other';
  for (const [name, re] of TYPE_BUCKETS) {
    if (re.test(typeLine)) return name;
  }
  return 'other';
}

export function bucketColor(colors) {
  if (!colors || colors.length === 0) return 'c';
  if (colors.length > 1) return 'm';
  return colors[0].toLowerCase();
}

// ---- Deck-view grouping helpers (pure) ----
// Each helper returns an array of { label, cards } in display order, omitting empty groups.

const TYPE_GROUP_ORDER = [
  ['creature',     'creatures'],
  ['instant',      'instants'],
  ['sorcery',      'sorceries'],
  ['artifact',     'artifacts'],
  ['enchantment',  'enchantments'],
  ['planeswalker', 'planeswalkers'],
  ['battle',       'battles'],
  ['land',         'lands'],
  ['other',        'other'],
];

function sortDeckCards(cards) {
  return cards.slice().sort((a, b) => {
    const ac = typeof a.cmc === 'number' ? a.cmc : 0;
    const bc = typeof b.cmc === 'number' ? b.cmc : 0;
    if (ac !== bc) return ac - bc;
    const an = (a.resolvedName || a.name || '').toLowerCase();
    const bn = (b.resolvedName || b.name || '').toLowerCase();
    return an.localeCompare(bn);
  });
}

export function groupByType(list) {
  const buckets = new Map();
  for (const c of list) {
    const key = bucketType(c.typeLine);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const out = [];
  for (const [key, label] of TYPE_GROUP_ORDER) {
    const cards = buckets.get(key);
    if (cards && cards.length) out.push({ label, cards: sortDeckCards(cards) });
  }
  return out;
}

export function groupByCmc(list) {
  const buckets = Array.from({ length: 8 }, () => []);
  const lands = [];
  for (const c of list) {
    if (bucketType(c.typeLine) === 'land') {
      lands.push(c);
      continue;
    }
    const slot = typeof c.cmc === 'number' ? Math.min(7, Math.max(0, Math.floor(c.cmc))) : 0;
    buckets[slot].push(c);
  }
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const out = [];
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].length === 0) continue;
    out.push({ label: labels[i], cards: sortDeckCards(buckets[i]) });
  }
  if (lands.length) out.push({ label: 'lands', cards: sortDeckCards(lands) });
  return out;
}

const COLOR_GROUP_ORDER = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
  ['M', 'multicolor'],
  ['C', 'colorless'],
];

function colorBucketKey(ci) {
  if (!Array.isArray(ci) || ci.length === 0) return 'C';
  if (ci.length > 1) return 'M';
  return ci[0].toUpperCase();
}

export function groupByColor(list) {
  const buckets = new Map();
  for (const c of list) {
    const key = colorBucketKey(c.colorIdentity);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const out = [];
  for (const [key, label] of COLOR_GROUP_ORDER) {
    const cards = buckets.get(key);
    if (cards && cards.length) out.push({ label, cards: sortDeckCards(cards) });
  }
  return out;
}

const RARITY_GROUP_ORDER = [
  ['mythic', 'mythic'],
  ['rare', 'rare'],
  ['uncommon', 'uncommon'],
  ['common', 'common'],
];

export function groupByRarity(list) {
  const buckets = new Map();
  for (const c of list) {
    const key = (c.rarity || '').toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  const out = [];
  for (const [key, label] of RARITY_GROUP_ORDER) {
    const cards = buckets.get(key);
    if (cards && cards.length) out.push({ label, cards: sortDeckCards(cards) });
  }
  // Anything with unknown rarity tucked into 'other' at end (preserves order).
  const known = new Set(RARITY_GROUP_ORDER.map(([k]) => k));
  const otherCards = [];
  for (const [key, cards] of buckets) {
    if (!known.has(key)) otherCards.push(...cards);
  }
  if (otherCards.length) out.push({ label: 'other', cards: sortDeckCards(otherCards) });
  return out;
}

export function groupDeck(list, mode) {
  switch (mode) {
    case 'cmc':    return groupByCmc(list);
    case 'color':  return groupByColor(list);
    case 'rarity': return groupByRarity(list);
    case 'type':
    default:       return groupByType(list);
  }
}

// Pick the card to seed the deck-view preview panel with —
// the first card in the first non-empty group. Returns null if
// the grouped output has no cards.
export function deckBoard(card) {
  const v = String(card?.deckBoard || '').trim().toLowerCase();
  return v === 'sideboard' || v === 'maybe' ? v : 'main';
}

export function splitDeckBoards(list) {
  const boards = { main: [], sideboard: [], maybe: [] };
  for (const c of list || []) boards[deckBoard(c)].push(c);
  return boards;
}

export function cardQuantity(list) {
  return (list || []).reduce((s, c) => s + (parseInt(c.qty, 10) || 0), 0);
}

export function deckStats(list) {
  const boards = splitDeckBoards(list);
  const main = boards.main;
  const total = cardQuantity(list);
  const mainTotal = cardQuantity(main);
  const value = (list || []).reduce((s, c) => s + (c.price || 0) * (parseInt(c.qty, 10) || 0), 0);
  const lands = main.reduce((s, c) => s + (bucketType(c.typeLine) === 'land' ? (parseInt(c.qty, 10) || 0) : 0), 0);
  let cmcSum = 0;
  let cmcCount = 0;
  let spellCmcSum = 0;
  let spellCmcCount = 0;
  for (const c of main) {
    const qty = parseInt(c.qty, 10) || 0;
    if (typeof c.cmc !== 'number') continue;
    cmcSum += c.cmc * qty;
    cmcCount += qty;
    if (bucketType(c.typeLine) !== 'land') {
      spellCmcSum += c.cmc * qty;
      spellCmcCount += qty;
    }
  }
  return {
    total,
    main: mainTotal,
    sideboard: cardQuantity(boards.sideboard),
    maybe: cardQuantity(boards.maybe),
    unique: (list || []).length,
    value,
    lands,
    nonlands: mainTotal - lands,
    avgManaValue: cmcCount ? cmcSum / cmcCount : 0,
    avgSpellManaValue: spellCmcCount ? spellCmcSum / spellCmcCount : 0,
  };
}

export function renderDeckStatsHtml(list) {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  const types = {};
  const rarity = {};
  const colors = {};
  for (const c of list || []) {
    const qty = c.qty || 1;
    const typeBucket = bucketType(c.typeLine);
    types[typeBucket] = (types[typeBucket] || 0) + qty;
    if (c.rarity) rarity[c.rarity] = (rarity[c.rarity] || 0) + qty;
    if (typeBucket !== 'land' && typeof c.cmc === 'number') {
      const slot = Math.min(7, Math.max(0, Math.floor(c.cmc)));
      curve[slot] += qty;
    }
    const cBucket = bucketColor(c.colors);
    colors[cBucket] = (colors[cBucket] || 0) + qty;
  }
  const curveMax = Math.max(1, ...curve);
  const curveLabels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const curveHtml = curve.map((n, i) => {
    const pct = (n / curveMax) * 100;
    return `<div class="curve-row"><span class="curve-bucket">${curveLabels[i]}</span><div class="curve-bar-wrap"><div class="curve-bar" style="width:${pct}%"></div></div><span class="curve-count">${n}</span></div>`;
  }).join('');
  const typesList = [...TYPE_BUCKETS.map(([n]) => n), 'other'];
  const typeHtml = typesList
    .filter(t => types[t])
    .map(t => `<div class="breakdown-row"><span>${t}</span><span class="breakdown-count">${types[t]}</span></div>`)
    .join('') || '<div class="curve-bucket">-</div>';
  const rarityHtml = RARITY_ORDER
    .filter(r => rarity[r])
    .map(r => `<div class="breakdown-row"><span>${r}</span><span class="breakdown-count">${rarity[r]}</span></div>`)
    .join('') || '<div class="curve-bucket">-</div>';
  const colorHtml = COLOR_SLICES
    .filter(sl => colors[sl.key])
    .map(sl => `<div class="color-legend-row"><span class="color-swatch" style="background:${sl.fill}"></span>${sl.label} ${colors[sl.key]}</div>`)
    .join('') || '<div class="curve-bucket">-</div>';
  return { curveHtml, typeHtml, rarityHtml, colorHtml };
}

export function expandDecklist(list) {
  const out = [];
  for (const c of list || []) {
    const qty = parseInt(c.qty, 10) || 1;
    for (let i = 0; i < qty; i++) out.push(c);
  }
  return out;
}

export function shuffleCards(cards, random = Math.random) {
  const out = (cards || []).slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawSampleHand(list, handSize = 7, random = Math.random) {
  const library = shuffleCards(expandDecklist(list), random);
  return {
    hand: library.slice(0, handSize),
    next: library.slice(handSize, handSize + 6),
  };
}

export function firstCardForPanel(groups) {
  if (!Array.isArray(groups)) return null;
  for (const g of groups) {
    if (g && Array.isArray(g.cards) && g.cards.length > 0) {
      return g.cards[0];
    }
  }
  return null;
}

export function renderStatsPanel(list) {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  const types = {};
  const rarity = {};
  const colors = {};
  for (const c of list) {
    const qty = c.qty || 1;
    const typeBucket = bucketType(c.typeLine);
    types[typeBucket] = (types[typeBucket] || 0) + qty;
    if (c.rarity) rarity[c.rarity] = (rarity[c.rarity] || 0) + qty;
    if (typeBucket !== 'land' && typeof c.cmc === 'number') {
      const slot = Math.min(7, Math.max(0, Math.floor(c.cmc)));
      curve[slot] += qty;
    }
    const cBucket = bucketColor(c.colors);
    colors[cBucket] = (colors[cBucket] || 0) + qty;
  }

  const curveMax = Math.max(1, ...curve);
  const curveLabels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  document.getElementById('manaCurve').innerHTML = curve.map((n, i) => {
    const pct = (n / curveMax) * 100;
    return `<div class="curve-row"><span class="curve-bucket">${curveLabels[i]}</span><div class="curve-bar-wrap"><div class="curve-bar" style="width:${pct}%"></div></div><span class="curve-count">${n}</span></div>`;
  }).join('');

  const typesList = [...TYPE_BUCKETS.map(([n]) => n), 'other'];
  document.getElementById('typeBreakdown').innerHTML = typesList
    .filter(t => types[t])
    .map(t => `<div class="breakdown-row"><span>${t}</span><span class="breakdown-count">${types[t]}</span></div>`)
    .join('') || '<div class="curve-bucket">—</div>';

  document.getElementById('rarityBreakdown').innerHTML = RARITY_ORDER
    .filter(r => rarity[r])
    .map(r => `<div class="breakdown-row"><span>${r}</span><span class="breakdown-count">${rarity[r]}</span></div>`)
    .join('') || '<div class="curve-bucket">—</div>';

  const totalColored = COLOR_SLICES.reduce((s, sl) => s + (colors[sl.key] || 0), 0);
  const pieEl = document.getElementById('colorPie');
  if (totalColored === 0) {
    pieEl.innerHTML = '<circle cx="18" cy="18" r="14" fill="none" stroke="#eee" stroke-width="6"></circle>';
  } else {
    const r = 14;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const segments = COLOR_SLICES.map(sl => {
      const n = colors[sl.key] || 0;
      if (!n) return '';
      const len = (n / totalColored) * circ;
      const seg = `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${sl.fill}" stroke-width="6" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 18 18)"></circle>`;
      offset += len;
      return seg;
    }).join('');
    pieEl.innerHTML = segments;
  }
  document.getElementById('colorLegend').innerHTML = COLOR_SLICES
    .filter(sl => colors[sl.key])
    .map(sl => `<div class="color-legend-row"><span class="color-swatch" style="background:${sl.fill}"></span>${sl.label} ${colors[sl.key]}</div>`)
    .join('');
}
