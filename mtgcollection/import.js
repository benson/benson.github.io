import { state, SCRYFALL_API } from './state.js';
import { showFeedback, hideFeedback } from './feedback.js';
import {
  makeEntry,
  collectionKey,
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  normalizeTag,
  getUsdPrice,
  getCardImageUrl,
  getCardBackImageUrl,
} from './collection.js';
import { save, commitCollectionChange } from './persistence.js';
import { filteredSorted } from './search.js';

// ---- Breya seed ----
const BREYA_DECKLIST = `1 Breya, Etherium Shaper (C16) 29 *F*
1 Ancient Den (SLD) 300 *F*
1 Ancient Tomb (TMP) 315
1 Arcane Signet (SLD) 1641★ *F*
1 Arcum Dagsson (CSP) 27
1 Arid Mesa (MH2) 475 *F*
1 Baleful Strix (C16) 181
1 Blood Crypt (RTR) 238
1 Bloodstained Mire (KTK) 230
1 Chromatic Lantern (RTR) 226
1 City of Brass (7ED) 327
1 Command Tower (SLD) 1666 *F*
1 Cyclonic Rift (MM3) 35
1 Daretti, Ingenious Iconoclast (CN2) 74
1 Darksteel Citadel (SLD) 608 *F*
1 Deflecting Swat (SLD) 1552 *F*
1 Dispatch (NPH) 7
1 Eldrazi Displacer (OGW) 13
1 Enlightened Tutor (DMR) 6 *F*
1 Esper Sentinel (H2R) 2 *F*
1 Etherium Sculptor (C16) 89
1 Ethersworn Canonist (MMA) 14 *F*
1 Everflowing Chalice (WWK) 123 *F*
1 Exotic Orchard (C16) 295
1 Fabricate (SLD) 332 *F*
1 Fellwar Stone (NCC) 367
1 Fetid Pools (AKH) 243 *F*
1 Fierce Guardianship (SLD) 1823 *F*
1 Flooded Strand (KTK) 233
1 Force of Will (DMR) 284
1 Forensic Gadgeteer (PMKM) 57s *F*
1 Ghost Trap (SLD) 871
1 Glint-Nest Crane (KLD) 50
1 Goblin Welder (ULG) 80
1 Godless Shrine (GTC) 242
1 Grand Architect (SOM) 33
1 Great Furnace (SLD) 303 *F*
1 Hallowed Fountain (RTR) 241
1 Hangarback Walker (ORI) 229
1 Inventors' Fair (KLD) 247
2 Island (UND) 89
1 Krark-Clan Ironworks (SLC) 11 *F*
1 Lotho, Corrupt Shirriff (LTR) 781 *F*
1 Lotus Petal (TMP) 294
1 Mana Confluence (JOU) 163
1 Mana Vault (2X2) 560 *E*
1 Moonsilver Key (MID) 255 *F*
3 Mountain (ELD) 262
1 Mox Opal (SLD) 1072 *E*
1 Myr Battlesphere (C16) 263
1 Myr Retriever (MMA) 210 *F*
1 Mystic Remora (SLD) 406 *F*
1 Nim Deathmantle (SOM) 188 *F*
1 Padeem, Consul of Innovation (KLD) 59
1 Path to Exile (MM3) 17
1 Phyrexian Metamorph (PNPH) 42★ *F*
1 Plains (UND) 87
1 Polluted Delta (KTK) 239
1 Purphoros, God of the Forge (PLST) THS-135
1 Raugrin Triome (IKO) 311 *F*
1 Reckless Fireweaver (SLD) 1526 *F*
1 Restoration Angel (MM3) 20
1 Saheeli, Sublime Artificer (SLD) 1143
1 Savai Triome (IKO) 312 *F*
1 Seat of the Synod (SLD) 301 *F*
1 Sharuum the Hegemon (C16) 221
1 Sink into Stupor / Soporific Springs (MH3) 241 *F*
1 Sir Bedivere's Scales (SLD) 1679 *F*
1 Skullclamp (SLD) 1112 *F*
1 Sol Ring (SLD) 1011 *F*
1 Spellskite (SLD) 587 *F*
1 Spire of Industry (AER) 184 *F*
1 Stoneforge Mystic (PGPX) 2016 *F*
2 Swamp (UND) 91
1 Sword of the Meek (FUT) 165
1 Swords to Plowshares (ICE) 54
1 Talisman of Creativity (SLD) 1058 *E*
1 Talisman of Dominance (SLD) 1053 *E*
1 Talisman of Progress (SLD) 1052 *E*
1 Tezzeret the Seeker (MM2) 62
1 The One Ring (LTR) 451 *F*
1 Thopter Assembly (PMBS) 140★ *F*
1 Thopter Foundry (PLST) C16-237
1 Thought Monitor (PMH2) 71s *F*
1 Time Sieve (PLST) ARB-31
1 Tribute Mage (H1R) 10 *E*
1 Trinket Mage (C16) 102
1 Trophy Mage (AER) 48 *F*
1 Unstable Harmonics (SLD) 478
1 Urborg, Tomb of Yawgmoth (M15) 248
1 Urza, Lord High Artificer (CMM) 674 *F*
1 Urza's Saga (PMH2) 259s *F*
1 Vampiric Tutor (DMR) 430 *F*
1 Vault of Whispers (SLD) 302 *F*
1 Whir of Invention (SPG) 96 *F*
1 Windswept Heath (KTK) 248`;

