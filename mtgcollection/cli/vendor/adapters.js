// Format adapters for CSV import/export. Each adapter:
//   - detect(headers): returns true if the headers look like its format
//   - parse(rows): returns array of { entry, source } objects
//   - export(entries): returns full CSV text
//
// Source metadata is stashed on each entry as `entry._source[adapterId] = row`
// so that exports back to the same format can preserve fields the canonical
// model doesn't capture (Tradelist Count, Last Modified, Misprint, etc.).
//
// Adapter precedence (used by detectAdapter): moxfield > deckbox > manabox > canonical.
// More-specific adapters detect first; canonical is the catch-all.

import {
  makeEntry,
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  formatLocationLabel,
} from './collection.js';
import { parseTagsCell, serializeTagsCell } from './importParsing.js';

// ---- shared helpers ----
const lower = arr => arr.map(s => String(s || '').toLowerCase().trim());
const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvRow = arr => arr.map(csvCell).join(',');

function rowToObject(headerRow, dataRow) {
  const out = {};
  for (let i = 0; i < headerRow.length; i++) {
    out[headerRow[i]] = dataRow[i] == null ? '' : String(dataRow[i]);
  }
  return out;
}

function attachSource(entry, adapterId, headerRow, dataRow) {
  if (!entry._source || typeof entry._source !== 'object') entry._source = {};
  entry._source[adapterId] = rowToObject(headerRow, dataRow);
}

function getSource(entry, adapterId) {
  return entry?._source?.[adapterId] || null;
}

// ---- Canonical adapter ----
// The format the app already produces via exportCsv. Header aliases in
// importParsing.js handles minor variations (manabox/deckbox/moxfield-like CSVs that
// don't trip the more specific adapters' detect()).
const CANONICAL_HEADER = [
  'Name', 'Set code', 'Set name', 'Collector number', 'Foil', 'Rarity', 'Quantity',
  'Scryfall ID', 'Condition', 'Language', 'Location',
  'Purchase price', 'Purchase price currency', 'Purchase price note', 'Tags',
];

const ALIASES = {
  name:       ['name', 'card name', 'card'],
  setCode:    ['set code', 'set', 'edition', 'setcode', 'set_code'],
  setName:    ['set name', 'setname', 'edition name'],
  cn:         ['collector number', 'card number', 'cn', 'collector_number', 'number'],
  finish:     ['foil', 'finish', 'printing'],
  qty:        ['quantity', 'count', 'qty'],
  condition:  ['condition'],
  language:   ['language', 'lang'],
  location:   ['location', 'place', 'storage', 'where'],
  scryfallId: ['scryfall id', 'scryfall_id', 'scryfallid'],
  rarity:     ['rarity'],
  price:      ['purchase price', 'price', 'tcg market price'],
  tags:       ['tags'],
};

function mapHeaders(headerRow) {
  const idx = {};
  const lc = lower(headerRow);
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      const i = lc.indexOf(a);
      if (i !== -1) { idx[key] = i; break; }
    }
  }
  return idx;
}

export const canonicalAdapter = {
  id: 'canonical',
  label: 'canonical CSV',
  // Canonical is the catch-all — it accepts any CSV that has a name/id column
  // plus enough to identify a printing.
  detect(headerRow) {
    const idx = mapHeaders(headerRow);
    const hasNameOrId = idx.name !== undefined || idx.scryfallId !== undefined;
    const hasSetAndCn = idx.setCode !== undefined && idx.cn !== undefined;
    return hasNameOrId || hasSetAndCn;
  },
  parse(rows) {
    if (!rows.length) return [];
    const headerRow = rows[0];
    const idx = mapHeaders(headerRow);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = k => idx[k] !== undefined ? (row[idx[k]] || '').trim() : '';
      const entry = makeEntry({
        name: get('name'),
        setCode: get('setCode').toLowerCase(),
        setName: get('setName'),
        cn: get('cn'),
        finish: normalizeFinish(get('finish')),
        qty: parseInt(get('qty'), 10) || 1,
        condition: normalizeCondition(get('condition')),
        language: normalizeLanguage(get('language')),
        location: get('location'),
        scryfallId: get('scryfallId'),
        rarity: get('rarity').toLowerCase(),
        price: parseFloat(get('price')) || null,
        tags: parseTagsCell(get('tags')),
      });
      if (!entry.name && !entry.scryfallId && !(entry.setCode && entry.cn)) continue;
      attachSource(entry, 'canonical', headerRow, row);
      out.push(entry);
    }
    return out;
  },
  export(entries) {
    const rows = entries.map(c => csvRow([
      c.resolvedName || c.name,
      c.setCode,
      c.setName,
      c.cn,
      c.finish,
      c.rarity,
      c.qty,
      c.scryfallId,
      c.condition,
      c.language,
      formatLocationLabel(c.location),
      c.price ?? '',
      c.price ? 'USD' : '',
      c.priceFallback ? 'regular usd fallback; exact finish price unavailable' : '',
      serializeTagsCell(c.tags),
    ]));
    return csvRow(CANONICAL_HEADER) + '\n' + rows.join('\n');
  },
};

