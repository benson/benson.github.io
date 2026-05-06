import { showFeedback } from './feedback.js';
import { SYNC_API_URL } from './syncClient.js';
import { getSyncAuthToken, getSyncUser, syncNow } from './syncEngine.js';
import { buildAddPreviewCardModel } from './addPreviewModel.js';
import { createAddPreviewElement } from './addPreviewView.js';
import { renderPrintingRows } from './addPrintingView.js';
import {
  allCollectionLocations,
  allContainers,
  DEFAULT_LOCATION_TYPE,
  formatLocationLabel,
  LOCATION_TYPES,
  locationKey,
  normalizeLocation,
} from './collection.js';

export const SYSTEM_PROMPT = [
  'You are the in-app MTG Collection assistant.',
  'Use the MTG Collection MCP tools to read the collection and preview safe changes.',
  'Do not apply changes yourself. The app receives preview metadata separately and shows pending changes for user confirmation.',
  'When calling tools, use real JSON types: quantities are numbers and createContainer is a boolean, not quoted strings.',
  'For add requests, do not invent set codes, collector numbers, rarities, Scryfall ids, quantities, finishes, or conditions.',
  'If the user does not provide every add detail, use search_card_printings or preview_add_inventory_item to return candidates/input needs; the app will render quick controls.',
  'When the user asks for foils, nonfoils, normal cards, or etched foils in their collection, pass the matching finish to search_inventory.',
  'For broad inventory filters, call search_inventory with structured filters instead of putting the whole user question into query. Use minPrice/maxPrice, minQty/maxQty, cardType, condition, rarity, tags, location, sortBy, and sortDirection when relevant.',
  'When the user asks about prices, value, cheapest, most expensive, cards over/under a price, or cards with many copies, use collection price/quantity fields from get_collection_summary or search_inventory; do not say price data is unavailable when the tools return price.',
  'For cheapest or most expensive card questions inside a binder, box, or deck, call search_inventory with the matching location plus sortBy=price and sortDirection=asc or desc; use list_containers only for container counts or metadata.',
  'Treat "bulk" as the box named "bulk" when it appears as a location. Treat "card stack" or "stack value" as one inventory row sorted by totalValue, not as a container total.',
  'If a phrase could be a container name, such as "breya artifacts" or "trade binder", do not split it into a card-name query; pass it as location.',
  'When showing inventory cards from search_inventory, get_container, or get_deck, keep the prose short and do not write markdown tables; the app renders the card results separately.',
].join(' ');
const HOSTED_PROVIDER = 'cloudflare';
const HOSTED_MODEL = '@cf/openai/gpt-oss-120b';
const CHAT_POSITION_KEY = 'mtgcollection_mcp_chat_position_v1';
const CHAT_SIZE_KEY = 'mtgcollection_mcp_chat_size_v1';
const CHAT_EDGE_MARGIN = 12;
const CHAT_RESIZE_HANDLES = ['left', 'right', 'bottom', 'bottom-left', 'bottom-right'];

let root = null;
let logEl = null;
let draftPanelEl = null;
let previewPanelEl = null;
let formEl = null;
let inputEl = null;
let sendBtn = null;
let closeBtn = null;
let clearBtn = null;
let dragHandleEl = null;
let documentRef = null;
let toggleButtons = [];
let dragState = null;
let resizeDragState = null;
let resizeObserver = null;
let chatEpoch = 0;
const transcript = [];
const pendingDrafts = [];
const pendingPreviews = [];

const CONDITION_OPTIONS = [
  ['near_mint', 'nm'],
  ['lightly_played', 'lp'],
  ['moderately_played', 'mp'],
  ['heavily_played', 'hp'],
  ['damaged', 'dmg'],
];

export function clampChatPosition(position, viewport, size, margin = CHAT_EDGE_MARGIN) {
  const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, viewportWidth - width - margin);
  const maxTop = Math.max(minTop, viewportHeight - height - margin);
  const rawLeft = Number(position?.left);
  const rawTop = Number(position?.top);
  return {
    left: Math.min(Math.max(Number.isFinite(rawLeft) ? rawLeft : minLeft, minLeft), maxLeft),
    top: Math.min(Math.max(Number.isFinite(rawTop) ? rawTop : minTop, minTop), maxTop),
  };
}

function storage() {
  try {
    return documentRef?.defaultView?.localStorage || globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

function readStoredChatPosition() {
  try {
    const raw = storage()?.getItem(CHAT_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.left)) || !Number.isFinite(Number(parsed?.top))) return null;
    return { left: Number(parsed.left), top: Number(parsed.top) };
  } catch (e) {
    return null;
  }
}

function writeStoredChatPosition(position) {
  try {
    storage()?.setItem(CHAT_POSITION_KEY, JSON.stringify({
      left: Math.round(position.left),
      top: Math.round(position.top),
    }));
  } catch (e) {}
}

function chatResizeBounds(viewport, margin = CHAT_EDGE_MARGIN) {
  const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
  const maxWidth = Math.max(320, viewportWidth - (margin * 2));
  const maxHeight = Math.max(320, viewportHeight - (margin * 2));
  return {
    maxWidth,
    maxHeight,
    minWidth: Math.min(340, maxWidth),
    minHeight: Math.min(320, maxHeight),
    viewportWidth,
    viewportHeight,
  };
}

function clampNumber(value, min, max, fallback) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : fallback;
  return Math.min(Math.max(next, min), max);
}

export function clampChatSize(size, viewport, margin = CHAT_EDGE_MARGIN) {
  const { minWidth, minHeight, maxWidth, maxHeight } = chatResizeBounds(viewport, margin);
  return {
    width: clampNumber(size?.width, minWidth, maxWidth, 430),
    height: clampNumber(size?.height, minHeight, maxHeight, 430),
  };
}

export function calculateChatResize({ edge, startRect, delta, viewport, margin = CHAT_EDGE_MARGIN } = {}) {
  const bounds = chatResizeBounds(viewport, margin);
  const startLeft = clampNumber(startRect?.left, margin, Math.max(margin, bounds.viewportWidth - margin), margin);
  const startTop = clampNumber(startRect?.top, margin, Math.max(margin, bounds.viewportHeight - margin), margin);
  const startWidth = clampNumber(startRect?.width, bounds.minWidth, bounds.maxWidth, 430);
  const startHeight = clampNumber(startRect?.height, bounds.minHeight, bounds.maxHeight, 430);
  const dx = Number(delta?.x);
  const dy = Number(delta?.y);
  const moveX = Number.isFinite(dx) ? dx : 0;
  const moveY = Number.isFinite(dy) ? dy : 0;
  const name = String(edge || '');
  let left = startLeft;
  let top = startTop;
  let width = startWidth;
  let height = startHeight;

  if (name === 'left' || name === 'bottom-left') {
    const fixedRight = clampNumber(startLeft + startWidth, margin + bounds.minWidth, bounds.viewportWidth - margin, startLeft + startWidth);
    const maxWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, fixedRight - margin));
    width = clampNumber(startWidth - moveX, bounds.minWidth, maxWidth, startWidth);
    left = fixedRight - width;
  } else if (name === 'right' || name === 'bottom-right') {
    const maxWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, bounds.viewportWidth - margin - startLeft));
    width = clampNumber(startWidth + moveX, bounds.minWidth, maxWidth, startWidth);
  }

  if (name === 'bottom' || name === 'bottom-left' || name === 'bottom-right') {
    const maxHeight = Math.max(bounds.minHeight, Math.min(bounds.maxHeight, bounds.viewportHeight - margin - startTop));
    height = clampNumber(startHeight + moveY, bounds.minHeight, maxHeight, startHeight);
  }

  return {
    position: { left: Math.round(left), top: Math.round(top) },
    size: { width: Math.round(width), height: Math.round(height) },
  };
}

