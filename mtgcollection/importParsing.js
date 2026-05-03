import { makeEntry, normalizeTag } from './collection.js';

// ---- CSV parser (handles quoted fields) ----
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

// ---- Header alias mapping ----
export const ALIASES = {
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

export function mapHeaders(headerRow) {
  const idx = {};
  const lower = headerRow.map(h => h.toLowerCase().trim());
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      const i = lower.indexOf(a);
      if (i !== -1) { idx[key] = i; break; }
    }
  }
  return idx;
}

export function parseDecklist(text, options = {}) {
  const { location = '' } = options;
  const entries = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    const match = line.match(/^(\d+)\s+(.+?)\s+\(([^)]+)\)\s+(\S+)(?:\s+(.*))?$/);
    if (!match) {
      errors.push(i + 1);
      continue;
    }
    const [, qty, name, setCode, cn, markerText = ''] = match;
    const markers = markerText.toUpperCase();
    const finish = markers.includes('*E*') ? 'etched' : markers.includes('*F*') ? 'foil' : 'normal';
    entries.push(makeEntry({ qty, name, setCode, cn, finish, location }));
  }
  return { entries, errors };
}

// ---- Tags CSV cell helpers ----
// Pipe-delimited. Inside a tag, '\' escapes itself ('\\') and '|' ('\|').
// Walk char-by-char so escapes can't be ambiguated by a tag literally
// ending in backslash (the bug was: ['foo\\', 'bar'] would naively
// serialize as 'foo\|bar' and round-trip back as the single tag 'foo|bar').
export function parseTagsCell(cell) {
  if (!cell) return [];
  const tags = [];
  let cur = '';
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i];
    if (ch === '\\' && i + 1 < cell.length) {
      const next = cell[i + 1];
      if (next === '\\' || next === '|') {
        cur += next;
        i++;
        continue;
      }
    }
    if (ch === '|') {
      tags.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  tags.push(cur);
  return tags.map(s => normalizeTag(s)).filter(Boolean);
}

export function serializeTagsCell(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  // Escape '\' first, then '|'. Order matters.
  return tags.map(t => String(t).replace(/\\/g, '\\\\').replace(/\|/g, '\\|')).join('|');
}
