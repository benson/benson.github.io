import { normalizeDeckBoard } from '../collection.js';
import { esc } from '../feedback.js';

export function renderDeckCard(c, isLast) {
  const name = c.resolvedName || c.name || '?';
  const idx = c.inventoryIndex >= 0 ? c.inventoryIndex : -1;
  const sid = c.scryfallId || '';
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="deck-qty">x${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const placeholderClass = c.placeholder ? ' deck-card-placeholder' : '';
  const lastClass = isLast ? ' deck-card-last' : '';
  const board = normalizeDeckBoard(c.deckBoard);
  const menuId = 'deck-card-menu-' + sid + '-' + board;
  const dataAttrs = `data-scryfall-id="${esc(sid)}" data-board="${esc(board)}" data-inventory-index="${idx}"`
    + ` data-card-name="${esc(name)}"`
    + ` data-image-url="${esc(c.imageUrl || '')}"`
    + ` data-back-image-url="${esc(c.backImageUrl || '')}"`
    + ` data-card-qty="${c.qty || 1}"`
    + ` data-card-finish="${esc(c.finish || 'normal')}"`
    + ` data-card-price="${c.price || 0}"`;
  const moveItem = (targetBoard, label) =>
    `<button role="menuitem" type="button" data-card-action="move-board" data-board-target="${targetBoard}" ${dataAttrs}${board === targetBoard ? ' disabled' : ''}>${esc(label)}</button>`;
  const openItem = idx >= 0
    ? `<button role="menuitem" type="button" data-card-action="open" data-inventory-index="${idx}">open details</button>`
    : '';
  const removeLabel = c.qty > 1 ? `remove ${c.qty} from deck` : 'remove from deck';
  return `<article class="deck-card${finishClass}${placeholderClass}${lastClass}" ${dataAttrs}>
    <button class="deck-card-face detail-trigger" type="button" data-card-action="open" data-inventory-index="${idx}" aria-label="open ${esc(name)} details">${img}${qty}</button>
    <button class="deck-card-menu-btn" type="button" data-card-menu-toggle aria-label="card actions for ${esc(name)}" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}">...</button>
    <div class="deck-card-menu" id="${menuId}" role="menu" hidden>
      ${openItem}
      ${moveItem('main', 'move to mainboard')}
      ${moveItem('sideboard', 'move to sideboard')}
      ${moveItem('maybe', 'move to maybeboard')}
      <button role="menuitem" type="button" class="deck-card-menu-danger" data-card-action="remove-from-deck" ${dataAttrs}>${esc(removeLabel)}</button>
    </div>
  </article>`;
}
