import { state } from './state.js';
import {
  deleteContainerAndUnlocateCards,
  deleteEmptyContainer,
  moveDeckListEntryBoard,
  normalizeDeckBoard,
  removeFromDeckList,
  renameContainer,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { recordEvent } from './changelog.js';

function defaultCommit(options = {}) {
  commitCollectionChange(options);
}

function deckLocationKey(deck) {
  return deck ? deck.type + ':' + deck.name : '';
}

function deckCardEventPayload(entry) {
  return {
    name: entry?.name || 'card',
    imageUrl: entry?.imageUrl || '',
    backImageUrl: entry?.backImageUrl || '',
  };
}

export function moveDeckCardToBoardCommand(deck, scryfallId, fromBoard, rawBoard, options = {}) {
  const commit = options.commit || defaultCommit;
  const record = options.record || recordEvent;
  if (!deck || !scryfallId) return { ok: false, reason: 'missing-card' };

  const targetBoard = normalizeDeckBoard(rawBoard);
  const currentBoard = normalizeDeckBoard(fromBoard);
  if (targetBoard === currentBoard) return { ok: false, reason: 'same-board' };

  const entry = (deck.deckList || []).find(e => e.scryfallId === scryfallId && e.board === currentBoard);
  if (!entry) return { ok: false, reason: 'not-found' };
  const payload = deckCardEventPayload(entry);
  if (!moveDeckListEntryBoard(deck, scryfallId, currentBoard, targetBoard)) {
    return { ok: false, reason: 'move-failed' };
  }

  state.deckSampleHand = null;
  record({
    type: 'edit',
    summary: 'Moved {card} to ' + (targetBoard === 'maybe' ? 'maybeboard' : targetBoard),
    cards: [payload],
    scope: 'deck',
    deckLocation: deckLocationKey(deck),
  });
  commit();

  return { ok: true, entry, targetBoard };
}

export function removeDeckCardFromDeckCommand(deck, scryfallId, board, options = {}) {
  const commit = options.commit || defaultCommit;
  const record = options.record || recordEvent;
  if (!deck || !scryfallId) return { ok: false, reason: 'missing-card' };

  const norm = normalizeDeckBoard(board);
  const entry = (deck.deckList || []).find(e => e.scryfallId === scryfallId && e.board === norm);
  if (!entry) return { ok: false, reason: 'not-found' };
  const payload = deckCardEventPayload(entry);
  if (!removeFromDeckList(deck, scryfallId, norm)) return { ok: false, reason: 'remove-failed' };

  state.deckSampleHand = null;
  record({
    type: 'edit',
    summary: 'Removed {card} from {loc:' + deck.type + ':' + deck.name + '}',
    cards: [payload],
    scope: 'deck',
    deckLocation: deckLocationKey(deck),
  });
  commit();

  return { ok: true, entry, board: norm };
}

export function renameContainerCommand(beforeRaw, afterRaw, options = {}) {
  const commit = options.commit || defaultCommit;
  if (!renameContainer(beforeRaw, afterRaw)) return { ok: false };

  commit({ coalesce: true });
  return { ok: true };
}

export function deleteEmptyContainerCommand(raw, options = {}) {
  const commit = options.commit || defaultCommit;
  if (!deleteEmptyContainer(raw)) return { ok: false };

  commit();
  return { ok: true };
}

export function deleteContainerAndUnlocateCardsCommand(raw, options = {}) {
  const commit = options.commit || defaultCommit;
  const cleared = deleteContainerAndUnlocateCards(raw);
  if (cleared <= 0) return { ok: false, cleared };

  commit();
  return { ok: true, cleared };
}
