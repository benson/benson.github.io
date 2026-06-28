import {
  normalizeCollectionEntry,
  normalizeContainers,
} from './collection.js';

export const APP_STORAGE_SCHEMA_VERSION = 1;
const VALID_STORED_VIEW_MODES = ['collection', 'decks', 'storage'];
const VALID_COLLECTION_DISPLAY_MODES = ['table', 'visual'];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeStoredViewMode(raw) {
  if (VALID_STORED_VIEW_MODES.includes(raw)) return raw;
  if (raw === 'locations') return 'storage';
  return 'collection';
}

export function normalizeStoredCollectionDisplayMode(raw) {
  return VALID_COLLECTION_DISPLAY_MODES.includes(raw) ? raw : 'table';
}

export function normalizeStoredUi(raw = {}) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    viewMode: normalizeStoredViewMode(source.viewMode),
    viewAsList: Boolean(source.viewAsList),
    collectionDisplayMode: normalizeStoredCollectionDisplayMode(source.collectionDisplayMode),
    selectedFormat: typeof source.selectedFormat === 'string' ? source.selectedFormat : '',
    sortField: typeof source.sortField === 'string' && source.sortField ? source.sortField : null,
    sortDir: source.sortDir === 'desc' ? 'desc' : 'asc',
  };
}

export function normalizeStoredCollectionEntry(raw) {
  if (!isPlainObject(raw)) return null;
  return normalizeCollectionEntry(raw, { preserveResolvedFields: true });
}

export function normalizeStoredCollection(rawCollection) {
  if (!Array.isArray(rawCollection)) return null;
  return rawCollection.map(normalizeStoredCollectionEntry).filter(Boolean);
}

export function normalizeStoredAppData(raw) {
  if (!isPlainObject(raw)) return null;
  const rawVersion = raw.schemaVersion;
  if (
    rawVersion != null
    && rawVersion !== APP_STORAGE_SCHEMA_VERSION
    && rawVersion !== String(APP_STORAGE_SCHEMA_VERSION)
  ) {
    return null;
  }

  const collection = normalizeStoredCollection(raw.collection);
  if (!collection) return null;

  return {
    schemaVersion: APP_STORAGE_SCHEMA_VERSION,
    collection,
    containers: normalizeContainers(raw.containers),
    ui: normalizeStoredUi(isPlainObject(raw.ui) ? raw.ui : raw),
  };
}

export function serializeAppState(stateRef) {
  return {
    schemaVersion: APP_STORAGE_SCHEMA_VERSION,
    collection: Array.isArray(stateRef.collection) ? stateRef.collection : [],
    containers: isPlainObject(stateRef.containers) ? stateRef.containers : {},
    ui: normalizeStoredUi(stateRef),
  };
}
