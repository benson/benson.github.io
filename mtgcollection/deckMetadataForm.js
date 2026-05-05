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
  const coverSelect = form.querySelector('[data-deck-cover-picker]');
  const coverOption = coverSelect?.selectedOptions?.[0] || null;
  const coverScryfallId = String(coverOption?.value || '').trim();
  const commanderName = String(fd.get('commander') || '').trim();
  const partnerName = String(fd.get('partner') || '').trim();
  const hasCommanderPick = isCommander && commanderName && commanderScryfallId;
  const hasPartnerPick = isCommander && partnerName && partnerScryfallId;
  const hasCoverPick = !isCommander && coverScryfallId && String(coverOption?.dataset.imageUrl || '').trim();

  return {
    metadata: {
      ...defaultDeckMetadata(deckName),
      title: String(fd.get('title') || '').trim() || deckName,
      format,
      commander: hasCommanderPick ? commanderName : '',
      commanderScryfallId: hasCommanderPick ? commanderScryfallId : '',
      commanderScryfallUri: hasCommanderPick ? commanderScryfallUri : '',
      commanderImageUrl: hasCommanderPick ? String(cmdInput?.dataset.metaAcImage || '') : '',
      commanderBackImageUrl: hasCommanderPick ? String(cmdInput?.dataset.metaAcBackImage || '') : '',
      partner: hasPartnerPick ? partnerName : '',
      partnerScryfallId: hasPartnerPick ? partnerScryfallId : '',
      partnerScryfallUri: hasPartnerPick ? partnerScryfallUri : '',
      partnerImageUrl: hasPartnerPick ? String(partnerInput?.dataset.metaAcImage || '') : '',
      partnerBackImageUrl: hasPartnerPick ? String(partnerInput?.dataset.metaAcBackImage || '') : '',
      coverName: hasCoverPick ? String(coverOption?.dataset.cardName || '').trim() : '',
      coverScryfallId: hasCoverPick ? coverScryfallId : '',
      coverImageUrl: hasCoverPick ? String(coverOption?.dataset.imageUrl || '').trim() : '',
      coverBackImageUrl: hasCoverPick ? String(coverOption?.dataset.backImageUrl || '').trim() : '',
      coverFinish: hasCoverPick ? String(coverOption?.dataset.cardFinish || 'normal').trim() || 'normal' : '',
      companion: String(fd.get('companion') || '').trim(),
      description: String(fd.get('description') || '').trim(),
    },
    isCommander,
    commanderScryfallId: hasCommanderPick ? commanderScryfallId : '',
    partnerScryfallId: hasPartnerPick ? partnerScryfallId : '',
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
