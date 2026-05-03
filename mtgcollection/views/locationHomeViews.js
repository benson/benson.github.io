import { state } from '../state.js';
import { containerStats, defaultDeckMetadata, resolveDeckListEntry } from '../collection.js';
import { esc } from '../feedback.js';
import { LOC_ICONS, containerEditRowHtml } from '../ui/locationUi.js';

const STORAGE_TYPES = ['binder', 'box'];
const STORAGE_TYPE_LABELS = { binder: 'binders', box: 'boxes' };

export function renderStorageHomeHtml(containers) {
  const createHtml = `<form class="locations-create" id="locationsCreateForm">
    <span class="locations-create-label">new container</span>
    <div class="locations-create-types" role="radiogroup" aria-label="container type">
      ${STORAGE_TYPES.map((t, i) => `<label class="locations-create-type${i === 0 ? ' is-selected' : ''}">
        <input type="radio" name="locationsCreateType" value="${esc(t)}"${i === 0 ? ' checked' : ''}>
        <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
      </label>`).join('')}
    </div>
    <input id="locationsCreateName" type="text" placeholder="name" autocomplete="off">
    <button class="btn" type="submit">create</button>
  </form>`;

  const groups = STORAGE_TYPES.map(type => {
    const ofType = containers.filter(c => c.type === type);
    const cards = ofType.map(c => {
      const stats = containerStats(c);
      const value = stats.value > 0 ? ' &middot; $' + stats.value.toFixed(2) : '';
      return `<article class="location-card" data-loc-type="${esc(c.type)}" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
        <div class="location-card-name">
          ${LOC_ICONS[c.type] || LOC_ICONS.box}
          <span class="location-card-name-text">${esc(c.name)}</span>
          <button class="location-card-edit-btn" type="button" aria-label="edit">&#9998;</button>
          <button class="location-card-menu-btn" type="button" aria-label="more options" aria-haspopup="menu">&hellip;</button>
        </div>
        <div class="location-card-menu" role="menu">
          <button class="location-card-menu-item location-delete" type="button" role="menuitem">delete</button>
        </div>
        <div class="location-card-stats">${stats.unique} unique &middot; ${stats.total} total${value}</div>
        ${containerEditRowHtml(c, STORAGE_TYPES)}
      </article>`;
    }).join('') || '<div class="deck-empty-prompt">no ' + esc(STORAGE_TYPE_LABELS[type]) + ' yet</div>';
    return `<section class="locations-group">
      <div class="locations-group-title">${esc(STORAGE_TYPE_LABELS[type])}</div>
      <div class="locations-list">${cards}</div>
    </section>`;
  }).join('');

  return createHtml + groups;
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
  const tiles = decks.map(c => {
    const meta = c.deck || defaultDeckMetadata(c.name);
    const own = deckOwnership(c);
    const formatBadge = meta.format
      ? `<span class="deck-home-badge deck-home-format">${esc(meta.format)}</span>`
      : '';
    const commanderArt = meta.commanderImageUrl
      ? `<div class="deck-home-art"><img src="${esc(meta.commanderImageUrl)}" alt="" loading="lazy"></div>`
      : `<div class="deck-home-art deck-home-art-empty">${LOC_ICONS.deck}</div>`;
    const valueStr = own.value > 0 ? ' &middot; $' + own.value.toFixed(2) : '';
    const ownedStr = own.total > 0 ? `${own.owned}/${own.total} owned` : 'empty deck';
    return `<article class="location-card deck-home-card" data-loc-type="deck" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
      ${commanderArt}
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
  }).join('') || `<div class="deck-empty-prompt">${allDecks.length ? 'no decks match' : 'no decks yet'}</div>`;
  return createHtml + `<section class="locations-group">
    <div class="locations-list">${tiles}</div>
  </section>`;
}
