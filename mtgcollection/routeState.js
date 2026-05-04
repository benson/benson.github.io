import { state } from './state.js';
import { locationKey, normalizeLocation } from './collection.js';
import { getMultiselectValue, setMultiselectValue } from './multiselect.js';

export const VALID_VIEW_MODES = ['collection', 'decks', 'storage'];

function locationFilterEl() {
  return typeof document === 'undefined' ? null : document.getElementById('filterLocation');
}

function currentUrl(locationObj = globalThis.location) {
  try {
    if (locationObj?.href) return new URL(locationObj.href);
    const pathname = locationObj?.pathname || '/mtgcollection/';
    const search = locationObj?.search || '';
    const hash = locationObj?.hash || '';
    return new URL(pathname + search + hash, 'https://example.com');
  } catch (e) {
    return new URL('/mtgcollection/', 'https://example.com');
  }
}

function routePathFromUrl(url) {
  return url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
}

export function syncRouteUrlFromState({
  historyObj = globalThis.history,
  locationObj = globalThis.location,
  replace = true,
} = {}) {
  if (!historyObj || !locationObj) return '';
  const url = currentUrl(locationObj);
  if (url.searchParams.get('share')) return '';
  const loc = getActiveLocation();
  if (loc) {
    url.searchParams.set('loc', locationKey(loc));
    url.searchParams.delete('view');
  } else if (state.viewMode && state.viewMode !== 'collection') {
    url.searchParams.set('view', state.viewMode);
    url.searchParams.delete('loc');
  } else {
    url.searchParams.delete('view');
    url.searchParams.delete('loc');
  }
  const path = routePathFromUrl(url);
  if (replace || typeof historyObj.pushState !== 'function') historyObj.replaceState(null, '', path);
  else historyObj.pushState(null, '', path);
  return path;
}

export function applyRouteStateFromUrl({
  locationObj = globalThis.location,
} = {}) {
  const url = currentUrl(locationObj);
  if (url.searchParams.get('share')) return false;
  const loc = normalizeLocation(url.searchParams.get('loc'));
  if (loc) {
    setActiveContainerRoute(loc, { updateUrl: false });
    return true;
  }
  const view = url.searchParams.get('view');
  if (VALID_VIEW_MODES.includes(view)) {
    setTopLevelViewMode(view, { updateUrl: false });
    return true;
  }
  setTopLevelViewMode('collection', { updateUrl: false });
  return false;
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

export function resetDeckWorkspaceLandingState() {
  state.deckMode = 'visual';
  state.deckBoardFilter = 'all';
  state.deckSampleHand = null;
}

function maybeResetDeckWorkspaceLandingState(previous, next) {
  if (next?.type !== 'deck') return;
  const previousKey = previous ? locationKey(previous) : '';
  const nextKey = next ? locationKey(next) : '';
  if (previousKey === nextKey) return;
  resetDeckWorkspaceLandingState();
}

export function clearActiveLocation() {
  state.activeLocation = null;
}

export function readActiveLocationFromFilter(el = locationFilterEl()) {
  const values = el ? getMultiselectValue(el) : [];
  return values.length === 1 ? normalizeLocation(values[0]) : null;
}

export function syncActiveLocationFromFilter(el = locationFilterEl()) {
  const previous = getActiveLocation();
  const next = setActiveLocation(readActiveLocationFromFilter(el));
  maybeResetDeckWorkspaceLandingState(previous, next);
  return next;
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

export function setTopLevelViewMode(mode, { syncFilter = true, updateUrl = true } = {}) {
  state.viewMode = VALID_VIEW_MODES.includes(mode) ? mode : 'collection';
  state.viewAsList = false;
  state.binderPage = 0;
  clearActiveLocation();
  if (syncFilter) syncLocationFilterFromActiveLocation();
  if (updateUrl) syncRouteUrlFromState();
  return state.viewMode;
}

export function setActiveContainerRoute(loc, { syncFilter = true, updateUrl = true } = {}) {
  const previous = getActiveLocation();
  const active = setActiveLocation(loc);
  state.viewMode = viewModeForLocation(active);
  state.viewAsList = false;
  state.binderPage = 0;
  maybeResetDeckWorkspaceLandingState(previous, active);
  if (syncFilter) syncLocationFilterFromActiveLocation();
  if (updateUrl) syncRouteUrlFromState();
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
    if (loc?.type === 'binder') return 'binder';
    if (loc?.type === 'box') return 'box';
    return 'storage-home';
  }
  return 'collection';
}