function readStoredChatSize() {
  try {
    const raw = storage()?.getItem(CHAT_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.width)) || !Number.isFinite(Number(parsed?.height))) return null;
    return { width: Number(parsed.width), height: Number(parsed.height) };
  } catch (e) {
    return null;
  }
}

function writeStoredChatSize(size) {
  try {
    storage()?.setItem(CHAT_SIZE_KEY, JSON.stringify({
      width: Math.round(size.width),
      height: Math.round(size.height),
    }));
  } catch (e) {}
}

function chatViewport() {
  const win = documentRef?.defaultView || globalThis;
  const docEl = documentRef?.documentElement;
  return {
    width: win?.innerWidth || docEl?.clientWidth || 1024,
    height: win?.innerHeight || docEl?.clientHeight || 768,
  };
}

function chatSize() {
  const rect = root?.getBoundingClientRect?.();
  return {
    width: rect?.width || root?.offsetWidth || 430,
    height: rect?.height || root?.offsetHeight || 360,
  };
}

function setChatSize(size, { persist = false } = {}) {
  if (!root) return null;
  const next = clampChatSize(size, chatViewport());
  root.style.setProperty('--mcp-chat-width', Math.round(next.width) + 'px');
  root.style.setProperty('--mcp-chat-height', Math.round(next.height) + 'px');
  if (persist) writeStoredChatSize(next);
  return next;
}

function applyStoredChatSize() {
  const stored = readStoredChatSize();
  if (stored) setChatSize(stored);
}

function currentChatPosition() {
  const left = parseFloat(root?.style.getPropertyValue('--mcp-chat-left') || '');
  const top = parseFloat(root?.style.getPropertyValue('--mcp-chat-top') || '');
  if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  const rect = root?.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) return { left: rect.left, top: rect.top };
  return null;
}

function setChatPosition(position, { persist = false, size = null } = {}) {
  if (!root) return null;
  const next = clampChatPosition(position, chatViewport(), size || chatSize());
  root.style.setProperty('--mcp-chat-left', Math.round(next.left) + 'px');
  root.style.setProperty('--mcp-chat-top', Math.round(next.top) + 'px');
  root.classList.add('is-positioned');
  if (persist) writeStoredChatPosition(next);
  return next;
}

function applyStoredChatPosition() {
  const stored = readStoredChatPosition();
  if (stored) setChatPosition(stored);
}

function ensureChatPositioned() {
  const current = currentChatPosition();
  if (current) setChatPosition(current);
}

function clampCurrentChatPosition({ persist = false } = {}) {
  const current = currentChatPosition();
  if (current && root?.classList.contains('is-positioned')) setChatPosition(current, { persist });
}

function shouldIgnoreDragTarget(target) {
  return Boolean(target?.closest?.('button, input, textarea, select, a, [data-mcp-chat-resize-handle]'));
}

function startChatDrag(event) {
  if (!root || shouldIgnoreDragTarget(event.target)) return;
  if (event.button !== undefined && event.button !== 0) return;
  const start = setChatPosition(currentChatPosition() || readStoredChatPosition() || { left: CHAT_EDGE_MARGIN, top: CHAT_EDGE_MARGIN });
  if (!start) return;
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: start.left,
    startTop: start.top,
  };
  root.classList.add('is-dragging');
  if (event.pointerId !== undefined && typeof dragHandleEl?.setPointerCapture === 'function') {
    dragHandleEl.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function moveChatDrag(event) {
  if (!dragState) return;
  setChatPosition({
    left: dragState.startLeft + event.clientX - dragState.startX,
    top: dragState.startTop + event.clientY - dragState.startY,
  });
}

function endChatDrag(event) {
  if (!dragState) return;
  if (
    event?.pointerId !== undefined
    && dragState.pointerId !== undefined
    && event.pointerId !== dragState.pointerId
  ) return;
  dragState = null;
  root?.classList.remove('is-dragging');
  const current = currentChatPosition();
  if (current) setChatPosition(current, { persist: true });
  if (event?.pointerId !== undefined && typeof dragHandleEl?.releasePointerCapture === 'function') {
    dragHandleEl.releasePointerCapture(event.pointerId);
  }
}

function ensureChatResizeHandles() {
  if (!root || !documentRef) return;
  CHAT_RESIZE_HANDLES.forEach(edge => {
    let handle = root.querySelector(`[data-mcp-chat-resize-handle="${edge}"]`);
    if (!handle) {
      handle = documentRef.createElement('div');
      handle.className = `mcp-chat-resize-handle mcp-chat-resize-${edge}`;
      handle.dataset.mcpChatResizeHandle = edge;
      handle.setAttribute('aria-hidden', 'true');
      root.appendChild(handle);
    }
    if (!handle.dataset.mcpChatResizeBound) {
      handle.dataset.mcpChatResizeBound = '1';
      handle.addEventListener('pointerdown', startChatResize);
    }
  });
}

function startChatResize(event) {
  if (!root) return;
  if (event.button !== undefined && event.button !== 0) return;
  const handle = event.currentTarget?.dataset?.mcpChatResizeHandle
    ? event.currentTarget
    : event.target?.closest?.('[data-mcp-chat-resize-handle]');
  const edge = handle?.dataset?.mcpChatResizeHandle;
  if (!edge) return;
  const currentSize = setChatSize(chatSize()) || chatSize();
  const currentPosition = setChatPosition(currentChatPosition() || readStoredChatPosition() || { left: CHAT_EDGE_MARGIN, top: CHAT_EDGE_MARGIN }, { size: currentSize });
  if (!currentPosition) return;
  resizeDragState = {
    pointerId: event.pointerId,
    edge,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startRect: {
      left: currentPosition.left,
      top: currentPosition.top,
      width: currentSize.width,
      height: currentSize.height,
    },
    next: null,
  };
  root.classList.add('is-resizing');
  if (event.pointerId !== undefined && typeof handle.setPointerCapture === 'function') {
    handle.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function moveChatResize(event) {
  if (!resizeDragState) return;
  if (
    event?.pointerId !== undefined
    && resizeDragState.pointerId !== undefined
    && event.pointerId !== resizeDragState.pointerId
  ) return;
  const next = calculateChatResize({
    edge: resizeDragState.edge,
    startRect: resizeDragState.startRect,
    delta: {
      x: event.clientX - resizeDragState.startX,
      y: event.clientY - resizeDragState.startY,
    },
    viewport: chatViewport(),
  });
  resizeDragState.next = next;
  setChatSize(next.size);
  setChatPosition(next.position, { size: next.size });
  event.preventDefault();
}

function endChatResize(event) {
  if (!resizeDragState) return;
  if (
    event?.pointerId !== undefined
    && resizeDragState.pointerId !== undefined
    && event.pointerId !== resizeDragState.pointerId
  ) return;
  const state = resizeDragState;
  resizeDragState = null;
  root?.classList.remove('is-resizing');
  if (state.next) {
    setChatSize(state.next.size, { persist: true });
    setChatPosition(state.next.position, { persist: true, size: state.next.size });
  } else {
    setChatSize(chatSize(), { persist: true });
    clampCurrentChatPosition({ persist: true });
  }
  if (event?.pointerId !== undefined && typeof state.handle?.releasePointerCapture === 'function') {
    state.handle.releasePointerCapture(event.pointerId);
  }
}

function observeChatResize() {
  resizeObserver?.disconnect?.();
  const ResizeObserverCtor = documentRef?.defaultView?.ResizeObserver || globalThis.ResizeObserver;
  if (!root || typeof ResizeObserverCtor !== 'function') return;
  resizeObserver = new ResizeObserverCtor(entries => {
    const entry = entries?.[0];
    const box = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
    const width = box?.inlineSize || entry?.contentRect?.width || root?.getBoundingClientRect?.().width || 0;
    const height = box?.blockSize || entry?.contentRect?.height || root?.getBoundingClientRect?.().height || 0;
    if (!width || !height || root.getAttribute('aria-hidden') === 'true') return;
    writeStoredChatSize(clampChatSize({ width, height }, chatViewport()));
    clampCurrentChatPosition({ persist: true });
  });
  resizeObserver.observe(root);
}

function appendMessage(role, content, meta = {}) {
  transcript.push({ role, content, meta });
  renderTranscript();
}

function confirmClearChat() {
  if (!pendingDrafts.length && !pendingPreviews.length) return true;
  const confirmFn = documentRef?.defaultView?.confirm || globalThis.confirm;
  if (typeof confirmFn !== 'function') return true;
  return confirmFn('Clear this chat and discard pending chat changes?') !== false;
}

function clearChat({ confirmFirst = true } = {}) {
  if (confirmFirst && !confirmClearChat()) return false;
  chatEpoch += 1;
  transcript.splice(0, transcript.length);
  pendingDrafts.splice(0, pendingDrafts.length);
  pendingPreviews.splice(0, pendingPreviews.length);
  if (inputEl) inputEl.value = '';
  if (sendBtn) sendBtn.disabled = false;
  renderTranscript();
  renderPendingDrafts();
  renderPendingPreviews();
  inputEl?.focus();
  return true;
}

function setChatOpen(open, { focus = false } = {}) {
  if (!root || !documentRef) return;
  documentRef.body.classList.toggle('mcp-chat-open', open);
  root.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggleButtons.forEach(button => button.setAttribute('aria-expanded', open ? 'true' : 'false'));
  if (open) {
    applyStoredChatSize();
    ensureChatPositioned();
    clampCurrentChatPosition();
  }
  if (open && focus) {
    globalThis.setTimeout(() => {
      inputEl?.focus();
    }, 0);
  }
}

function toggleChat() {
  const open = !documentRef?.body.classList.contains('mcp-chat-open');
  setChatOpen(open, { focus: open });
}

function submitChatForm() {
  if (!formEl) return;
  if (typeof formEl.requestSubmit === 'function') {
    formEl.requestSubmit();
    return;
  }
  const EventCtor = documentRef?.defaultView?.Event || Event;
  formEl.dispatchEvent(new EventCtor('submit', { bubbles: true, cancelable: true }));
}

function handleInputKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (sendBtn?.disabled) return;
  submitChatForm();
}

function changeTokensFromText(text) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /"changeToken"\s*:\s*"([^"]+)"/g,
    /\bchangeToken\b\s*[:=]\s*([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g,
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(text))) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        out.push(match[1]);
      }
    }
  }
  return out;
}

