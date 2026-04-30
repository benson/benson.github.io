import {
  fetchSets,
  fetchCardByCollectorNumber,
  fetchCardByName,
  getCardFinishes,
} from 'https://bensonperry.com/shared/mtg.js';
import { state, SCRYFALL_API } from './state.js';
import { esc, showFeedback, hideFeedback } from './feedback.js';
import {
  makeEntry,
  collectionKey,
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  normalizeLocation,
  getCardImageUrl,
  getCardBackImageUrl,
  getUsdPrice,
} from './collection.js';
import { commitCollectionChange } from './persistence.js';
import { showImageLightbox } from './view.js';
import { snapshotCollection } from './bulk.js';

const ADD_CONDITIONS = [
  { value: 'near_mint',         label: 'near mint' },
  { value: 'lightly_played',    label: 'lightly played' },
  { value: 'moderately_played', label: 'moderately played' },
  { value: 'heavily_played',    label: 'heavily played' },
  { value: 'damaged',           label: 'damaged' },
];
const ADD_LANGUAGES = [
  { value: 'en',  label: 'english' },
  { value: 'ja',  label: 'japanese' },
  { value: 'de',  label: 'german' },
  { value: 'fr',  label: 'french' },
  { value: 'it',  label: 'italian' },
  { value: 'es',  label: 'spanish' },
  { value: 'pt',  label: 'portuguese' },
  { value: 'ru',  label: 'russian' },
  { value: 'ko',  label: 'korean' },
  { value: 'zhs', label: 'chinese (simplified)' },
  { value: 'zht', label: 'chinese (traditional)' },
];

let validSets = new Set();
let addPreviewCard = null;
let addMode = 'name';
let lastUsedLocation = '';
let voiceFoilFlag = false;

let addDetailsEl, addModeNameEl, addModeCnEl;
let addNameInput, addNameList;
let addPreviewEl, addPreviewImg, addPreviewName, addPreviewMeta;
let addFinishSel, addConditionSel, addLanguageSel, addQtyInput, addLocationInput;
let addBtn, addCancelBtn, addMicBtn, addMicStatus;

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

function setAddMode(mode) {
  addMode = mode;
  document.querySelectorAll('.add-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.addMode === mode);
  });
  addModeNameEl.classList.toggle('active', mode === 'name');
  addModeCnEl.classList.toggle('active', mode === 'cn');
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
  showFeedback('<span class="loading-spinner"></span> looking up ' + esc(name) + '...', 'info');
  const card = await fetchCardByName(name);
  if (!card) {
    showFeedback('no card found for ' + esc(name), 'error');
    return;
  }
  hideFeedback();
  showAddPreview(card);
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
    showFeedback('no card found for ' + esc(userSet) + ' #' + esc(userCn), 'error');
    return;
  }
  if (fallback) showFeedback('no ' + variant + ' variant found — showing regular printing', 'info');
  else hideFeedback();
  showAddPreview(card);
}

function showAddPreview(card) {
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

  addFinishSel.innerHTML = '';
  const finishes = getCardFinishes(card);
  for (const f of finishes) {
    const value = f.finish === 'nonfoil' ? 'normal' : f.finish;
    const priceStr = f.price ? ' ($' + f.price + ')' : '';
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = (f.label + priceStr).toLowerCase();
    addFinishSel.appendChild(opt);
  }

  if (voiceFoilFlag) {
    for (const opt of addFinishSel.options) {
      if (opt.value === 'foil') { addFinishSel.value = 'foil'; break; }
    }
    voiceFoilFlag = false;
  }

  addQtyInput.value = 1;
  addLocationInput.value = lastUsedLocation || '';
  addBtn.focus();
}

function hideAddPreview() {
  addPreviewCard = null;
  addPreviewEl.classList.remove('active');
}

function addCardFromPreview() {
  const card = addPreviewCard;
  if (!card) return;
  const finish = normalizeFinish(addFinishSel.value);
  const condition = normalizeCondition(addConditionSel.value);
  const language = normalizeLanguage(addLanguageSel.value);
  const qty = Math.max(1, parseInt(addQtyInput.value, 10) || 1);
  const location = normalizeLocation(addLocationInput.value);

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

  snapshotCollection();
  const k = collectionKey(entry);
  const existing = state.collection.find(c => collectionKey(c) === k);
  if (existing) existing.qty += entry.qty;
  else state.collection.push(entry);

  commitCollectionChange();
  lastUsedLocation = location;
  showFeedback('added ' + esc(card.name) + ' (' + (card.set || '').toUpperCase() + ' #' + esc(card.collector_number) + ') <button class="undo-btn" type="button">undo</button>', 'success');

  hideAddPreview();
  if (addMode === 'name') {
    addNameInput.value = '';
    addNameInput.focus();
  } else {
    addMicBtn.focus();
  }
}