// ---- Moxfield adapter ----
// Reference headers: Count, Tradelist Count, Name, Edition, Condition,
// Language, Foil, Tags, Last Modified, Collector Number, Alter, Proxy,
// Purchase Price.
const MOXFIELD_HEADER = [
  'Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language',
  'Foil', 'Tags', 'Last Modified', 'Collector Number', 'Alter', 'Proxy',
  'Purchase Price',
];
const MOXFIELD_REQUIRED = ['count', 'name', 'edition', 'collector number'];
const MOXFIELD_HALLMARKS = ['tradelist count', 'last modified', 'alter', 'proxy'];

function moxfieldFinishOf(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'foil') return 'foil';
  if (v === 'etched') return 'etched';
  return 'normal';
}

function moxfieldConditionOf(raw) {
  const v = String(raw || '').toLowerCase().trim();
  // Moxfield uses NM/LP/MP/HP/DMG abbreviations.
  return normalizeCondition(v);
}

export const moxfieldAdapter = {
  id: 'moxfield',
  label: 'Moxfield',
  detect(headerRow) {
    const lc = lower(headerRow);
    const hasRequired = MOXFIELD_REQUIRED.every(h => lc.includes(h));
    if (!hasRequired) return false;
    // At least one of the moxfield-only columns must be present so we don't
    // false-positive on a generic CSV that happens to have those four headers.
    return MOXFIELD_HALLMARKS.some(h => lc.includes(h));
  },
  parse(rows) {
    if (!rows.length) return [];
    const headerRow = rows[0];
    const lc = lower(headerRow);
    const i = name => lc.indexOf(name);
    const colCount = i('count');
    const colName = i('name');
    const colEdition = i('edition');
    const colCondition = i('condition');
    const colLanguage = i('language');
    const colFoil = i('foil');
    const colTags = i('tags');
    const colCn = i('collector number');
    const colPrice = i('purchase price');
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = idx => idx >= 0 ? (row[idx] || '').trim() : '';
      const name = get(colName);
      if (!name) continue;
      const entry = makeEntry({
        name,
        setCode: get(colEdition).toLowerCase(),
        cn: get(colCn),
        finish: moxfieldFinishOf(get(colFoil)),
        qty: parseInt(get(colCount), 10) || 1,
        condition: moxfieldConditionOf(get(colCondition)),
        language: normalizeLanguage(get(colLanguage)),
        price: parseFloat(get(colPrice)) || null,
        tags: get(colTags) ? get(colTags).split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      attachSource(entry, 'moxfield', headerRow, row);
      out.push(entry);
    }
    return out;
  },
  export(entries) {
    const rows = entries.map(c => {
      const src = getSource(c, 'moxfield') || {};
      const finishOut = c.finish === 'foil' ? 'foil' : c.finish === 'etched' ? 'etched' : '';
      const condMap = { near_mint: 'NM', lightly_played: 'LP', moderately_played: 'MP', heavily_played: 'HP', damaged: 'DMG' };
      return csvRow([
        c.qty,
        src['Tradelist Count'] ?? 0,
        c.resolvedName || c.name,
        (c.setCode || '').toLowerCase(),
        condMap[c.condition] || 'NM',
        (c.language || 'en').toLowerCase(),
        finishOut,
        (Array.isArray(c.tags) ? c.tags.join(',') : ''),
        src['Last Modified'] ?? '',
        c.cn || '',
        src['Alter'] ?? 'False',
        src['Proxy'] ?? 'False',
        c.price ?? '',
      ]);
    });
    return csvRow(MOXFIELD_HEADER) + '\n' + rows.join('\n');
  },
};

// ---- ManaBox adapter ----
// Reference headers: Name, Set code, Set name, Collector number, Foil, Rarity,
// Quantity, ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered,
// Condition, Language, Purchase price currency.
const MANABOX_HEADER = [
  'Name', 'Set code', 'Set name', 'Collector number', 'Foil', 'Rarity',
  'Quantity', 'ManaBox ID', 'Scryfall ID', 'Purchase price', 'Misprint',
  'Altered', 'Condition', 'Language', 'Purchase price currency',
];
const MANABOX_HALLMARKS = ['manabox id', 'misprint', 'altered', 'purchase price currency'];

export const manaboxAdapter = {
  id: 'manabox',
  label: 'ManaBox',
  detect(headerRow) {
    const lc = lower(headerRow);
    // Need at least two manabox-specific columns to claim a manabox CSV.
    return MANABOX_HALLMARKS.filter(h => lc.includes(h)).length >= 2;
  },
  parse(rows) {
    if (!rows.length) return [];
    const headerRow = rows[0];
    const lc = lower(headerRow);
    const i = name => lc.indexOf(name);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = idx => idx >= 0 ? (row[idx] || '').trim() : '';
      const name = get(i('name'));
      if (!name && !get(i('scryfall id'))) continue;
      const entry = makeEntry({
        name,
        setCode: get(i('set code')).toLowerCase(),
        setName: get(i('set name')),
        cn: get(i('collector number')),
        finish: normalizeFinish(get(i('foil'))),
        qty: parseInt(get(i('quantity')), 10) || 1,
        condition: normalizeCondition(get(i('condition'))),
        language: normalizeLanguage(get(i('language'))),
        scryfallId: get(i('scryfall id')),
        rarity: get(i('rarity')).toLowerCase(),
        price: parseFloat(get(i('purchase price'))) || null,
      });
      attachSource(entry, 'manabox', headerRow, row);
      out.push(entry);
    }
    return out;
  },
  export(entries) {
    const finishOut = f => f === 'foil' ? 'foil' : f === 'etched' ? 'etched' : 'normal';
    const condOut = {
      near_mint: 'near_mint', lightly_played: 'lightly_played',
      moderately_played: 'moderately_played', heavily_played: 'heavily_played',
      damaged: 'damaged',
    };
    const rows = entries.map(c => {
      const src = getSource(c, 'manabox') || {};
      return csvRow([
        c.resolvedName || c.name,
        (c.setCode || '').toLowerCase(),
        c.setName || src['Set name'] || '',
        c.cn || '',
        finishOut(c.finish),
        c.rarity || '',
        c.qty,
        src['ManaBox ID'] ?? '',
        c.scryfallId || '',
        c.price ?? '',
        src['Misprint'] ?? 'false',
        src['Altered'] ?? 'false',
        condOut[c.condition] || 'near_mint',
        c.language || 'en',
        c.price ? 'USD' : (src['Purchase price currency'] || ''),
      ]);
    });
    return csvRow(MANABOX_HEADER) + '\n' + rows.join('\n');
  },
};