let progressEl;

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

// ---- Scryfall resolve ----
async function resolveCards(entries) {
  // Batch Scryfall /cards/collection requests, up to 75 per call
  const BATCH = 75;
  let resolved = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const identifiers = batch.map(e => {
      if (e.scryfallId) return { id: e.scryfallId };
      if (e.setCode && e.cn) return { set: e.setCode, collector_number: e.cn };
      if (e.name && e.setCode) return { name: e.name, set: e.setCode };
      if (e.name) return { name: e.name };
      return { name: 'UNRESOLVABLE' };
    });
    try {
      const resp = await fetch(SCRYFALL_API + '/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const found = data.data || [];
      for (let j = 0; j < batch.length; j++) {
        const entry = batch[j];
        const ident = identifiers[j];
        let card = null;
        if (ident.id) card = found.find(c => c.id === ident.id);
        else if (ident.set && ident.collector_number) {
          card = found.find(c => c.set === ident.set && c.collector_number === ident.collector_number);
        } else if (ident.name) {
          card = found.find(c => c.name.toLowerCase() === ident.name.toLowerCase() && (!ident.set || c.set === ident.set))
              || found.find(c => c.name.toLowerCase().includes(ident.name.toLowerCase()));
        }
        if (card) {
          entry.scryfallId = card.id;
          entry.resolvedName = card.name;
          entry.setCode = card.set;
          entry.setName = card.set_name;
          entry.cn = card.collector_number;
          entry.rarity = entry.rarity || card.rarity;
          entry.cmc = card.cmc ?? null;
          entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
          entry.colorIdentity = card.color_identity || [];
          entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
          entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
          entry.legalities = card.legalities || {};
          entry.scryfallUri = card.scryfall_uri;
          entry.imageUrl = getCardImageUrl(card);
          entry.backImageUrl = getCardBackImageUrl(card);
          if (!entry.price) {
            const priced = getUsdPrice(card, entry.finish);
            entry.price = priced.price;
            entry.priceFallback = priced.fallback;
          } else {
            entry.priceFallback = Boolean(entry.priceFallback);
          }
          resolved++;
        }
      }
    } catch (e) {
      // leave unresolved; skip batch
    }
    progressEl.textContent = 'resolved ' + resolved + ' / ' + entries.length;
    if (i + BATCH < entries.length) await new Promise(r => setTimeout(r, 120));
  }
  progressEl.textContent = '';
}

// ---- Imports ----
async function importEntries(imported, options = {}) {
  const { replace = false, silent = false, label = 'rows' } = options;
  if (imported.length === 0) {
    if (!silent) showFeedback('no usable rows found', 'error');
    return;
  }

  if (replace) state.collection = [];
  if (!silent) {
    showFeedback('<span class="loading-spinner"></span> imported ' + imported.length + ' ' + label + ' — resolving via scryfall...', 'info');
  }

  await resolveCards(imported);

  state.collection = mergeIntoCollection(state.collection, imported);
  commitCollectionChange();
  const resolved = imported.filter(c => c.imageUrl).length;
  if (!silent) {
    showFeedback('imported ' + imported.length + ' ' + label + ' (' + resolved + ' resolved)', 'success');
    document.getElementById('importDetails').open = false;
  }
}

export async function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    showFeedback('csv looks empty', 'error');
    return;
  }
  const headerRow = rows[0];
  const idx = mapHeaders(headerRow);
  const hasNameOrId = idx.name !== undefined || idx.scryfallId !== undefined;
  const hasSetAndCn = idx.setCode !== undefined && idx.cn !== undefined;
  if (!hasNameOrId && !hasSetAndCn) {
    showFeedback('couldn\'t recognize columns — need name, scryfall id, or both set code + collector number', 'error');
    return;
  }

  const imported = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => idx[k] !== undefined ? (row[idx[k]] || '').trim() : '';
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
    imported.push(entry);
  }

  if (imported.length === 0) {
    showFeedback('no usable rows found', 'error');
    return;
  }

  await importEntries(imported, { label: 'rows' });
}

