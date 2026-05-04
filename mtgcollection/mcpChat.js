import { showFeedback } from './feedback.js';
import { SYNC_API_URL } from './syncClient.js';
import { getSyncAuthToken, getSyncUser, syncNow } from './syncEngine.js';

const SYSTEM_PROMPT = [
  'You are the in-app MTG Collection assistant.',
  'Use the MTG Collection MCP tools to read the collection and preview safe changes.',
  'Do not apply changes yourself. When a preview returns a changeToken, summarize it so the app can show an apply button.',
].join(' ');

let root = null;
let logEl = null;
let formEl = null;
let providerEl = null;
let modelEl = null;
let keyEl = null;
let keyToggleEl = null;
let inputEl = null;
let sendBtn = null;
let closeBtn = null;
let documentRef = null;
let toggleButtons = [];
const transcript = [];

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

function providerModelDefault(provider) {
  if (provider === 'xai') return 'grok-4-fast-non-reasoning';
  return provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-5-nano';
}

function syncModelPlaceholder() {
  if (!providerEl || !modelEl) return;
  modelEl.placeholder = providerModelDefault(providerEl.value);
}

function setKeyFieldVisible(visible) {
  if (!keyEl || !keyToggleEl) return;
  keyEl.hidden = !visible;
  keyToggleEl.setAttribute('aria-expanded', visible ? 'true' : 'false');
  if (visible) keyEl.focus();
}

async function sendChat() {
  const prompt = inputEl.value.trim();
  const apiKey = keyEl.value.trim();
  const user = getSyncUser();
  if (!user) {
    showFeedback('sign in before using collection chat', 'error');
    return;
  }
  if (!prompt) return;

  appendMessage('user', prompt);
  inputEl.value = '';
  sendBtn.disabled = true;
  const pending = { role: 'assistant', content: 'thinking...', meta: { pending: true } };
  transcript.push(pending);
  renderTranscript();

  try {
    const token = await getSyncAuthToken();
    if (!token) throw new Error('chat needs Clerk auth. For local testing, open /mtgcollection/?auth=clerk&sync=remote');
    const provider = providerEl.value;
    const model = modelEl.value.trim() || providerModelDefault(provider);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...transcript
        .filter(message => !message.meta?.pending)
        .slice(-12)
        .map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
    ];
    const payload = {
      provider,
      model,
      messages,
    };
    if (apiKey) payload.apiKey = apiKey;
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
    pending.content = data.text || '(no text response)';
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

async function applyPreview(changeToken) {
  if (!changeToken) return;
  if (!confirm('Apply this previewed collection change?')) return;
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
    appendMessage('assistant', 'Applied: ' + (data.summary || 'collection change') + ' (revision ' + data.revision + ')');
    await syncNow();
  } catch (e) {
    showFeedback(e.message || String(e), 'error');
  }
}

export function initMcpChat({ documentObj = document } = {}) {
  documentRef = documentObj;
  root = documentObj.getElementById('mcpChatDetails');
  if (!root) return;
  logEl = documentObj.getElementById('mcpChatLog');
  formEl = documentObj.getElementById('mcpChatForm');
  providerEl = documentObj.getElementById('mcpChatProvider');
  modelEl = documentObj.getElementById('mcpChatModel');
  keyEl = documentObj.getElementById('mcpChatKey');
  keyToggleEl = documentObj.getElementById('mcpChatKeyToggle');
  inputEl = documentObj.getElementById('mcpChatInput');
  sendBtn = documentObj.getElementById('mcpChatSend');
  closeBtn = documentObj.getElementById('mcpChatClose');
  toggleButtons = Array.from(documentObj.querySelectorAll('[data-mcp-chat-toggle]'));
  syncModelPlaceholder();
  renderTranscript();

  toggleButtons.forEach(button => {
    button.addEventListener('click', toggleChat);
  });
  closeBtn?.addEventListener('click', () => setChatOpen(false));
  keyToggleEl?.addEventListener('click', () => setKeyFieldVisible(!!keyEl?.hidden));
  documentObj.addEventListener('keydown', event => {
    if (event.key === 'Escape' && documentObj.body.classList.contains('mcp-chat-open')) {
      setChatOpen(false);
    }
  });
  providerEl?.addEventListener('change', syncModelPlaceholder);
  formEl?.addEventListener('submit', event => {
    event.preventDefault();
    sendChat();
  });
  logEl?.addEventListener('click', event => {
    const button = event.target.closest('[data-change-token]');
    if (button) applyPreview(button.dataset.changeToken);
  });
}
