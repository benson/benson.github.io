import { fetchCardByCollectorNumber, getCardFinishes } from '../shared/mtg.js';
import { normalizeCondition, normalizeLanguage, normalizeLocation } from './collection.js';

export function resolveVoiceLookupTarget(set, cn, variant = 'regular') {
  const s = String(set || '').toLowerCase();
  if (variant === 'promo' || variant === 'prerelease') {
    const pset = s.startsWith('p') ? s : 'p' + s;
    const pcn = /[a-z]$/i.test(cn) ? cn : cn + 's';
    return { set: pset, cn: pcn };
  }
  return { set: s, cn };
}

export async function lookupVoiceCard({
  userSet,
  userCn,
  variant = 'regular',
  fetchCardByCollectorNumberImpl = fetchCardByCollectorNumber,
} = {}) {
  const target = resolveVoiceLookupTarget(userSet, userCn, variant);
  let card = await fetchCardByCollectorNumberImpl(target.set, target.cn);
  let fallback = false;
  if (!card && variant !== 'regular') {
    card = await fetchCardByCollectorNumberImpl(userSet, userCn);
    if (card) fallback = true;
  }
  return {
    status: card ? 'found' : 'missing',
    card,
    target,
    fallback,
  };
}

export function chooseVoiceFinish(card, wantsFoil = false) {
  const finishes = getCardFinishes(card);
  if (wantsFoil && finishes.some(f => f.finish === 'foil')) return 'foil';
  if (finishes[0]) return finishes[0].finish === 'nonfoil' ? 'normal' : finishes[0].finish;
  return 'normal';
}

export function buildVoiceAddOptions({
  card,
  wantsFoil = false,
  qtyOverride = null,
  locationOverride = null,
  lastUsedLocation = null,
  condition = 'near_mint',
  language = 'en',
} = {}) {
  return {
    finish: chooseVoiceFinish(card, wantsFoil),
    condition: normalizeCondition(condition),
    language: normalizeLanguage(language),
    qty: Math.max(1, qtyOverride || 1),
    location: normalizeLocation(locationOverride != null ? locationOverride : lastUsedLocation),
  };
}

export function buildRepeatVoiceInput(lastAddInput, qty) {
  if (!lastAddInput) return null;
  return { ...lastAddInput, qty: qty != null ? qty : 1 };
}
