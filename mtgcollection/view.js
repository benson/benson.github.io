import { state, DECK_GROUP_KEY } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  biggerImageUrl,
  allCollectionLocations,
  quoteLocationForSearch,
} from './collection.js';
import { save, commitCollectionChange } from './persistence.js';
import { openDetail } from './detail.js';
import { filteredSorted } from './search.js';
import { renderStatsPanel, groupDeck } from './stats.js';
import { updateBulkBar } from './bulk.js';

const VALID_DECK_GROUPS = ['type', 'cmc', 'color', 'rarity'];

let gridEl, listBodyEl, collectionSection, emptyState, priceNoteEl;
let cardPreviewEl, cardPreviewImg;
let lightboxEl, lightboxImg, lightboxFlipBtn;
let lightboxFront = null;
let lightboxBack = null;
let lightboxShowingBack = false;

export function render() {
  if (state.collection.length === 0) {
    collectionSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    priceNoteEl.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  collectionSection.classList.remove('hidden');

  const list = filteredSorted();

  document.getElementById('uniqueCount').textContent = list.length;
  document.getElementById('totalCount').textContent = list.reduce((s, c) => s + c.qty, 0);
  const value = list.reduce((s, c) => s + (c.price || 0) * c.qty, 0);
  document.getElementById('totalValue').textContent = value.toFixed(2);
  priceNoteEl.classList.toggle('hidden', !list.some(c => c.priceFallback));
  renderStatsPanel(list);
  applyGridSize();

  const gridContainer = document.getElementById('grid');
  const listContainer = document.getElementById('listView');
  const deckContainer = document.getElementById('deckView');
  const deckBtn = document.getElementById('deckViewBtn');
  if (state.viewMode === 'deck') {
    gridContainer.classList.add('hidden');
    listContainer.classList.remove('active');
    deckContainer.classList.add('active');
    document.getElementById('toggleView').textContent = 'grid view';
    deckBtn.textContent = 'exit deck view';
    renderDeckView(list);
  } else if (state.viewMode === 'grid') {
    gridContainer.classList.remove('hidden');
    listContainer.classList.remove('active');
    deckContainer.classList.remove('active');
    document.getElementById('toggleView').textContent = 'list view';
    deckBtn.textContent = 'deck view';
    gridEl.innerHTML = list.map(c => renderTile(c)).join('');
  } else {
    gridContainer.classList.add('hidden');
    listContainer.classList.add('active');
    deckContainer.classList.remove('active');
    document.getElementById('toggleView').textContent = 'grid view';
    deckBtn.textContent = 'deck view';
    listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
  }
  updateBulkBar();
}

export function applyGridSize() {
  const sizeClass = 'grid-' + state.gridSize;
  if (gridEl) {
    gridEl.classList.remove('grid-small', 'grid-medium', 'grid-large');
    gridEl.classList.add(sizeClass);
  }
  document.querySelectorAll('[data-grid-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gridSize === state.gridSize);
  });
}

function formatPrice(c) {
  if (!c.price) return '';
  return '$' + c.price.toFixed(2) + (c.priceFallback ? '*' : '');
}

function renderTile(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = state.collection.indexOf(c);
  const badges = [];
  if (c.qty > 1) badges.push('<span class="badge">×' + c.qty + '</span>');
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}<br><small>${esc((c.setCode||'').toUpperCase())} #${esc(c.cn||'')}</small></div>`;
  const caption = esc(name) + ' · ' + esc((c.setCode || '').toUpperCase());
  const scryfallAction = c.scryfallUri
    ? `<button class="card-scryfall-link" type="button" data-scryfall-url="${esc(c.scryfallUri)}">scryfall ↗</button>`
    : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  return `<div class="card-tile detail-trigger${finishClass}" role="button" tabindex="0" data-index="${index}" aria-label="edit ${esc(name)}">
    ${img}
    <div class="card-badges">${badges.join('')}</div>
    <div class="card-caption">${caption}</div>
    ${scryfallAction ? `<div class="card-actions">${scryfallAction}</div>` : ''}
  </div>`;
}

function renderRow(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = state.collection.indexOf(c);
  const key = collectionKey(c);
  const selected = state.selectedKeys.has(key);
  const previewClasses = c.imageUrl ? 'card-name-button card-preview-link detail-trigger' : 'card-name-button detail-trigger';
  const previewAttr = c.imageUrl ? ` data-preview-url="${esc(c.imageUrl)}"` : '';
  return `<tr class="detail-trigger${selected ? ' row-selected' : ''}" data-index="${index}" data-key="${esc(key)}">
    <td class="col-check"><input type="checkbox" class="row-check" data-key="${esc(key)}"${selected ? ' checked' : ''} aria-label="select row"></td>
    <td class="card-name-cell"><button class="${previewClasses}" type="button" data-index="${index}"${previewAttr}>${esc(name)}</button></td>
    <td class="muted">${esc((c.setCode || '').toUpperCase())}</td>
    <td class="muted">${esc(c.cn || '')}</td>
    <td class="muted">${esc(c.finish)}</td>
    <td class="muted">${esc(c.rarity || '')}</td>
    <td class="muted">${esc(c.condition.replace(/_/g, ' '))}</td>
    <td><input class="location-input" data-index="${index}" list="locationOptions" value="${esc(c.location || '')}" placeholder="location"></td>
    <td>${c.qty}</td>
    <td class="muted">${formatPrice(c)}</td>
  </tr>`;
}

