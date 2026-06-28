// Shared rendering for card lists: aligned table rows and CSV (via the app's
// adapters, so exports round-trip with the web app).
import { formatLocationLabel } from '../vendor/collection.js';
import { getAdapter, canonicalAdapter } from '../vendor/adapters.js';

const COND_ABBR = { near_mint: 'NM', lightly_played: 'LP', moderately_played: 'MP', heavily_played: 'HP', damaged: 'DMG' };
const FINISH_LABEL = { normal: '', foil: 'foil', etched: 'etched' };

export const CARD_COLUMNS = [
  { header: 'qty', align: 'right' },
  { header: 'name' },
  { header: 'set' },
  { header: 'finish' },
  { header: 'cond' },
  { header: 'price', align: 'right' },
  { header: 'location' },
];

export function cardRow(c) {
  const price = typeof c.price === 'number' ? '$' + c.price.toFixed(2) : '';
  return [
    String(c.qty ?? ''),
    c.resolvedName || c.name || '',
    ((c.setCode || '').toUpperCase() + ' ' + (c.cn || '')).trim(),
    FINISH_LABEL[c.finish] ?? c.finish ?? '',
    COND_ABBR[c.condition] || c.condition || '',
    price,
    formatLocationLabel(c.location),
  ];
}

export function cardsToCsv(cards, format = 'canonical') {
  const adapter = getAdapter(format) || canonicalAdapter;
  return adapter.export(cards);
}
