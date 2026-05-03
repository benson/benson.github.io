import { state } from './state.js';

// ---- Normalizers ----
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

export const LOCATION_TYPES = ['deck', 'binder', 'box'];
export const DEFAULT_LOCATION_TYPE = 'box';
export const DECK_BOARDS = ['main', 'sideboard', 'maybe'];
export const DEFAULT_DECK_BOARD = 'main';

// Parses a freeform string like "deck breya", "deck:breya", or "breya" into
// a typed location. The type prefix is optional — bare names default to box.
export function parseLocationString(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  // Bare type word like "binder" or "deck" — treat as that type with same name.
  if (LOCATION_TYPES.includes(s)) return { type: s, name: s };
  const m = s.match(/^(deck|binder|box)[\s:]+(.+)$/);
  if (m) {
    const name = m[2].trim();
    return name ? { type: m[1], name } : null;
  }
  return { type: DEFAULT_LOCATION_TYPE, name: s };
}

// Accepts string (freeform), {type, name}, or null/undefined/''.
// Returns null or a normalized {type, name}.
export function normalizeLocation(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return parseLocationString(raw);
  if (typeof raw === 'object') {
    const name = String(raw.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) return null;
    const type = LOCATION_TYPES.includes(raw.type) ? raw.type : DEFAULT_LOCATION_TYPE;
    return { type, name };
  }
  return null;
}

// Stable serialization for collectionKey + filter dedup. Returns "" for null.
export function locationKey(loc) {
  const n = normalizeLocation(loc);
  return n ? n.type + ':' + n.name : '';
}

export function containerKey(container) {
  return locationKey(container);
}

export function defaultDeckMetadata(name = '') {
  return {
    title: name || '',
    description: '',
    format: '',
    commander: '',
    commanderScryfallId: '',
    commanderScryfallUri: '',
    commanderImageUrl: '',
    commanderBackImageUrl: '',
    partner: '',
    partnerScryfallId: '',
    partnerScryfallUri: '',
    partnerImageUrl: '',
    partnerBackImageUrl: '',
    companion: '',
  };
}

export function normalizeDeckBoard(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return DECK_BOARDS.includes(v) ? v : DEFAULT_DECK_BOARD;
}

// A decklist entry is the logical "this is in the deck" record. Independent
// from physical location: the same scryfallId can appear in a decklist while
// the physical card sits in a different container (or isn't owned at all).
export function normalizeDeckListEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scryfallId = String(raw.scryfallId || '').trim();
  if (!scryfallId) return null;
  return {
    scryfallId,
    qty: Math.max(1, parseInt(raw.qty, 10) || 1),
    board: normalizeDeckBoard(raw.board),
    name: String(raw.name || '').trim(),
    setCode: String(raw.setCode || '').toLowerCase(),
    cn: String(raw.cn || '').trim(),
    imageUrl: String(raw.imageUrl || '').trim(),
    backImageUrl: String(raw.backImageUrl || '').trim(),
    rarity: String(raw.rarity || '').toLowerCase(),
    cmc: raw.cmc ?? null,
    typeLine: String(raw.typeLine || ''),
    colors: Array.isArray(raw.colors) ? [...raw.colors] : [],
    colorIdentity: Array.isArray(raw.colorIdentity) ? [...raw.colorIdentity] : [],
  };
}

export function normalizeDeckList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeDeckListEntry).filter(Boolean);
}

// Stable identity for a decklist entry. We keep separate rows for different
// boards (so "Sol Ring main" and "Sol Ring sideboard" are independent), but
// the same (scryfallId, board) tuple coalesces qty.
export function deckListEntryKey(entry) {
  return entry.scryfallId + '|' + normalizeDeckBoard(entry.board);
}

export function addToDeckList(container, entry) {
  if (!container || container.type !== 'deck') return null;
  if (!Array.isArray(container.deckList)) container.deckList = [];
  const norm = normalizeDeckListEntry(entry);
  if (!norm) return null;
  const k = deckListEntryKey(norm);
  const existing = container.deckList.find(e => deckListEntryKey(e) === k);
  if (existing) {
    existing.qty += norm.qty;
    if (norm.imageUrl && !existing.imageUrl) existing.imageUrl = norm.imageUrl;
    if (norm.backImageUrl && !existing.backImageUrl) existing.backImageUrl = norm.backImageUrl;
    if (norm.name && !existing.name) existing.name = norm.name;
    if (norm.setCode && !existing.setCode) existing.setCode = norm.setCode;
    if (norm.cn && !existing.cn) existing.cn = norm.cn;
    return existing;
  }
  container.deckList.push(norm);
  return norm;
}

