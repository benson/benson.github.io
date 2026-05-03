import { fetchSets } from '../shared/mtg.js';
import { state } from './state.js';
import { esc, showFeedback, hideFeedback } from './feedback.js';
import {
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  ensureContainer,
  addToDeckList,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { showImageLightbox } from './ui/cardPreview.js';
import { recordEvent } from './changelog.js';
import { getMultiselectValue } from './multiselect.js';
import { parseVoiceText } from './voiceParser.js';
import { getActiveLocation } from './routeState.js';
import { buildCollectionEntryFromCard, mergeEntryIntoCollection } from './addEntry.js';
import { createNameAutocomplete } from './addAutocomplete.js';
import {
  createAddLocationPicker,
  createAddOptionControls,
  createAddPrintingPicker,
  createTagChipEditor,
} from './cardEditor.js';
import {
  buildRepeatVoiceInput,
  buildVoiceAddOptions,
  lookupVoiceCard,
  resolveVoiceLookupTarget,
} from './addVoice.js';
import { buildDeckOwnershipReadout } from './addDeckOwnership.js';
import { buildAddPreviewCardModel, buildExistingPreviewText } from './addPreviewModel.js';
import { createAddSpeechRecognition } from './addSpeechRecognition.js';
import {
  buildDeckListEntryFromCard,
  buildInventoryAddEvent,
  buildLastAddInputFromCard,
  buildPlaceholderAddEvent,
  buildVoiceAddEvent,
} from './addCommitModel.js';

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
let nameAutocomplete = null;
let addPrintingPicker = null;
let addTagEditor = null;
let speechRecognition = null;

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
  const ownership = buildDeckOwnershipReadout({ collection: state.collection, card, location: loc });
  readout.textContent = ownership.text;
  readout.classList.toggle('placeholder-state', ownership.placeholderState);
  if (ph && !ph.dataset.userTouched) ph.checked = ownership.placeholderChecked;
}

export function setSelectedLocation(loc) {
  if (locationPicker) locationPicker.setSelectedLocation(loc);
  else pendingSelectedLocation = loc;
}
let addBtn, addCancelBtn, addMicBtn, addMicStatus, addAutoAddEl;

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

async function doVoiceLookup(userSet, userCn, variant = 'regular') {
  const target = resolveVoiceLookupTarget(userSet, userCn, variant);
  showFeedback('<span class="loading-spinner"></span> looking up ' + esc(target.set) + ' #' + esc(target.cn) + '...', 'info');
  const result = await lookupVoiceCard({ userSet, userCn, variant });
  if (!result.card) {
    const msg = 'no card found for ' + esc(userSet) + ' #' + esc(userCn);
    showFeedback(msg, 'error');
    voiceQtyOverride = null;
    voiceLocationOverride = null;
    voiceFoilFlag = false;
    return;
  }
  if (result.fallback) showFeedback('no ' + variant + ' variant found — showing regular printing', 'info');
  else hideFeedback();

  if (autoAddEnabled) {
    autoAddVoiceCard(result.card, { userSet, userCn, variant });
  } else {
    showAddPreview(result.card);
  }
}

function autoAddVoiceCard(card, voiceCtx) {
  const opts = buildVoiceAddOptions({
    card,
    wantsFoil: voiceFoilFlag,
    qtyOverride: voiceQtyOverride,
    locationOverride: voiceLocationOverride,
    lastUsedLocation,
    condition: addOptionControls.condition.value,
    language: addOptionControls.language.value,
  });

  commitVoiceAdd(card, opts, voiceCtx);

  voiceQtyOverride = null;
  voiceLocationOverride = null;
  voiceFoilFlag = false;
}

function commitVoiceAdd(card, opts, voiceCtx) {
  const entry = buildCollectionEntryFromCard(card, { ...opts, tags: addTagEditor?.getTags() || [] });
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
  recordEvent(buildVoiceAddEvent({ card, entry, opts, key: k, before, created }));
}

function showAddPreview(card, opts) {
  const preserveFields = !!(opts && opts.preserveFields);
  const prevQty = preserveFields ? addQtyInput.value : null;
  const prevFinish = preserveFields ? addOptionControls.finish.value : null;
  const prevLocationSnapshot = preserveFields ? locationPicker?.snapshot() : null;
  const prevTags = preserveFields ? addTagEditor?.getTags() : [];
  addPreviewCard = card;
  addPreviewEl.classList.add('active');
  const preview = buildAddPreviewCardModel(card);
  addPreviewImg.src = preview.imageUrl || '';
  addPreviewImg.alt = preview.name;
  addPreviewImg.style.cursor = preview.imageUrl ? 'zoom-in' : '';
  addPreviewImg.dataset.front = preview.imageUrl || '';
  addPreviewImg.dataset.back = preview.backUrl || '';
  addPreviewImg.dataset.current = 'front';
  addPreviewName.textContent = preview.name;
  addPreviewMeta.textContent = preview.meta;

  const flipBtn = document.getElementById('addFlipBtn');
  flipBtn.classList.toggle('hidden', !preview.backUrl);

  const existingEl = document.getElementById('addPreviewExisting');
  const existingText = buildExistingPreviewText(state.collection, card);
  if (existingText) {
    existingEl.textContent = existingText;
    existingEl.classList.remove('hidden');
  } else {
    existingEl.classList.add('hidden');
  }

  addOptionControls.renderFinishRadios(card, prevFinish || '');
  addOptionControls.renderLanguageRadios('en');
  addTagEditor?.setTags(prevTags || []);

  if (voiceFoilFlag) {
    if (document.querySelector('input[name="addFinish"][value="foil"]')) addOptionControls.finish.value = 'foil';
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
    locationPicker?.restore(prevLocationSnapshot);
  }
  addBtn.focus();
  syncDeckAddOptions();
}

