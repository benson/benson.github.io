import { state } from '../state.js';
import { esc } from '../feedback.js';
import { defaultDeckExportOptions } from '../deckExport.js';

export const FORMAT_PRESETS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander', 'brawl'];

export function deckDetailsViewModel(deck, meta = {}, stats = {}, selectedFormat = '') {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const safeStats = stats && typeof stats === 'object' ? stats : {};
  const deckName = String(deck?.name || '');
  const title = String(safeMeta.title || '').trim();
  const description = String(safeMeta.description || '').trim();
  const formatInput = String(safeMeta.format || selectedFormat || '').trim();
  const commander = String(safeMeta.commander || '').trim();
  const commanderScryfallId = String(safeMeta.commanderScryfallId || '').trim();
  const commanderScryfallUri = String(safeMeta.commanderScryfallUri || '').trim();
  const commanderImageUrl = String(safeMeta.commanderImageUrl || '').trim();
  const commanderBackImageUrl = String(safeMeta.commanderBackImageUrl || '').trim();
  const partner = String(safeMeta.partner || '').trim();
  const partnerScryfallId = String(safeMeta.partnerScryfallId || '').trim();
  const partnerScryfallUri = String(safeMeta.partnerScryfallUri || '').trim();
  const partnerImageUrl = String(safeMeta.partnerImageUrl || '').trim();
  const partnerBackImageUrl = String(safeMeta.partnerBackImageUrl || '').trim();
  const companion = String(safeMeta.companion || '').trim();
  const value = Number(safeStats.value) || 0;
  const count = key => parseInt(safeStats[key], 10) || 0;
  return {
    title,
    displayTitle: title || deckName || 'deck',
    description,
    descriptionText: description || 'No description yet.',
    format: formatInput || 'unspecified format',
    formatInput,
    shareId: deck?.shareId || '',
    commander,
    commanderScryfallId,
    commanderScryfallUri,
    commanderImageUrl,
    commanderBackImageUrl,
    partner,
    partnerScryfallId,
    partnerScryfallUri,
    partnerImageUrl,
    partnerBackImageUrl,
    companion,
    total: count('total'),
    main: count('main'),
    sideboard: count('sideboard'),
    maybe: count('maybe'),
    valueText: value > 0 ? '$' + value.toFixed(2) : '-',
  };
}

function deckMetaItem(label, value, emptyText) {
  const hasValue = !!value;
  const cls = 'deck-meta-value' + (hasValue ? '' : ' is-empty');
  return `<div><dt>${esc(label)}</dt><dd class="${cls}">${esc(hasValue ? value : emptyText)}</dd></div>`;
}

function commanderWidgetCard({ role, name, imageUrl, backImageUrl, scryfallId, scryfallUri }) {
  if (!name) return '';
  const img = imageUrl
    ? `<img src="${esc(imageUrl)}" alt="${esc(name)}">`
    : `<div class="deck-commander-placeholder" aria-hidden="true">${esc(name.slice(0, 1) || '?')}</div>`;
  const dataAttrs = ' data-deck-commander-card'
    + ' data-scryfall-id="' + esc(scryfallId || '') + '"'
    + ' data-scryfall-uri="' + esc(scryfallUri || '') + '"'
    + ' data-card-name="' + esc(name) + '"'
    + ' data-image-url="' + esc(imageUrl || '') + '"'
    + ' data-back-image-url="' + esc(backImageUrl || '') + '"';
  return `<button class="deck-commander-card deck-meta-preview-link" type="button"${dataAttrs} aria-label="open ${esc(name)}">
      <span class="deck-commander-frame">${img}</span>
      <span class="deck-commander-role">${esc(role)}</span>
      <strong>${esc(name)}</strong>
    </button>`;
}

function renderCommanderWidget(model) {
  if (model.formatInput !== 'commander' || (!model.commander && !model.partner)) return '';
  const commander = commanderWidgetCard({
    role: 'commander',
    name: model.commander,
    imageUrl: model.commanderImageUrl,
    backImageUrl: model.commanderBackImageUrl,
    scryfallId: model.commanderScryfallId,
    scryfallUri: model.commanderScryfallUri,
  });
  const partner = commanderWidgetCard({
    role: 'partner',
    name: model.partner,
    imageUrl: model.partnerImageUrl,
    backImageUrl: model.partnerBackImageUrl,
    scryfallId: model.partnerScryfallId,
    scryfallUri: model.partnerScryfallUri,
  });
  return `<div class="deck-commander-widget" aria-label="commander identity">
    ${commander}${partner}
  </div>`;
}