function renderDeckCard(c, isLast) {
  const name = c.resolvedName || c.name || '?';
  const idx = state.collection.indexOf(c);
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="deck-qty">×${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const lastClass = isLast ? ' deck-card-last' : '';
  return `<div class="deck-card detail-trigger${finishClass}${lastClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}</div>`;
}

function renderDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');
  const searchInput = document.getElementById('searchInput');
  const searchQuery = (searchInput && searchInput.value || '').trim();

  if (!searchQuery) {
    if (deckActionsEl) deckActionsEl.classList.add('hidden');
    const locations = allCollectionLocations();
    if (locations.length === 0) {
      deckColumnsEl.innerHTML = `<div class="deck-empty-state">
        <p class="deck-empty-prompt">deck view needs a filter — add a location to a card via the drawer, or apply a search query</p>
      </div>`;
    } else {
      const chips = locations.map(loc =>
        `<button type="button" class="deck-empty-chip" data-loc="${esc(loc)}">${esc(loc)}</button>`
      ).join('');
      deckColumnsEl.innerHTML = `<div class="deck-empty-state">
        <p class="deck-empty-prompt">deck view needs a filter — try <code>loc:breya</code> or pick a location below</p>
        <div class="deck-empty-chips">${chips}</div>
      </div>`;
    }
    document.getElementById('deckSummary').textContent = '';
    return;
  }

  if (deckActionsEl) deckActionsEl.classList.remove('hidden');

  const cols = groupDeck(list, state.deckGroupBy);
  if (cols.length === 0) {
    deckColumnsEl.innerHTML = '';
  } else {
    deckColumnsEl.innerHTML = cols.map(col => {
      const total = col.cards.reduce((s, c) => s + (c.qty || 1), 0);
      const price = col.cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
      const priceStr = price > 0 ? ` · $${price.toFixed(2)}` : '';
      const stack = col.cards.map((c, i) => renderDeckCard(c, i === col.cards.length - 1)).join('');
      return `<div class="deck-col"><div class="deck-col-header">${esc(col.label)}<span class="deck-col-count">${total}${priceStr}</span></div><div class="deck-stack">${stack}</div></div>`;
    }).join('');
  }

  const total = list.reduce((s, c) => s + (c.qty || 1), 0);
  const summary = document.getElementById('deckSummary');
  if (!state.selectedFormat) {
    summary.textContent = total + ' cards';
  } else {
    const illegal = list.filter(c => c.legalities && c.legalities[state.selectedFormat] && c.legalities[state.selectedFormat] !== 'legal' && c.legalities[state.selectedFormat] !== 'restricted');
    if (illegal.length > 0) {
      summary.innerHTML = total + ' cards · <span class="warn">' + illegal.length + ' not ' + state.selectedFormat + '-legal</span>';
    } else {
      summary.textContent = total + ' cards · all legal in ' + state.selectedFormat;
    }
  }
}

function loadDeckGroup() {
  try {
    const v = localStorage.getItem(DECK_GROUP_KEY);
    if (v && VALID_DECK_GROUPS.includes(v)) state.deckGroupBy = v;
  } catch (e) {}
}

function saveDeckGroup() {
  try { localStorage.setItem(DECK_GROUP_KEY, state.deckGroupBy); } catch (e) {}
}

function buildDecklistText(list) {
  return list.map(c => {
    const name = c.resolvedName || c.name || '';
    const setCode = (c.setCode || '').toUpperCase();
    const cn = c.cn || '';
    const finishMarker = c.finish === 'foil' ? ' *F*' : c.finish === 'etched' ? ' *E*' : '';
    return `${c.qty} ${name} (${setCode}) ${cn}${finishMarker}`;
  }).join('\n');
}

function showCardPreview(link) {
  const url = link.dataset.previewUrl;
  if (!url) return;

  const rect = link.getBoundingClientRect();
  cardPreviewImg.src = url;
  cardPreviewEl.classList.add('visible');

  const previewWidth = 300;
  const previewHeight = 418;
  const padding = 20;
  const linkCenterX = rect.left + rect.width / 2;
  const windowCenterX = window.innerWidth / 2;

  let left = linkCenterX < windowCenterX
    ? rect.right + padding
    : rect.left - previewWidth - padding;
  let top = rect.top - previewHeight / 2 + rect.height / 2;

  top = Math.max(padding, Math.min(top, window.innerHeight - previewHeight - padding));
  left = Math.max(padding, Math.min(left, window.innerWidth - previewWidth - padding));

  cardPreviewEl.style.left = left + 'px';
  cardPreviewEl.style.top = top + 'px';
}

export function hideCardPreview() {
  cardPreviewEl.classList.remove('visible');
}

