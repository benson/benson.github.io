import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
} from './vendor/pretext/layout.js';

const FLOW_MARGIN_Y = 14;
const FLOW_GAP_X = 26;
const MAX_FLOW_SHIFT = 52;
const MIN_LINE_WIDTH = 40;

let documentRef = null;
let appCenterEl = null;
let initialized = false;
let scheduled = false;
let followupScheduled = false;
let measurementAvailable = null;
let intersectionObserver = null;
let resizeObserver = null;

const observedButtons = new Set();
const visibleButtons = new Set();
const flowedButtons = new Set();
const flowedCheckboxes = new Set();
const preparedCache = new WeakMap();

function requestFrame(callback) {
  const win = documentRef?.defaultView || globalThis;
  if (typeof win.requestAnimationFrame === 'function') {
    return win.requestAnimationFrame(callback);
  }
  return win.setTimeout(callback, 16);
}

function canMeasureText(documentObj) {
  if (measurementAvailable !== null) return measurementAvailable;
  try {
    const canvas = documentObj?.createElement?.('canvas');
    measurementAvailable = !!(
      globalThis.Intl?.Segmenter &&
      canvas?.getContext?.('2d')
    );
  } catch (e) {
    measurementAvailable = false;
  }
  return measurementAvailable;
}

function sourceText(button) {
  if (!button.dataset.pretextFlowText) {
    button.dataset.pretextFlowText = button.textContent || '';
  }
  return button.dataset.pretextFlowText;
}

function fontFor(style) {
  if (style.font && style.font !== '') return style.font;
  return [
    style.fontStyle || 'normal',
    style.fontVariant || 'normal',
    style.fontWeight || '400',
    style.fontSize || '14px',
    style.fontFamily || 'serif',
  ].join(' ');
}

