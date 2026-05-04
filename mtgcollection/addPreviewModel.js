import { getCardBackImageUrl, getCardImageUrl } from './collection.js';

function normalizedName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedSet(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedCollectorNumber(value) {
  return String(value || '').trim().toLowerCase();
}

function entryDisplayName(entry) {
  return entry?.resolvedName || entry?.name || '';
}

function cardDisplayName(card) {
  return card?.name || '';
}

export function isSamePreviewName(entry, card) {
  const name = normalizedName(cardDisplayName(card));
  return !!name && normalizedName(entryDisplayName(entry)) === name;
}

export function isSamePreviewPrinting(entry, card) {
  if (!entry || !card) return false;
  if (entry.scryfallId && card.id && entry.scryfallId === card.id) return true;
  if (!isSamePreviewName(entry, card)) return false;
  const entrySet = normalizedSet(entry.setCode || entry.set);
  const cardSet = normalizedSet(card.set || card.setCode);
  const entryCn = normalizedCollectorNumber(entry.cn || entry.collector_number);
  const cardCn = normalizedCollectorNumber(card.collector_number || card.cn);
  return !!entrySet && !!cardSet && !!entryCn && !!cardCn
    && entrySet === cardSet
    && entryCn === cardCn;
}

export function buildAddPreviewCardModel(card) {
  const imageUrl = getCardImageUrl(card);
  const backUrl = getCardBackImageUrl(card);
  return {
    name: card.name,
    imageUrl,
    backUrl,
    meta: [card.set_name, card.type_line, card.rarity].filter(Boolean).join(' \u2014 '),
  };
}

export function findExistingPreviewEntries(collection = [], card) {
  return collection.filter(c => isSamePreviewPrinting(c, card) || isSamePreviewName(c, card));
}

export function buildExistingPreviewSummary(collection = [], card) {
  const summary = { exactQty: 0, otherQty: 0, totalQty: 0, text: null };
  for (const entry of collection) {
    const exact = isSamePreviewPrinting(entry, card);
    const sameName = isSamePreviewName(entry, card);
    if (!exact && !sameName) continue;
    const qty = parseInt(entry.qty, 10) || 0;
    if (exact) summary.exactQty += qty;
    else summary.otherQty += qty;
  }
  summary.totalQty = summary.exactQty + summary.otherQty;
  if (summary.exactQty && summary.otherQty) {
    summary.text = 'this printing owned (\u00d7' + summary.exactQty + ') - other printings (\u00d7' + summary.otherQty + ')';
  } else if (summary.exactQty) {
    summary.text = 'this printing owned (\u00d7' + summary.exactQty + ')';
  } else if (summary.otherQty) {
    summary.text = 'other printings owned (\u00d7' + summary.otherQty + ')';
  }
  return summary;
}

export function buildExistingPreviewText(collection = [], card) {
  return buildExistingPreviewSummary(collection, card).text;
}
