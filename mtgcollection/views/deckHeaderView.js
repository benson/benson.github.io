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
  const commanderFinish = String(safeMeta.commanderFinish || 'normal').trim() || 'normal';
  const partner = String(safeMeta.partner || '').trim();
  const partnerScryfallId = String(safeMeta.partnerScryfallId || '').trim();
  const partnerScryfallUri = String(safeMeta.partnerScryfallUri || '').trim();
  const partnerImageUrl = String(safeMeta.partnerImageUrl || '').trim();
  const partnerBackImageUrl = String(safeMeta.partnerBackImageUrl || '').trim();
  const partnerFinish = String(safeMeta.partnerFinish || 'normal').trim() || 'normal';
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
    commanderFinish,
    partner,
    partnerScryfallId,
    partnerScryfallUri,
    partnerImageUrl,
    partnerBackImageUrl,
    partnerFinish,
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

function deckMetaCardItem(label, model, prefix) {
  const name = model[prefix] || '';
  if (!name) return '';
  return `<div><dt>${esc(label)}</dt><dd class="deck-meta-value">
    <button class="deck-meta-card-link" type="button" data-deck-commander-card data-scryfall-id="${esc(model[prefix + 'ScryfallId'] || '')}" data-card-name="${esc(name)}" data-scryfall-uri="${esc(model[prefix + 'ScryfallUri'] || '')}">${esc(name)}</button>
  </dd></div>`;
}

function deckIdentityMetaItems(model) {
  const hideCommanderFormat = model.formatInput === 'commander' && !!model.commander;
  return [
    deckMetaCardItem('commander', model, 'commander'),
    deckMetaCardItem('partner', model, 'partner'),
    hideCommanderFormat ? '' : deckMetaItem('format', model.formatInput, 'unspecified format'),
    model.companion ? deckMetaItem('companion', model.companion, '') : '',
  ].filter(Boolean).join('');
}

export function renderDeckDetailsHeaderHtml(model) {
  const descClass = 'deck-description' + (model.description ? '' : ' is-empty');
  return `<section class="deck-hero">
      <div class="deck-hero-main">
        <div class="deck-hero-read">
          <div class="deck-kicker">deck</div>
          <h2>${esc(model.displayTitle)}</h2>
          <p class="${descClass}">${esc(model.descriptionText)}</p>
          <dl class="deck-meta-strip" aria-label="deck details">
            ${deckIdentityMetaItems(model)}
          </dl>
        </div>
        <section class="deck-details-editor hidden" id="deckDetailsEditor" aria-label="edit deck details">
          <form class="deck-metadata-form" id="deckMetadataForm" data-format="${esc(model.formatInput)}">
            <label class="deck-metadata-field"><span>title</span><input name="title" value="${esc(model.title)}" placeholder="deck title" autocomplete="off"></label>
            <label class="deck-metadata-field"><span>format</span>${renderDeckFormatPicker(model.formatInput)}</label>
            <label class="deck-metadata-field deck-metadata-commander"><span>commander</span>
              <span class="deck-meta-ac-wrap">
                <input name="commander" value="${esc(model.commander)}" placeholder="search commander" autocomplete="off" data-meta-ac="commander" data-meta-ac-scryfall-id="${esc(model.commanderScryfallId)}" data-meta-ac-scryfall-uri="${esc(model.commanderScryfallUri)}" data-meta-ac-image="${esc(model.commanderImageUrl)}" data-meta-ac-back-image="${esc(model.commanderBackImageUrl)}">
                <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
              </span>
            </label>
            <label class="deck-metadata-field deck-metadata-partner"><span>partner</span>
              <span class="deck-meta-ac-wrap">
                <input name="partner" value="${esc(model.partner)}" placeholder="search partner" autocomplete="off" data-meta-ac="partner" data-meta-ac-scryfall-id="${esc(model.partnerScryfallId)}" data-meta-ac-scryfall-uri="${esc(model.partnerScryfallUri)}" data-meta-ac-image="${esc(model.partnerImageUrl)}" data-meta-ac-back-image="${esc(model.partnerBackImageUrl)}">
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
        </section>
      </div>
      <div class="deck-hero-side">
        <div class="deck-hero-actions">
          <div class="deck-export-menu-wrap">
            <button class="btn btn-secondary" type="button" data-toggle-deck-export aria-controls="deckExportPanel" aria-expanded="false">export</button>
            ${renderDeckExportPanel()}
          </div>
          <button class="btn btn-secondary deck-share-btn" type="button" data-deck-action="share">${model.shareId ? 'sharing' : 'share'}</button>
          <button class="btn" type="button" data-sample-hand="draw">sample hand</button>
          <button class="btn btn-secondary" type="button" data-edit-deck-details aria-controls="deckDetailsEditor" aria-expanded="false">edit</button>
        </div>
      </div>
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
