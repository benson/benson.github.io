import {
  fetchSets,
  fetchCardByCollectorNumber,
  getCardFinishes,
} from '../shared/mtg.js';
import { state, SCRYFALL_API } from './state.js';
import { esc, showFeedback, hideFeedback } from './feedback.js';
import {
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  normalizeLocation,
  getCardImageUrl,
  getCardBackImageUrl,
  ensureContainer,
  addToDeckList,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { showImageLightbox } from './ui/cardPreview.js';
import { recordEvent } from './changelog.js';
import { getMultiselectValue } from './multiselect.js';
import { parseVoiceText } from './voiceParser.js';
import { getActiveLocation } from './routeState.js';
import { createAddLocationPicker } from './addLocationPicker.js';
import { renderPrintingList as renderPrintingListView } from './addPrintingView.js';
import { buildCollectionEntryFromCard, mergeEntryIntoCollection } from './addEntry.js';
import { createAddOptionControls } from './addOptions.js';
import { loadCardPrintings } from './addPrintingSearch.js';

// When a single container is the active filter, that's the user's
// implicit context — the add flow should default to dropping cards there.
function currentFilterLocation() {
  const active = getActiveLocation();
  if (active) return active;
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
let addOptionControls = null;

// ---- Location picker (existing-pills + inline-new) ----
let locationPicker = null;
let pendingSelectedLocation = null;

function syncDeckAddOptions() {
  const wrap = document.getElementById('addDeckOptions');
  if (!wrap) return;
  const loc = locationPicker?.readLocation() || null;
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

export function setSelectedLocation(loc) {
  if (locationPicker) locationPicker.setSelectedLocation(loc);
  else pendingSelectedLocation = loc;
}
let addBtn, addCancelBtn, addMicBtn, addMicStatus, addAutoAddEl;
let addPrintingPickerEl, addPrintingListEl, addPrintingCaptionEl;

// ---- Printings state ----
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

  const result = await loadCardPrintings({ name, signal });
  if (result.status === 'aborted') return;

  if (result.status === 'empty') {
    addPrintingCaptionEl.textContent = 'No printings found';
    showFeedback('no card found for ' + esc(name), 'error');
    return;
  }

  if (result.error) {
    showFeedback("couldn't load printings: " + esc(result.error.message || String(result.error)), 'error');
  } else {
    hideFeedback();
  }

  if (!result.printings.length) {
    hidePrintingPicker();
    return;
  }

  currentPrintings = result.printings;
  currentPrintingsName = name;
  printingsTotalCount = result.totalCount;
  printingsTruncated = result.truncated;
  renderPrintingList();
  selectPrinting(0);
}

function renderPrintingList() {
  renderPrintingListView({
    listEl: addPrintingListEl,
    captionEl: addPrintingCaptionEl,
    printings: currentPrintings,
    totalCount: printingsTotalCount,
    truncated: printingsTruncated,
  });
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
  const condition = normalizeCondition(addOptionControls.condition.value);
  const language = normalizeLanguage(addOptionControls.language.value);
  const qty = Math.max(1, voiceQtyOverride || 1);
  const location = normalizeLocation(voiceLocationOverride != null ? voiceLocationOverride : lastUsedLocation);

  commitVoiceAdd(card, { finish, qty, condition, language, location }, voiceCtx);

  voiceQtyOverride = null;
  voiceLocationOverride = null;
  voiceFoilFlag = false;
}

function commitVoiceAdd(card, opts, voiceCtx) {
  const entry = buildCollectionEntryFromCard(card, opts);
  const { key: k, before, created } = mergeEntryIntoCollection(state.collection, entry);

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
  const prevFinish = preserveFields ? addOptionControls.finish.value : null;
  const prevLocationSnapshot = preserveFields ? locationPicker?.snapshot() : null;
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

  addOptionControls.renderFinishRadios(card);
  addOptionControls.renderLanguageRadios('en');

  if (voiceFoilFlag) {
    addOptionControls.finish.value = 'foil';
    voiceFoilFlag = false;
  }

  addQtyInput.value = voiceQtyOverride && voiceQtyOverride > 0 ? voiceQtyOverride : 1;
  // Seed the location: voice override > current single-container filter > last-used.
  const seedSource = voiceLocationOverride != null
    ? voiceLocationOverride
    : (currentFilterLocation() || lastUsedLocation);
  locationPicker?.seed(seedSource);
  voiceQtyOverride = null;
  voiceLocationOverride = null;
  if (preserveFields) {
    if (prevQty != null && prevQty !== '') addQtyInput.value = prevQty;
    if (prevFinish) addOptionControls.finish.value = prevFinish;
    locationPicker?.restore(prevLocationSnapshot);
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
  const finish = normalizeFinish(addOptionControls.finish.value);
  const condition = normalizeCondition(addOptionControls.condition.value);
  const language = normalizeLanguage(addOptionControls.language.value);
  const qty = Math.max(1, parseInt(addQtyInput.value, 10) || 1);
  const location = locationPicker?.readLocation() || null;
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

  const entry = buildCollectionEntryFromCard(card, { finish, qty, condition, language, location });
  const { key: k, before, created } = mergeEntryIntoCollection(state.collection, entry);

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
  if (result.condition) addOptionControls.condition.value = result.condition;
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
  if (repeated.condition) addOptionControls.condition.value = repeated.condition;
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
  addLocationNameInput = document.getElementById('addLocationName');
  addOptionControls = createAddOptionControls({
    getCollection: () => state.collection,
  });
  locationPicker = createAddLocationPicker({
    getNameInput: () => addLocationNameInput,
    onChange: syncDeckAddOptions,
  });
  locationPicker.buildTypeRadios();
  // Initial render: empty finish (no card picked yet) + language radios from collection
  addOptionControls.renderLanguageRadios('en');
  locationPicker.render();
  if (pendingSelectedLocation) {
    locationPicker.setSelectedLocation(pendingSelectedLocation);
    pendingSelectedLocation = null;
  }
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

  addOptionControls.bindLanguageOther();

  locationPicker.bindPills();
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
