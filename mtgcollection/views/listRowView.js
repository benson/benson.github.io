import { state } from '../state.js';
import {
  allCollectionLocations,
  allContainers,
  collectionKey,
  locationKey,
  LOCATION_TYPES,
  DEFAULT_LOCATION_TYPE,
  normalizeLocation,
} from '../collection.js';
import { esc } from '../feedback.js';
import { getSetIconUrl } from '../setIcons.js';
import { CONDITION_ABBR, RARITY_ABBR } from '../deckUi.js';
import { locationPillHtml } from '../ui/locationUi.js';
import { formatPrice } from '../ui/priceUi.js';

const TYPE_HEADERS = {
  deck: 'decks',
  binder: 'binders',
  box: 'boxes',
};

function rowLocationChoices(collection = state.collection) {
  const byKey = new Map();
  for (const loc of [
    ...allContainers().map(c => ({ type: c.type, name: c.name })),
    ...allCollectionLocations(collection),
  ]) {
    const key = locationKey(loc);
    if (key && !byKey.has(key)) byKey.set(key, normalizeLocation(loc));
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const typeSort = LOCATION_TYPES.indexOf(a.type) - LOCATION_TYPES.indexOf(b.type);
    return typeSort || a.name.localeCompare(b.name);
  });
}

function rowLocationOptionsHtml(collection = state.collection) {
  const locations = rowLocationChoices(collection);
  const html = ['<option value="" selected>+ loc</option>'];
  for (const type of LOCATION_TYPES) {
    const ofType = locations.filter(loc => loc.type === type);
    if (ofType.length === 0) continue;
    html.push('<optgroup label="' + esc(TYPE_HEADERS[type] || type) + '">');
    for (const loc of ofType) {
      html.push('<option value="' + esc(locationKey(loc)) + '">' + esc(loc.name) + '</option>');
    }
    html.push('</optgroup>');
  }
  html.push('<option value="__new__">+ new container</option>');
  return html.join('');
}

export function locationCellHtml(c, index) {
  const loc = normalizeLocation(c.location);
  if (loc) {
    return locationPillHtml(loc, { withRemove: true, index });
  }

  const typeOptions = LOCATION_TYPES.map(t =>
    '<option value="' + t + '"' + (t === DEFAULT_LOCATION_TYPE ? ' selected' : '') + '>' + t + '</option>'
  ).join('');
  return '<span class="loc-picker" data-index="' + index + '">' +
    '<select class="loc-picker-target" data-index="' + index + '" aria-label="location">' + rowLocationOptionsHtml() + '</select>' +
    '<span class="loc-picker-new hidden">' +
      '<select class="loc-picker-type" data-index="' + index + '" aria-label="new container type">' + typeOptions + '</select>' +
      '<input class="loc-picker-name" data-index="' + index + '" type="text" list="locationOptions" placeholder="new name" autocomplete="off">' +
    '</span>' +
  '</span>';
}

export function renderRow(c, collection = state.collection) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = collection.indexOf(c);
  const key = collectionKey(c);
  const selected = state.selectedKeys.has(key);
  const canPreview = !!(c.imageUrl || c.scryfallId || c.setCode || c.cn || (name && name !== '(unknown)'));
  const previewClasses = canPreview ? 'card-name-button card-preview-link detail-trigger' : 'card-name-button detail-trigger';
  const previewAttr = canPreview
    ? [
        c.imageUrl ? ` data-preview-url="${esc(c.imageUrl)}"` : '',
        c.scryfallId ? ` data-preview-id="${esc(c.scryfallId)}"` : '',
        c.setCode ? ` data-preview-set="${esc(c.setCode)}"` : '',
        c.cn ? ` data-preview-cn="${esc(c.cn)}"` : '',
        name && name !== '(unknown)' ? ` data-preview-name="${esc(name)}"` : '',
        ` data-preview-finish="${esc(c.finish || 'normal')}"`,
      ].join('')
    : '';
  const setCodeLower = (c.setCode || '').toLowerCase();
  const setCode = setCodeLower.toUpperCase();
  const iconUrl = setCodeLower ? getSetIconUrl(setCodeLower) : '';
  const setIcon = iconUrl
    ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
    : '';
  return `<tr class="detail-trigger${selected ? ' row-selected' : ''}" data-index="${index}" data-key="${esc(key)}">
    <td class="col-check"><input type="checkbox" class="row-check" data-key="${esc(key)}"${selected ? ' checked' : ''} aria-label="select row"></td>
    <td class="card-name-cell"><button class="${previewClasses}" type="button" data-index="${index}"${previewAttr}>${esc(name)}</button></td>
    <td class="muted set-cell">${setIcon}${esc(setCode)}</td>
    <td class="muted cn-cell">${esc(c.cn || '')}</td>
    <td class="muted finish-cell">${esc(c.finish)}</td>
    <td class="muted rarity-cell" title="${esc(c.rarity || '')}">${esc(RARITY_ABBR[c.rarity] || c.rarity || '')}</td>
    <td class="muted condition-cell" title="${esc((c.condition || '').replace(/_/g, ' '))}">${esc(CONDITION_ABBR[c.condition] || (c.condition || '').replace(/_/g, ' '))}</td>
    <td class="location-cell">${locationCellHtml(c, index)}</td>
    <td class="tags-cell">${(c.tags || []).map(t => `<span class="row-tag">${esc(t)}<button class="row-tag-remove" type="button" data-tag="${esc(t)}" data-index="${index}" aria-label="remove ${esc(t)}">&times;</button></span>`).join('')}<input class="row-tag-input" data-index="${index}" list="rowTagOptions" placeholder="+ tag" autocomplete="off"></td>
    <td class="qty-cell">${c.qty}</td>
    <td class="muted price-cell">${formatPrice(c)}</td>
  </tr>`;
}
