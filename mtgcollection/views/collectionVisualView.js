import { collectionKey, normalizeLocation } from '../collection.js';
import { esc } from '../feedback.js';
import { locationPillHtml } from '../ui/locationUi.js';
import { formatPrice } from '../ui/priceUi.js';

function visualCardImageHtml(card, name) {
  const url = card.imageUrl || '';
  if (url) {
    return `<img class="collection-visual-card-image" src="${esc(url)}" alt="${esc(name)}">`;
  }
  return `<div class="collection-visual-card-image collection-visual-card-image-missing" aria-hidden="true">
    <span>${esc(name.slice(0, 1).toUpperCase() || '?')}</span>
  </div>`;
}

function visualCardLocationHtml(card) {
  const loc = normalizeLocation(card.location);
  if (!loc) return '<span class="collection-visual-card-location muted">unlocated</span>';
  return `<span class="collection-visual-card-location">${locationPillHtml(loc)}</span>`;
}

export function renderCollectionVisualCard(card, collection = []) {
  const name = card.resolvedName || card.name || '(unknown)';
  const index = collection.indexOf(card);
  const key = collectionKey(card);
  const price = formatPrice(card);
  const finish = card.finish || 'normal';
  const finishClass = finish === 'foil' ? ' is-foil' : finish === 'etched' ? ' is-etched' : '';
  return `<article class="collection-visual-card detail-trigger${finishClass}" data-collection-visual-card data-index="${index}" data-key="${esc(key)}">
    <button class="collection-visual-card-art" type="button" data-collection-visual-detail data-index="${index}" aria-label="open ${esc(name)} details">
      ${visualCardImageHtml(card, name)}
    </button>
    <div class="collection-visual-card-body">
      <button class="collection-visual-card-name" type="button" data-collection-visual-detail data-index="${index}">${esc(name)}</button>
      <div class="collection-visual-card-meta">
        <span class="collection-visual-card-qty">x${esc(card.qty || 1)}</span>
        <span class="collection-visual-card-finish">${esc(finish)}</span>
        ${price ? `<span class="collection-visual-card-price">${price}</span>` : '<span class="collection-visual-card-price muted">no price</span>'}
      </div>
      ${visualCardLocationHtml(card)}
    </div>
  </article>`;
}

export function renderCollectionVisualGrid(cards = [], collection = cards) {
  return `<div class="collection-visual-grid" data-collection-visual-grid>
    ${cards.map(card => renderCollectionVisualCard(card, collection)).join('')}
  </div>`;
}
