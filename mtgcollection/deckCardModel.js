import { resolveDeckListEntry } from './collection.js';

export function buildDeckCardFromEntry(entry, collection = []) {
  const resolution = resolveDeckListEntry(entry, collection);
  const inv = resolution.primary;
  const inventoryIndex = inv ? collection.indexOf(inv) : -1;
  return {
    scryfallId: entry.scryfallId,
    name: entry.name || inv?.name || '?',
    resolvedName: entry.name || inv?.resolvedName || inv?.name || '?',
    setCode: entry.setCode || inv?.setCode || '',
    setName: inv?.setName || '',
    cn: entry.cn || inv?.cn || '',
    rarity: inv?.rarity || entry.rarity || '',
    qty: entry.qty,
    deckBoard: entry.board,
    finish: inv?.finish || 'normal',
    condition: inv?.condition || 'near_mint',
    language: inv?.language || 'en',
    location: inv?.location || null,
    price: inv?.price || 0,
    priceFallback: inv?.priceFallback || false,
    cmc: inv?.cmc ?? entry.cmc ?? null,
    colors: (inv?.colors && inv.colors.length ? inv.colors : entry.colors) || [],
    colorIdentity: (inv?.colorIdentity && inv.colorIdentity.length ? inv.colorIdentity : entry.colorIdentity) || [],
    typeLine: inv?.typeLine || entry.typeLine || '',
    oracleText: inv?.oracleText || '',
    legalities: inv?.legalities || {},
    tags: inv?.tags || [],
    imageUrl: entry.imageUrl || inv?.imageUrl || '',
    backImageUrl: entry.backImageUrl || inv?.backImageUrl || '',
    placeholder: resolution.placeholder,
    ownedQty: resolution.ownedQty,
    needed: resolution.needed,
    inventoryIndex,
  };
}
