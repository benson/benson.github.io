import { showFeedback } from './feedback.js';
import { SYNC_API_URL } from './syncClient.js';
import { getSyncAuthToken, getSyncUser, syncNow } from './syncEngine.js';

const SYSTEM_PROMPT = [
  'You are the in-app MTG Collection assistant.',
  'Use the MTG Collection MCP tools to read the collection and preview safe changes.',
  'Do not apply changes yourself. The app receives preview metadata separately and shows pending changes for user confirmation.',
  'When calling tools, use real JSON types: quantities are numbers and createContainer is a boolean, not quoted strings.',
  'For add requests, do not invent set codes, collector numbers, rarities, Scryfall ids, quantities, finishes, or conditions.',
  'If the user does not provide every add detail, use search_card_printings or preview_add_inventory_item to return candidates/input needs; the app will render quick controls.',
].join(' ');
const HOSTED_PROVIDER = 'groq';
const HOSTED_MODEL = 'openai/gpt-oss-120b';
const CHAT_POSITION_KEY = 'mtgcollection_mcp_chat_position_v1';
const CHAT_EDGE_MARGIN = 12;

let root = null;
let logEl = null;
let draftPanelEl = null;
let previewPanelEl = null;
let formEl = null;
let inputEl = null;
let sendBtn = null;
let closeBtn = null;
let dragHandleEl = null;
let documentRef = null;
let toggleButtons = [];
let dragState = null;
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

function currentChatPosition() {
  const left = parseFloat(root?.style.getPropertyValue('--mcp-chat-left') || '');
  const top = parseFloat(root?.style.getPropertyValue('--mcp-chat-top') || '');
  if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  const rect = root?.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) return { left: rect.left, top: rect.top };
  return null;
}

function setChatPosition(position, { persist = false } = {}) {
  if (!root) return null;
  const next = clampChatPosition(position, chatViewport(), chatSize());
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

function clampCurrentChatPosition({ persist = false } = {}) {
  const current = currentChatPosition();
  if (current && root?.classList.contains('is-positioned')) setChatPosition(current, { persist });
}

function shouldIgnoreDragTarget(target) {
  return Boolean(target?.closest?.('button, input, textarea, select, a'));
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

function appendMessage(role, content, meta = {}) {
  transcript.push({ role, content, meta });
  renderTranscript();
}

function setChatOpen(open, { focus = false } = {}) {
  if (!root || !documentRef) return;
  documentRef.body.classList.toggle('mcp-chat-open', open);
  root.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggleButtons.forEach(button => button.setAttribute('aria-expanded', open ? 'true' : 'false'));
  if (open) clampCurrentChatPosition();
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

    if (draft.candidates.length > 1) {
      const label = documentRef.createElement('label');
      label.className = 'mcp-chat-draft-field mcp-chat-draft-field-wide';
      const span = documentRef.createElement('span');
      span.textContent = 'printing';
      const select = documentRef.createElement('select');
      select.dataset.draftField = 'selectedIndex';
      draft.candidates.forEach((candidate, index) => {
        select.appendChild(makeOption(index, candidateLabel(candidate), String(draft.selectedIndex)));
      });
      label.append(span, select);
      controls.appendChild(label);
    } else {
      const candidate = selectedDraftCandidate(draft);
      const printing = documentRef.createElement('div');
      printing.className = 'mcp-chat-draft-printing';
      printing.textContent = candidateLabel(candidate);
      controls.appendChild(printing);
    }

    const candidate = selectedDraftCandidate(draft);
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
    const previews = Array.isArray(data.previews) ? [...data.previews] : [];
    const drafts = Array.isArray(data.drafts) ? [...data.drafts] : [];
    const warnings = Array.isArray(data.previewWarnings) ? data.previewWarnings.map(String).filter(Boolean) : [];
    const serverText = data.text || (previews.length ? 'Preview ready below.' : '(no text response)');
    const responseText = drafts.length
      ? 'Choose options below.'
      : previews.length
      ? (previews.length === 1 ? 'Preview ready below.' : previews.length + ' previews ready below.')
      : warnings.length ? warnings.join('\n') : serverText;
    pending.content = responseText;
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
    pending.content = e.message || String(e);
    pending.meta.error = true;
    showFeedback(pending.content, 'error');
  } finally {
    sendBtn.disabled = false;
    renderTranscript();
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
  dragHandleEl = documentObj.getElementById('mcpChatDragHandle') || documentObj.querySelector('[data-mcp-chat-drag-handle]');
  toggleButtons = Array.from(documentObj.querySelectorAll('[data-mcp-chat-toggle]'));
  applyStoredChatPosition();
  renderTranscript();
  renderPendingDrafts();
  renderPendingPreviews();

  toggleButtons.forEach(button => {
    button.addEventListener('click', toggleChat);
  });
  closeBtn?.addEventListener('click', () => setChatOpen(false));
  dragHandleEl?.addEventListener('pointerdown', startChatDrag);
  documentObj.addEventListener('pointermove', moveChatDrag);
  documentObj.addEventListener('pointerup', endChatDrag);
  documentObj.addEventListener('pointercancel', endChatDrag);
  documentObj.defaultView?.addEventListener('resize', () => clampCurrentChatPosition({ persist: true }));
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
    const button = event.target.closest('[data-change-token]');
    if (button) applyPreview(button.dataset.changeToken);
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
