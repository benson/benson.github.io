import { state } from './state.js';
import { locationKey, normalizeLocation } from './collection.js';
import { getMultiselectValue, setMultiselectValue } from './multiselect.js';

export const VALID_VIEW_MODES = ['collection', 'decks', 'storage'];

function locationFilterEl() {
  return typeof document === 'undefined' ? null : document.getElementById('filterLocation');
}

export function getActiveLocation() {
  const loc = normalizeLocation(state.activeLocation);
  state.activeLocation = loc;
  return loc;
}

export function getActiveLocationOfType(type) {
  const loc = getActiveLocation();
  return loc?.type === type ? loc : null;
}

export function setActiveLocation(loc) {
  state.activeLocation = normalizeLocation(loc);
  return state.activeLocation;
}

export function clearActiveLocation() {
  state.activeLocation = null;
}

export function readActiveLocationFromFilter(el = locationFilterEl()) {
  const values = el ? getMultiselectValue(el) : [];
  return values.length === 1 ? normalizeLocation(values[0]) : null;
}

export function syncActiveLocationFromFilter(el = locationFilterEl()) {
  return setActiveLocation(readActiveLocationFromFilter(el));
}

export function syncLocationFilterFromActiveLocation(el = locationFilterEl()) {
  if (!el) return;
  const loc = getActiveLocation();
  setMultiselectValue(el, loc ? [locationKey(loc)] : []);
}

function viewModeForLocation(loc) {
  if (loc?.type === 'deck') return 'decks';
  if (loc?.type === 'binder' || loc?.type === 'box') return 'storage';
  return 'collection';
}

export function setTopLevelViewMode(mode, { syncFilter = true } = {}) {
  state.viewMode = VALID_VIEW_MODES.includes(mode) ? mode : 'collection';
  state.viewAsList = false;
  state.binderPage = 0;
  clearActiveLocation();
  if (syncFilter) syncLocationFilterFromActiveLocation();
  return state.viewMode;
}

export function setActiveContainerRoute(loc, { syncFilter = true } = {}) {
  const active = setActiveLocation(loc);
  state.viewMode = viewModeForLocation(active);
  state.viewAsList = false;
  state.binderPage = 0;
  if (syncFilter) syncLocationFilterFromActiveLocation();
  return active;
}

export function getEffectiveShape() {
  if (state.shareSnapshot) return 'deck';
  if (state.viewMode === 'collection') return 'collection';
  const loc = getActiveLocation();
  if (state.viewMode === 'decks') {
    return loc?.type === 'deck' ? 'deck' : 'decks-home';
  }
  if (state.viewMode === 'storage') {
    if (loc?.type === 'binder') return state.viewAsList ? 'box' : 'binder';
    if (loc?.type === 'box') return 'box';
    return 'storage-home';
  }
  return 'collection';
}