export function renderDeckDetailsHeaderHtml(model) {
  const descClass = 'deck-description' + (model.description ? '' : ' is-empty');
  const hideCommanderFormat = model.formatInput === 'commander' && !!model.commander;
  return `<section class="deck-hero">
      <div class="deck-hero-main">
        <div class="deck-kicker">deck</div>
        <h2>${esc(model.displayTitle)}</h2>
        <p class="${descClass}">${esc(model.descriptionText)}</p>
        ${renderCommanderWidget(model)}
        <dl class="deck-meta-strip" aria-label="deck details">
          ${hideCommanderFormat ? '' : deckMetaItem('format', model.formatInput, 'unspecified format')}
          ${model.companion ? deckMetaItem('companion', model.companion, '') : ''}
        </dl>
      </div>
      <div class="deck-hero-side">
        <div class="deck-hero-actions">
          <div class="deck-export-menu-wrap">
            <button class="btn btn-secondary" type="button" data-toggle-deck-export aria-controls="deckExportPanel" aria-expanded="false">export</button>
            ${renderDeckExportPanel()}
          </div>
          <button class="btn btn-secondary deck-share-btn" type="button" data-deck-action="share">${model.shareId ? 'sharing' : 'share'}</button>
          <button class="btn" type="button" data-sample-hand="draw">sample hand</button>
          <button class="btn btn-secondary" type="button" data-edit-deck-details aria-controls="deckDetailsEditor" aria-expanded="false">edit details</button>
        </div>
      </div>
    </section>
    <section class="deck-details-editor hidden" id="deckDetailsEditor" aria-label="edit deck details">
      <form class="deck-metadata-form" id="deckMetadataForm" data-format="${esc(model.formatInput)}">
        <label class="deck-metadata-field"><span>title</span><input name="title" value="${esc(model.title)}" placeholder="deck title" autocomplete="off"></label>
        <label class="deck-metadata-field"><span>format</span>${renderDeckFormatPicker(model.formatInput)}</label>
        <label class="deck-metadata-field deck-metadata-commander"><span>commander</span>
          <span class="deck-meta-ac-wrap">
            <input name="commander" value="${esc(model.commander)}" placeholder="commander" autocomplete="off" data-meta-ac="commander" data-meta-ac-scryfall-id="${esc(model.commanderScryfallId)}" data-meta-ac-scryfall-uri="${esc(model.commanderScryfallUri)}" data-meta-ac-image="${esc(model.commanderImageUrl)}" data-meta-ac-back-image="${esc(model.commanderBackImageUrl)}">
            <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
          </span>
        </label>
        <label class="deck-metadata-field deck-metadata-partner"><span>partner</span>
          <span class="deck-meta-ac-wrap">
            <input name="partner" value="${esc(model.partner)}" placeholder="partner" autocomplete="off" data-meta-ac="partner" data-meta-ac-scryfall-id="${esc(model.partnerScryfallId)}" data-meta-ac-scryfall-uri="${esc(model.partnerScryfallUri)}" data-meta-ac-image="${esc(model.partnerImageUrl)}" data-meta-ac-back-image="${esc(model.partnerBackImageUrl)}">
            <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
          </span>
        </label>
        <div class="deck-metadata-field deck-metadata-companion">
          <span>companion</span>
          ${model.companion
            ? `<input name="companion" value="${esc(model.companion)}" placeholder="companion" autocomplete="off">`
            : `<button type="button" class="deck-companion-add" data-add-companion>+ add companion</button><input name="companion" value="" placeholder="companion" autocomplete="off" hidden>`}
        </div>
        <label class="deck-metadata-field deck-metadata-description"><span>description</span><textarea name="description" rows="3" placeholder="description">${esc(model.description)}</textarea></label>
        <div class="deck-metadata-actions">
          <button class="btn btn-secondary" type="button" data-cancel-deck-details>cancel</button>
          <button class="btn" type="submit">save deck</button>
        </div>
      </form>
    </section>`;
}