function randomDraftId() {
  if (globalThis.crypto?.randomUUID) return 'draft_' + globalThis.crypto.randomUUID().replace(/-/g, '');
  return 'draft_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeFinish(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'foil') return 'foil';
  if (raw === 'etched' || raw === 'etched_foil') return 'etched';
  return 'normal';
}

function finishLabel(value) {
  const finish = normalizeFinish(value);
  if (finish === 'foil') return 'foil';
  if (finish === 'etched') return 'etched';
  return 'nonfoil';
}

function finishOptionsForCandidate(candidate, selectedFinish) {
  const finishes = Array.isArray(candidate?.finishes) ? candidate.finishes.map(normalizeFinish) : [];
  const values = [];
  for (const finish of finishes) {
    if (!values.includes(finish)) values.push(finish);
  }
  const selected = normalizeFinish(selectedFinish);
  if (!values.length && !values.includes(selected)) values.unshift(selected);
  if (!values.length) values.push('normal');
  return values;
}

function candidateLabel(candidate) {
  const bits = [
    candidate.name || 'card',
    [candidate.setCode, candidate.collectorNumber].filter(Boolean).join(' #'),
    candidate.setName,
    candidate.rarity,
  ].filter(Boolean);
  return bits.join(' · ');
}

function normalizePendingDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.filter(candidate => candidate?.previewAddArgs && typeof candidate.previewAddArgs === 'object')
    : [];
  if (!candidates.length) return null;
  const firstArgs = candidates[0].previewAddArgs || {};
  return {
    id: randomDraftId(),
    type: raw.previewType || 'inventory.add',
    message: String(raw.message || 'Choose add details, then create a preview.'),
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.map(String) : [],
    query: String(raw.query || ''),
    resolvedName: String(raw.resolvedName || candidates[0].name || ''),
    totalCount: Math.max(candidates.length, parseInt(raw.totalCount, 10) || 0),
    truncated: Boolean(raw.truncated),
    candidates,
    selectedIndex: 0,
    qty: Math.max(1, parseInt(firstArgs.qty, 10) || 1),
    finish: normalizeFinish(firstArgs.finish || raw.requestedFinish || candidates[0].requestedFinish || 'normal'),
    condition: String(firstArgs.condition || 'near_mint'),
    error: '',
    previewing: false,
  };
}

function addPendingDrafts(drafts) {
  let added = 0;
  for (const raw of Array.isArray(drafts) ? drafts : []) {
    const draft = normalizePendingDraft(raw);
    if (!draft) continue;
    pendingDrafts.push(draft);
    added += 1;
  }
  renderPendingDrafts();
  return added;
}

function selectedDraftCandidate(draft) {
  return draft.candidates[Math.max(0, Math.min(draft.selectedIndex, draft.candidates.length - 1))] || draft.candidates[0];
}

function candidatePreviewCard(candidate = {}) {
  return {
    id: candidate.scryfallId || candidate.previewAddArgs?.scryfallId || '',
    name: candidate.name || candidate.previewAddArgs?.name || 'card',
    set: candidate.setCode || candidate.previewAddArgs?.setCode || '',
    collector_number: candidate.collectorNumber || candidate.previewAddArgs?.cn || '',
    setName: candidate.setName || '',
    typeLine: candidate.typeLine || '',
    rarity: candidate.rarity || '',
    imageUrl: candidate.imageUrl || '',
    backImageUrl: candidate.backImageUrl || '',
  };
}

function candidatePrintingCard(candidate = {}) {
  return {
    set: candidate.setCode || candidate.previewAddArgs?.setCode || '',
    set_name: candidate.setName || '',
    collector_number: candidate.collectorNumber || candidate.previewAddArgs?.cn || '',
    released_at: candidate.releasedAt || '',
  };
}