export function removeFromDeckList(container, scryfallId, board) {
  if (!container || !Array.isArray(container.deckList)) return false;
  const target = scryfallId + '|' + normalizeDeckBoard(board);
  const before = container.deckList.length;
  container.deckList = container.deckList.filter(e => deckListEntryKey(e) !== target);
  return container.deckList.length < before;
}

export function moveDeckListEntryBoard(container, scryfallId, fromBoard, toBoard) {
  if (!container || !Array.isArray(container.deckList)) return false;
  const fromKey = scryfallId + '|' + normalizeDeckBoard(fromBoard);
  const entry = container.deckList.find(e => deckListEntryKey(e) === fromKey);
  if (!entry) return false;
  const target = normalizeDeckBoard(toBoard);
  if (entry.board === target) return false;
  // If a different entry already exists on the target board, merge qty
  const merge = container.deckList.find(e =>
    e !== entry && e.scryfallId === scryfallId && e.board === target
  );
  if (merge) {
    merge.qty += entry.qty;
    container.deckList = container.deckList.filter(e => e !== entry);
  } else {
    entry.board = target;
  }
  return true;
}

// Resolve a decklist against the inventory. For each decklist entry, return
// matching inventory entries (by scryfallId) so the deck view can render the
// card image + show where it physically is.
export function resolveDeckListEntry(entry, collection) {
  const matches = collection.filter(c => c && c.scryfallId === entry.scryfallId);
  // Prefer entries already physically in this deck (location.type === 'deck')
  // for the visual + finish display.
  const sorted = matches.slice().sort((a, b) => {
    const aDeck = normalizeLocation(a.location)?.type === 'deck' ? 0 : 1;
    const bDeck = normalizeLocation(b.location)?.type === 'deck' ? 0 : 1;
    return aDeck - bDeck;
  });
  const ownedQty = sorted.reduce((s, c) => s + (c.qty || 0), 0);
  return {
    entry,
    inventory: sorted,
    primary: sorted[0] || null,
    ownedQty,
    needed: Math.max(0, entry.qty - ownedQty),
    placeholder: ownedQty === 0,
  };
}

export function makeContainer(raw, now = Date.now()) {
  const loc = normalizeLocation(raw);
  if (!loc) return null;
  const out = {
    type: loc.type,
    name: loc.name,
    createdAt: now,
    updatedAt: now,
  };
  if (loc.type === 'deck') {
    out.deck = {
      ...defaultDeckMetadata(loc.name),
      ...(raw && typeof raw.deck === 'object' && !Array.isArray(raw.deck) ? raw.deck : {}),
    };
    out.deckList = normalizeDeckList(raw && raw.deckList);
    // Sharing state (auto-mirror): set when the user clicks "share". The ID
    // alone is the capability; the worker accepts PUT/DELETE from anyone
    // with it. Cleared on "stop sharing".
    if (typeof raw?.shareId === 'string' && raw.shareId) out.shareId = raw.shareId;
    if (raw?.shareIncludeTags) out.shareIncludeTags = true;
    out.deck.title = String(out.deck.title || loc.name);
    out.deck.description = String(out.deck.description || '');
    out.deck.format = String(out.deck.format || '');
    out.deck.commander = String(out.deck.commander || '');
    out.deck.commanderScryfallId = String(out.deck.commanderScryfallId || '');
    out.deck.commanderScryfallUri = String(out.deck.commanderScryfallUri || '');
    out.deck.commanderImageUrl = String(out.deck.commanderImageUrl || '');
    out.deck.commanderBackImageUrl = String(out.deck.commanderBackImageUrl || '');
    out.deck.partner = String(out.deck.partner || '');
    out.deck.partnerScryfallId = String(out.deck.partnerScryfallId || '');
    out.deck.partnerScryfallUri = String(out.deck.partnerScryfallUri || '');
    out.deck.partnerImageUrl = String(out.deck.partnerImageUrl || '');
    out.deck.partnerBackImageUrl = String(out.deck.partnerBackImageUrl || '');
    out.deck.companion = String(out.deck.companion || '');
  }
  return out;
}