function renderDeckFormatPicker(formatInput) {
  const isPreset = !formatInput || FORMAT_PRESETS.includes(formatInput);
  const selectValue = !formatInput ? '' : isPreset ? formatInput : 'custom';
  const opts = [
    `<option value=""${selectValue === '' ? ' selected' : ''}>-</option>`,
    ...FORMAT_PRESETS.map(f => `<option value="${f}"${selectValue === f ? ' selected' : ''}>${f}</option>`),
    `<option value="custom"${selectValue === 'custom' ? ' selected' : ''}>custom</option>`,
  ].join('');
  const customValue = !isPreset ? formatInput : '';
  return `<span class="deck-format-picker">
    <select name="formatPreset" data-deck-format-preset>${opts}</select>
    <input name="formatCustom" data-deck-format-custom value="${esc(customValue)}" placeholder="custom format" autocomplete="off"${selectValue === 'custom' ? '' : ' hidden'}>
  </span>`;
}

export function renderDeckWorkspaceControls() {
  const modeBtn = (mode, label) =>
    `<button class="deck-mode-btn${state.deckMode === mode ? ' active' : ''}" type="button" data-deck-mode="${mode}" aria-pressed="${state.deckMode === mode ? 'true' : 'false'}">${label}</button>`;
  const boardBtn = (board, label) =>
    `<button class="deck-board-filter-btn${state.deckBoardFilter === board ? ' active' : ''}" type="button" data-deck-board-filter="${board}" aria-pressed="${state.deckBoardFilter === board ? 'true' : 'false'}">${label}</button>`;
  return `<div class="deck-workspace-controls">
    <div class="deck-mode-tabs" aria-label="deck view mode">
      ${modeBtn('visual', 'visual')}
      ${modeBtn('text', 'text')}
      ${modeBtn('stats', 'stats')}
      ${modeBtn('hands', 'hands')}
      ${modeBtn('notes', 'notes')}
    </div>
    <div class="deck-board-filter-tabs" aria-label="deck board filter">
      ${boardBtn('all', 'all')}
      ${boardBtn('main', 'main')}
      ${boardBtn('sideboard', 'side')}
      ${boardBtn('maybe', 'maybe')}
    </div>
    <div class="deck-ownership-toggle" role="group" aria-label="ownership view" title="decklist mode hides ownership and physical location; building mode surfaces them">
      <button type="button" class="deck-ownership-btn${state.deckOwnershipView === 'decklist' ? ' active' : ''}" data-deck-ownership="decklist" aria-pressed="${state.deckOwnershipView === 'decklist' ? 'true' : 'false'}">decklist</button>
      <button type="button" class="deck-ownership-btn${state.deckOwnershipView === 'building' ? ' active' : ''}" data-deck-ownership="building" aria-pressed="${state.deckOwnershipView === 'building' ? 'true' : 'false'}">building</button>
    </div>
  </div>`;
}

export function renderDeckExportPanel() {
  const opts = defaultDeckExportOptions('moxfield');
  return `<section class="deck-export-panel hidden" id="deckExportPanel" aria-label="export deck">
    <form id="deckExportForm" class="deck-export-form">
      <label>format
        <select name="preset">
          <option value="moxfield" selected>moxfield text</option>
          <option value="plain">plain text</option>
          <option value="arena">arena</option>
          <option value="mtgo">mtgo</option>
          <option value="csv">csv</option>
          <option value="json">json</option>
        </select>
      </label>
      <div class="deck-export-checks" aria-label="included boards">
        <label><input type="checkbox" name="includeCommander" checked> commander</label>
        <label><input type="checkbox" name="board" value="main"${opts.boards.includes('main') ? ' checked' : ''}> main</label>
        <label><input type="checkbox" name="board" value="sideboard"${opts.boards.includes('sideboard') ? ' checked' : ''}> side</label>
        <label><input type="checkbox" name="board" value="maybe"${opts.boards.includes('maybe') ? ' checked' : ''}> maybe</label>
        <label><input type="checkbox" name="collapsePrintings"> collapse printings</label>
      </div>
      <div class="deck-export-actions">
        <button class="btn" type="button" data-export-action="copy">copy</button>
        <button class="btn btn-secondary" type="button" data-export-action="download">download</button>
        <button class="btn btn-secondary" type="button" data-close-deck-export>close</button>
      </div>
    </form>
  </section>`;
}
