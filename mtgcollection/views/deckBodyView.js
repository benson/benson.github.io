import { state } from '../state.js';
import { esc } from '../feedback.js';
import { groupDeck } from '../stats.js';
import { getSetIconUrl } from '../setIcons.js';
import { CONDITION_ABBR, RARITY_ABBR, VALID_DECK_CARD_SIZES, VALID_DECK_GROUPS } from '../deckUi.js';
import { formatPrice } from '../ui/priceUi.js';
import { renderDeckCard } from './deckCardView.js';

function renderDeckTextRow(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = c.inventoryIndex >= 0 ? c.inventoryIndex : -1;
  const previewClasses = c.imageUrl ? 'card-name-button card-preview-link detail-trigger' : 'card-name-button detail-trigger';
  const previewAttr = c.imageUrl
    ? ` data-preview-url="${esc(c.imageUrl)}" data-preview-finish="${esc(c.finish || 'normal')}"`
    : '';
  const setCodeLower = (c.setCode || '').toLowerCase();
  const setCode = setCodeLower.toUpperCase();
  const iconUrl = setCodeLower ? getSetIconUrl(setCodeLower) : '';
  const setIcon = iconUrl
    ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
    : '';
  const placeholderCls = c.placeholder ? ' deck-text-row-placeholder' : '';
  const physicalLoc = c.placeholder
    ? '<span class="deck-row-loc deck-row-loc-placeholder">placeholder</span>'
    : c.location
      ? `<span class="deck-row-loc">in ${esc(c.location.type)}:${esc(c.location.name)}</span>`
      : '';
  return `<tr class="detail-trigger${placeholderCls}" data-index="${index}">
    <td class="card-name-cell"><button class="${previewClasses}" type="button" data-index="${index}"${previewAttr}>${esc(name)}</button>${physicalLoc}</td>
    <td class="muted set-cell">${setIcon}${esc(setCode)}</td>
    <td class="muted cn-cell">${esc(c.cn || '')}</td>
    <td class="muted finish-cell">${esc(c.finish)}</td>
    <td class="muted rarity-cell" title="${esc(c.rarity || '')}">${esc(RARITY_ABBR[c.rarity] || c.rarity || '')}</td>
    <td class="muted condition-cell" title="${esc((c.condition || '').replace(/_/g, ' '))}">${esc(CONDITION_ABBR[c.condition] || (c.condition || '').replace(/_/g, ' '))}</td>
    <td class="tags-cell">${(c.tags || []).map(t => `<span class="row-tag">${esc(t)}</span>`).join('')}</td>
    <td class="qty-cell">${c.qty}</td>
    <td class="muted price-cell">${formatPrice(c)}</td>
  </tr>`;
}

export function renderDeckBoardSection(title, cards, { grouped = false } = {}) {
  const total = cards.reduce((s, c) => s + (c.qty || 1), 0);
  const value = cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
  const body = grouped
    ? groupDeck(cards, state.deckGroupBy).map(col => {
      const colTotal = col.cards.reduce((s, c) => s + (c.qty || 1), 0);
      const colValue = col.cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
      const valueStr = state.deckShowPrices && colValue > 0 ? ` - $${colValue.toFixed(2)}` : '';
      const stack = col.cards.map((c, i) => renderDeckCard(c, i === col.cards.length - 1)).join('');
      return `<div class="deck-col"><div class="deck-col-header">${esc(col.label)}<span class="deck-col-count">${colTotal}${esc(valueStr)}</span></div><div class="deck-stack">${stack}</div></div>`;
    }).join('')
    : cards.map((c, i) => renderDeckCard(c, i === cards.length - 1)).join('');
  const valueStr = state.deckShowPrices && value > 0 ? ` - $${value.toFixed(2)}` : '';
  return `<section class="deck-board-section">
    <div class="deck-board-header"><h3>${esc(title)}</h3><span>${total} cards${esc(valueStr)}</span></div>
    <div class="${grouped ? 'deck-columns' : 'deck-side-stack'}">${body || '<div class="deck-empty-prompt">no cards</div>'}</div>
  </section>`;
}

export function renderDeckStatsDashboard(stats, statHtml, format) {
  return `<div class="deck-dashboard">
    <section class="deck-stat-card"><h3>curve</h3>${statHtml.curveHtml}</section>
    <section class="deck-stat-card"><h3>summary</h3>
      <div class="breakdown-row"><span>format</span><span class="breakdown-count">${esc(format)}</span></div>
      <div class="breakdown-row"><span>lands</span><span class="breakdown-count">${stats.lands}</span></div>
      <div class="breakdown-row"><span>nonlands</span><span class="breakdown-count">${stats.nonlands}</span></div>
      <div class="breakdown-row"><span>avg mv</span><span class="breakdown-count">${stats.avgManaValue.toFixed(2)}</span></div>
      <div class="breakdown-row"><span>avg spell mv</span><span class="breakdown-count">${stats.avgSpellManaValue.toFixed(2)}</span></div>
    </section>
    <section class="deck-stat-card"><h3>types</h3>${statHtml.typeHtml}</section>
    <section class="deck-stat-card"><h3>colors</h3>${statHtml.colorHtml}</section>
  </div>`;
}