// ---- Deckbox adapter ----
// Reference headers: Count, Tradelist Count, Name, Edition, Card Number,
// Condition, Language, Foil, Signed, Artist Proof, Altered Art, Misprint,
// Promo, Textless, My Price.
const DECKBOX_HEADER = [
  'Count', 'Tradelist Count', 'Name', 'Edition', 'Card Number', 'Condition',
  'Language', 'Foil', 'Signed', 'Artist Proof', 'Altered Art', 'Misprint',
  'Promo', 'Textless', 'My Price',
];
const DECKBOX_REQUIRED = ['count', 'name', 'edition', 'card number'];
// "Card Number" + "Tradelist Count" + "Signed/Artist Proof/Altered Art" hallmarks.
const DECKBOX_HALLMARKS = ['signed', 'artist proof', 'altered art', 'textless', 'my price'];

function deckboxConditionOf(raw) {
  const v = String(raw || '').toLowerCase().trim();
  // Deckbox uses long names: "Near Mint", "Mint", "Good (Lightly Played)", etc.
  if (v.includes('near mint') || v === 'mint') return 'near_mint';
  if (v.includes('lightly') || v.includes('good')) return 'lightly_played';
  if (v.includes('played') || v.includes('moderate')) return 'moderately_played';
  if (v.includes('heavily') || v.includes('poor')) return 'heavily_played';
  if (v.includes('damaged')) return 'damaged';
  return normalizeCondition(v);
}

