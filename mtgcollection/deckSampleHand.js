import { normalizeDeckBoard } from './collection.js';
import { buildDeckCardFromEntry } from './deckCardModel.js';
import { renderDeckCard } from './views/deckCardView.js';
import { drawSampleHand, splitDeckBoards } from './stats.js';

export function deckSampleHandKey(deck) {
  return deck ? deck.type + ':' + deck.name : '';
}

export function buildDeckSampleHand({
  deck,
  collection = [],
  handSize = 7,
  random,
} = {}) {
  const list = (deck?.deckList || [])
    .map(entry => buildDeckCardFromEntry(entry, collection))
    .map(card => ({ ...card, deckBoard: normalizeDeckBoard(card.deckBoard) }));
  const boards = splitDeckBoards(list);
  return {
    deckKey: deckSampleHandKey(deck),
    ...drawSampleHand(boards.main, handSize, random),
  };
}

export function renderDeckSampleHandPanel({
  handEl,
  deck,
  sampleHand,
  renderCard = renderDeckCard,
} = {}) {
  if (!handEl) return;
  if (!sampleHand || sampleHand.deckKey !== deckSampleHandKey(deck)) {
    handEl.innerHTML = '<div class="deck-empty-prompt">draw a hand to preview opening texture</div>';
    return;
  }
  handEl.innerHTML = sampleHand.hand
    .map((card, index) => renderCard({ ...card, qty: 1 }, index === sampleHand.hand.length - 1))
    .join('');
}