function boardLabel(board) {
  return board === 'main' ? 'mainboard' : board === 'sideboard' ? 'sideboard' : 'maybeboard';
}

function filterDeckBoards(boards, filter) {
  if (filter === 'main') return [['main', boards.main]];
  if (filter === 'sideboard') return [['sideboard', boards.sideboard]];
  if (filter === 'maybe') return [['maybe', boards.maybe]];
  return [['main', boards.main], ['sideboard', boards.sideboard], ['maybe', boards.maybe]];
}

function renderVisualCardSizeControl() {
  const labels = { small: 'sm', medium: 'md', large: 'lg' };
  return `<div class="deck-card-size-row deck-visual-card-size">
    <span class="deck-control-label">card size</span>
    <div class="deck-card-size-segmented" role="group" aria-label="card size">
      ${VALID_DECK_CARD_SIZES.map(v => {
        const active = state.deckCardSize === v;
        return `<button type="button" class="deck-card-size-btn${active ? ' active' : ''}" data-deck-card-size="${v}" aria-pressed="${active ? 'true' : 'false'}">${labels[v]}</button>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderDeckTextMode(boards) {
  const sections = filterDeckBoards(boards, state.deckBoardFilter);
  const cards = sections.flatMap(([, c]) => c);
  if (!cards.length) {
    return `<div class="deck-text-mode"><div class="deck-empty-prompt">no cards</div></div>`;
  }
  return `<div class="deck-text-mode">
    <table class="deck-text-table">
      <thead>
        <tr>
          <th>name</th>
          <th>set</th>
          <th>cn</th>
          <th>finish</th>
          <th>rarity</th>
          <th>condition</th>
          <th>tags</th>
          <th>qty</th>
          <th>price</th>
        </tr>
      </thead>
      <tbody>${cards.map(c => renderDeckTextRow(c)).join('')}</tbody>
    </table>
  </div>`;
}

export function renderDeckNotesMode(model) {
  const hasNotes = !!model.description;
  return `<section class="deck-board-section deck-notes-panel">
    <div class="deck-board-header"><h3>notes</h3><button class="btn btn-secondary" type="button" data-edit-deck-details aria-controls="deckDetailsEditor" aria-expanded="false">edit details</button></div>
    <p class="${hasNotes ? '' : 'deck-empty-prompt'}">${esc(hasNotes ? model.description : 'No deck notes yet.')}</p>
  </section>`;
}

export function renderDeckSampleHandSection() {
  return `<section class="deck-sample-hand" id="deckSampleHand">
    <div class="deck-board-header"><h3>sample hand</h3><div><button class="btn btn-secondary" type="button" data-sample-hand="draw">new hand</button></div></div>
    <div class="deck-hand-cards" id="deckHandCards"></div>
  </section>`;
}

export function renderDeckVisualMode(boards) {
  const filteredBoards = filterDeckBoards(boards, state.deckBoardFilter);
  const visualMainSections = filteredBoards
    .filter(([board]) => board === 'main')
    .map(([, cards]) => renderDeckBoardSection('mainboard', cards, { grouped: true }))
    .join('');
  const visualSideSections = filteredBoards
    .filter(([board]) => board !== 'main')
    .map(([board, cards]) => renderDeckBoardSection(boardLabel(board), cards))
    .join('');
  const visualGroupByBar = `<div class="deck-visual-controls">
    <label class="deck-visual-group-by">group by
      <select data-deck-group>
        ${VALID_DECK_GROUPS.map(v => `<option value="${v}"${state.deckGroupBy === v ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
    </label>
    ${renderVisualCardSizeControl()}
    <label class="deck-visual-price-toggle"><input type="checkbox" data-deck-show-prices${state.deckShowPrices ? ' checked' : ''}> show prices</label>
  </div>`;
  if (state.deckBoardFilter === 'all') {
    return `${visualGroupByBar}<div class="deck-content-grid${visualSideSections ? '' : ' deck-content-grid-single'}">
      <main>
        ${visualMainSections || (visualSideSections ? '' : renderDeckBoardSection('mainboard', [], { grouped: true }))}
      </main>
      ${visualSideSections ? `<aside class="deck-board-aside">${visualSideSections}</aside>` : ''}
    </div>`;
  }
  if (state.deckBoardFilter === 'main') {
    return `${visualGroupByBar}<div class="deck-content-grid deck-content-grid-single"><main>${visualMainSections}</main></div>`;
  }
  return `${visualGroupByBar}<div class="deck-content-grid deck-content-grid-single"><main>${visualSideSections}</main></div>`;
}