// ---- Merge import into existing collection ----
// Pure: takes (existing, imported) → new collection. Dedupes by collectionKey,
// sums qty on collisions, unions tags on collisions.
export function mergeIntoCollection(existing, imported) {
  const byKey = new Map();
  for (const c of existing) byKey.set(collectionKey(c), c);
  for (const c of imported) {
    const k = collectionKey(c);
    if (byKey.has(k)) {
      const e = byKey.get(k);
      e.qty += c.qty;
      e.tags = [...new Set([...(e.tags || []), ...(c.tags || [])])];
    } else {
      byKey.set(k, c);
    }
  }
  return Array.from(byKey.values());
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

// ---- Import triggers ----
function importFromPaste() {
  const text = document.getElementById('pasteArea').value;
  if (!text.trim()) { showFeedback('paste some csv first', 'error'); return; }
  const firstLine = text.trim().split(/\r?\n/, 1)[0] || '';
  if (firstLine.includes(',')) {
    importCsv(text);
    return;
  }
  const { entries, errors } = parseDecklist(text);
  if (errors.length) {
    showFeedback('couldn\'t parse decklist lines: ' + errors.join(', '), 'error');
    return;
  }
  importEntries(entries, { label: 'decklist cards' });
}

async function importFromFile(file) {
  const text = await file.text();
  importCsv(text);
}

function loadSample() {
  const sample = 'Name,Set code,Collector number,Foil,Rarity,Quantity,Condition,Location\n' +
    'Sol Ring,cmm,410,normal,uncommon,1,near_mint,sample binder\n' +
    'Lightning Bolt,clb,187,normal,common,4,lightly_played,sample binder\n' +
    'Counterspell,cmm,81,normal,common,2,near_mint,sample binder\n' +
    'Brainstorm,sta,13,normal,rare,3,near_mint,sample binder\n' +
    'Swords to Plowshares,cmm,841,normal,uncommon,2,near_mint,sample binder\n' +
    'Thoughtseize,2xm,109,foil,rare,1,near_mint,sample binder\n' +
    '"Ragavan, Nimble Pilferer",mh2,138,normal,mythic,1,near_mint,sample binder\n' +
    'Wrenn and Six,mh1,217,normal,mythic,1,near_mint,sample binder\n' +
    'Force of Will,2xm,51,normal,mythic,1,near_mint,sample binder\n' +
    'Rhystic Study,j22,114,normal,rare,1,near_mint,sample binder';
  document.getElementById('pasteArea').value = sample;
  showFeedback('loaded sample csv — click "import pasted"', 'info');
}

export async function loadBreyaDeck(options = {}) {
  const { replace = true, silent = false } = options;
  if (replace && state.collection.length > 0 && !silent && !confirm('replace current collection with the breya deck?')) return;
  const { entries, errors } = parseDecklist(BREYA_DECKLIST, { location: 'breya deck' });
  if (errors.length && !silent) {
    showFeedback('couldn\'t parse decklist lines: ' + errors.join(', '), 'error');
    return;
  }
  await importEntries(entries, { replace, silent, label: 'breya deck cards' });
}

function clearCollection() {
  if (!confirm('clear ' + state.collection.length + ' entries?')) return;
  state.collection = [];
  commitCollectionChange();
  hideFeedback();
}

function exportCsv() {
  if (state.collection.length === 0) return;
  const list = filteredSorted();
  const header = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Condition,Language,Location,Purchase price,Purchase price currency,Purchase price note,Tags';
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = list.map(c => [
    q(c.resolvedName || c.name),
    q(c.setCode),
    q(c.setName),
    q(c.cn),
    q(c.finish),
    q(c.rarity),
    q(c.qty),
    q(c.scryfallId),
    q(c.condition),
    q(c.language),
    q(c.location),
    q(c.price ?? ''),
    q(c.price ? 'USD' : ''),
    q(c.priceFallback ? 'regular usd fallback; exact finish price unavailable' : ''),
    q(serializeTagsCell(c.tags)),
  ].join(','));
  const csv = header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'collection-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Lazy backfill (uses resolveCards, hence lives here) ----
export async function lazyBackfillSearchFields() {
  const stale = state.collection.filter(c =>
    (c.scryfallId || (c.setCode && c.cn) || c.name) &&
    (c.oracleText === undefined || c.colorIdentity === undefined || c.legalities === undefined)
  );
  if (stale.length === 0) return;
  await resolveCards(stale);
  commitCollectionChange();
}

// ---- Backfill missing prices on boot ----
export async function backfillMissingPrices() {
  const missingPrices = state.collection.filter(c => !c.price && (c.scryfallId || c.name || (c.setCode && c.cn)));
  if (missingPrices.length) {
    await resolveCards(missingPrices);
    save();
  }
}

// ---- Init: wire buttons + drop zone, return exportCsv for the backup-nag handler ----
export function initImport() {
  progressEl = document.getElementById('progress');

  // Drop zone
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) importFromFile(e.target.files[0]);
  });
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) importFromFile(file);
  });

  document.getElementById('importPastedBtn').addEventListener('click', importFromPaste);
  document.getElementById('loadBreyaBtn').addEventListener('click', () => loadBreyaDeck());
  document.getElementById('loadSampleBtn').addEventListener('click', loadSample);
  document.getElementById('deleteAllBtn').addEventListener('click', clearCollection);
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportCsv);
}

// Exposed so app.js can wire it into the backup-nag click handler
export { exportCsv };
