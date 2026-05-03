import {
  addToDeckList,
  defaultDeckMetadata,
  getCardBackImageUrl,
  getCardImageUrl,
} from './collection.js';

export function readDeckMetadataForm(form, deckName = 'deck') {
  const fd = new FormData(form);
  const preset = String(fd.get('formatPreset') || '').trim();
  const custom = String(fd.get('formatCustom') || '').trim();
  const format = preset === 'custom' ? custom : preset;
  const isCommander = format === 'commander';
  const cmdInput = form.querySelector('input[data-meta-ac="commander"]');
  const partnerInput = form.querySelector('input[data-meta-ac="partner"]');
  const commanderScryfallId = String(cmdInput?.dataset.metaAcScryfallId || '');
  const commanderScryfallUri = String(cmdInput?.dataset.metaAcScryfallUri || '');
  const partnerScryfallId = String(partnerInput?.dataset.metaAcScryfallId || '');
  const partnerScryfallUri = String(partnerInput?.dataset.metaAcScryfallUri || '');

  return {
    metadata: {
      ...defaultDeckMetadata(deckName),
      title: String(fd.get('title') || '').trim() || deckName,
      format,
      commander: isCommander ? String(fd.get('commander') || '').trim() : '',
      commanderScryfallId: isCommander ? commanderScryfallId : '',
      commanderScryfallUri: isCommander ? commanderScryfallUri : '',
      commanderImageUrl: isCommander ? String(cmdInput?.dataset.metaAcImage || '') : '',
      commanderBackImageUrl: isCommander ? String(cmdInput?.dataset.metaAcBackImage || '') : '',
      partner: isCommander ? String(fd.get('partner') || '').trim() : '',
      partnerScryfallId: isCommander ? partnerScryfallId : '',
      partnerScryfallUri: isCommander ? partnerScryfallUri : '',
      partnerImageUrl: isCommander ? String(partnerInput?.dataset.metaAcImage || '') : '',
      partnerBackImageUrl: isCommander ? String(partnerInput?.dataset.metaAcBackImage || '') : '',
      companion: String(fd.get('companion') || '').trim(),
      description: String(fd.get('description') || '').trim(),
    },
    isCommander,
    commanderScryfallId,
    partnerScryfallId,
  };
}

export function ensureCommanderEntryInDeck(scryfallId, deck, card, {
  recordEventImpl = () => {},
  addToDeckListImpl = addToDeckList,
} = {}) {
  if (!scryfallId || !deck || deck.type !== 'deck') return null;
  if (!Array.isArray(deck.deckList)) deck.deckList = [];
  const already = deck.deckList.some(entry => entry.scryfallId === scryfallId);
  if (already || !card) return null;

  const imageUrl = getCardImageUrl(card);
  const backImageUrl = getCardBackImageUrl(card);
  addToDeckListImpl(deck, {
    scryfallId: card.id,
    qty: 1,
    board: 'main',
    name: card.name,
    setCode: card.set,
    cn: card.collector_number,
    imageUrl,
    backImageUrl,
  });
  recordEventImpl({
    type: 'add',
    summary: 'Added {card} as commander to {loc:' + deck.type + ':' + deck.name + '}',
    cards: [{ name: card.name, imageUrl, backImageUrl: backImageUrl || '' }],
    scope: 'deck',
    deckLocation: deck.type + ':' + deck.name,
  });
  return scryfallId;
}

export function saveDeckMetadataFromForm({
  form,
  deck,
  getCardById = () => null,
  now = Date.now,
  recordEventImpl = () => {},
} = {}) {
  if (!form || !deck) return { added: 0, metadata: null };
  const beforeMetadata = JSON.parse(JSON.stringify(deck.deck || defaultDeckMetadata(deck.name)));
  const result = readDeckMetadataForm(form, deck.name);
  deck.deck = result.metadata;
  deck.updatedAt = now();

  if (JSON.stringify(beforeMetadata) !== JSON.stringify(result.metadata)) {
    recordEventImpl({
      type: 'deck-update',
      summary: 'Updated details for {loc:deck:' + deck.name + '}',
      scope: 'deck',
      deckLocation: 'deck:' + deck.name,
      containerAfter: { type: 'deck', name: deck.name },
      deckBefore: beforeMetadata,
      deckAfter: result.metadata,
    });
  }

  let added = 0;
  if (result.isCommander) {
    const commanderCard = getCardById(result.commanderScryfallId);
    const partnerCard = getCardById(result.partnerScryfallId);
    if (result.commanderScryfallId && ensureCommanderEntryInDeck(result.commanderScryfallId, deck, commanderCard, { recordEventImpl })) added++;
    if (result.partnerScryfallId && ensureCommanderEntryInDeck(result.partnerScryfallId, deck, partnerCard, { recordEventImpl })) added++;
  }

  return { added, metadata: result.metadata };
}