export function showImageLightbox(frontUrl, backUrl) {
  if (!frontUrl) return;
  lightboxFront = frontUrl;
  lightboxBack = backUrl;
  lightboxShowingBack = false;
  lightboxImg.src = biggerImageUrl(frontUrl);
  lightboxImg.alt = '';
  lightboxFlipBtn.classList.toggle('hidden', !backUrl);
  lightboxFlipBtn.textContent = 'flip card';
  lightboxEl.classList.add('visible');
  lightboxEl.setAttribute('aria-hidden', 'false');
  hideCardPreview();
}

export function hideImageLightbox() {
  lightboxEl.classList.remove('visible');
  lightboxEl.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
}

export function isLightboxVisible() {
  return lightboxEl.classList.contains('visible');
}

export function initView() {
  gridEl = document.getElementById('grid');
  listBodyEl = document.getElementById('listBody');
  collectionSection = document.getElementById('collectionSection');
  emptyState = document.getElementById('emptyState');
  priceNoteEl = document.getElementById('priceNote');
  cardPreviewEl = document.getElementById('cardPreview');
  cardPreviewImg = cardPreviewEl.querySelector('img');
  lightboxEl = document.getElementById('imageLightbox');
  lightboxImg = document.getElementById('imageLightboxImg');
  lightboxFlipBtn = document.getElementById('lightboxFlip');

  document.getElementById('copyDecklistBtn').addEventListener('click', async () => {
    const text = buildDecklistText(filteredSorted());
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('decklist copied (' + filteredSorted().length + ' cards)', 'success');
    } catch (e) {
      showFeedback('clipboard unavailable: ' + e.message, 'error');
    }
  });

  document.getElementById('deckViewBtn').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'deck' ? 'grid' : 'deck';
    save();
    render();
  });

  loadDeckGroup();
  const deckGroupEl = document.getElementById('deckGroupBy');
  if (deckGroupEl) {
    deckGroupEl.value = state.deckGroupBy;
    deckGroupEl.addEventListener('change', () => {
      const v = deckGroupEl.value;
      if (!VALID_DECK_GROUPS.includes(v)) return;
      state.deckGroupBy = v;
      saveDeckGroup();
      render();
    });
  }

  document.getElementById('deckColumns').addEventListener('click', e => {
    const chip = e.target.closest('.deck-empty-chip');
    if (chip) {
      const loc = chip.dataset.loc || '';
      const searchInput = document.getElementById('searchInput');
      searchInput.value = 'loc:' + quoteLocationForSearch(loc);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const card = e.target.closest('.deck-card');
    if (!card) return;
    openDetail(parseInt(card.dataset.index, 10));
  });

  document.getElementById('deckColumns').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.deck-card');
    if (!card) return;
    e.preventDefault();
    openDetail(parseInt(card.dataset.index, 10));
  });

  document.getElementById('toggleView').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'list' ? 'grid' : 'list';
    save();
    render();
  });

  document.getElementById('gridSizeControl').addEventListener('click', e => {
    const btn = e.target.closest('[data-grid-size]');
    if (!btn) return;
    state.gridSize = btn.dataset.gridSize;
    save();
    applyGridSize();
  });

  gridEl.addEventListener('click', e => {
    const scryfallLink = e.target.closest('.card-scryfall-link');
    if (scryfallLink) {
      e.stopPropagation();
      window.open(scryfallLink.dataset.scryfallUrl, '_blank', 'noopener');
      return;
    }
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !gridEl.contains(trigger)) return;
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  gridEl.addEventListener('keydown', e => {
    const scryfallLink = e.target.closest('.card-scryfall-link');
    if (scryfallLink && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      window.open(scryfallLink.dataset.scryfallUrl, '_blank', 'noopener');
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !gridEl.contains(trigger)) return;
    e.preventDefault();
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  listBodyEl.addEventListener('click', e => {
    const nameBtn = e.target.closest('.card-name-button');
    if (nameBtn) {
      openDetail(parseInt(nameBtn.dataset.index, 10));
      return;
    }
    if (e.target.closest('input, select, button, a')) return;
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !listBodyEl.contains(trigger)) return;
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  listBodyEl.addEventListener('change', e => {
    if (e.target.classList.contains('row-check')) {
      // bulk module handles this
      return;
    }
    if (!e.target.classList.contains('location-input')) return;
    const index = parseInt(e.target.dataset.index, 10);
    if (!state.collection[index]) return;
    state.collection[index].location = normalizeLocation(e.target.value);
    commitCollectionChange({ coalesce: true });
  });

  listBodyEl.addEventListener('mouseover', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link || !listBodyEl.contains(link)) return;
    showCardPreview(link);
  });

  listBodyEl.addEventListener('mouseout', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link || link.contains(e.relatedTarget)) return;
    hideCardPreview();
  });

  lightboxEl.addEventListener('click', e => {
    if (e.target.closest('.lightbox-flip')) return;
    hideImageLightbox();
  });
  lightboxFlipBtn.addEventListener('click', () => {
    if (!lightboxBack) return;
    lightboxShowingBack = !lightboxShowingBack;
    const url = lightboxShowingBack ? lightboxBack : lightboxFront;
    lightboxImg.src = biggerImageUrl(url);
  });
}
