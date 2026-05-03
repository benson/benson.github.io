import {
  normalizeCondition,
  normalizeContainers,
  normalizeDeckBoard,
  normalizeFinish,
  normalizeLanguage,
  normalizeLocation,
  normalizeTags,
} from './collection.js';

export const APP_STORAGE_SCHEMA_VERSION = 1;
const VALID_STORED_VIEW_MODES = ['collection', 'decks', 'storage'];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNullableNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeStringArray(raw, fallback = null) {
  if (!Array.isArray(raw)) return fallback;
  return raw.map(v => String(v)).filter(Boolean);
}

export function normalizeStoredViewMode(raw) {
  if (VALID_STORED_VIEW_MODES.includes(raw)) return raw;
  if (raw === 'locations') return 'storage';
  return 'collection';
}

export function normalizeStoredUi(raw = {}) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    viewMode: normalizeStoredViewMode(source.viewMode),
    viewAsList: Boolean(source.viewAsList),
    selectedFormat: typeof source.selectedFormat === 'string' ? source.selectedFormat : '',
    sortField: typeof source.sortField === 'string' && source.sortField ? source.sortField : null,
    sortDir: source.sortDir === 'desc' ? 'desc' : 'asc',
  };
}

export function normalizeStoredCollectionEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const location = normalizeLocation(raw.location);
  const out = {
    ...raw,
    name: String(raw.name || ''),
    setCode: String(raw.setCode || '').toLowerCase(),
    setName: String(raw.setName || ''),
    cn: String(raw.cn || ''),
    finish: normalizeFinish(raw.finish),
    qty: Math.max(1, parseInt(raw.qty, 10) || 1),
    condition: normalizeCondition(raw.condition),
    language: normalizeLanguage(raw.language),
    location,
    scryfallId: String(raw.scryfallId || ''),
    rarity: String(raw.rarity || '').toLowerCase(),
    price: normalizeNullableNumber(raw.price),
    priceFallback: Boolean(raw.priceFallback),
    tags: normalizeTags(raw.tags),
    imageUrl: raw.imageUrl == null ? null : String(raw.imageUrl),
    backImageUrl: raw.backImageUrl == null ? null : String(raw.backImageUrl),
    cmc: normalizeNullableNumber(raw.cmc),
    colors: normalizeStringArray(raw.colors, raw.colors == null ? null : []),
    colorIdentity: normalizeStringArray(raw.colorIdentity, raw.colorIdentity == null ? undefined : []),
    typeLine: raw.typeLine == null ? null : String(raw.typeLine),
    resolvedName: raw.resolvedName == null ? null : String(raw.resolvedName),
    scryfallUri: raw.scryfallUri == null ? null : String(raw.scryfallUri),
  };

  if (location?.type === 'deck') out.deckBoard = normalizeDeckBoard(raw.deckBoard);
  else delete out.deckBoard;
  if (out.colorIdentity === undefined) delete out.colorIdentity;
  return out;
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