function renderDraftPrintingPicker(draft) {
  if (!draft?.candidates?.length) return null;
  const picker = documentRef.createElement('div');
  picker.className = 'printing-picker active mcp-chat-draft-printing-picker';

  const caption = documentRef.createElement('div');
  caption.className = 'printing-list-caption';
  const shown = draft.candidates.length;
  const total = Math.max(shown, parseInt(draft.totalCount, 10) || shown);
  caption.textContent = shown === total
    ? 'showing ' + shown + ' printing' + (shown === 1 ? '' : 's')
    : 'showing ' + shown + ' of ' + total;
  if (draft.truncated) caption.textContent += ' - narrow in the main add flow for more printings';

  const list = documentRef.createElement('ul');
  list.className = 'printing-list';
  list.setAttribute('role', 'listbox');
  list.innerHTML = renderPrintingRows(draft.candidates.map(candidatePrintingCard));
  Array.from(list.querySelectorAll('.printing-row')).forEach((row, index) => {
    row.classList.toggle('selected', index === draft.selectedIndex);
    row.setAttribute('aria-selected', index === draft.selectedIndex ? 'true' : 'false');
  });

  picker.append(caption, list);
  return picker;
}

function draftPreviewArgs(draft) {
  const candidate = selectedDraftCandidate(draft);
  const finishOptions = finishOptionsForCandidate(candidate, draft.finish);
  const finish = finishOptions.includes(normalizeFinish(draft.finish)) ? normalizeFinish(draft.finish) : finishOptions[0] || 'normal';
  return {
    ...(candidate?.previewAddArgs || {}),
    qty: Math.max(1, parseInt(draft.qty, 10) || 1),
    finish,
    condition: draft.condition || 'near_mint',
  };
}

function removePendingDraft(draftId) {
  const index = pendingDrafts.findIndex(draft => draft.id === draftId);
  if (index !== -1) pendingDrafts.splice(index, 1);
  renderPendingDrafts();
}

function normalizePendingPreview(preview) {
  if (!preview || typeof preview !== 'object') return null;
  const changeToken = String(preview.changeToken || '').trim();
  if (!changeToken) return null;
  return {
    changeToken,
    summary: String(preview.summary || 'Previewed collection change'),
    expectedRevision: preview.expectedRevision ?? null,
    expiresAt: preview.expiresAt || '',
    opCount: preview.opCount ?? null,
    totalsAfter: preview.totalsAfter || null,
    applying: false,
    error: '',
  };
}

function addPendingPreviews(previews) {
  const added = [];
  for (const raw of Array.isArray(previews) ? previews : []) {
    const preview = normalizePendingPreview(raw);
    if (!preview) continue;
    const existing = pendingPreviews.find(item => item.changeToken === preview.changeToken);
    if (existing) {
      Object.assign(existing, preview, { applying: existing.applying, error: existing.error });
    } else {
      pendingPreviews.push(preview);
      added.push(preview);
    }
  }
  renderPendingPreviews();
  return added;
}

function removePendingPreview(changeToken) {
  const index = pendingPreviews.findIndex(preview => preview.changeToken === changeToken);
  if (index !== -1) pendingPreviews.splice(index, 1);
  renderPendingPreviews();
}

function previewMetaText(preview) {
  const parts = [];
  if (preview.expectedRevision !== null && preview.expectedRevision !== undefined && preview.expectedRevision !== '') {
    parts.push('preview rev ' + preview.expectedRevision);
  }
  if (preview.opCount !== null && preview.opCount !== undefined) {
    const count = Number(preview.opCount) || 0;
    parts.push(count + ' sync ' + (count === 1 ? 'op' : 'ops'));
  }
  if (preview.expiresAt) {
    const expires = new Date(preview.expiresAt);
    if (!Number.isNaN(expires.getTime())) {
      parts.push('expires ' + expires.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }
  }
  if (preview.error) parts.push(preview.error);
  return parts.join(' / ');
}

function makePreviewButton(action, text, changeToken = '') {
  const button = documentRef.createElement('button');
  button.className = 'btn mcp-chat-preview-action';
  button.type = 'button';
  button.dataset.previewAction = action;
  if (changeToken) button.dataset.changeToken = changeToken;
  button.textContent = text;
  return button;
}

function makeOption(value, label, selectedValue) {
  const option = documentRef.createElement('option');
  option.value = String(value);
  option.textContent = label;
  option.selected = String(value) === String(selectedValue);
  return option;
}

function conditionShortLabel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'near_mint') return 'nm';
  if (raw === 'lightly_played') return 'lp';
  if (raw === 'moderately_played') return 'mp';
  if (raw === 'heavily_played') return 'hp';
  if (raw === 'damaged') return 'dmg';
  return raw.replace(/_/g, ' ') || 'condition unknown';
}

function normalizeChatCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemKey = String(raw.itemKey || '').trim();
  if (!itemKey) return null;
  const name = String(raw.name || raw.resolvedName || '').trim();
  if (!name) return null;
  return {
    itemKey,
    name,
    scryfallId: String(raw.scryfallId || '').trim(),
    setCode: String(raw.setCode || raw.set || '').trim().toLowerCase(),
    cn: String(raw.cn || raw.collectorNumber || '').trim(),
    finish: normalizeFinish(raw.finish || 'normal'),
    condition: String(raw.condition || 'near_mint').trim().toLowerCase(),
    language: String(raw.language || raw.lang || 'en').trim().toLowerCase(),
    qty: Math.max(0, parseInt(raw.qty, 10) || 0),
    location: normalizeLocation(raw.location),
    deckBoard: String(raw.deckBoard || '').trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
    price: Number(raw.price) || 0,
    priceFallback: Boolean(raw.priceFallback),
    totalValue: Number(raw.totalValue) || 0,
    imageUrl: String(raw.imageUrl || '').trim(),
    backImageUrl: String(raw.backImageUrl || '').trim(),
    scryfallUri: String(raw.scryfallUri || '').trim(),
  };
}

function tsvCell(value) {
  return String(value == null ? '' : value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

export function formatChatCardResultsForCopy(cards) {
  const normalized = (Array.isArray(cards) ? cards : []).map(normalizeChatCard).filter(Boolean);
  if (!normalized.length) return '';
  const rows = [[
    'name',
    'set',
    'collector_number',
    'qty',
    'location',
    'condition',
    'finish',
    'language',
    'price',
  ]];
  for (const card of normalized) {
    rows.push([
      card.name,
      card.setCode.toUpperCase(),
      card.cn,
      card.qty || '',
      card.location ? formatLocationLabel(card.location) : '',
      conditionShortLabel(card.condition),
      finishLabel(card.finish),
      card.language || '',
      card.price || '',
    ]);
  }
  return rows.map(row => row.map(tsvCell).join('\t')).join('\n');
}

async function copyTextToClipboard(text) {
  const nav = documentRef?.defaultView?.navigator || globalThis.navigator;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return true;
  }
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) return false;
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  doc.body?.appendChild(textarea);
  textarea.select?.();
  let copied = false;
  try {
    copied = !!doc.execCommand?.('copy');
  } finally {
    textarea.remove?.();
  }
  return copied;
}

