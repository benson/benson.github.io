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

export function normalizeLocation(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function normalizeLanguage(raw) {
  return String(raw || 'en').trim().toLowerCase() || 'en';
}

export function normalizeTag(raw) {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTags(rawList) {
  if (!rawList) return [];
  const out = new Set();
  for (const raw of rawList) {
    const t = normalizeTag(raw);
    if (t) out.add(t);
  }
  return Array.from(out);
}

// ---- Entry shape ----
export function makeEntry(data) {
  return {
    name: data.name || '',
    setCode: (data.setCode || '').toLowerCase(),
    setName: data.setName || '',
    cn: data.cn || '',
    finish: normalizeFinish(data.finish),
    qty: Math.max(1, parseInt(data.qty, 10) || 1),
    condition: normalizeCondition(data.condition),
    language: normalizeLanguage(data.language),
    location: normalizeLocation(data.location),
    scryfallId: data.scryfallId || '',
    rarity: (data.rarity || '').toLowerCase(),
    price: parseFloat(data.price) || null,
    priceFallback: Boolean(data.priceFallback),
    tags: normalizeTags(data.tags),
    imageUrl: null,
    cmc: null,
    colors: null,
    typeLine: null,
    resolvedName: null,
    scryfallUri: null,
  };
}

// ---- Keying + coalescing ----
export function collectionKey(c) {
  return (c.scryfallId || (c.setCode + ':' + c.cn + ':' + c.name)) + ':' + c.finish + ':' + c.condition + ':' + c.language + ':' + normalizeLocation(c.location);
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

export function biggerImageUrl(url) {
  if (!url) return url;
  return url.replace('/normal/', '/large/');
}
