import { normalizeLocation, LOCATION_TYPES } from '../collection.js';
import { esc } from '../feedback.js';

export const LOC_ICONS = {
  deck: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="3.5" width="6.5" height="8.5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="5" y="1.5" width="6.5" height="8.5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  binder: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/><line x1="5" y1="2" x2="5" y2="12" stroke="currentColor" stroke-width="1"/><circle cx="5" cy="5" r="0.7" fill="currentColor"/><circle cx="5" cy="7" r="0.7" fill="currentColor"/><circle cx="5" cy="9" r="0.7" fill="currentColor"/></svg>',
  box: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><polygon points="2,4 7,1.5 12,4 12,11.5 2,11.5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" stroke-width="1"/><line x1="7" y1="1.5" x2="7" y2="4" stroke="currentColor" stroke-width="1"/></svg>',
};

export function locationPillHtml(loc, { withRemove = false, index = -1 } = {}) {
  const n = normalizeLocation(loc);
  if (!n) return '';
  const icon = LOC_ICONS[n.type] || LOC_ICONS.box;
  const removeBtn = withRemove
    ? '<button class="loc-pill-remove" type="button" data-index="' + index + '" aria-label="remove location">&times;</button>'
    : '';
  return '<span class="loc-pill loc-pill-' + esc(n.type) + '" data-loc-type="' + esc(n.type) + '" data-loc-name="' + esc(n.name) + '">' +
    icon +
    '<span class="loc-pill-name">' + esc(n.name) + '</span>' +
    removeBtn +
  '</span>';
}

export function containerEditRowHtml(c, allowedTypes = LOCATION_TYPES) {
  const radioName = 'editLocType_' + esc(c.type) + '_' + esc(c.name);
  const typeRadiosHtml = allowedTypes.map(t => `<label class="loc-type-radio${t === c.type ? ' is-selected' : ''}">
    <input type="radio" name="${radioName}" value="${esc(t)}"${t === c.type ? ' checked' : ''}>
    <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
  </label>`).join('');
  return `<div class="location-card-edit-row">
    <div class="loc-type-radios">${typeRadiosHtml}</div>
    <input class="location-rename-input" type="text" value="${esc(c.name)}">
    <div class="location-card-edit-actions">
      <button class="btn location-rename-save" type="button">save</button>
      <button class="btn btn-secondary location-rename-cancel" type="button">cancel</button>
    </div>
  </div>`;
}
