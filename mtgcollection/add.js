import {
  fetchSets,
  fetchCardByCollectorNumber,
  fetchCardByName,
  getCardFinishes,
} from '../shared/mtg.js';
import { state, SCRYFALL_API } from './state.js';
import { esc, showFeedback, hideFeedback } from './feedback.js';
import { getSetIconUrl } from './setIcons.js';
import {
  makeEntry,
  collectionKey,
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  normalizeLocation,
  formatLocationLabel,
  locationKey,
  allCollectionLocations,
  getCardImageUrl,
  getCardBackImageUrl,
  getUsdPrice,
  ensureContainer,
  addToDeckList,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { showImageLightbox, LOC_ICONS } from './view.js';
import { recordEvent } from './changelog.js';
import { getMultiselectValue } from './multiselect.js';

// When a single container is the active filter, that's the user's
// implicit context — the add flow should default to dropping cards there.
function currentFilterLocation() {
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return null;
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return null;
  const idx = values[0].indexOf(':');
  if (idx === -1) return null;
  return { type: values[0].slice(0, idx), name: values[0].slice(idx + 1) };
}

let validSets = new Set();
let addPreviewCard = null;
let addMode = 'name';
let lastUsedLocation = null;
let voiceFoilFlag = false;
let voiceQtyOverride = null;
let voiceLocationOverride = null;
let lastAddInput = null;
let autoAddEnabled = false;

const AUTOADD_KEY = 'mtgcollection_voice_autoadd_v1';

let addDetailsEl, addModeNameEl, addModeCnEl, addModeImportEl;
let addNameInput, addNameList;
let addPreviewEl, addPreviewImg, addPreviewName, addPreviewMeta;
let addQtyInput, addLocationNameInput;

// Wrappers that mimic a <select>'s `.value` API so existing call sites stay simple.
const addFinishSel = {
  get value() {
    return document.querySelector('input[name="addFinish"]:checked')?.value || '';
  },
  set value(v) {
    document.querySelectorAll('input[name="addFinish"]').forEach(r => { r.checked = (r.value === v); });
  },
};
const addConditionSel = {
  get value() {
    return document.querySelector('input[name="addCondition"]:checked')?.value || 'near_mint';
  },
  set value(v) {
    document.querySelectorAll('input[name="addCondition"]').forEach(r => { r.checked = (r.value === v); });
  },
};
const addLanguageSel = {
  get value() {
    const other = document.getElementById('addLanguageOther');
    if (other && other.value.trim()) return other.value.trim();
    return document.querySelector('input[name="addLanguage"]:checked')?.value || 'en';
  },
  set value(v) {
    const radios = document.querySelectorAll('input[name="addLanguage"]');
    let matched = false;
    radios.forEach(r => {
      const checked = r.value === v;
      r.checked = checked;
      if (checked) matched = true;
    });
    const other = document.getElementById('addLanguageOther');
    if (!other) return;
    if (matched) {
      other.value = '';
      other.classList.remove('visible');
    } else {
      other.value = v;
      other.classList.add('visible');
    }
  },
};

const ADD_LOCATION_TYPES = ['deck', 'binder', 'box'];
const ADD_LOCATION_DEFAULT = 'box';

function renderFinishRadios(card) {
  const wrap = document.getElementById('addFinish');
  if (!wrap) return;
  const finishes = getCardFinishes(card);
  wrap.innerHTML = finishes.map((f, i) => {
    const value = f.finish === 'nonfoil' ? 'normal' : f.finish;
    const label = f.label.toLowerCase();
    return `<label><input type="radio" name="addFinish" value="${esc(value)}"${i === 0 ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  }).join('');
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

function renderLanguageRadios(selected) {
  const wrap = document.getElementById('addLanguageOptions');
  if (!wrap) return;
  const lang = normalizeLanguage(selected);
  const options = collectionLanguages(lang);
  wrap.innerHTML = options.map(code =>
    `<label><input type="radio" name="addLanguage" value="${esc(code)}"${code === lang ? ' checked' : ''}><span>${esc(code)}</span></label>`
  ).join('');
  const other = document.getElementById('addLanguageOther');
  if (other) {
    other.value = '';
    other.classList.remove('visible');
  }
}

// ---- Location picker (existing-pills + inline-new) ----
let selectedLocation = null;
let locationNewMode = false;

function syncDeckAddOptions() {
  const wrap = document.getElementById('addDeckOptions');
  if (!wrap) return;
  const loc = readPickerLocation();
  const isDeck = loc?.type === 'deck';
  wrap.classList.toggle('hidden', !isDeck);
  if (!isDeck) return;
  // Compute ownership for the currently previewed printing.
  const card = addPreviewCard;
  const readout = document.getElementById('addOwnershipReadout');
  const ph = document.getElementById('addAsPlaceholder');
  if (!readout) return;
  if (!card) {
    readout.textContent = '';
    readout.classList.remove('placeholder-state');
    return;
  }
  const owned = state.collection.filter(c => c.scryfallId === card.id);
  const ownedQty = owned.reduce((s, c) => s + (c.qty || 0), 0);
  const inDeck = owned.filter(c => normalizeLocation(c.location)?.type === 'deck' && normalizeLocation(c.location)?.name === loc.name);
  const inDeckQty = inDeck.reduce((s, c) => s + (c.qty || 0), 0);
  if (ownedQty === 0) {
    readout.textContent = "you don't own this printing yet — defaults to placeholder";
    readout.classList.add('placeholder-state');
    if (ph && !ph.dataset.userTouched) ph.checked = true;
  } else {
    const breakdown = owned.map(c => {
      const l = normalizeLocation(c.location);
      return (c.qty || 0) + ' in ' + (l ? l.type + ':' + l.name : 'unsorted');
    }).join(', ');
    readout.textContent = 'you own ' + ownedQty + ' of this printing (' + breakdown + ')' + (inDeckQty ? ' · ' + inDeckQty + ' already in this deck' : '');
    readout.classList.remove('placeholder-state');
    if (ph && !ph.dataset.userTouched) ph.checked = false;
  }
}

function renderLocationPicker() {
  const pillsEl = document.getElementById('addLocationPills');
  const newBoxEl = document.getElementById('addLocationNewBox');
  if (!pillsEl || !newBoxEl) {
    syncDeckAddOptions();
    return;
  }
  const TYPE_HEADERS = { deck: 'decks', binder: 'binders', box: 'boxes' };
  const locations = allCollectionLocations();
  const html = [];
  for (const type of ADD_LOCATION_TYPES) {
    const ofType = locations.filter(l => l.type === type);
    if (ofType.length === 0) continue;
    html.push(`<span class="loc-group-label">${TYPE_HEADERS[type]}</span>`);
    for (const loc of ofType) {
      const isSelected = !locationNewMode && selectedLocation
        && locationKey(selectedLocation) === locationKey(loc);
      html.push(`<button class="location-pill-btn${isSelected ? ' is-selected' : ''}" type="button" data-loc-type="${esc(loc.type)}" data-loc-name="${esc(loc.name)}">
        <span class="loc-pill loc-pill-${esc(loc.type)}">${LOC_ICONS[loc.type]}<span>${esc(loc.name)}</span></span>
      </button>`);
    }
  }
  html.push(`<span class="loc-pills-row-break" aria-hidden="true"></span>`);
  html.push(`<button class="location-pill-new${locationNewMode ? ' is-selected' : ''}" type="button" id="addLocationNewBtn">+ new location</button>`);
  pillsEl.innerHTML = html.join('');
  newBoxEl.classList.toggle('hidden', !locationNewMode);
  syncDeckAddOptions();
}

export function setSelectedLocation(loc) {
  if (loc && loc.type && loc.name) {
    selectedLocation = { type: loc.type, name: loc.name };
    locationNewMode = false;
  } else {
    selectedLocation = null;
  }
  renderLocationPicker();
}

function setLocationNewMode(seed) {
  locationNewMode = true;
  selectedLocation = null;
  if (seed && seed.type) addLocationType.value = seed.type;
  const nameInput = document.getElementById('addLocationName');
  if (nameInput) nameInput.value = seed && seed.name ? seed.name : '';
  renderLocationPicker();
  if (nameInput) nameInput.focus();
}

function readPickerLocation() {
  if (locationNewMode) {
    return normalizeLocation({ type: addLocationType.value, name: addLocationNameInput.value });
  }
  return selectedLocation ? normalizeLocation(selectedLocation) : null;
}

function seedLocationPicker(seed) {
  const seedLoc = normalizeLocation(seed);
  if (!seedLoc) {
    selectedLocation = null;
    locationNewMode = false;
    renderLocationPicker();
    return;
  }
  const existing = allCollectionLocations().find(l => locationKey(l) === locationKey(seedLoc));
  if (existing) {
    setSelectedLocation(seedLoc);
  } else {
    setLocationNewMode(seedLoc);
  }
}

function buildLocationTypeRadios() {
  const wrap = document.getElementById('addLocationTypeRadios');
  if (!wrap) return;
  wrap.innerHTML = ADD_LOCATION_TYPES.map(t => `<label class="loc-type-radio${t === ADD_LOCATION_DEFAULT ? ' is-selected' : ''}">
    <input type="radio" name="addLocationType" value="${t}"${t === ADD_LOCATION_DEFAULT ? ' checked' : ''}>
    <span class="loc-pill loc-pill-${t}">${LOC_ICONS[t]}<span>${t}</span></span>
  </label>`).join('');
  wrap.addEventListener('change', e => {
    if (e.target.name !== 'addLocationType') return;
    wrap.querySelectorAll('.loc-type-radio').forEach(l => {
      const r = l.querySelector('input');
      l.classList.toggle('is-selected', !!(r && r.checked));
    });
  });
}

// Typed-pill radio group for the location type. Mimics a <select>'s `.value`
// API so existing call sites continue to read/write a plain string.
const addLocationType = {
  get value() {
    const r = document.querySelector('input[name="addLocationType"]:checked');
    return r ? r.value : 'box';
  },
  set value(v) {
    document.querySelectorAll('input[name="addLocationType"]').forEach(r => {
      const checked = r.value === v;
      r.checked = checked;
      const wrap = r.closest('.loc-type-radio');
      if (wrap) wrap.classList.toggle('is-selected', checked);
    });
  },
};
let addBtn, addCancelBtn, addMicBtn, addMicStatus, addAutoAddEl;
let addPrintingPickerEl, addPrintingListEl, addPrintingCaptionEl;

// ---- Printings state ----
const PRINTINGS_MAX_PAGES = 3;
const PRINTINGS_HARD_CAP = 150;
let currentPrintings = [];
let currentPrintingsName = '';
let printingsAbort = null;
let printingsTotalCount = 0;
let printingsTruncated = false;

// ---- Name autocomplete state ----
let acDebounce = null;
let acAbort = null;
let acItems = [];
let acIndex = -1;

// ---- Voice state ----
let voiceListening = false;
let voiceRecognition = null;
let voicePending = '';
let voiceDebounce = null;
const VOICE_DEBOUNCE_MS = 1200;

const KW_FOIL = /\bfoil\b/g;
const KW_PRERELEASE = /\b(prerelease|pre-release|pre release|date\s*stamp(ed)?)\b/g;
const KW_PROMO = /\b(promo|stamp|stamped)\b/g;
const KW_CONDITIONS = [
  ['damaged',           /\b(damaged|dmg|poor)\b/g],
  ['heavily_played',    /\b(heavily\s*played|heavy\s*play(ed)?|hp)\b/g],
  ['moderately_played', /\b(moderately\s*played|moderate\s*play(ed)?|mp)\b/g],
  ['lightly_played',    /\b(lightly\s*played|light\s*play(ed)?|lp|excellent)\b/g],
  ['near_mint',         /\b(near\s*mint|nm|mint|n\.m\.)\b/g],
];

const QTY_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const QTY_WORD_RE = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s+of)?\s+/;
const QTY_DIGIT_PREFIX_RE = /^\s*(\d{1,3})\s+(?=[a-z])/;
const QTY_SUFFIX_RE = /\s+x\s*(\d{1,3})\b/;
const LOCATION_RE = /\b(?:in|to)\s+(.+?)\s*$/;

function setAddMode(mode) {
  addMode = mode;
  document.querySelectorAll('.add-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.addMode === mode);
  });
  addModeNameEl.classList.toggle('active', mode === 'name');
  addModeCnEl.classList.toggle('active', mode === 'cn');
  if (addModeImportEl) addModeImportEl.classList.toggle('active', mode === 'import');
  hideAddPreview();
  if (mode === 'name') addNameInput.focus();
  else if (mode === 'cn') addMicBtn.focus();
}

async function fetchAcSuggestions(q) {
  try {
    if (acAbort) acAbort.abort();
    acAbort = new AbortController();
    const url = SCRYFALL_API + '/cards/autocomplete?q=' + encodeURIComponent(q);
    const resp = await fetch(url, { signal: acAbort.signal });
    if (!resp.ok) return;
    const data = await resp.json();
    acItems = (data.data || []).slice(0, 12);
    renderAcList();
  } catch (e) {}
}

function renderAcList() {
  if (!acItems.length) { hideAcList(); return; }
  acIndex = -1;
  addNameList.innerHTML = acItems.map(n => `<li role="option">${esc(n)}</li>`).join('');
  addNameList.classList.add('active');
}

function highlightAc() {
  Array.from(addNameList.children).forEach((li, i) => {
    li.classList.toggle('highlight', i === acIndex);
  });
}

function hideAcList() {
  addNameList.classList.remove('active');
  acIndex = -1;
}

async function pickName(name) {
  hideAcList();
  addNameInput.value = name;
  await loadPrintings(name);
}

async function loadPrintings(name) {
  if (printingsAbort) printingsAbort.abort();
  printingsAbort = new AbortController();
  const signal = printingsAbort.signal;

  currentPrintings = [];
  currentPrintingsName = name;
  printingsTotalCount = 0;
  printingsTruncated = false;

  showPrintingPicker();
  addPrintingCaptionEl.textContent = 'Loading printings...';
  addPrintingListEl.innerHTML = '';

  try {
    const query = '!"' + name.replace(/"/g, '\\"') + '"';
    let url = SCRYFALL_API
      + '/cards/search?q=' + encodeURIComponent(query)
      + '&unique=prints&order=released&dir=desc&include_extras=true&include_variations=true';
    const collected = [];
    let pages = 0;
    let totalCards = 0;
    while (url && pages < PRINTINGS_MAX_PAGES) {
      const resp = await fetch(url, { signal });
      if (!resp.ok) {
        if (resp.status === 404) {
          // Scryfall returns 404 if no cards match the search.
          break;
        }
        throw new Error('http ' + resp.status);
      }
      const data = await resp.json();
      pages++;
      if (typeof data.total_cards === 'number') totalCards = data.total_cards;
      if (Array.isArray(data.data)) {
        for (const c of data.data) {
          collected.push(c);
          if (collected.length >= PRINTINGS_HARD_CAP) break;
        }
      }
      if (collected.length >= PRINTINGS_HARD_CAP) break;
      url = data.has_more ? data.next_page : null;
    }

    if (signal.aborted) return;

    if (collected.length === 0) {
      // Fallback: try a fuzzy name lookup so we still show something.
      const card = await fetchCardByName(name);
      if (signal.aborted) return;
      if (!card) {
        addPrintingCaptionEl.textContent = 'No printings found';
        showFeedback('no card found for ' + esc(name), 'error');
        return;
      }
      currentPrintings = [card];
      currentPrintingsName = name;
      printingsTotalCount = 1;
      printingsTruncated = false;
      hideFeedback();
      renderPrintingList();
      selectPrinting(0);
      return;
    }

    currentPrintings = collected;
    printingsTotalCount = Math.max(totalCards, collected.length);
    printingsTruncated = collected.length < printingsTotalCount;
    hideFeedback();
    renderPrintingList();
    selectPrinting(0);
  } catch (err) {
    if (signal.aborted) return;
    showFeedback("couldn't load printings: " + esc(err.message || String(err)), 'error');
    // Fallback to single canonical printing so the user can still add the card.
    const card = await fetchCardByName(name);
    if (signal.aborted) return;
    if (card) {
      currentPrintings = [card];
      currentPrintingsName = name;
      printingsTotalCount = 1;
      printingsTruncated = false;
      renderPrintingList();
      selectPrinting(0);
    } else {
      hidePrintingPicker();
    }
  }
}

function renderPrintingList() {
  if (!currentPrintings.length) {
    addPrintingListEl.innerHTML = '';
    addPrintingCaptionEl.textContent = 'No printings found';
    return;
  }
  const captionParts = ['showing ' + currentPrintings.length + ' of ' + printingsTotalCount];
  if (printingsTruncated) {
    captionParts.push('<span class="truncate-hint">More available — narrow by typing the set code</span>');
  }
  addPrintingCaptionEl.innerHTML = captionParts.join(' — ');

  const rows = currentPrintings.map((c, i) => {
    const setCode = (c.set || '').toLowerCase();
    const iconUrl = setCode ? getSetIconUrl(setCode) : '';
    const icon = iconUrl
      ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
      : '';
    const finishes = Array.isArray(c.finishes) ? c.finishes : [];
    const finishBadges = [];
    // Only flag printings that DON'T offer plain nonfoil — most modern printings
    // are foil-or-nonfoil, so a "foil" badge there is misleading.
    if (!finishes.includes('nonfoil') && finishes.includes('foil')) {
      finishBadges.push('<span class="printing-finish-badge">foil only</span>');
    }
    if (finishes.includes('etched')) finishBadges.push('<span class="printing-finish-badge">etched</span>');
    const year = (c.released_at || '').slice(0, 4);
    return `<li class="printing-row" role="option" data-index="${i}">
      ${icon}
      <span class="printing-set-code">${esc((c.set || '').toUpperCase())}</span>
      <span class="printing-set-name">${esc(c.set_name || '')}</span>
      <span class="printing-cn">#${esc(c.collector_number || '')}</span>
      <span class="printing-finishes">${finishBadges.join('')}</span>
      <span class="printing-year">${esc(year)}</span>
    </li>`;
  });
  addPrintingListEl.innerHTML = rows.join('');
}

function selectPrinting(index) {
  if (!currentPrintings.length) return;
  const i = Math.max(0, Math.min(currentPrintings.length - 1, index));
  const card = currentPrintings[i];
  Array.from(addPrintingListEl.children).forEach((li, idx) => {
    li.classList.toggle('selected', idx === i);
  });
  showAddPreview(card, { preserveFields: addPreviewCard != null });
}

function showPrintingPicker() {
  if (addPrintingPickerEl) addPrintingPickerEl.classList.add('active');
}

function hidePrintingPicker() {
  if (addPrintingPickerEl) addPrintingPickerEl.classList.remove('active');
  if (addPrintingListEl) addPrintingListEl.innerHTML = '';
  if (addPrintingCaptionEl) addPrintingCaptionEl.textContent = '';
  if (printingsAbort) { try { printingsAbort.abort(); } catch (e) {} printingsAbort = null; }
  currentPrintings = [];
  currentPrintingsName = '';
  printingsTotalCount = 0;
  printingsTruncated = false;
}

function resolveLookupTarget(set, cn, variant) {
  const s = set.toLowerCase();
  if (variant === 'promo' || variant === 'prerelease') {
    const pset = s.startsWith('p') ? s : 'p' + s;
    const pcn = /[a-z]$/i.test(cn) ? cn : cn + 's';
    return { set: pset, cn: pcn };
  }
  return { set: s, cn };
}

async function doVoiceLookup(userSet, userCn, variant = 'regular') {
  const target = resolveLookupTarget(userSet, userCn, variant);
  showFeedback('<span class="loading-spinner"></span> looking up ' + esc(target.set) + ' #' + esc(target.cn) + '...', 'info');
  let card = await fetchCardByCollectorNumber(target.set, target.cn);
  let fallback = false;
  if (!card && variant !== 'regular') {
    card = await fetchCardByCollectorNumber(userSet, userCn);
    if (card) fallback = true;
  }
  if (!card) {
    const msg = 'no card found for ' + esc(userSet) + ' #' + esc(userCn);
    showFeedback(msg, 'error');
    voiceQtyOverride = null;
    voiceLocationOverride = null;
    voiceFoilFlag = false;
    return;
  }
  if (fallback) showFeedback('no ' + variant + ' variant found — showing regular printing', 'info');
  else hideFeedback();

  if (autoAddEnabled) {
    autoAddVoiceCard(card, { userSet, userCn, variant });
  } else {
    showAddPreview(card);
  }
}

function autoAddVoiceCard(card, voiceCtx) {
  const finishes = getCardFinishes(card);
  let finish = 'normal';
  if (voiceFoilFlag && finishes.some(f => f.finish === 'foil')) {
    finish = 'foil';
  } else if (finishes[0]) {
    finish = finishes[0].finish === 'nonfoil' ? 'normal' : finishes[0].finish;
  }
  const condition = normalizeCondition(addConditionSel.value);
  const language = normalizeLanguage(addLanguageSel.value);
  const qty = Math.max(1, voiceQtyOverride || 1);
  const location = normalizeLocation(voiceLocationOverride != null ? voiceLocationOverride : lastUsedLocation);

  commitVoiceAdd(card, { finish, qty, condition, language, location }, voiceCtx);

  voiceQtyOverride = null;
  voiceLocationOverride = null;
  voiceFoilFlag = false;
}

function commitVoiceAdd(card, opts, voiceCtx) {
  const entry = makeEntry({
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    cn: card.collector_number,
    finish: opts.finish,
    qty: opts.qty,
    condition: opts.condition,
    language: opts.language,
    location: opts.location,
    scryfallId: card.id,
    rarity: card.rarity || '',
  });
  entry.resolvedName = card.name;
  entry.cmc = card.cmc ?? null;
  entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
  entry.colorIdentity = card.color_identity || [];
  entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
  entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
  entry.legalities = card.legalities || {};
  entry.scryfallUri = card.scryfall_uri;
  entry.imageUrl = getCardImageUrl(card);
  entry.backImageUrl = getCardBackImageUrl(card);
  const priced = getUsdPrice(card, entry.finish);
  entry.price = priced.price;
  entry.priceFallback = priced.fallback;

  const k = collectionKey(entry);
  const existing = state.collection.find(c => collectionKey(c) === k);
  let before = [];
  let created = [];
  if (existing) {
    before = [{ key: k, card: { ...existing, tags: Array.isArray(existing.tags) ? [...existing.tags] : [] } }];
    existing.qty += entry.qty;
  } else {
    state.collection.push(entry);
    created = [k];
  }

  commitCollectionChange();
  lastUsedLocation = opts.location;
  if (voiceCtx) {
    lastAddInput = {
      set: voiceCtx.userSet,
      cn: voiceCtx.userCn,
      variant: voiceCtx.variant,
      foil: opts.finish === 'foil',
      condition: opts.condition,
      qty: opts.qty,
      location: opts.location,
    };
  }
  recordEvent({
    type: 'add',
    summary: 'Added ×' + opts.qty,
    before,
    created,
    affectedKeys: [k],
    cards: [{
      name: card.name,
      imageUrl: entry.imageUrl || '',
      backImageUrl: entry.backImageUrl || '',
    }],
  });
}

function showAddPreview(card, opts) {
  const preserveFields = !!(opts && opts.preserveFields);
  const prevQty = preserveFields ? addQtyInput.value : null;
  const prevFinish = preserveFields ? addFinishSel.value : null;
  const prevSelectedLocation = preserveFields ? selectedLocation : null;
  const prevLocationNewMode = preserveFields ? locationNewMode : false;
  const prevLocationType = preserveFields && locationNewMode ? addLocationType.value : null;
  const prevLocationName = preserveFields && locationNewMode ? addLocationNameInput.value : null;
  addPreviewCard = card;
  addPreviewEl.classList.add('active');
  const imageUrl = getCardImageUrl(card);
  const backUrl = getCardBackImageUrl(card);
  addPreviewImg.src = imageUrl || '';
  addPreviewImg.alt = card.name;
  addPreviewImg.style.cursor = imageUrl ? 'zoom-in' : '';
  addPreviewImg.dataset.front = imageUrl || '';
  addPreviewImg.dataset.back = backUrl || '';
  addPreviewImg.dataset.current = 'front';
  addPreviewName.textContent = card.name;
  addPreviewMeta.textContent = [card.set_name, card.type_line, card.rarity].filter(Boolean).join(' — ');

  const flipBtn = document.getElementById('addFlipBtn');
  flipBtn.classList.toggle('hidden', !backUrl);

  const existingEl = document.getElementById('addPreviewExisting');
  const cardName = (card.name || '').toLowerCase();
  const matches = state.collection.filter(c =>
    (c.scryfallId && c.scryfallId === card.id) ||
    ((c.resolvedName || c.name || '').toLowerCase() === cardName)
  );
  if (matches.length > 0) {
    const totalQty = matches.reduce((s, c) => s + (parseInt(c.qty, 10) || 0), 0);
    existingEl.textContent = 'already in collection (×' + totalQty + ')';
    existingEl.classList.remove('hidden');
  } else {
    existingEl.classList.add('hidden');
  }

  renderFinishRadios(card);
  renderLanguageRadios('en');

  if (voiceFoilFlag) {
    addFinishSel.value = 'foil';
    voiceFoilFlag = false;
  }

  addQtyInput.value = voiceQtyOverride && voiceQtyOverride > 0 ? voiceQtyOverride : 1;
  // Seed the location: voice override > current single-container filter > last-used.
  const seedSource = voiceLocationOverride != null
    ? voiceLocationOverride
    : (currentFilterLocation() || lastUsedLocation);
  seedLocationPicker(seedSource);
  voiceQtyOverride = null;
  voiceLocationOverride = null;
  if (preserveFields) {
    if (prevQty != null && prevQty !== '') addQtyInput.value = prevQty;
    if (prevFinish) addFinishSel.value = prevFinish;
    if (prevLocationNewMode) {
      setLocationNewMode({ type: prevLocationType, name: prevLocationName });
    } else if (prevSelectedLocation) {
      setSelectedLocation(prevSelectedLocation);
    }
  }
  addBtn.focus();
  syncDeckAddOptions();
}

function hideAddPreview() {
  addPreviewCard = null;
  addPreviewEl.classList.remove('active');
  hidePrintingPicker();
}

function addCardFromPreview() {
  const card = addPreviewCard;
  if (!card) return;
  const finish = normalizeFinish(addFinishSel.value);
  const condition = normalizeCondition(addConditionSel.value);
  const language = normalizeLanguage(addLanguageSel.value);
  const qty = Math.max(1, parseInt(addQtyInput.value, 10) || 1);
  const location = readPickerLocation();
  const placeholderToggle = document.getElementById('addAsPlaceholder');
  const asPlaceholder = !!(placeholderToggle && placeholderToggle.checked && location?.type === 'deck');

  // When the destination is a deck, always update its decklist. Whether we
  // also create an inventory row is gated by the placeholder toggle.
  if (location?.type === 'deck') {
    const deck = ensureContainer({ type: 'deck', name: location.name });
    if (deck) {
      addToDeckList(deck, {
        scryfallId: card.id,
        qty,
        board: 'main',
        name: card.name,
        setCode: card.set,
        cn: card.collector_number,
        imageUrl: getCardImageUrl(card),
        backImageUrl: getCardBackImageUrl(card),
      });
      deck.updatedAt = Date.now();
    }
  }

  if (asPlaceholder) {
    commitCollectionChange();
    lastUsedLocation = location;
    recordEvent({
      type: 'add',
      summary: 'Added {card} as placeholder to {loc:' + location.type + ':' + location.name + '}',
      cards: [{ name: card.name, imageUrl: getCardImageUrl(card), backImageUrl: getCardBackImageUrl(card) || '' }],
      scope: 'deck',
      deckLocation: location.type + ':' + location.name,
    });
    showFeedback('added placeholder for ' + card.name, 'success');
    hideAddPreview();
    return;
  }

  const entry = makeEntry({
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    cn: card.collector_number,
    finish, qty, condition, language, location,
    scryfallId: card.id,
    rarity: card.rarity || '',
  });
  entry.resolvedName = card.name;
  entry.cmc = card.cmc ?? null;
  entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
  entry.colorIdentity = card.color_identity || [];
  entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
  entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
  entry.legalities = card.legalities || {};
  entry.scryfallUri = card.scryfall_uri;
  entry.imageUrl = getCardImageUrl(card);
  entry.backImageUrl = getCardBackImageUrl(card);
  const priced = getUsdPrice(card, entry.finish);
  entry.price = priced.price;
  entry.priceFallback = priced.fallback;

  const k = collectionKey(entry);
  const existing = state.collection.find(c => collectionKey(c) === k);
  let before = [];
  let created = [];
  if (existing) {
    before = [{ key: k, card: { ...existing, tags: Array.isArray(existing.tags) ? [...existing.tags] : [] } }];
    existing.qty += entry.qty;
  } else {
    state.collection.push(entry);
    created = [k];
  }

  commitCollectionChange();
  lastUsedLocation = location;
  if (addMode === 'cn') {
    lastAddInput = {
      set: card.set,
      cn: card.collector_number,
      variant: 'regular',
      foil: finish === 'foil',
      condition,
      qty,
      location,
    };
  }
  recordEvent({
    type: 'add',
    summary: 'Added (' + (card.set || '').toUpperCase() + ' #' + card.collector_number + ')',
    before,
    created,
    affectedKeys: [k],
    cards: [{
      name: card.name,
      imageUrl: entry.imageUrl || '',
      backImageUrl: entry.backImageUrl || '',
    }],
  });

  hideAddPreview();
  if (addMode === 'name') {
    addNameInput.value = '';
    addNameInput.focus();
  } else {
    addMicBtn.focus();
  }
}

export function parseVoiceText(text, validSetsArg) {
  const sets = validSetsArg instanceof Set ? validSetsArg : new Set(validSetsArg || []);
  let clean = String(text || '').toLowerCase()
    .replace(/\b(um|uh|uhh|okay|ok)\b/g, '')
    .replace(/number\s*/g, '')
    .replace(/hashtag\s*/g, '')
    .replace(/pound\s*/g, '')
    .replace(/hash\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { kind: 'empty' };

  const againMatch = clean.match(/^again(?:\s+(.+))?$/);
  if (againMatch) {
    let qty = null;
    const tail = (againMatch[1] || '').trim();
    if (tail) {
      const tm = tail.match(/^(\d{1,3})(?:\s*(?:times?|x))?$/) ||
                 tail.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*times?)?$/);
      if (tm) {
        const v = QTY_WORDS[tm[1]] ?? parseInt(tm[1], 10);
        if (v > 0) qty = v;
      }
    }
    return { kind: 'again', qty };
  }

  let location = null;
  const locMatch = clean.match(LOCATION_RE);
  if (locMatch) {
    location = locMatch[1].trim().toLowerCase();
    clean = clean.slice(0, locMatch.index).trim();
  }

  let qty = null;
  const suffixMatch = clean.match(QTY_SUFFIX_RE);
  if (suffixMatch) {
    qty = parseInt(suffixMatch[1], 10);
    clean = (clean.slice(0, suffixMatch.index) + clean.slice(suffixMatch.index + suffixMatch[0].length)).trim();
  } else {
    const wordMatch = clean.match(QTY_WORD_RE);
    if (wordMatch) {
      qty = QTY_WORDS[wordMatch[1]];
      clean = clean.slice(wordMatch[0].length).trim();
    } else {
      const digitMatch = clean.match(QTY_DIGIT_PREFIX_RE);
      if (digitMatch) {
        qty = parseInt(digitMatch[1], 10);
        clean = clean.slice(digitMatch[0].length).trim();
      }
    }
  }
  if (qty != null && (!Number.isFinite(qty) || qty < 1)) qty = null;

  const hasFoil = KW_FOIL.test(clean); KW_FOIL.lastIndex = 0;
  let variant = 'regular';
  if (KW_PRERELEASE.test(clean)) variant = 'prerelease';
  else if (KW_PROMO.test(clean)) variant = 'promo';
  KW_PRERELEASE.lastIndex = 0; KW_PROMO.lastIndex = 0;
  let condition = null;
  for (const [value, re] of KW_CONDITIONS) {
    re.lastIndex = 0;
    if (re.test(clean)) { condition = value; break; }
    re.lastIndex = 0;
  }
  let stripped = clean
    .replace(KW_FOIL, ' ')
    .replace(KW_PRERELEASE, ' ')
    .replace(KW_PROMO, ' ');
  for (const [, re] of KW_CONDITIONS) stripped = stripped.replace(re, ' ');
  stripped = stripped.replace(/\s+/g, ' ').trim();

  const parsed = smartParseSetCnWith(stripped, sets);
  if (!parsed) return { kind: 'unparsed' };
  return {
    kind: 'card',
    set: parsed.set,
    cn: parsed.cn,
    variant,
    foil: hasFoil,
    condition,
    qty,
    location,
  };
}

function smartParseSetCnWith(text, sets) {
  const alnum = text.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!alnum) return null;
  if (sets && sets.size > 0) {
    for (let k = 5; k >= 2; k--) {
      const candidate = alnum.slice(0, k);
      const rest = alnum.slice(k);
      if (sets.has(candidate) && /^\d+[a-z]?$/.test(rest)) {
        return { set: candidate, cn: rest };
      }
    }
    const m = alnum.match(/^([a-z]+)(\d)0(\d+)$/);
    if (m && m[3].length >= 1) {
      const setCode = m[1] + m[2] + m[3][0];
      const cn = m[3].slice(1);
      if (sets.has(setCode) && cn.length > 0) return { set: setCode, cn };
    }
  }
  const m = text.match(/^\s*([a-z0-9]{2,5})\s+(\d{1,4}[a-z]?)\b/i);
  if (m) return { set: m[1].toLowerCase(), cn: m[2] };
  return null;
}

function parseVoice(text) {
  const result = parseVoiceText(text, validSets);
  if (result.kind === 'empty') return;
  if (result.kind === 'again') {
    handleAgain(result.qty);
    return;
  }
  if (result.kind === 'unparsed') {
    showFeedback('couldn\'t parse "' + esc(text) + '" — say set code then number (e.g. "fin 142")', 'error');
    return;
  }
  addDetailsEl.open = true;
  if (addMode !== 'cn') setAddMode('cn');
  voiceFoilFlag = result.foil;
  voiceQtyOverride = result.qty;
  voiceLocationOverride = result.location;
  if (result.condition) addConditionSel.value = result.condition;
  doVoiceLookup(result.set, result.cn, result.variant);
}

function handleAgain(qty) {
  if (!lastAddInput) {
    showFeedback('no previous add to repeat', 'error');
    return;
  }
  const repeated = { ...lastAddInput, qty: qty != null ? qty : 1 };
  addDetailsEl.open = true;
  if (addMode !== 'cn') setAddMode('cn');
  voiceFoilFlag = repeated.foil;
  voiceQtyOverride = repeated.qty;
  voiceLocationOverride = repeated.location;
  if (repeated.condition) addConditionSel.value = repeated.condition;
  doVoiceLookup(repeated.set, repeated.cn, repeated.variant);
}

export function initAdd() {
  addDetailsEl  = document.getElementById('addDetails');
  addModeNameEl = document.getElementById('addModeName');
  addModeCnEl   = document.getElementById('addModeCn');
  addModeImportEl = document.getElementById('addModeImport');
  addNameInput  = document.getElementById('addNameInput');
  addNameList   = document.getElementById('addNameSuggestions');
  addPreviewEl  = document.getElementById('addPreview');
  addPreviewImg = document.getElementById('addPreviewImg');
  addPreviewName = document.getElementById('addPreviewName');
  addPreviewMeta = document.getElementById('addPreviewMeta');
  addPrintingPickerEl  = document.getElementById('addPrintingPicker');
  addPrintingListEl    = document.getElementById('addPrintingList');
  addPrintingCaptionEl = document.getElementById('addPrintingCaption');
  addQtyInput     = document.getElementById('addQty');
  buildLocationTypeRadios();
  addLocationNameInput = document.getElementById('addLocationName');
  // Initial render: empty finish (no card picked yet) + language radios from collection
  renderLanguageRadios('en');
  renderLocationPicker();
  addBtn         = document.getElementById('addCardBtn');
  addCancelBtn   = document.getElementById('addCardCancel');
  const placeholderToggle = document.getElementById('addAsPlaceholder');
  if (placeholderToggle) {
    placeholderToggle.addEventListener('change', () => {
      placeholderToggle.dataset.userTouched = '1';
    });
  }
  addMicBtn      = document.getElementById('addMicBtn');
  addMicStatus   = document.getElementById('addMicStatus');
  addAutoAddEl   = document.getElementById('addAutoAdd');

  try {
    autoAddEnabled = localStorage.getItem(AUTOADD_KEY) === '1';
  } catch (e) { autoAddEnabled = false; }
  if (addAutoAddEl) {
    addAutoAddEl.checked = autoAddEnabled;
    addAutoAddEl.addEventListener('change', () => {
      autoAddEnabled = !!addAutoAddEl.checked;
      try { localStorage.setItem(AUTOADD_KEY, autoAddEnabled ? '1' : '0'); } catch (e) {}
    });
  }

  fetchSets().then(sets => {
    validSets = new Set((sets || []).map(s => s.code.toLowerCase()));
  }).catch(() => {});

  document.querySelectorAll('.add-tab').forEach(btn => {
    btn.addEventListener('click', () => setAddMode(btn.dataset.addMode));
  });

  // Language: clicking the "+" reveals the free-form input. Typing in it
  // un-checks the radio so the value-getter falls through to the input.
  const addLanguageAdd = document.getElementById('addLanguageAdd');
  const addLanguageOther = document.getElementById('addLanguageOther');
  if (addLanguageAdd && addLanguageOther) {
    addLanguageAdd.addEventListener('click', () => {
      addLanguageOther.classList.add('visible');
      addLanguageOther.focus();
    });
    addLanguageOther.addEventListener('input', () => {
      if (!addLanguageOther.value.trim()) return;
      document.querySelectorAll('input[name="addLanguage"]').forEach(r => { r.checked = false; });
    });
  }

  // Location pills + "+ new" delegated click.
  const pillsEl = document.getElementById('addLocationPills');
  if (pillsEl) {
    pillsEl.addEventListener('click', e => {
      if (e.target.closest('#addLocationNewBtn')) {
        setLocationNewMode();
        return;
      }
      const btn = e.target.closest('.location-pill-btn');
      if (!btn) return;
      setSelectedLocation({ type: btn.dataset.locType, name: btn.dataset.locName });
    });
  }
  // Typing a name while in new mode keeps us in new mode (no-op needed —
  // the picker stays unchanged). Clearing the name is fine too.

  // Name autocomplete
  addNameInput.addEventListener('input', () => {
    const q = addNameInput.value.trim();
    clearTimeout(acDebounce);
    if (q.length < 2) { hideAcList(); hidePrintingPicker(); return; }
    acDebounce = setTimeout(() => fetchAcSuggestions(q), 180);
  });

  if (addPrintingListEl) {
    addPrintingListEl.addEventListener('click', (e) => {
      const li = e.target.closest('.printing-row');
      if (!li) return;
      const idx = parseInt(li.dataset.index, 10);
      if (Number.isNaN(idx)) return;
      selectPrinting(idx);
    });
  }

  addNameInput.addEventListener('keydown', (e) => {
    const open = addNameList.classList.contains('active');
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      acIndex = Math.min(acItems.length - 1, acIndex + 1);
      highlightAc();
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      acIndex = Math.max(-1, acIndex - 1);
      highlightAc();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && acIndex >= 0 && acIndex < acItems.length) pickName(acItems[acIndex]);
      else if (addNameInput.value.trim()) pickName(addNameInput.value.trim());
    } else if (e.key === 'Escape' && open) {
      hideAcList();
    }
  });

  addNameInput.addEventListener('blur', () => {
    setTimeout(hideAcList, 150);
  });

  addNameList.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    pickName(li.textContent);
  });

  addCancelBtn.addEventListener('click', () => {
    hideAddPreview();
    if (addMode === 'name') addNameInput.focus();
    else addMicBtn.focus();
  });

  addBtn.addEventListener('click', addCardFromPreview);

  document.getElementById('addFlipBtn').addEventListener('click', () => {
    const showingBack = addPreviewImg.dataset.current === 'back';
    if (showingBack) {
      addPreviewImg.src = addPreviewImg.dataset.front;
      addPreviewImg.dataset.current = 'front';
    } else if (addPreviewImg.dataset.back) {
      addPreviewImg.src = addPreviewImg.dataset.back;
      addPreviewImg.dataset.current = 'back';
    }
  });

  addPreviewImg.addEventListener('click', () => {
    if (!addPreviewImg.src) return;
    const front = addPreviewImg.dataset.front || addPreviewImg.src;
    const back = addPreviewImg.dataset.back || null;
    showImageLightbox(front, back);
  });
  addQtyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCardFromPreview(); }
  });
  addLocationNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCardFromPreview(); }
  });

  // ---- Voice ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    voiceRecognition = new SR();
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-US';
    voiceRecognition.onresult = (event) => {
      let final = '', interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t + ' ';
        else interim += t;
      }
      if (final.trim()) {
        voicePending += final;
        addMicStatus.innerHTML = '<strong>heard:</strong> ' + esc(voicePending.trim());
        clearTimeout(voiceDebounce);
        voiceDebounce = setTimeout(() => {
          const text = voicePending.trim();
          voicePending = '';
          if (text.length > 1) parseVoice(text);
        }, VOICE_DEBOUNCE_MS);
      }
      if (interim) {
        addMicStatus.innerHTML = '<strong>...</strong> ' + esc((voicePending + interim).trim());
      }
    };
    voiceRecognition.onend = () => {
      if (voiceListening) { try { voiceRecognition.start(); } catch (e) {} }
    };
    voiceRecognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        addMicStatus.textContent = 'mic access denied — allow and reload';
      }
    };
  }

  addMicBtn.addEventListener('click', () => {
    if (!voiceRecognition) {
      addMicStatus.textContent = 'voice not supported in this browser';
      return;
    }
    if (voiceListening) {
      voiceListening = false;
      voiceRecognition.stop();
      addMicBtn.className = 'mic-btn off';
      addMicBtn.textContent = 'start listening';
      addMicStatus.textContent = 'mic off';
    } else {
      voiceListening = true;
      voiceRecognition.start();
      addMicBtn.className = 'mic-btn on';
      addMicBtn.textContent = 'stop';
      addMicStatus.textContent = 'listening...';
    }
  });
}