async function copyChatCardResults(cards, button) {
  const text = formatChatCardResultsForCopy(cards);
  if (!text || !button || button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  try {
    const copied = await copyTextToClipboard(text);
    button.textContent = copied ? 'copied' : 'copy failed';
  } catch (e) {
    button.textContent = 'copy failed';
  } finally {
    globalThis.setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1200);
  }
}

function locationFromKey(key) {
  const raw = String(key || '');
  const index = raw.indexOf(':');
  if (index === -1) return null;
  return normalizeLocation({ type: raw.slice(0, index), name: raw.slice(index + 1) });
}

function chatLocationChoices() {
  const byKey = new Map();
  for (const loc of [
    ...allContainers().map(container => ({ type: container.type, name: container.name })),
    ...allCollectionLocations(),
  ]) {
    const normalized = normalizeLocation(loc);
    const key = locationKey(normalized);
    if (key && !byKey.has(key)) byKey.set(key, normalized);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const typeSort = LOCATION_TYPES.indexOf(a.type) - LOCATION_TYPES.indexOf(b.type);
    return typeSort || a.name.localeCompare(b.name);
  });
}

function appendCardPreviewDataset(el, card) {
  if (card.imageUrl) el.dataset.previewUrl = card.imageUrl;
  if (card.scryfallId) el.dataset.previewId = card.scryfallId;
  if (card.setCode) el.dataset.previewSet = card.setCode;
  if (card.cn) el.dataset.previewCn = card.cn;
  if (card.name) el.dataset.previewName = card.name;
  el.dataset.previewFinish = card.finish || 'normal';
}

function formatUsd(value) {
  const amount = Number(value) || 0;
  return amount ? '$' + amount.toFixed(2) : '';
}

function makeChatCardMoveControls(card) {
  const move = documentRef.createElement('div');
  move.className = 'mcp-chat-card-move';
  move.hidden = true;

  const label = documentRef.createElement('label');
  label.className = 'mcp-chat-card-move-field';
  const labelText = documentRef.createElement('span');
  labelText.textContent = 'move to';
  const select = documentRef.createElement('select');
  select.dataset.chatMoveTarget = '1';
  select.appendChild(makeOption('', 'choose destination', ''));
  const currentKey = locationKey(card.location);
  const choices = chatLocationChoices();
  for (const type of LOCATION_TYPES) {
    const locations = choices.filter(loc => loc.type === type && locationKey(loc) !== currentKey);
    if (!locations.length) continue;
    const group = documentRef.createElement('optgroup');
    group.label = type + 's';
    for (const loc of locations) {
      group.appendChild(makeOption(locationKey(loc), loc.name, ''));
    }
    select.appendChild(group);
  }
  select.appendChild(makeOption('__new__', '+ new container', ''));
  label.append(labelText, select);

  const newFields = documentRef.createElement('div');
  newFields.className = 'mcp-chat-card-move-new';
  newFields.hidden = true;
  const type = documentRef.createElement('select');
  type.dataset.chatMoveNewType = '1';
  for (const value of LOCATION_TYPES) type.appendChild(makeOption(value, value, DEFAULT_LOCATION_TYPE));
  const name = documentRef.createElement('input');
  name.type = 'text';
  name.dataset.chatMoveNewName = '1';
  name.placeholder = 'new container name';
  newFields.append(type, name);

  const actions = documentRef.createElement('div');
  actions.className = 'mcp-chat-card-move-actions';
  const error = documentRef.createElement('span');
  error.className = 'mcp-chat-card-move-error';
  const stage = makePreviewButton('cardMove', 'stage move');
  stage.dataset.chatCardAction = 'stageMove';
  stage.dataset.itemKey = card.itemKey;
  actions.append(error, stage);

  move.append(label, newFields, actions);
  return move;
}

function makeChatCardResult(raw) {
  const card = normalizeChatCard(raw);
  if (!card) return null;
  const row = documentRef.createElement('article');
  row.className = 'mcp-chat-card-row';
  row.dataset.itemKey = card.itemKey;

  const copy = documentRef.createElement('div');
  copy.className = 'mcp-chat-card-copy';
  const name = documentRef.createElement('button');
  name.type = 'button';
  name.className = 'mcp-chat-card-name card-preview-link';
  name.textContent = card.name;
  appendCardPreviewDataset(name, card);

  const meta = documentRef.createElement('div');
  meta.className = 'mcp-chat-card-meta';
  const printing = [card.setCode ? card.setCode.toUpperCase() : '', card.cn ? '#' + card.cn : ''].filter(Boolean).join(' ');
  const price = formatUsd(card.price);
  const totalValue = card.qty > 1 ? formatUsd(card.totalValue || (card.price * card.qty)) : '';
  const priceDetail = price && totalValue ? price + ' each / ' + totalValue + ' total' : price;
  const details = [
    printing,
    card.qty ? card.qty + 'x' : '',
    card.location ? formatLocationLabel(card.location) : 'no location',
    conditionShortLabel(card.condition),
    finishLabel(card.finish),
    card.language && card.language !== 'en' ? card.language : '',
    priceDetail,
  ].filter(Boolean);
  meta.textContent = details.join(' / ');
  copy.append(name, meta);

  const actions = documentRef.createElement('div');
  actions.className = 'mcp-chat-card-actions';
  const moveButton = documentRef.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'btn mcp-chat-card-action';
  moveButton.dataset.chatCardAction = 'toggleMove';
  moveButton.textContent = 'move';
  actions.appendChild(moveButton);

  row.append(copy, actions, makeChatCardMoveControls(card));
  return row;
}