export const deckboxAdapter = {
  id: 'deckbox',
  label: 'Deckbox',
  detect(headerRow) {
    const lc = lower(headerRow);
    const hasRequired = DECKBOX_REQUIRED.every(h => lc.includes(h));
    if (!hasRequired) return false;
    return DECKBOX_HALLMARKS.some(h => lc.includes(h));
  },
  parse(rows) {
    if (!rows.length) return [];
    const headerRow = rows[0];
    const lc = lower(headerRow);
    const i = name => lc.indexOf(name);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = idx => idx >= 0 ? (row[idx] || '').trim() : '';
      const name = get(i('name'));
      if (!name) continue;
      const foilRaw = get(i('foil'));
      const foilLc = foilRaw.toLowerCase();
      const finish = foilLc === 'foil' || foilLc === 'true' || foilLc === 'yes' ? 'foil' : 'normal';
      const entry = makeEntry({
        name,
        // Deckbox 'Edition' is the SET NAME, not the code. Stash and let
        // scryfall resolve via name+number.
        setName: get(i('edition')),
        cn: get(i('card number')),
        finish,
        qty: parseInt(get(i('count')), 10) || 1,
        condition: deckboxConditionOf(get(i('condition'))),
        language: normalizeLanguage(get(i('language'))),
        price: parseFloat(get(i('my price'))) || null,
      });
      attachSource(entry, 'deckbox', headerRow, row);
      out.push(entry);
    }
    return out;
  },
  export(entries) {
    const condMap = {
      near_mint: 'Near Mint', lightly_played: 'Good (Lightly Played)',
      moderately_played: 'Played', heavily_played: 'Heavily Played',
      damaged: 'Poor',
    };
    const rows = entries.map(c => {
      const src = getSource(c, 'deckbox') || {};
      return csvRow([
        c.qty,
        src['Tradelist Count'] ?? 0,
        c.resolvedName || c.name,
        c.setName || src['Edition'] || (c.setCode || '').toUpperCase(),
        c.cn || '',
        condMap[c.condition] || 'Near Mint',
        c.language || 'English',
        c.finish === 'foil' ? 'foil' : '',
        src['Signed'] ?? '',
        src['Artist Proof'] ?? '',
        src['Altered Art'] ?? '',
        src['Misprint'] ?? '',
        src['Promo'] ?? '',
        src['Textless'] ?? '',
        c.price ?? '',
      ]);
    });
    return csvRow(DECKBOX_HEADER) + '\n' + rows.join('\n');
  },
};

// ---- Registry + dispatch ----
// Order matters — most-specific first. detectAdapter walks in order and
// returns the first match. Canonical is the fallback catch-all.
export const ADAPTERS = [moxfieldAdapter, deckboxAdapter, manaboxAdapter, canonicalAdapter];

export function getAdapter(id) {
  return ADAPTERS.find(a => a.id === id) || null;
}

export function detectAdapter(headerRow) {
  for (const a of ADAPTERS) {
    if (a.detect(headerRow)) return a;
  }
  return null;
}

// Merge source metadata across two entries (used by mergeIntoCollection so
// re-imports don't drop earlier-import preserved fields). The newer source
// wins per-format.
export function mergeSource(existing, incoming) {
  if (!incoming?._source) return existing;
  if (!existing._source || typeof existing._source !== 'object') existing._source = {};
  for (const [id, row] of Object.entries(incoming._source)) {
    existing._source[id] = row;
  }
  return existing;
}