function smartParseSetCn(text) {
  const alnum = text.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!alnum) return null;
  if (validSets.size > 0) {
    for (let k = 5; k >= 2; k--) {
      const candidate = alnum.slice(0, k);
      const rest = alnum.slice(k);
      if (validSets.has(candidate) && /^\d+[a-z]?$/.test(rest)) {
        return { set: candidate, cn: rest };
      }
    }
    const m = alnum.match(/^([a-z]+)(\d)0(\d+)$/);
    if (m && m[3].length >= 1) {
      const setCode = m[1] + m[2] + m[3][0];
      const cn = m[3].slice(1);
      if (validSets.has(setCode) && cn.length > 0) return { set: setCode, cn };
    }
  }
  const m = text.match(/^\s*([a-z0-9]{2,5})\s+(\d{1,4}[a-z]?)\b/i);
  if (m) return { set: m[1].toLowerCase(), cn: m[2] };
  return null;
}

function parseVoice(text) {
  let clean = text.toLowerCase()
    .replace(/\b(um|uh|uhh|okay|ok)\b/g, '')
    .replace(/number\s*/g, '')
    .replace(/hashtag\s*/g, '')
    .replace(/pound\s*/g, '')
    .replace(/hash\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const hasFoil = KW_FOIL.test(clean); KW_FOIL.lastIndex = 0;
  let source = 'regular';
  if (KW_PRERELEASE.test(clean)) source = 'prerelease';
  else if (KW_PROMO.test(clean)) source = 'promo';
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

  const parsed = smartParseSetCn(stripped);
  if (!parsed) {
    showFeedback('couldn\'t parse "' + esc(text) + '" — say set code then number (e.g. "fin 142")', 'error');
    return;
  }
  addDetailsEl.open = true;
  if (addMode !== 'cn') setAddMode('cn');
  voiceFoilFlag = hasFoil;
  if (condition) addConditionSel.value = condition;
  doVoiceLookup(parsed.set, parsed.cn, source);
}

export function initAdd() {
  addDetailsEl  = document.getElementById('addDetails');
  addModeNameEl = document.getElementById('addModeName');
  addModeCnEl   = document.getElementById('addModeCn');
  addNameInput  = document.getElementById('addNameInput');
  addNameList   = document.getElementById('addNameSuggestions');
  addPreviewEl  = document.getElementById('addPreview');
  addPreviewImg = document.getElementById('addPreviewImg');
  addPreviewName = document.getElementById('addPreviewName');
  addPreviewMeta = document.getElementById('addPreviewMeta');
  addFinishSel    = document.getElementById('addFinish');
  addConditionSel = document.getElementById('addCondition');
  addLanguageSel  = document.getElementById('addLanguage');
  addQtyInput     = document.getElementById('addQty');
  addLocationInput = document.getElementById('addLocation');
  addBtn         = document.getElementById('addCardBtn');
  addCancelBtn   = document.getElementById('addCardCancel');
  addMicBtn      = document.getElementById('addMicBtn');
  addMicStatus   = document.getElementById('addMicStatus');

  for (const c of ADD_CONDITIONS) {
    const opt = document.createElement('option');
    opt.value = c.value; opt.textContent = c.label;
    addConditionSel.appendChild(opt);
  }
  for (const l of ADD_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = l.value; opt.textContent = l.label;
    addLanguageSel.appendChild(opt);
  }

  fetchSets().then(sets => {
    validSets = new Set((sets || []).map(s => s.code.toLowerCase()));
  }).catch(() => {});

  document.querySelectorAll('.add-tab').forEach(btn => {
    btn.addEventListener('click', () => setAddMode(btn.dataset.addMode));
  });

  // Name autocomplete
  addNameInput.addEventListener('input', () => {
    const q = addNameInput.value.trim();
    clearTimeout(acDebounce);
    if (q.length < 2) { hideAcList(); return; }
    acDebounce = setTimeout(() => fetchAcSuggestions(q), 180);
  });

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
  addLocationInput.addEventListener('keydown', e => {
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