function renderChatCardResults(cards) {
  const normalized = (Array.isArray(cards) ? cards : []).map(normalizeChatCard).filter(Boolean);
  if (!normalized.length) return null;
  const section = documentRef.createElement('section');
  section.className = 'mcp-chat-card-results';
  const head = documentRef.createElement('div');
  head.className = 'mcp-chat-card-results-head';
  const count = documentRef.createElement('span');
  count.textContent = normalized.length === 1 ? '1 card from your collection' : normalized.length + ' cards from your collection';
  const copy = documentRef.createElement('button');
  copy.type = 'button';
  copy.className = 'btn mcp-chat-card-results-copy';
  copy.textContent = 'copy';
  copy.title = 'copy results as tab-separated text';
  copy.setAttribute('aria-label', 'copy card results');
  copy.addEventListener('click', () => copyChatCardResults(normalized, copy));
  head.append(count, copy);
  section.appendChild(head);

  const list = documentRef.createElement('div');
  list.className = 'mcp-chat-card-list';
  for (const card of normalized) {
    const row = makeChatCardResult(card);
    if (row) list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

export function renderChatCardResultsForTest(cards, documentObj = document) {
  const previousDocument = documentRef;
  documentRef = documentObj;
  try {
    return renderChatCardResults(cards);
  } finally {
    documentRef = previousDocument;
  }
}

function renderPendingDrafts() {
  if (!draftPanelEl || !documentRef) return;
  draftPanelEl.innerHTML = '';
  if (!pendingDrafts.length) {
    draftPanelEl.hidden = true;
    return;
  }
  draftPanelEl.hidden = false;

  const head = documentRef.createElement('div');
  head.className = 'mcp-chat-preview-head';
  const title = documentRef.createElement('div');
  title.className = 'mcp-chat-preview-title';
  title.textContent = 'complete add';
  const actions = documentRef.createElement('div');
  actions.className = 'mcp-chat-preview-actions';
  const clear = makePreviewButton('clearDrafts', 'clear');
  actions.appendChild(clear);
  head.append(title, actions);
  draftPanelEl.appendChild(head);

  const list = documentRef.createElement('div');
  list.className = 'mcp-chat-preview-list';
  for (const draft of pendingDrafts) {
    const row = documentRef.createElement('article');
    row.className = 'mcp-chat-draft-row' + (draft.error ? ' has-error' : '');
    row.dataset.draftId = draft.id;

    const copy = documentRef.createElement('div');
    copy.className = 'mcp-chat-preview-copy';
    const summary = documentRef.createElement('div');
    summary.className = 'mcp-chat-preview-summary';
    summary.textContent = draft.resolvedName || draft.query || 'card add';
    const meta = documentRef.createElement('div');
    meta.className = 'mcp-chat-preview-meta';
    const missing = draft.missingFields.length ? 'needs ' + draft.missingFields.join(', ') : 'choose details';
    meta.textContent = draft.error || missing;
    copy.append(summary, meta);

    const controls = documentRef.createElement('div');
    controls.className = 'mcp-chat-draft-controls';

    const candidate = selectedDraftCandidate(draft);
    controls.appendChild(createAddPreviewElement({
      documentObj: documentRef,
      model: buildAddPreviewCardModel(candidatePreviewCard(candidate)),
      extraClass: 'mcp-chat-draft-add-preview',
    }));
    const printingPicker = draft.candidates.length > 1 ? renderDraftPrintingPicker(draft) : null;
    if (printingPicker) controls.appendChild(printingPicker);

    const qtyLabel = documentRef.createElement('label');
    qtyLabel.className = 'mcp-chat-draft-field';
    const qtyText = documentRef.createElement('span');
    qtyText.textContent = 'qty';
    const qty = documentRef.createElement('input');
    qty.type = 'number';
    qty.min = '1';
    qty.max = '99';
    qty.step = '1';
    qty.value = String(draft.qty || 1);
    qty.dataset.draftField = 'qty';
    qtyLabel.append(qtyText, qty);

    const finishLabelEl = documentRef.createElement('label');
    finishLabelEl.className = 'mcp-chat-draft-field';
    const finishText = documentRef.createElement('span');
    finishText.textContent = 'finish';
    const finish = documentRef.createElement('select');
    finish.dataset.draftField = 'finish';
    const finishOptions = finishOptionsForCandidate(candidate, draft.finish);
    const selectedFinish = finishOptions.includes(normalizeFinish(draft.finish)) ? normalizeFinish(draft.finish) : finishOptions[0];
    for (const value of finishOptions) {
      finish.appendChild(makeOption(value, finishLabel(value), selectedFinish));
    }
    finishLabelEl.append(finishText, finish);

    const conditionLabel = documentRef.createElement('label');
    conditionLabel.className = 'mcp-chat-draft-field';
    const conditionText = documentRef.createElement('span');
    conditionText.textContent = 'condition';
    const condition = documentRef.createElement('select');
    condition.dataset.draftField = 'condition';
    for (const [value, label] of CONDITION_OPTIONS) {
      condition.appendChild(makeOption(value, label, draft.condition));
    }
    conditionLabel.append(conditionText, condition);

    controls.append(qtyLabel, finishLabelEl, conditionLabel);

    const rowActions = documentRef.createElement('div');
    rowActions.className = 'mcp-chat-preview-row-actions';
    const preview = makePreviewButton('previewDraft', draft.previewing ? 'adding' : 'add to pending');
    preview.dataset.draftId = draft.id;
    preview.disabled = draft.previewing;
    const dismiss = makePreviewButton('dismissDraft', 'dismiss');
    dismiss.dataset.draftId = draft.id;
    dismiss.disabled = draft.previewing;
    rowActions.append(preview, dismiss);

    row.append(copy, controls, rowActions);
    list.appendChild(row);
  }
  draftPanelEl.appendChild(list);
}

function renderPendingPreviews() {
  if (!previewPanelEl || !documentRef) return;
  previewPanelEl.innerHTML = '';
  if (!pendingPreviews.length) {
    previewPanelEl.hidden = true;
    return;
  }
  previewPanelEl.hidden = false;

  const head = documentRef.createElement('div');
  head.className = 'mcp-chat-preview-head';
  const title = documentRef.createElement('div');
  title.className = 'mcp-chat-preview-title';
  title.textContent = 'pending changes';
  const headActions = documentRef.createElement('div');
  headActions.className = 'mcp-chat-preview-actions';
  if (pendingPreviews.length > 1) headActions.appendChild(makePreviewButton('applyAll', 'apply all'));
  headActions.appendChild(makePreviewButton('clear', 'clear'));
  head.append(title, headActions);
  previewPanelEl.appendChild(head);

  const list = documentRef.createElement('div');
  list.className = 'mcp-chat-preview-list';
  for (const preview of pendingPreviews) {
    const row = documentRef.createElement('article');
    row.className = 'mcp-chat-preview-row' + (preview.error ? ' has-error' : '');

    const text = documentRef.createElement('div');
    text.className = 'mcp-chat-preview-copy';
    const summary = documentRef.createElement('div');
    summary.className = 'mcp-chat-preview-summary';
    summary.textContent = preview.summary;
    const meta = documentRef.createElement('div');
    meta.className = 'mcp-chat-preview-meta';
    meta.textContent = previewMetaText(preview);
    text.append(summary);
    if (meta.textContent) text.appendChild(meta);

    const actions = documentRef.createElement('div');
    actions.className = 'mcp-chat-preview-row-actions';
    const apply = makePreviewButton('apply', preview.applying ? 'applying' : 'apply', preview.changeToken);
    apply.disabled = preview.applying;
    const dismiss = makePreviewButton('dismiss', 'dismiss', preview.changeToken);
    dismiss.disabled = preview.applying;
    actions.append(apply, dismiss);
    row.append(text, actions);
    list.appendChild(row);
  }
  previewPanelEl.appendChild(list);
}

function renderTranscript() {
  if (!logEl) return;
  logEl.innerHTML = '';
  if (!transcript.length) {
    const empty = documentRef.createElement('div');
    empty.className = 'mcp-chat-empty';
    const title = documentRef.createElement('div');
    title.className = 'mcp-chat-empty-title';
    title.textContent = 'no chat yet';
    const copy = documentRef.createElement('div');
    copy.className = 'mcp-chat-empty-copy';
    copy.textContent = 'ask about your collection, or stage a card/container change for review.';
    const examples = documentRef.createElement('ul');
    examples.className = 'mcp-chat-empty-examples';
    for (const text of [
      'do i have any cards in trade binder?',
      'add a nm nonfoil petrified hamlet',
      'move prismari charm to trade binder',
    ]) {
      const item = documentRef.createElement('li');
      item.textContent = text;
      examples.appendChild(item);
    }
    empty.append(title, copy, examples);
    logEl.appendChild(empty);
    return;
  }

  for (const message of transcript) {
    const row = documentRef.createElement('article');
    row.className = 'mcp-chat-message mcp-chat-' + message.role;
    const label = documentRef.createElement('div');
    label.className = 'mcp-chat-role';
    label.textContent = message.role === 'assistant' ? 'assistant' : 'you';
    const body = documentRef.createElement('div');
    body.className = 'mcp-chat-body';
    body.textContent = message.content;
    row.append(label, body);

    if (message.role === 'assistant') {
      const cards = renderChatCardResults(message.meta?.cards);
      if (cards) row.appendChild(cards);
      const tokens = changeTokensFromText(message.content);
      for (const token of tokens) {
        const apply = documentRef.createElement('button');
        apply.className = 'btn mcp-chat-apply';
        apply.type = 'button';
        apply.dataset.changeToken = token;
        apply.textContent = 'apply preview';
        row.appendChild(apply);
      }
    }
    logEl.appendChild(row);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

async function sendChat() {
  const prompt = inputEl.value.trim();
  if (!prompt) return;
  const user = getSyncUser();
  if (!user) {
    showFeedback('sign in before using collection chat', 'error');
    return;
  }

  appendMessage('user', prompt);
  inputEl.value = '';
  sendBtn.disabled = true;
  const requestEpoch = chatEpoch;
  const pending = { role: 'assistant', content: 'thinking...', meta: { pending: true } };
  transcript.push(pending);
  renderTranscript();

  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...transcript
        .filter(message => !message.meta?.pending)
        .slice(-12)
        .map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
    ];
    const payload = {
      provider: HOSTED_PROVIDER,
      model: HOSTED_MODEL,
      messages,
    };
    const res = await fetch(SYNC_API_URL + '/mcp/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'chat request failed');
    if (requestEpoch !== chatEpoch) return;
    const previews = Array.isArray(data.previews) ? [...data.previews] : [];
    const drafts = Array.isArray(data.drafts) ? [...data.drafts] : [];
    const cards = Array.isArray(data.cards) ? data.cards.map(normalizeChatCard).filter(Boolean) : [];
    const warnings = Array.isArray(data.previewWarnings) ? data.previewWarnings.map(String).filter(Boolean) : [];
    const serverText = data.text || (previews.length ? 'Preview ready below.' : '(no text response)');
    const responseText = drafts.length
      ? 'Choose options below.'
      : previews.length
      ? (previews.length === 1 ? 'Preview ready below.' : previews.length + ' previews ready below.')
      : warnings.length ? warnings.join('\n') : serverText;
    pending.content = responseText;
    if (cards.length) pending.meta.cards = cards;
    if (!previews.length && !warnings.length) for (const token of changeTokensFromText(serverText)) {
      if (!previews.some(preview => preview?.changeToken === token)) {
        previews.push({ changeToken: token, summary: 'Previewed collection change' });
      }
    }
    addPendingDrafts(drafts);
    addPendingPreviews(previews);
    if (warnings.length) showFeedback(warnings[0], 'error');
    delete pending.meta.pending;
  } catch (e) {
    if (requestEpoch !== chatEpoch) return;
    pending.content = e.message || String(e);
    pending.meta.error = true;
    showFeedback(pending.content, 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (requestEpoch === chatEpoch) renderTranscript();
  }
}

async function previewDraft(draftId) {
  const draft = pendingDrafts.find(item => item.id === draftId);
  if (!draft || draft.previewing) return false;
  draft.previewing = true;
  draft.error = '';
  renderPendingDrafts();
  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const res = await fetch(SYNC_API_URL + '/mcp/preview', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolName: 'preview_add_inventory_item',
        arguments: draftPreviewArgs(draft),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'preview failed');
    if (data.status === 'preview' && data.changeToken) {
      removePendingDraft(draftId);
      addPendingPreviews([data]);
      appendMessage('assistant', 'Preview ready below.');
      return true;
    }
    if (Array.isArray(data.candidates) && data.candidates.length) {
      const replacement = normalizePendingDraft(data);
      if (replacement) {
        Object.assign(draft, replacement, { id: draft.id, previewing: false });
        renderPendingDrafts();
        return false;
      }
    }
    throw new Error(data.message || data.error || 'preview needs more information');
  } catch (e) {
    draft.previewing = false;
    draft.error = e.message || String(e);
    renderPendingDrafts();
    showFeedback(draft.error, 'error');
    return false;
  }
}

async function applyPreview(changeToken, { confirmFirst = true } = {}) {
  if (!changeToken) return;
  if (confirmFirst && !confirm('Apply this previewed collection change?')) return false;
  const preview = pendingPreviews.find(item => item.changeToken === changeToken);
  if (preview?.applying) return false;
  if (preview) {
    preview.applying = true;
    preview.error = '';
    renderPendingPreviews();
  }
  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const res = await fetch(SYNC_API_URL + '/mcp/apply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ changeToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'apply failed');
    removePendingPreview(changeToken);
    appendMessage('assistant', 'Applied: ' + (data.summary || 'collection change'));
    await syncNow();
    return true;
  } catch (e) {
    if (preview) {
      preview.applying = false;
      preview.error = e.message || String(e);
      renderPendingPreviews();
    }
    showFeedback(e.message || String(e), 'error');
    return false;
  }
}

async function applyAllPreviews() {
  const previews = pendingPreviews.filter(preview => !preview.applying);
  if (!previews.length) return;
  if (!confirm('Apply all pending collection changes?')) return;
  for (const preview of previews) {
    preview.applying = true;
    preview.error = '';
  }
  renderPendingPreviews();
  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const changeTokens = previews.map(preview => preview.changeToken);
    const res = await fetch(SYNC_API_URL + '/mcp/apply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ changeTokens }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'apply failed');
    const applied = new Set(changeTokens);
    for (let i = pendingPreviews.length - 1; i >= 0; i--) {
      if (applied.has(pendingPreviews[i].changeToken)) pendingPreviews.splice(i, 1);
    }
    renderPendingPreviews();
    appendMessage('assistant', 'Applied: ' + (data.summary || 'collection changes'));
    await syncNow();
  } catch (e) {
    for (const preview of previews) {
      preview.applying = false;
      preview.error = e.message || String(e);
    }
    renderPendingPreviews();
    showFeedback(e.message || String(e), 'error');
  }
}

function setChatCardMoveError(row, message = '') {
  const error = row?.querySelector('.mcp-chat-card-move-error');
  if (error) error.textContent = message;
}

function syncChatCardMoveNewFields(row) {
  const select = row?.querySelector('[data-chat-move-target]');
  const newFields = row?.querySelector('.mcp-chat-card-move-new');
  if (newFields) newFields.hidden = select?.value !== '__new__';
}

function readChatCardMoveDestination(row) {
  const select = row?.querySelector('[data-chat-move-target]');
  const value = select?.value || '';
  if (value === '__new__') {
    const type = row.querySelector('[data-chat-move-new-type]')?.value || DEFAULT_LOCATION_TYPE;
    const name = row.querySelector('[data-chat-move-new-name]')?.value || '';
    const loc = normalizeLocation({ type, name });
    if (!loc) throw new Error('choose a name for the new container');
    return { toLocation: loc, createContainer: true };
  }
  const loc = locationFromKey(value);
  if (!loc) throw new Error('choose a destination');
  return { toLocation: loc };
}

async function stageChatCardMove(button) {
  const row = button?.closest?.('.mcp-chat-card-row');
  if (!row || button.disabled) return false;
  setChatCardMoveError(row, '');
  let destination = null;
  try {
    destination = readChatCardMoveDestination(row);
  } catch (e) {
    setChatCardMoveError(row, e.message || String(e));
    return false;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'staging';
  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const res = await fetch(SYNC_API_URL + '/mcp/preview', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolName: 'preview_move_inventory_item',
        arguments: {
          itemKey: row.dataset.itemKey,
          ...destination,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'move preview failed');
    if (data.status === 'preview' && data.changeToken) {
      addPendingPreviews([data]);
      const move = row.querySelector('.mcp-chat-card-move');
      if (move) move.hidden = true;
      appendMessage('assistant', 'Move preview ready below.');
      return true;
    }
    throw new Error(data.message || data.error || 'move preview needs more information');
  } catch (e) {
    const message = e.message || String(e);
    setChatCardMoveError(row, message);
    showFeedback(message, 'error');
    return false;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

export function initMcpChat({ documentObj = document } = {}) {
  documentRef = documentObj;
  root = documentObj.getElementById('mcpChatDetails');
  if (!root) return;
  logEl = documentObj.getElementById('mcpChatLog');
  draftPanelEl = documentObj.getElementById('mcpChatDraftPanel');
  previewPanelEl = documentObj.getElementById('mcpChatPreviewPanel');
  formEl = documentObj.getElementById('mcpChatForm');
  inputEl = documentObj.getElementById('mcpChatInput');
  sendBtn = documentObj.getElementById('mcpChatSend');
  closeBtn = documentObj.getElementById('mcpChatClose');
  clearBtn = documentObj.getElementById('mcpChatClear');
  dragHandleEl = documentObj.getElementById('mcpChatDragHandle') || documentObj.querySelector('[data-mcp-chat-drag-handle]');
  toggleButtons = Array.from(documentObj.querySelectorAll('[data-mcp-chat-toggle]'));
  resizeObserver?.disconnect?.();
  resizeObserver = null;
  resizeDragState = null;
  applyStoredChatSize();
  applyStoredChatPosition();
  ensureChatResizeHandles();
  observeChatResize();
  renderTranscript();
  renderPendingDrafts();
  renderPendingPreviews();

  toggleButtons.forEach(button => {
    button.addEventListener('click', toggleChat);
  });
  closeBtn?.addEventListener('click', () => setChatOpen(false));
  clearBtn?.addEventListener('click', () => clearChat());
  dragHandleEl?.addEventListener('pointerdown', startChatDrag);
  documentObj.addEventListener('pointermove', moveChatDrag);
  documentObj.addEventListener('pointermove', moveChatResize);
  documentObj.addEventListener('pointerup', endChatDrag);
  documentObj.addEventListener('pointerup', endChatResize);
  documentObj.addEventListener('pointercancel', endChatDrag);
  documentObj.addEventListener('pointercancel', endChatResize);
  documentObj.defaultView?.addEventListener('resize', () => {
    setChatSize(chatSize(), { persist: true });
    clampCurrentChatPosition({ persist: true });
  });
  documentObj.addEventListener('keydown', event => {
    if (event.key === 'Escape' && documentObj.body.classList.contains('mcp-chat-open')) {
      setChatOpen(false);
    }
  });
  inputEl?.addEventListener('keydown', handleInputKeydown);
  formEl?.addEventListener('submit', event => {
    event.preventDefault();
    sendChat();
  });
  logEl?.addEventListener('click', event => {
    const chatCardAction = event.target.closest('[data-chat-card-action]');
    if (chatCardAction) {
      const row = chatCardAction.closest('.mcp-chat-card-row');
      const action = chatCardAction.dataset.chatCardAction;
      if (action === 'toggleMove') {
        const move = row?.querySelector('.mcp-chat-card-move');
        if (move) {
          move.hidden = !move.hidden;
          syncChatCardMoveNewFields(row);
        }
        return;
      }
      if (action === 'stageMove') {
        stageChatCardMove(chatCardAction);
        return;
      }
    }
    const button = event.target.closest('[data-change-token]');
    if (button) applyPreview(button.dataset.changeToken);
  });
  logEl?.addEventListener('change', event => {
    if (event.target?.matches?.('[data-chat-move-target]')) {
      syncChatCardMoveNewFields(event.target.closest('.mcp-chat-card-row'));
    }
  });
  draftPanelEl?.addEventListener('change', event => {
    const field = event.target?.dataset?.draftField;
    if (!field) return;
    const row = event.target.closest('[data-draft-id]');
    const draft = pendingDrafts.find(item => item.id === row?.dataset?.draftId);
    if (!draft) return;
    if (field === 'selectedIndex') {
      draft.selectedIndex = parseInt(event.target.value, 10) || 0;
      const candidate = selectedDraftCandidate(draft);
      draft.finish = normalizeFinish(candidate?.previewAddArgs?.finish || candidate?.requestedFinish || draft.finish);
    } else if (field === 'qty') {
      draft.qty = Math.max(1, parseInt(event.target.value, 10) || 1);
    } else if (field === 'finish') {
      draft.finish = normalizeFinish(event.target.value);
    } else if (field === 'condition') {
      draft.condition = event.target.value || 'near_mint';
    }
    draft.error = '';
    renderPendingDrafts();
  });
  draftPanelEl?.addEventListener('click', event => {
    const printingRow = event.target.closest('.printing-row[data-index]');
    if (printingRow) {
      const row = printingRow.closest('[data-draft-id]');
      const draft = pendingDrafts.find(item => item.id === row?.dataset?.draftId);
      if (draft) {
        draft.selectedIndex = Math.max(0, parseInt(printingRow.dataset.index, 10) || 0);
        const candidate = selectedDraftCandidate(draft);
        draft.finish = normalizeFinish(candidate?.previewAddArgs?.finish || candidate?.requestedFinish || draft.finish);
        draft.error = '';
        renderPendingDrafts();
      }
      return;
    }
    const button = event.target.closest('[data-preview-action]');
    if (!button) return;
    const action = button.dataset.previewAction;
    if (action === 'previewDraft') previewDraft(button.dataset.draftId);
    else if (action === 'dismissDraft') removePendingDraft(button.dataset.draftId);
    else if (action === 'clearDrafts') {
      pendingDrafts.splice(0, pendingDrafts.length);
      renderPendingDrafts();
    }
  });
  previewPanelEl?.addEventListener('click', event => {
    const button = event.target.closest('[data-preview-action]');
    if (!button) return;
    const action = button.dataset.previewAction;
    if (action === 'apply') applyPreview(button.dataset.changeToken, { confirmFirst: false });
    else if (action === 'dismiss') removePendingPreview(button.dataset.changeToken);
    else if (action === 'applyAll') applyAllPreviews();
    else if (action === 'clear') {
      pendingPreviews.splice(0, pendingPreviews.length);
      renderPendingPreviews();
    }
  });
}

export function appendMcpChatMessageForTest(role, content, meta = {}) {
  appendMessage(role, content, meta);
}

export function addPendingPreviewsForTest(previews) {
  return addPendingPreviews(previews);
}

export function addPendingDraftsForTest(drafts) {
  return addPendingDrafts(drafts);
}