function hideAddPreview() {
  addPreviewCard = null;
  addPreviewEl.classList.remove('active');
  addPrintingPicker?.hide();
}

function addCardFromPreview() {
  const card = addPreviewCard;
  if (!card) return;
  const finish = normalizeFinish(addOptionControls.finish.value);
  const condition = normalizeCondition(addOptionControls.condition.value);
  const language = normalizeLanguage(addOptionControls.language.value);
  const qty = Math.max(1, parseInt(addQtyInput.value, 10) || 1);
  const location = locationPicker?.readLocation() || null;
  addTagEditor?.commitInput();
  const tags = addTagEditor?.getTags() || [];
  const placeholderToggle = document.getElementById('addAsPlaceholder');
  const asPlaceholder = !!(placeholderToggle && placeholderToggle.checked && location?.type === 'deck');

  // When the destination is a deck, always update its decklist. Whether we
  // also create an inventory row is gated by the placeholder toggle.
  if (location?.type === 'deck') {
    const deck = ensureContainer({ type: 'deck', name: location.name });
    if (deck) {
      addToDeckList(deck, buildDeckListEntryFromCard(card, qty));
      deck.updatedAt = Date.now();
    }
  }

  if (asPlaceholder) {
    commitCollectionChange();
    lastUsedLocation = location;
    recordEvent(buildPlaceholderAddEvent(card, location));
    showFeedback('added placeholder for ' + card.name, 'success');
    hideAddPreview();
    return;
  }

  const entry = buildCollectionEntryFromCard(card, { finish, qty, condition, language, location, tags });
  const { key: k, before, created } = mergeEntryIntoCollection(state.collection, entry);

  commitCollectionChange();
  lastUsedLocation = location;
  if (addMode === 'cn') {
    lastAddInput = buildLastAddInputFromCard({ card, finish, condition, qty, location });
  }
  recordEvent(buildInventoryAddEvent({ card, entry, key: k, before, created }));

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
  const repeated = buildRepeatVoiceInput(lastAddInput, qty);
  if (!repeated) {
    showFeedback('no previous add to repeat', 'error');
    return;
  }
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
  const addPrintingPickerEl  = document.getElementById('addPrintingPicker');
  const addPrintingListEl    = document.getElementById('addPrintingList');
  const addPrintingCaptionEl = document.getElementById('addPrintingCaption');
  const addPrintingSearchEl  = document.getElementById('addPrintingSearch');
  addQtyInput     = document.getElementById('addQty');
  addLocationNameInput = document.getElementById('addLocationName');
  addOptionControls = createAddOptionControls({
    getCollection: () => state.collection,
  });
  addPrintingPicker = createAddPrintingPicker({
    pickerEl: addPrintingPickerEl,
    listEl: addPrintingListEl,
    captionEl: addPrintingCaptionEl,
    searchEl: addPrintingSearchEl,
    onSelect: showAddPreview,
    shouldPreserveFields: () => addPreviewCard != null,
  });
  nameAutocomplete = createNameAutocomplete({
    inputEl: addNameInput,
    listEl: addNameList,
    onPick: (name) => addPrintingPicker.load(name),
    onEmptyQuery: () => addPrintingPicker.hide(),
  });
  locationPicker = createAddLocationPicker({
    getNameInput: () => addLocationNameInput,
    onChange: syncDeckAddOptions,
  });
  addTagEditor = createTagChipEditor({
    chipsEl: document.getElementById('addTagChips'),
    inputEl: document.getElementById('addTagInput'),
    datalistEl: document.getElementById('addTagSuggestions'),
    getSuggestions: () => state.collection.flatMap(c => Array.isArray(c.tags) ? c.tags : []),
  });
  locationPicker.buildTypeRadios();
  // Initial render: empty finish (no card picked yet) + language radios from collection
  addOptionControls.renderLanguageRadios('en');
  locationPicker.render();
  addTagEditor.bind();
  addTagEditor.setTags([]);
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

  nameAutocomplete.bind();
  addPrintingPicker.bind();

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

  speechRecognition = createAddSpeechRecognition({
    micBtn: addMicBtn,
    statusEl: addMicStatus,
    onText: parseVoice,
  });
  speechRecognition.bind();
}
