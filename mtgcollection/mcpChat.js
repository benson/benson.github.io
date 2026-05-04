import { showFeedback } from './feedback.js';
import { SYNC_API_URL } from './syncClient.js';
import { getSyncAuthToken, getSyncUser, syncNow } from './syncEngine.js';

const SYSTEM_PROMPT = [
  'You are the in-app MTG Collection assistant.',
  'Use the MTG Collection MCP tools to read the collection and preview safe changes.',
  'Do not apply changes yourself. The app receives preview metadata separately and shows pending changes for user confirmation.',
  'When calling tools, use real JSON types: quantities are numbers and createContainer is a boolean, not quoted strings.',
  'For a simple single-card add request without an explicit quantity, preview exactly one copy with one tool call.',
].join(' ');
const HOSTED_PROVIDER = 'groq';
const HOSTED_MODEL = 'llama-3.1-8b-instant';

let root = null;
let logEl = null;
let previewPanelEl = null;
let formEl = null;
let inputEl = null;
let sendBtn = null;
let closeBtn = null;
let documentRef = null;
let toggleButtons = [];
const transcript = [];
const pendingPreviews = [];

function appendMessage(role, content, meta = {}) {
  transcript.push({ role, content, meta });
  renderTranscript();
}

function setChatOpen(open, { focus = false } = {}) {
  if (!root || !documentRef) return;
  documentRef.body.classList.toggle('mcp-chat-open', open);
  root.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggleButtons.forEach(button => button.setAttribute('aria-expanded', open ? 'true' : 'false'));
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
    const warnings = Array.isArray(data.previewWarnings) ? data.previewWarnings.map(String).filter(Boolean) : [];
    const serverText = data.text || (previews.length ? 'Preview ready below.' : '(no text response)');
    const responseText = previews.length
      ? (previews.length === 1 ? 'Preview ready below.' : previews.length + ' previews ready below.')
      : warnings.length ? warnings.join('\n') : serverText;
    pending.content = responseText;
    if (!previews.length && !warnings.length) for (const token of changeTokensFromText(serverText)) {
      if (!previews.some(preview => preview?.changeToken === token)) {
        previews.push({ changeToken: token, summary: 'Previewed collection change' });
      }
    }
    if (addPendingPreviews(previews).length) showFeedback('preview ready to review', 'success');
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
    appendMessage('assistant', 'Applied: ' + (data.summary || 'collection change') + ' (revision ' + data.revision + ')');
    await syncNow();
    showFeedback('applied preview', 'success');
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
    appendMessage('assistant', 'Applied: ' + (data.summary || 'collection changes') + ' (revision ' + data.revision + ')');
    await syncNow();
    showFeedback('applied pending changes', 'success');
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
  previewPanelEl = documentObj.getElementById('mcpChatPreviewPanel');
  formEl = documentObj.getElementById('mcpChatForm');
  inputEl = documentObj.getElementById('mcpChatInput');
  sendBtn = documentObj.getElementById('mcpChatSend');
  closeBtn = documentObj.getElementById('mcpChatClose');
  toggleButtons = Array.from(documentObj.querySelectorAll('[data-mcp-chat-toggle]'));
  renderTranscript();
  renderPendingPreviews();

  toggleButtons.forEach(button => {
    button.addEventListener('click', toggleChat);
  });
  closeBtn?.addEventListener('click', () => setChatOpen(false));
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
