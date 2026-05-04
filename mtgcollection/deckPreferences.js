import { state, DECK_GROUP_KEY, DECK_VIEW_PREFS_KEY } from './state.js';
import {
  VALID_DECK_CARD_SIZES,
  VALID_DECK_GROUPS,
  VALID_DECK_OWNERSHIP_VIEWS,
} from './deckUi.js';
import { defaultDeckExportOptions } from './deckExport.js';

export function loadDeckGroup(storage = localStorage) {
  try {
    const v = storage.getItem(DECK_GROUP_KEY);
    if (v && VALID_DECK_GROUPS.includes(v)) state.deckGroupBy = v;
  } catch (e) {}
}

export function saveDeckGroup(storage = localStorage) {
  try { storage.setItem(DECK_GROUP_KEY, state.deckGroupBy); } catch (e) {}
}

export function loadDeckPrefs(storage = localStorage) {
  try {
    const raw = storage.getItem(DECK_VIEW_PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (VALID_DECK_CARD_SIZES.includes(prefs.cardSize)) state.deckCardSize = prefs.cardSize;
    if (typeof prefs.showPrices === 'boolean') state.deckShowPrices = prefs.showPrices;
    if (VALID_DECK_OWNERSHIP_VIEWS.includes(prefs.ownershipView)) state.deckOwnershipView = prefs.ownershipView;
  } catch (e) {}
}

export function currentDeckPrefs() {
  return {
    cardSize: state.deckCardSize,
    showPrices: state.deckShowPrices,
    ownershipView: state.deckOwnershipView,
  };
}

export function saveDeckPrefs(storage = localStorage) {
  try {
    storage.setItem(DECK_VIEW_PREFS_KEY, JSON.stringify(currentDeckPrefs()));
  } catch (e) {}
}

export function deckExportOptionsFromForm(form) {
  const fd = new FormData(form);
  const preset = String(fd.get('preset') || 'moxfield');
  const boards = fd.getAll('board').map(v => String(v)).filter(v => ['main', 'sideboard', 'maybe'].includes(v));
  const defaults = defaultDeckExportOptions(preset);
  const options = {
    preset,
    boards: boards.length ? boards : defaults.boards,
    includeCommander: fd.get('includeCommander') === 'on',
  };
  if (fd.get('collapsePrintings') === 'on') options.collapsePrintings = true;
  return options;
}
