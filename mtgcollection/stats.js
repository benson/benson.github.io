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