function numericPx(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lineHeightFor(style) {
  const fontSize = numericPx(style.fontSize, 14);
  const lineHeight = numericPx(style.lineHeight, 0);
  return lineHeight > 0 ? lineHeight : fontSize * 1.2;
}

function letterSpacingFor(style) {
  return numericPx(style.letterSpacing, 0);
}

function preparedFor(button, text, font, letterSpacing) {
  const existing = preparedCache.get(button);
  if (
    existing &&
    existing.text === text &&
    existing.font === font &&
    existing.letterSpacing === letterSpacing
  ) {
    return existing.prepared;
  }

  const prepared = prepareWithSegments(text, font, { letterSpacing });
  preparedCache.set(button, { text, font, letterSpacing, prepared });
  return prepared;
}

function restoreButton(button) {
  if (!button?.classList?.contains('is-flowing-tab-text')) return;
  const text = sourceText(button);
  button.textContent = text;
  button.classList.remove('is-flowing-tab-text');
  button.style.removeProperty('height');
  button.style.removeProperty('--pretext-flow-line-height');
  flowedButtons.delete(button);
}

function checkboxForRow(row) {
  return row?.querySelector?.('.col-check .row-check') || null;
}

function checkboxCellForRow(row) {
  return row?.querySelector?.('.col-check') || null;
}

function restoreCheckbox(target) {
  const checkbox = target?.matches?.('.row-check')
    ? target
    : checkboxForRow(target);
  const cell = target?.matches?.('.col-check')
    ? target
    : checkbox?.closest?.('.col-check') || checkboxCellForRow(target);
  if (checkbox) {
    checkbox.classList.remove('is-flowing-tab-check');
    checkbox.style.removeProperty('--pretext-flow-check-shift');
    flowedCheckboxes.delete(checkbox);
  }
  if (cell) {
    cell.classList.remove('is-flowing-tab-check-cell');
    cell.style.removeProperty('--pretext-flow-check-shift');
    flowedCheckboxes.delete(cell);
  }
}

function moveCheckbox(row, shift) {
  const cell = checkboxCellForRow(row);
  const checkbox = checkboxForRow(row);
  const target = cell || checkbox;
  if (!target) return;
  if (shift <= 0.25) {
    restoreCheckbox(cell || checkbox);
    return;
  }
  checkbox?.classList?.remove('is-flowing-tab-check');
  checkbox?.style?.removeProperty('--pretext-flow-check-shift');
  target.classList.add('is-flowing-tab-check-cell');
  target.style.setProperty('--pretext-flow-check-shift', `${shift.toFixed(2)}px`);
  flowedCheckboxes.add(target);
}

function rowFlowAnchorLeft(row, fallbackLeft) {
  const cell = checkboxCellForRow(row);
  const checkbox = checkboxForRow(row);
  const checkboxRect = checkbox?.getBoundingClientRect?.();
  if (checkboxRect && checkboxRect.width > 0) {
    const currentShift = numericPx(
      cell?.style.getPropertyValue('--pretext-flow-check-shift')
        || checkbox.style.getPropertyValue('--pretext-flow-check-shift'),
      0
    );
    return Math.min(checkboxRect.left - currentShift, fallbackLeft);
  }
  return fallbackLeft;
}

function checkboxShiftForRow(row, tabRect, maxShift, fallbackShift) {
  const checkboxRect = checkboxForRow(row)?.getBoundingClientRect?.();
  if (!checkboxRect || checkboxRect.height <= 0) return fallbackShift;
  const checkboxCenterY = checkboxRect.top + checkboxRect.height / 2;
  return Math.max(fallbackShift, flowShiftForY(checkboxCenterY, tabRect, maxShift));
}

function restoreAllFlowed() {
  for (const button of Array.from(flowedButtons)) restoreButton(button);
  for (const checkbox of Array.from(flowedCheckboxes)) restoreCheckbox(checkbox);
}

function isFlowActive(documentObj = documentRef) {
  const body = documentObj?.body;
  if (!body?.classList.contains('view-list')) return false;
  if (body.classList.contains('sidebar-tab-simple')) return false;
  if (body.classList.contains('view-deck') || body.classList.contains('share-mode')) return false;
  return !!documentObj.querySelector('.list-view.active.collection-display-table table:not([hidden])');
}

function sidebarTabRect(documentObj = documentRef) {
  const tab = documentObj?.querySelector?.('[data-sidebar-edge-toggle]');
  if (!tab) return null;
  const style = documentObj.defaultView?.getComputedStyle?.(tab);
  if (style?.display === 'none' || style?.visibility === 'hidden') return null;
  const rect = tab.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function flowShiftForY(y, tabRect, maxShift) {
  const top = tabRect.top - FLOW_MARGIN_Y;
  const bottom = tabRect.bottom + FLOW_MARGIN_Y;
  const radiusY = (bottom - top) / 2;
  if (radiusY <= 0) return 0;
  const centerY = top + radiusY;
  const normalized = Math.abs(y - centerY) / radiusY;
  if (normalized >= 1) return 0;
  return maxShift * Math.sqrt(1 - normalized * normalized);
}

function lineSpan(documentObj, line) {
  const span = documentObj.createElement('span');
  span.className = 'pretext-flow-line';
  span.textContent = line.text;
  span.style.transform = `translate(${line.shift.toFixed(2)}px, ${line.top.toFixed(2)}px)`;
  span.style.maxWidth = `${Math.max(MIN_LINE_WIDTH, line.width).toFixed(2)}px`;
  return span;
}

function renderFlowedButton(button, lines, lineHeight) {
  const oldHeight = button.getBoundingClientRect().height;
  const nextHeight = Math.max(lineHeight, lines.length * lineHeight);
  button.textContent = '';
  button.classList.add('is-flowing-tab-text');
  button.style.height = `${nextHeight.toFixed(2)}px`;
  button.style.setProperty('--pretext-flow-line-height', `${lineHeight.toFixed(2)}px`);
  for (const line of lines) button.appendChild(lineSpan(button.ownerDocument, line));
  flowedButtons.add(button);
  return Math.abs(oldHeight - nextHeight) > 0.5;
}

function layoutButton(button, tabRect) {
  if (!button.isConnected) {
    flowedButtons.delete(button);
    return false;
  }

  const row = button.closest('tr');
  const rowRect = row?.getBoundingClientRect?.();
  if (!rowRect || rowRect.bottom < tabRect.top - FLOW_MARGIN_Y || rowRect.top > tabRect.bottom + FLOW_MARGIN_Y) {
    restoreButton(button);
    restoreCheckbox(row);
    return false;
  }

  const text = sourceText(button);
  if (!text.trim()) {
    restoreButton(button);
    restoreCheckbox(row);
    return false;
  }

  const rect = button.getBoundingClientRect();
  const flowAnchorLeft = rowFlowAnchorLeft(row, rect.left);
  const maxShift = Math.min(MAX_FLOW_SHIFT, Math.max(0, tabRect.right - flowAnchorLeft + FLOW_GAP_X));
  if (maxShift <= 0.25) {
    restoreButton(button);
    restoreCheckbox(row);
    return false;
  }

  const style = button.ownerDocument.defaultView.getComputedStyle(button);
  const lineHeight = lineHeightFor(style);
  const availableWidth = Math.max(MIN_LINE_WIDTH, rect.width || button.closest('td')?.getBoundingClientRect?.().width || 0);
  const font = fontFor(style);
  const letterSpacing = letterSpacingFor(style);
  let prepared;
  try {
    prepared = preparedFor(button, text, font, letterSpacing);
  } catch (e) {
    measurementAvailable = false;
    restoreButton(button);
    restoreCheckbox(row);
    return false;
  }

  const lines = [];
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  let affected = false;

  for (let guard = 0; guard < 20; guard++) {
    const lineCenterY = rect.top + y + lineHeight / 2;
    const shift = flowShiftForY(lineCenterY, tabRect, maxShift);
    const width = Math.max(MIN_LINE_WIDTH, availableWidth - shift);
    const range = layoutNextLineRange(prepared, cursor, width);
    if (range === null) break;
    const materialized = materializeLineRange(prepared, range);
    if (shift > 0.25) affected = true;
    lines.push({
      text: materialized.text,
      width,
      shift,
      top: y,
    });
    cursor = range.end;
    y += lineHeight;
  }

  const checkboxShift = checkboxShiftForRow(row, tabRect, maxShift, lines[0]?.shift || 0);
  if (!affected || lines.length === 0) {
    restoreButton(button);
    moveCheckbox(row, checkboxShift);
    return false;
  }

  moveCheckbox(row, checkboxShift);
  return renderFlowedButton(button, lines, lineHeight);
}

function currentButtons() {
  return Array.from(documentRef?.querySelectorAll?.(
    '.list-view.collection-display-table tbody .card-name-button'
  ) || []);
}

function refreshObservedButtons() {
  if (!documentRef) return;
  const next = new Set(currentButtons());
  for (const button of Array.from(observedButtons)) {
    if (next.has(button)) continue;
    restoreButton(button);
    restoreCheckbox(button.closest?.('tr'));
    intersectionObserver?.unobserve?.(button);
    observedButtons.delete(button);
    visibleButtons.delete(button);
    flowedButtons.delete(button);
  }
  for (const button of next) {
    if (observedButtons.has(button)) continue;
    observedButtons.add(button);
    if (intersectionObserver) {
      intersectionObserver.observe(button);
    } else {
      visibleButtons.add(button);
    }
  }
}

function candidateButtons() {
  const source = intersectionObserver ? visibleButtons : observedButtons;
  return Array.from(source).filter(button => button.isConnected);
}

function runLayout() {
  scheduled = false;
  if (!documentRef || !isFlowActive(documentRef) || !canMeasureText(documentRef)) {
    restoreAllFlowed();
    return;
  }

  const tabRect = sidebarTabRect(documentRef);
  if (!tabRect) {
    restoreAllFlowed();
    return;
  }

  let needsFollowup = false;
  for (const button of candidateButtons()) {
    needsFollowup = layoutButton(button, tabRect) || needsFollowup;
  }

  if (needsFollowup && !followupScheduled) {
    followupScheduled = true;
    requestFrame(() => {
      followupScheduled = false;
      runLayout();
    });
  }
}

function scheduleLayout({ rescan = false } = {}) {
  if (!documentRef) return;
  if (rescan) refreshObservedButtons();
  if (scheduled) return;
  scheduled = true;
  requestFrame(runLayout);
}

export function syncSidebarTabFlow(options = {}) {
  if (!initialized) initSidebarTabFlow();
  scheduleLayout({ rescan: !!options.rescan });
}

export function initSidebarTabFlow({
  documentObj = globalThis.document,
} = {}) {
  if (initialized || !documentObj?.querySelector) return;
  initialized = true;
  documentRef = documentObj;
  appCenterEl = documentObj.querySelector('.app-center');

  const IntersectionObserverCtor = documentObj.defaultView?.IntersectionObserver || globalThis.IntersectionObserver;
  if (IntersectionObserverCtor) {
    intersectionObserver = new IntersectionObserverCtor(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleButtons.add(entry.target);
        else visibleButtons.delete(entry.target);
      }
      scheduleLayout();
    }, { root: null, rootMargin: '180px 0px' });
  }

  const ResizeObserverCtor = documentObj.defaultView?.ResizeObserver || globalThis.ResizeObserver;
  if (ResizeObserverCtor) {
    resizeObserver = new ResizeObserverCtor(() => scheduleLayout({ rescan: true }));
    const tab = documentObj.querySelector('[data-sidebar-edge-toggle]');
    const list = documentObj.getElementById('listView');
    if (tab) resizeObserver.observe(tab);
    if (list) resizeObserver.observe(list);
  }

  appCenterEl?.addEventListener('scroll', () => scheduleLayout(), { passive: true });
  documentObj.defaultView?.addEventListener('scroll', () => scheduleLayout(), { passive: true });
  documentObj.defaultView?.addEventListener('resize', () => scheduleLayout({ rescan: true }));
  documentObj.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-sidebar-edge-toggle]')) return;
    scheduleLayout({ rescan: true });
    documentObj.defaultView.setTimeout(() => scheduleLayout({ rescan: true }), 220);
  });

  const MutationObserverCtor = documentObj.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (MutationObserverCtor && documentObj.body) {
    const mutationObserver = new MutationObserverCtor(() => scheduleLayout({ rescan: true }));
    mutationObserver.observe(documentObj.body, { attributes: true, attributeFilter: ['class'] });
  }
  refreshObservedButtons();
}