export function ensureContainer(raw, now = Date.now()) {
  const container = makeContainer(raw, now);
  if (!container) return null;
  const key = containerKey(container);
  const existing = state.containers && state.containers[key];
  if (existing) {
    existing.type = container.type;
    existing.name = container.name;
    if (container.type === 'deck') {
      existing.deck = {
        ...defaultDeckMetadata(container.name),
        ...(existing.deck && typeof existing.deck === 'object' ? existing.deck : {}),
      };
      if (!existing.deck.title) existing.deck.title = container.name;
      if (!Array.isArray(existing.deckList)) existing.deckList = [];
      // Preserve sharing state — only stamp from raw if not already set, so
      // calls without a shareId don't clobber an active share.
      if (container.shareId && !existing.shareId) existing.shareId = container.shareId;
      if (container.shareIncludeTags) existing.shareIncludeTags = true;
    }
    if (!existing.createdAt) existing.createdAt = container.createdAt;
    if (!existing.updatedAt) existing.updatedAt = container.updatedAt;
    return existing;
  }
  if (!state.containers || typeof state.containers !== 'object' || Array.isArray(state.containers)) {
    state.containers = {};
  }
  state.containers[key] = container;
  return container;
}

export function normalizeContainers(rawContainers = {}) {
  const out = {};
  if (!rawContainers || typeof rawContainers !== 'object' || Array.isArray(rawContainers)) return out;
  for (const raw of Object.values(rawContainers)) {
    const createdAt = raw?.createdAt || Date.now();
    const c = makeContainer(raw, raw?.updatedAt || createdAt);
    if (!c) continue;
    c.createdAt = createdAt;
    c.updatedAt = raw.updatedAt || c.updatedAt;
    if (c.type === 'deck' && raw.deck && typeof raw.deck === 'object') {
      c.deck = {
        ...defaultDeckMetadata(c.name),
        ...raw.deck,
      };
      c.deck.title = String(c.deck.title || c.name);
      c.deck.description = String(c.deck.description || '');
      c.deck.format = String(c.deck.format || '');
      c.deck.commander = String(c.deck.commander || '');
      c.deck.commanderScryfallId = String(c.deck.commanderScryfallId || '');
      c.deck.commanderScryfallUri = String(c.deck.commanderScryfallUri || '');
      c.deck.commanderImageUrl = String(c.deck.commanderImageUrl || '');
      c.deck.commanderBackImageUrl = String(c.deck.commanderBackImageUrl || '');
      c.deck.partner = String(c.deck.partner || '');
      c.deck.partnerScryfallId = String(c.deck.partnerScryfallId || '');
      c.deck.partnerScryfallUri = String(c.deck.partnerScryfallUri || '');
      c.deck.partnerImageUrl = String(c.deck.partnerImageUrl || '');
      c.deck.partnerBackImageUrl = String(c.deck.partnerBackImageUrl || '');
      c.deck.companion = String(c.deck.companion || '');
      c.deckList = normalizeDeckList(c.deckList);
    }
    out[containerKey(c)] = c;
  }
  return out;
}

export function ensureContainersForCollection(collection = state.collection) {
  for (const c of collection || []) {
    const loc = normalizeLocation(c.location);
    if (loc) {
      ensureContainer(loc);
      if (loc.type === 'deck') c.deckBoard = normalizeDeckBoard(c.deckBoard);
      else if (Object.prototype.hasOwnProperty.call(c, 'deckBoard')) delete c.deckBoard;
    }
  }
}

// Display label "type:name" used in filter dropdowns + datalist suggestions.
export function formatLocationLabel(loc) {
  const n = normalizeLocation(loc);
  return n ? n.type + ':' + n.name : '';
}

export function normalizeLanguage(raw) {
  return String(raw || 'en').trim().toLowerCase() || 'en';
}

