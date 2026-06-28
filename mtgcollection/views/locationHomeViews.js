import { state } from '../state.js';
import {
  CONTAINER_DISPLAY_MODES,
  containerStats,
  defaultDeckMetadata,
  normalizeContainerDisplayMode,
  resolveDeckListEntry,
} from '../collection.js';
import { esc } from '../feedback.js';
import { LOC_ICONS, containerEditRowHtml } from '../ui/locationUi.js';

export const STORAGE_DISPLAY_MODE_LABELS = { visual: 'visual', list: 'list' };

export function storageMatchesHomeFilters(container, { query = '', types = [] } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (container?.type !== 'container') return false;
  if (q && !String(container?.name || '').toLowerCase().includes(q)) return false;
  const mode = normalizeContainerDisplayMode(container.displayMode);
  if (types.length && !types.includes(mode)) return false;
  return true;
}

export function renderStorageHomeHtml(containers, filters = {}) {
  const createHtml = `<form class="locations-create" id="locationsCreateForm">
    <span class="locations-create-label">new container</span>
    <input type="hidden" name="locationsCreateType" value="container">
    <div class="locations-create-types" role="radiogroup" aria-label="default view">
      ${CONTAINER_DISPLAY_MODES.map((mode, i) => `<label class="locations-create-type${i === 0 ? ' is-selected' : ''}">
        <input type="radio" name="locationsCreateDisplayMode" value="${esc(mode)}"${i === 0 ? ' checked' : ''}>
        <span class="loc-pill loc-pill-container">${LOC_ICONS.container}<span>${esc(STORAGE_DISPLAY_MODE_LABELS[mode])}</span></span>
      </label>`).join('')}
    </div>
    <input id="locationsCreateName" type="text" placeholder="name" autocomplete="off">
    <button class="btn" type="submit">create</button>
  </form>`;

  const allStorage = containers.filter(c => c.type === 'container');
  const storage = allStorage.filter(c => storageMatchesHomeFilters(c, filters));
  const cards = storage.map(c => {
      const stats = containerStats(c);
      const value = stats.value > 0 ? ' &middot; $' + stats.value.toFixed(2) : '';
      const mode = normalizeContainerDisplayMode(c.displayMode);
      return `<article class="location-card" data-loc-type="${esc(c.type)}" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
        <div class="location-card-name">
          ${LOC_ICONS.container}
          <span class="location-card-name-text">${esc(c.name)}</span>
          <span class="location-card-view-mode">${esc(STORAGE_DISPLAY_MODE_LABELS[mode])}</span>
          <button class="location-card-edit-btn" type="button" aria-label="edit">&#9998;</button>
          <button class="location-card-menu-btn" type="button" aria-label="more options" aria-haspopup="menu">&hellip;</button>
        </div>
        <div class="location-card-menu" role="menu">
          <button class="location-card-menu-item location-delete" type="button" role="menuitem">delete</button>
        </div>
        <div class="location-card-stats">${stats.unique} unique &middot; ${stats.total} total${value}</div>
        ${containerEditRowHtml(c, ['container'])}
      </article>`;
  }).join('') || '<div class="deck-empty-prompt">no containers ' + (allStorage.length ? 'match' : 'yet') + '</div>';

  return createHtml + `<section class="locations-group">
      <div class="locations-group-title">containers</div>
      <div class="locations-list">${cards}</div>
    </section>`;
}

export function deckOwnership(deck) {
  const list = Array.isArray(deck.deckList) ? deck.deckList : [];
  const total = list.reduce((s, e) => s + (e.qty || 0), 0);
  let owned = 0;
  let value = 0;
  for (const entry of list) {
    const r = resolveDeckListEntry(entry, state.collection);
    owned += Math.min(entry.qty || 0, r.ownedQty);
    if (r.primary) value += (r.primary.price || 0) * (entry.qty || 0);
  }
  return { total, owned, value };
}

function deckHomeImageUrl(meta = {}) {
  return String(meta.commanderImageUrl || meta.coverImageUrl || '').trim();
}

export function deckMatchesHomeFilters(deck, { query = '', formats = [] } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const deckFormat = deck?.deck?.format || '';
  if (q && !String(deck?.name || '').toLowerCase().includes(q)) return false;
  if (formats.length) {
    const normalized = deckFormat || 'unspecified';
    if (!formats.includes(normalized)) return false;
  }
  return true;
}

export function renderDecksHomeHtml(containers, filters = {}) {
  const allDecks = containers.filter(c => c.type === 'deck');
  const decks = allDecks.filter(c => deckMatchesHomeFilters(c, filters));
  const createHtml = `<form class="locations-create locations-create-decks" id="locationsCreateForm">
    <span class="locations-create-label">new deck</span>
    <input type="hidden" name="locationsCreateType" value="deck">
    <input id="locationsCreateName" type="text" placeholder="deck name" autocomplete="off">
    <button class="btn" type="submit">create deck</button>
  </form>`;
  const emptyDeckTile = `<button class="deck-home-add-card" type="button" data-location-create-focus aria-label="add deck">
    <span class="deck-home-add-art" aria-hidden="true">
      ${LOC_ICONS.deck}
      <span class="deck-home-add-plus">+</span>
    </span>
    <span class="deck-home-add-body">
      <span class="deck-home-add-title">add deck</span>
      <span class="deck-home-add-stats">empty deck</span>
    </span>
  </button>`;
  const tiles = decks.map(c => {
    const meta = c.deck || defaultDeckMetadata(c.name);
    const own = deckOwnership(c);
    const formatBadge = meta.format
      ? `<span class="deck-home-badge deck-home-format">${esc(meta.format)}</span>`
      : '';
    const coverImageUrl = deckHomeImageUrl(meta);
    const deckArt = coverImageUrl
      ? `<div class="deck-home-art"><img src="${esc(coverImageUrl)}" alt="" loading="lazy"></div>`
      : `<div class="deck-home-art deck-home-art-empty">${LOC_ICONS.deck}</div>`;
    const valueStr = own.value > 0 ? ' &middot; $' + own.value.toFixed(2) : '';
    const ownedStr = own.total > 0 ? `${own.owned}/${own.total} owned` : 'empty deck';
    return `<article class="location-card deck-home-card" data-loc-type="deck" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
      ${deckArt}
      <div class="location-card-name">
        ${LOC_ICONS.deck}
        <span class="location-card-name-text">${esc(c.name)}</span>
        ${formatBadge}
        <button class="location-card-edit-btn" type="button" aria-label="edit">&#9998;</button>
        <button class="location-card-menu-btn" type="button" aria-label="more options" aria-haspopup="menu">&hellip;</button>
      </div>
      <div class="location-card-menu" role="menu">
        <button class="location-card-menu-item location-delete" type="button" role="menuitem">delete</button>
      </div>
      <div class="location-card-stats">${esc(ownedStr)}${valueStr}</div>
      ${containerEditRowHtml(c, ['deck'])}
    </article>`;
  }).join('') || (allDecks.length ? `<div class="deck-empty-prompt">no decks match</div>` : emptyDeckTile);
  return createHtml + `<section class="locations-group">
    <div class="locations-list">${tiles}</div>
  </section>`;
}
