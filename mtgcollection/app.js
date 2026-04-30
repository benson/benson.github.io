import { state, STORAGE_KEY, SCRYFALL_API } from './state.js';
import { initSearch, applyUrlStateOnLoad, filteredSorted } from './search.js';
import { render, initView, hideImageLightbox, hideCardPreview, isLightboxVisible, showImageLightbox } from './view.js';
import { initBulk, snapshotCollection } from './bulk.js';
import { initAdd } from './add.js';

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

// ---- Persistence ----
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      collection: state.collection,
      viewMode: state.viewMode,
      gridSize: state.gridSize,
      selectedFormat: state.selectedFormat,
    }));
  } catch (e) {
    showFeedback('collection too large for localstorage — ' + e.message, 'error');
  }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Array.isArray(data.collection)) {
      state.collection = data.collection;
      state.viewMode = data.viewMode || 'grid';
      state.gridSize = ['small', 'medium', 'large'].includes(data.gridSize) ? data.gridSize : 'medium';
      state.selectedFormat = typeof data.selectedFormat === 'string' ? data.selectedFormat : '';
      return true;
    }
  } catch (e) {}
  return false;
}

// ---- DOM refs (assigned in init) ----
let feedbackEl;
let progressEl;
let drawerBackdrop;
let detailDrawer;
let detailForm;

// ---- Feedback ----
export function showFeedback(html, type = 'info') {
  feedbackEl.innerHTML = html;
  feedbackEl.className = 'feedback active ' + type;
}
export function hideFeedback() { feedbackEl.className = 'feedback'; }

// ---- HTML escape ----
export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// ---- CSV parser (handles quoted fields) ----
function parseCsv(text) {
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
};