export function normalizeTag(raw) {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTags(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = new Set();
  for (const raw of rawList) {
    const t = normalizeTag(raw);
    if (t) out.add(t);
  }
  return Array.from(out);
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

function normalizeObject(raw, fallback = {}) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : fallback;
}

// ---- Entry shape ----
export function normalizeCollectionEntry(data = {}, { preserveResolvedFields = false } = {}) {
  const location = normalizeLocation(data.location);
  const entry = {
    name: String(data.name || ''),
    setCode: String(data.setCode || '').toLowerCase(),
    setName: String(data.setName || ''),
    cn: String(data.cn || ''),
    finish: normalizeFinish(data.finish),
    qty: Math.max(1, parseInt(data.qty, 10) || 1),
    condition: normalizeCondition(data.condition),
    language: normalizeLanguage(data.language),
    location,
    scryfallId: String(data.scryfallId || ''),
    rarity: String(data.rarity || '').toLowerCase(),
    price: normalizeNullableNumber(data.price),
    priceFallback: Boolean(data.priceFallback),
    tags: normalizeTags(data.tags),
    deckBoard: location?.type === 'deck' ? normalizeDeckBoard(data.deckBoard) : undefined,
    imageUrl: null,
    backImageUrl: null,
    cmc: null,
    colors: null,
    colorIdentity: [],
    typeLine: null,
    oracleText: '',
    legalities: {},
    resolvedName: null,
    scryfallUri: null,
  };

  if (preserveResolvedFields) {
    entry.imageUrl = data.imageUrl == null ? null : String(data.imageUrl);
    entry.backImageUrl = data.backImageUrl == null ? null : String(data.backImageUrl);
    entry.cmc = normalizeNullableNumber(data.cmc);
    entry.colors = normalizeStringArray(data.colors, data.colors == null ? null : []);
    entry.colorIdentity = normalizeStringArray(data.colorIdentity, []);
    entry.typeLine = data.typeLine == null ? null : String(data.typeLine);
    entry.oracleText = data.oracleText == null ? '' : String(data.oracleText);
    entry.legalities = normalizeObject(data.legalities);
    entry.resolvedName = data.resolvedName == null ? null : String(data.resolvedName);
    entry.scryfallUri = data.scryfallUri == null ? null : String(data.scryfallUri);
    if (data._source && typeof data._source === 'object' && !Array.isArray(data._source)) {
      entry._source = { ...data._source };
    }
  }

  if (location?.type !== 'deck') delete entry.deckBoard;
  return entry;
}

export function makeEntry(data) {
  return normalizeCollectionEntry(data);
}

// ---- Keying + coalescing ----
export function collectionKey(c) {
  const locKey = locationKey(c.location);
  const boardPart = locKey.startsWith('deck:') ? ':' + normalizeDeckBoard(c.deckBoard) : '';
  return (c.scryfallId || (c.setCode + ':' + c.cn + ':' + c.name)) + ':' + c.finish + ':' + c.condition + ':' + c.language + ':' + locKey + boardPart;
}

export function coalesceCollection() {
  const byKey = new Map();
  for (const c of state.collection) {
    const k = collectionKey(c);
    if (byKey.has(k)) {
      const survivor = byKey.get(k);
      survivor.qty += c.qty;
      survivor.tags = normalizeTags([...(survivor.tags || []), ...(c.tags || [])]);
    } else {
      if (normalizeLocation(c.location)?.type === 'deck') c.deckBoard = normalizeDeckBoard(c.deckBoard);
      byKey.set(k, c);
    }
  }
  state.collection = Array.from(byKey.values());
}

export function allCollectionTags() {
  const set = new Set();
  for (const c of state.collection) {
    if (!Array.isArray(c.tags)) continue;
    for (const t of c.tags) {
      if (t) set.add(t);
    }
  }
  return Array.from(set).sort();
}

// Returns deduped sorted list of {type, name} objects across the collection.
export function allCollectionLocations(collection = state.collection) {
  const byKey = new Map();
  for (const c of collection) {
    const loc = normalizeLocation(c.location);
    if (!loc) continue;
    const k = loc.type + ':' + loc.name;
    if (!byKey.has(k)) byKey.set(k, loc);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  );
}

export function allContainers() {
  ensureContainersForCollection();
  return Object.values(state.containers || {}).sort((a, b) =>
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  );
}

export function containerStats(container, collection = state.collection) {
  const key = containerKey(container);
  const cards = (collection || []).filter(c => locationKey(c.location) === key);
  return {
    unique: cards.length,
    total: cards.reduce((sum, c) => sum + (parseInt(c.qty, 10) || 0), 0),
    value: cards.reduce((sum, c) => sum + (c.price || 0) * (parseInt(c.qty, 10) || 0), 0),
  };
}

export function renameContainer(beforeRaw, afterRaw) {
  const before = normalizeLocation(beforeRaw);
  const after = normalizeLocation(afterRaw);
  if (!before || !after) return false;
  const beforeKey = locationKey(before);
  const afterKey = locationKey(after);
  if (beforeKey === afterKey) return true;

  const existing = state.containers?.[beforeKey];
  ensureContainer(after);
  if (existing && state.containers?.[afterKey]) {
    const target = state.containers[afterKey];
    target.createdAt = existing.createdAt || target.createdAt;
    target.updatedAt = Date.now();
    if (before.type === 'deck' && after.type === 'deck') {
      const previousDeck = existing.deck && typeof existing.deck === 'object' ? existing.deck : {};
      target.deck = {
        ...defaultDeckMetadata(after.name),
        ...previousDeck,
        title: !previousDeck.title || previousDeck.title === before.name ? after.name : previousDeck.title,
      };
      target.deckList = normalizeDeckList(existing.deckList);
      if (existing.shareId && !target.shareId) target.shareId = existing.shareId;
      if (existing.shareIncludeTags) target.shareIncludeTags = true;
    }
  }
  if (state.containers) delete state.containers[beforeKey];
  for (const c of state.collection) {
    if (locationKey(c.location) === beforeKey) c.location = { ...after };
  }
  return true;
}

export function deleteEmptyContainer(raw) {
  const loc = normalizeLocation(raw);
  if (!loc) return false;
  const key = locationKey(loc);
  if (state.collection.some(c => locationKey(c.location) === key)) return false;
  if (state.containers) delete state.containers[key];
  return true;
}

// Delete a container and clear the location on every card that was in it.
// Returns the number of cards whose location was cleared.
export function deleteContainerAndUnlocateCards(raw) {
  const loc = normalizeLocation(raw);
  if (!loc) return 0;
  const key = locationKey(loc);
  let cleared = 0;
  for (const c of state.collection) {
    if (locationKey(c.location) === key) {
      c.location = null;
      cleared++;
    }
  }
  if (state.containers) delete state.containers[key];
  return cleared;
}

// Build a `loc:` search token from a typed location (or legacy string).
export function quoteLocationForSearch(loc) {
  const label = typeof loc === 'string' ? loc : formatLocationLabel(loc);
  return /\s/.test(label) ? `"${label}"` : label;
}

// ---- Pricing ----
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

// ---- Image URLs ----
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

export function applyScryfallCardResolution(entry, card, { priceMode = 'fill' } = {}) {
  if (!entry || !card) return entry;
  entry.scryfallId = card.id || entry.scryfallId || '';
  entry.resolvedName = card.name || entry.resolvedName || entry.name || '';
  entry.setCode = card.set || entry.setCode || '';
  entry.setName = card.set_name || entry.setName || '';
  entry.cn = card.collector_number || entry.cn || '';
  entry.rarity = String(entry.rarity || card.rarity || '').toLowerCase();
  entry.cmc = card.cmc ?? null;
  entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
  entry.colorIdentity = card.color_identity || [];
  entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
  entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
  entry.legalities = card.legalities || {};
  entry.scryfallUri = card.scryfall_uri || '';
  entry.imageUrl = getCardImageUrl(card);
  entry.backImageUrl = getCardBackImageUrl(card);
  if (priceMode === 'replace' || !entry.price) {
    const priced = getUsdPrice(card, entry.finish);
    entry.price = priced.price;
    entry.priceFallback = priced.fallback;
  } else {
    entry.priceFallback = Boolean(entry.priceFallback);
  }
  return entry;
}

export function biggerImageUrl(url) {
  if (!url) return url;
  return url.replace('/normal/', '/large/');
}
