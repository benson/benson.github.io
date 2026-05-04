import { esc } from './feedback.js';
import { getSetIconUrl } from './setIcons.js';

export function renderPrintingRows(printings, { ownershipLookup = null } = {}) {
  return printings.map((c, i) => {
    const setCode = (c.set || '').toLowerCase();
    const iconUrl = setCode ? getSetIconUrl(setCode) : '';
    const icon = iconUrl
      ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
      : '';
    const finishes = Array.isArray(c.finishes) ? c.finishes : [];
    const finishBadges = [];
    if (!finishes.includes('nonfoil') && finishes.includes('foil')) {
      finishBadges.push('<span class="printing-finish-badge">foil only</span>');
    }
    if (finishes.includes('etched')) finishBadges.push('<span class="printing-finish-badge">etched</span>');
    const ownedQty = typeof ownershipLookup === 'function'
      ? Math.max(0, parseInt(ownershipLookup(c), 10) || 0)
      : 0;
    const ownedBadge = ownedQty > 0
      ? `<span class="printing-owned-badge" title="this exact printing is in your collection">owned &times;${ownedQty}</span>`
      : '';
    const year = (c.released_at || '').slice(0, 4);
    return `<li class="printing-row" role="option" data-index="${i}">
      ${icon}
      <span class="printing-set-code">${esc((c.set || '').toUpperCase())}</span>
      <span class="printing-set-name">${esc(c.set_name || '')}</span>
      <span class="printing-cn">#${esc(c.collector_number || '')}</span>
      <span class="printing-finishes">${finishBadges.join('')}</span>
      ${ownedBadge}
      <span class="printing-year">${esc(year)}</span>
    </li>`;
  }).join('');
}

export function renderPrintingList({
  listEl,
  captionEl,
  printings,
  totalCount,
  truncated,
  loadedCount = printings.length,
  filterQuery = '',
  ownershipLookup = null,
}) {
  if (!printings.length) {
    listEl.innerHTML = '';
    captionEl.textContent = filterQuery ? 'No printings match this filter' : 'No printings found';
    return;
  }
  const filtered = String(filterQuery || '').trim();
  const countText = filtered
    ? 'showing ' + printings.length + ' of ' + loadedCount + ' loaded'
    : 'showing ' + printings.length + ' of ' + totalCount;
  const captionParts = [countText];
  if (truncated) {
    captionParts.push('<span class="truncate-hint">More available - narrow by typing the set code</span>');
  }
  captionEl.innerHTML = captionParts.join(' - ');
  listEl.innerHTML = renderPrintingRows(printings, { ownershipLookup });
}