function mapHeaders(headerRow) {
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

// ---- Normalizers + entry shape ----
export function normalizeFinish(raw) {
  if (!raw) return 'normal';
  const v = String(raw).toLowerCase().trim();
  if (!v || v === 'false' || v === 'no' || v === '0' || v === 'normal' || v === 'nonfoil' || v === 'non-foil') return 'normal';
  if (v === 'etched' || v === 'etched foil') return 'etched';
  if (v === 'true' || v === 'yes' || v === '1' || v === 'foil' || v.includes('foil')) return 'foil';
  return 'normal';
}

export function normalizeCondition(raw) {
  if (!raw) return 'near_mint';
  const v = String(raw).toLowerCase().trim().replace(/\s+/g, '_');
  if (v === 'mint' || v === 'm' || v === 'near_mint' || v === 'nm') return 'near_mint';
  if (v === 'lightly_played' || v === 'lp' || v === 'excellent' || v === 'ex' || v === 'light_played') return 'lightly_played';
  if (v === 'moderately_played' || v === 'mp' || v === 'played' || v === 'pl' || v === 'good') return 'moderately_played';
  if (v === 'heavily_played' || v === 'hp') return 'heavily_played';
  if (v === 'damaged' || v === 'dmg' || v === 'poor' || v === 'po') return 'damaged';
  return v;
}

export function normalizeLocation(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function normalizeLanguage(raw) {
  return String(raw || 'en').trim().toLowerCase() || 'en';
}

export function makeEntry(data) {
  return {
    name: data.name || '',
    setCode: (data.setCode || '').toLowerCase(),
    setName: data.setName || '',
    cn: data.cn || '',
    finish: normalizeFinish(data.finish),
    qty: Math.max(1, parseInt(data.qty, 10) || 1),
    condition: normalizeCondition(data.condition),
    language: normalizeLanguage(data.language),
    location: normalizeLocation(data.location),
    scryfallId: data.scryfallId || '',
    rarity: (data.rarity || '').toLowerCase(),
    price: parseFloat(data.price) || null,
    priceFallback: Boolean(data.priceFallback),
    imageUrl: null,
    cmc: null,
    colors: null,
    typeLine: null,
    resolvedName: null,
    scryfallUri: null,
  };
}

function parseDecklist(text, options = {}) {
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

  // Merge with existing collection — dedupe by key
  const byKey = new Map();
  for (const c of state.collection) byKey.set(collectionKey(c), c);
  for (const c of imported) {
    const k = collectionKey(c);
    if (byKey.has(k)) {
      byKey.get(k).qty += c.qty;
    } else {
      byKey.set(k, c);
    }
  }
  state.collection = Array.from(byKey.values());
  save();
  populateFilters();
  render();
  const resolved = imported.filter(c => c.imageUrl).length;
  if (!silent) {
    showFeedback('imported ' + imported.length + ' ' + label + ' (' + resolved + ' resolved)', 'success');
    document.getElementById('importDetails').open = false;
  }
}

function migrateSavedCollection() {
  const total = state.collection.reduce((sum, c) => sum + (parseInt(c.qty, 10) || 0), 0);
  const hasNoLocations = state.collection.every(c => !normalizeLocation(c.location));
  const looksLikeBreyaDefault = state.collection.length === 96
    && total === 100
    && state.collection.some(c => (c.resolvedName || c.name) === 'Breya, Etherium Shaper');
  if (hasNoLocations && looksLikeBreyaDefault) {
    state.collection.forEach(c => { c.location = 'breya deck'; });
    save();
  }
}

// ---- Import ----
async function importCsv(text) {
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

export function collectionKey(c) {
  return (c.scryfallId || (c.setCode + ':' + c.cn + ':' + c.name)) + ':' + c.finish + ':' + c.condition + ':' + c.language + ':' + normalizeLocation(c.location);
}

export function coalesceCollection() {
  const byKey = new Map();
  for (const c of state.collection) {
    const k = collectionKey(c);
    if (byKey.has(k)) {
      byKey.get(k).qty += c.qty;
    } else {
      byKey.set(k, c);
    }
  }
  state.collection = Array.from(byKey.values());
}

export function getUsdPrice(card, finish) {
  const prices = card?.prices || {};
  const exact = finish === 'foil' ? prices.usd_foil
    : finish === 'etched' ? prices.usd_etched
    : prices.usd;
  const exactPrice = parseFloat(exact);
  if (exactPrice) return { price: exactPrice, fallback: false };

  const fallbackPrice = parseFloat(prices.usd);
  if (finish !== 'normal' && fallbackPrice) return { price: fallbackPrice, fallback: true };

  return { price: null, fallback: false };
}

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

export function getCardImageUrl(card) {
  if (!card) return null;
  if (card.image_uris) return card.image_uris.normal || card.image_uris.small;
  if (card.card_faces?.length && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.small;
  }
  return null;
}

export function getCardBackImageUrl(card) {
  if (!card) return null;
  const faces = card.card_faces;
  if (faces?.length >= 2 && faces[1].image_uris) {
    return faces[1].image_uris.normal || faces[1].image_uris.small;
  }
  return null;
}

export function biggerImageUrl(url) {
  if (!url) return url;
  return url.replace('/normal/', '/large/');
}

// ---- Import triggers (exposed on window for inline onclick) ----
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

async function loadBreyaDeck(options = {}) {
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
  save();
  populateFilters();
  render();
  hideFeedback();
}

function exportCsv() {
  if (state.collection.length === 0) return;
  const list = filteredSorted();
  const header = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Condition,Language,Location,Purchase price,Purchase price currency,Purchase price note';
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

// ---- Filters (set/location dropdown population) ----
export function populateFilters() {
  const sets = [...new Set(state.collection.map(c => c.setCode).filter(Boolean))].sort();
  const setSelect = document.getElementById('filterSet');
  const current = setSelect.value;
  setSelect.innerHTML = '<option value="">all sets</option>' +
    sets.map(s => '<option value="' + esc(s) + '">' + esc(s.toUpperCase()) + '</option>').join('');
  setSelect.value = current;

  const locations = [...new Set(state.collection.map(c => normalizeLocation(c.location)).filter(Boolean))].sort();
  const locationSelect = document.getElementById('filterLocation');
  const currentLocation = locationSelect.value;
  locationSelect.innerHTML = '<option value="">all locations</option>' +
    locations.map(l => '<option value="' + esc(l) + '">' + esc(l) + '</option>').join('');
  locationSelect.value = currentLocation;
  document.getElementById('locationOptions').innerHTML =
    locations.map(l => '<option value="' + esc(l) + '"></option>').join('');
}

function collectionLanguages(extra = '') {
  const langs = new Set(['en']);
  state.collection.forEach(c => langs.add(normalizeLanguage(c.language)));
  if (extra) langs.add(normalizeLanguage(extra));
  return [...langs].filter(Boolean).sort((a, b) => {
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
  });
}

function renderLanguageOptions(selected) {
  const lang = normalizeLanguage(selected);
  const options = collectionLanguages(lang);
  document.getElementById('detailLanguageOptions').innerHTML = options.map(code =>
    `<label><input type="radio" name="detailLanguage" value="${esc(code)}"${code === lang ? ' checked' : ''}><span>${esc(code)}</span></label>`
  ).join('');
  const other = document.getElementById('detailLanguageOther');
  other.value = '';
  other.classList.remove('visible');
}

// ---- Drawer ----
const LEGALITY_LABELS = {
  legal: 'legal',
  not_legal: 'not legal',
  banned: 'banned',
  restricted: 'restricted',
};

function renderDetailLegality() {
  const c = state.collection[state.detailIndex];
  const chip = document.getElementById('detailLegality');
  if (!state.selectedFormat || !c || !c.legalities || !c.legalities[state.selectedFormat]) {
    chip.className = 'legality-chip hidden';
    chip.textContent = '';
    return;
  }
  const status = c.legalities[state.selectedFormat];
  const label = LEGALITY_LABELS[status] || status.replace(/_/g, ' ');
  chip.textContent = state.selectedFormat + ': ' + label;
  chip.className = 'legality-chip ' + status;
}

export function openDetail(index) {
  const c = state.collection[index];
  if (!c) return;
  state.detailIndex = index;
  hideCardPreview();

  const name = c.resolvedName || c.name || '(unknown)';
  document.getElementById('detailTitle').textContent = name;
  document.getElementById('detailSubtitle').textContent =
    [c.setCode ? c.setCode.toUpperCase() : '', c.cn ? '#' + c.cn : '', c.rarity || ''].filter(Boolean).join(' · ');
  renderDetailLegality();

  const imageWrap = document.getElementById('detailImageWrap');
  const flipRow = c.backImageUrl
    ? `<div class="drawer-flip-row"><button type="button" class="flip-btn" id="drawerFlipBtn">flip card</button></div>`
    : '';
  imageWrap.innerHTML = c.imageUrl
    ? `<img class="drawer-image" src="${esc(c.imageUrl)}" alt="${esc(name)}" data-front="${esc(c.imageUrl)}"${c.backImageUrl ? ` data-back="${esc(c.backImageUrl)}"` : ''} style="cursor:zoom-in;">${flipRow}`
    : `<div class="drawer-placeholder">${esc(name)}</div>`;
  const drawerImg = imageWrap.querySelector('.drawer-image');
  if (drawerImg) {
    drawerImg.addEventListener('click', () => {
      const cur = drawerImg.dataset.current === 'back' ? c.backImageUrl : c.imageUrl;
      showImageLightbox(cur || c.imageUrl, c.backImageUrl || null);
    });
  }
  const drawerFlip = document.getElementById('drawerFlipBtn');
  if (drawerFlip && drawerImg) {
    drawerFlip.addEventListener('click', () => {
      const showingBack = drawerImg.dataset.current === 'back';
      drawerImg.dataset.current = showingBack ? 'front' : 'back';
      drawerImg.src = showingBack ? c.imageUrl : c.backImageUrl;
    });
  }

  document.getElementById('detailQty').value = c.qty || 1;
  document.getElementById('detailFinish').value = c.finish || 'normal';
  const conditionValue = c.condition || 'near_mint';
  const conditionInput = detailForm.querySelector(`input[name="detailCondition"][value="${CSS.escape(conditionValue)}"]`)
    || detailForm.querySelector('input[name="detailCondition"][value="near_mint"]');
  if (conditionInput) conditionInput.checked = true;
  renderLanguageOptions(c.language || 'en');
  document.getElementById('detailLocation').value = c.location || '';
  document.getElementById('detailPriceText').textContent = c.price ? '$' + c.price.toFixed(2) : 'no price';
  document.getElementById('detailPriceMark').textContent = c.priceFallback ? '*' : '';
  const priceLink = document.getElementById('detailPriceLink');
  priceLink.href = c.scryfallUri || '#';
  priceLink.classList.toggle('hidden', !c.scryfallUri);

  drawerBackdrop.classList.add('visible');
  detailDrawer.classList.add('visible');
  detailDrawer.setAttribute('aria-hidden', 'false');
  document.getElementById('detailQty').focus();
}

function closeDetail() {
  state.detailIndex = -1;
  detailDrawer.classList.remove('visible');
  drawerBackdrop.classList.remove('visible');
  detailDrawer.setAttribute('aria-hidden', 'true');
}

function saveDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;

  const before = { qty: c.qty, finish: c.finish, condition: c.condition, language: c.language, location: c.location || '' };

  snapshotCollection();
  c.qty = Math.max(1, parseInt(document.getElementById('detailQty').value, 10) || 1);
  c.finish = normalizeFinish(document.getElementById('detailFinish').value);
  c.condition = normalizeCondition(detailForm.querySelector('input[name="detailCondition"]:checked')?.value || 'near_mint');
  c.language = normalizeLanguage(document.getElementById('detailLanguageOther').value
    || detailForm.querySelector('input[name="detailLanguage"]:checked')?.value
    || 'en');
  c.location = normalizeLocation(document.getElementById('detailLocation').value);

  const after = { qty: c.qty, finish: c.finish, condition: c.condition, language: c.language, location: c.location || '' };
  const diffs = [];
  if (after.qty !== before.qty) diffs.push('qty ' + before.qty + ' → ' + after.qty);
  if (after.finish !== before.finish) diffs.push(before.finish + ' → ' + after.finish);
  if (after.condition !== before.condition) {
    diffs.push(before.condition.replace(/_/g, ' ') + ' → ' + after.condition.replace(/_/g, ' '));
  }
  if (after.language !== before.language) diffs.push(before.language + ' → ' + after.language);
  if (after.location !== before.location) {
    diffs.push('location: ' + (before.location || '—') + ' → ' + (after.location || '—'));
  }

  coalesceCollection();
  save();
  populateFilters();
  render();
  closeDetail();
  const name = c.resolvedName || c.name || 'card';
  if (diffs.length === 0) {
    showFeedback('saved ' + esc(name) + ' (no changes)', 'success');
  } else {
    showFeedback('saved ' + esc(name) + ' (' + esc(diffs.join(', ')) + ') <button class="undo-btn" type="button">undo</button>', 'success');
  }
}

function deleteDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;
  const name = c.resolvedName || c.name || 'this row';
  snapshotCollection();
  state.collection.splice(state.detailIndex, 1);
  save();
  populateFilters();
  render();
  closeDetail();
  showFeedback('deleted ' + esc(name) + ' <button class="undo-btn" type="button">undo</button>', 'success');
}

// ---- Backup nag ----
const BACKUP_LOAD_KEY = 'mtgcollection_loads_since_backup';
const BACKUP_NAG_THRESHOLD = 15;

function bumpBackupCounter() {
  const prev = parseInt(localStorage.getItem(BACKUP_LOAD_KEY) || '0', 10) || 0;
  const next = prev + 1;
  try { localStorage.setItem(BACKUP_LOAD_KEY, String(next)); } catch (e) {}
  return next;
}
function resetBackupCounter() {
  try { localStorage.setItem(BACKUP_LOAD_KEY, '0'); } catch (e) {}
}
function maybeShowBackupNag(loadCount) {
  if (loadCount < BACKUP_NAG_THRESHOLD) return;
  if (state.collection.length <= 1) return;
  showFeedback(
    'localstorage-only — back up your collection. ' +
    '<button class="backup-btn" type="button" data-backup-action="export">export csv</button>' +
    '<button class="backup-btn" type="button" data-backup-action="dismiss">remind later</button>',
    'info'
  );
}

async function lazyBackfillSearchFields() {
  const stale = state.collection.filter(c =>
    (c.scryfallId || (c.setCode && c.cn) || c.name) &&
    (c.oracleText === undefined || c.colorIdentity === undefined || c.legalities === undefined)
  );
  if (stale.length === 0) return;
  await resolveCards(stale);
  save();
  populateFilters();
  render();
}

// ---- Boot ----
async function boot() {
  // Resolve DOM refs that other modules and core need
  feedbackEl = document.getElementById('feedback');
  progressEl = document.getElementById('progress');
  drawerBackdrop = document.getElementById('drawerBackdrop');
  detailDrawer = document.getElementById('detailDrawer');
  detailForm = document.getElementById('detailForm');

  // Init submodules (each wires its own event listeners + DOM refs)
  initView();
  initSearch();
  initBulk();
  initAdd();

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

  // Drawer wiring
  detailForm.addEventListener('submit', e => {
    e.preventDefault();
    saveDetail();
  });
  document.getElementById('detailCancel').addEventListener('click', closeDetail);
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  drawerBackdrop.addEventListener('click', closeDetail);
  document.getElementById('detailDelete').addEventListener('click', deleteDetail);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isLightboxVisible()) { hideImageLightbox(); return; }
    if (detailDrawer.classList.contains('visible')) closeDetail();
  });
  document.getElementById('detailLanguageAdd').addEventListener('click', () => {
    const other = document.getElementById('detailLanguageOther');
    other.classList.add('visible');
    other.focus();
  });
  document.getElementById('detailLanguageOther').addEventListener('input', e => {
    if (!e.target.value.trim()) return;
    detailForm.querySelectorAll('input[name="detailLanguage"]').forEach(input => { input.checked = false; });
  });

  // Format selector
  const formatSelectEl = document.getElementById('formatSelect');
  formatSelectEl.value = state.selectedFormat;
  formatSelectEl.addEventListener('change', () => {
    state.selectedFormat = formatSelectEl.value;
    save();
    if (state.detailIndex >= 0) renderDetailLegality();
    if (state.viewMode === 'deck') render();
  });

  // Backup nag actions
  feedbackEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-backup-action]');
    if (!btn) return;
    if (btn.dataset.backupAction === 'export') {
      exportCsv();
      resetBackupCounter();
      hideFeedback();
    } else if (btn.dataset.backupAction === 'dismiss') {
      resetBackupCounter();
      hideFeedback();
    }
  });

  // Expose inline-onclick handlers used by index.html
  window.importFromPaste = importFromPaste;
  window.loadSample = loadSample;
  window.loadBreyaDeck = loadBreyaDeck;
  window.clearCollection = clearCollection;
  window.exportCsv = exportCsv;

  // Boot the collection
  const hasSavedCollection = load();
  if (!hasSavedCollection) {
    showFeedback('<span class="loading-spinner"></span> loading breya deck...', 'info');
    await loadBreyaDeck({ replace: true, silent: true });
    hideFeedback();
  } else {
    migrateSavedCollection();
    const missingPrices = state.collection.filter(c => !c.price && (c.scryfallId || c.name || (c.setCode && c.cn)));
    if (missingPrices.length) {
      await resolveCards(missingPrices);
      save();
    }
    populateFilters();
    render();
  }
  if (state.collection.length > 0) {
    document.getElementById('importDetails').open = false;
  }
  applyUrlStateOnLoad();
  const loadCount = bumpBackupCounter();
  if (hasSavedCollection) maybeShowBackupNag(loadCount);
  lazyBackfillSearchFields();
}

boot();
