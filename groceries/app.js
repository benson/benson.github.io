const API = 'https://groceries-api.bensonperry.workers.dev';

// must mirror the worker's section order
const SECTIONS = [
  'produce', 'bakery', 'meat & seafood', 'dairy & eggs', 'frozen',
  'pantry & canned', 'snacks', 'beverages', 'household', 'personal care', 'other',
];

const LS = {
  items: 'groceries.items',
  order: 'groceries.order',
  view: 'groceries.view',
  queue: 'groceries.queue',
};

const state = {
  items: load(LS.items, []),
  order: mergeOrder(load(LS.order, null)),
  view: load(LS.view, 'section'),
  queue: load(LS.queue, []),
  arranging: false,
  openMenu: null,
  editing: null,
};

let inFlight = 0;

// ---------- storage ----------
function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function persist() {
  save(LS.items, state.items);
  save(LS.queue, state.queue);
}

function mergeOrder(saved) {
  if (!Array.isArray(saved)) return [...SECTIONS];
  const known = saved.filter((s) => SECTIONS.includes(s));
  const missing = SECTIONS.filter((s) => !known.includes(s));
  // keep 'other' last
  const merged = [...known, ...missing].filter((s) => s !== 'other');
  merged.push('other');
  return merged;
}

// ---------- api + sync ----------
async function api(path, body) {
  const opts = { method: body === undefined ? 'GET' : 'POST' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

async function syncFromServer() {
  if (inFlight > 0 || state.queue.length || !navigator.onLine) return;
  try {
    const data = await api('/list');
    state.items = data.items || [];
    persist();
    renderAll();
  } catch { /* offline; keep cache */ }
}

async function send(path, body, queueOp) {
  inFlight++;
  try {
    const data = await api(path, body);
    inFlight--;
    return data;
  } catch (e) {
    inFlight--;
    if (queueOp) { state.queue.push(queueOp); persist(); }
    setOffline(true);
    return null;
  }
}

async function flushQueue() {
  if (!navigator.onLine || !state.queue.length) return;
  while (state.queue.length) {
    const op = state.queue[0];
    try {
      await api(op.path, op.body);
      state.queue.shift();
      persist();
    } catch { return; } // still offline
  }
  await syncFromServer();
}

// ---------- mutations (optimistic) ----------
function splitNames(text) {
  return String(text || '')
    .split(/\n|,|;|•|\band\b/i)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((s) => s.slice(0, 80));
}

async function addItems(text) {
  const names = splitNames(text);
  if (!names.length) return;

  if (navigator.onLine) {
    const data = await send('/add', { text }, null);
    if (data && data.items) {
      state.items = data.items;
      persist();
      renderAll();
      return;
    }
  }
  // offline / failed: optimistic local add, reconcile section on reconnect
  for (const name of names) {
    state.items.push({ id: 'tmp_' + crypto.randomUUID().slice(0, 8), name, section: 'other', checked: false, addedAt: new Date().toISOString(), pending: true });
  }
  state.queue.push({ path: '/add', body: { text } });
  persist();
  setOffline(true);
  renderAll();
}

function toggle(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.checked = !it.checked;
  persist();
  updateRow(it);       // fast path: no full rebuild, preserves scroll
  updateCount();
  send('/toggle', { id }, { path: '/toggle', body: { id } });
}

function removeItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  state.openMenu = null;
  persist();
  renderAll();
  send('/remove', { id }, { path: '/remove', body: { id } });
}

function moveItem(id, section) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.section = section;
  state.openMenu = null;
  persist();
  renderAll();
  send('/move', { id, section }, { path: '/move', body: { id, section } });
}

function renameItem(id, name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  state.editing = null;
  if (!clean) { renderAll(); return; }
  const it = state.items.find((i) => i.id === id);
  if (!it || it.name === clean) { renderAll(); return; }
  it.name = clean;
  persist();
  renderAll();
  send('/rename', { id, name: clean }, { path: '/rename', body: { id, name: clean } });
}

function clearAll() {
  state.items = [];
  state.openMenu = null;
  persist();
  renderAll();
  send('/clear', {}, { path: '/clear', body: {} });
}

// ---------- rendering ----------
const el = {
  list: document.getElementById('list'),
  count: document.getElementById('count'),
  empty: document.getElementById('empty'),
  done: document.getElementById('done-btn'),
  arrange: document.getElementById('arrange-btn'),
  status: document.getElementById('status'),
  app: document.querySelector('.app'),
};

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function updateCount() {
  const total = state.items.length;
  const left = state.items.filter((i) => !i.checked).length;
  el.count.textContent = total === 0 ? '' : left === 0 ? 'all done' : `${left} left`;
}

function itemHTML(it) {
  const editing = state.editing === it.id;
  const namePart = editing
    ? `<input class="name-edit" value="${esc(it.name)}" data-edit="${it.id}" autocomplete="off" />`
    : `<span class="name" data-toggle="${it.id}">${esc(it.name)}</span>`;
  return `<div class="item ${it.checked ? 'checked' : ''} ${it.pending ? 'pending' : ''}" data-row="${it.id}">
    <button class="check" data-toggle="${it.id}" aria-label="check off">${CHECK_SVG}</button>
    ${namePart}
    <button class="kebab" data-menu="${it.id}" aria-label="item options">⋯</button>
  </div>${menuHTML(it)}`;
}

function menuHTML(it) {
  if (state.openMenu !== it.id) return '';
  const chips = SECTIONS.map((s) =>
    `<button class="menu-section ${s === it.section ? 'current' : ''}" data-move="${it.id}|${s}">${s}</button>`
  ).join('');
  return `<div class="menu">
    <div class="menu-row">
      <button class="menu-act" data-rename="${it.id}">rename</button>
      <button class="menu-act danger" data-remove="${it.id}">delete</button>
    </div>
    <div class="menu-label">move to aisle</div>
    <div class="menu-sections">${chips}</div>
  </div>`;
}

function renderAll() {
  el.app.classList.toggle('arranging', state.arranging);
  document.getElementById('view-section').classList.toggle('is-active', state.view === 'section');
  document.getElementById('view-added').classList.toggle('is-active', state.view === 'added');

  const has = state.items.length > 0;
  el.empty.hidden = has;
  el.done.hidden = !has;
  el.arrange.hidden = !(has && state.view === 'section');
  el.arrange.classList.toggle('is-active', state.arranging);
  if (state.view !== 'section' && state.arranging) state.arranging = false;

  let html = '';
  if (state.view === 'added') {
    const sorted = [...state.items].sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
    html = sorted.map(itemHTML).join('');
  } else {
    const visible = state.order.filter((s) => state.items.some((i) => i.section === s));
    visible.forEach((section, idx) => {
      const items = state.items.filter((i) => i.section === section);
      const left = items.filter((i) => !i.checked).length;
      html += `<section class="section">
        <div class="section-head">
          <span class="section-title">${section}</span>
          <span class="section-count">${left ? left : '✓'}</span>
          <span class="arrange-handles">
            <button class="nudge" data-up="${section}" ${idx === 0 ? 'disabled' : ''} aria-label="move up">↑</button>
            <button class="nudge" data-down="${section}" ${idx === visible.length - 1 ? 'disabled' : ''} aria-label="move down">↓</button>
          </span>
        </div>
        ${items.map(itemHTML).join('')}
      </section>`;
    });
  }
  el.list.innerHTML = html;
  updateCount();
  if (state.editing) {
    const input = el.list.querySelector(`[data-edit="${state.editing}"]`);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
}

// fast toggle without rebuilding the list
function updateRow(it) {
  const row = el.list.querySelector(`[data-row="${it.id}"]`);
  if (!row) { renderAll(); return; }
  row.classList.toggle('checked', it.checked);
}

// swap a section past its neighbouring *visible* section, so nudges always
// move it relative to the aisles actually on screen.
function nudgeSection(section, dir) {
  const visible = state.order.filter((s) => state.items.some((i) => i.section === s));
  const vi = visible.indexOf(section);
  const neighbour = visible[vi + dir];
  if (!neighbour) return;
  const order = [...state.order];
  const a = order.indexOf(section);
  const b = order.indexOf(neighbour);
  [order[a], order[b]] = [order[b], order[a]];
  state.order = order;
  save(LS.order, order);
  renderAll();
}

function setOffline(off) {
  if (off) {
    el.status.hidden = false;
    el.status.classList.add('offline');
    el.status.textContent = state.queue.length
      ? `offline — ${state.queue.length} change${state.queue.length > 1 ? 's' : ''} will sync when you reconnect`
      : 'offline — changes will sync when you reconnect';
  } else {
    el.status.hidden = true;
    el.status.classList.remove('offline');
  }
}

// ---------- events ----------
document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('add-input');
  const text = input.value;
  input.value = '';
  addItems(text);
  input.focus();
});

document.getElementById('view-section').addEventListener('click', () => setView('section'));
document.getElementById('view-added').addEventListener('click', () => setView('added'));
function setView(v) { state.view = v; save(LS.view, v); state.openMenu = null; state.arranging = false; renderAll(); }

el.arrange.addEventListener('click', () => { state.arranging = !state.arranging; state.openMenu = null; renderAll(); });

// done shopping: two-tap confirm
let confirming = false;
let confirmTimer = null;
el.done.addEventListener('click', () => {
  if (!confirming) {
    confirming = true;
    el.done.classList.add('confirm');
    el.done.textContent = 'tap again to clear everything';
    confirmTimer = setTimeout(resetDone, 3500);
    return;
  }
  resetDone();
  clearAll();
});
function resetDone() {
  confirming = false;
  clearTimeout(confirmTimer);
  el.done.classList.remove('confirm');
  el.done.textContent = 'done shopping — clear list';
}

// delegated list interactions
el.list.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle],[data-menu],[data-remove],[data-rename],[data-move],[data-up],[data-down]');
  if (!t) return;
  if (t.dataset.toggle) return toggle(t.dataset.toggle);
  if (t.dataset.menu) { state.openMenu = state.openMenu === t.dataset.menu ? null : t.dataset.menu; return renderAll(); }
  if (t.dataset.remove) return removeItem(t.dataset.remove);
  if (t.dataset.rename) { state.editing = t.dataset.rename; state.openMenu = null; return renderAll(); }
  if (t.dataset.move) { const [id, section] = t.dataset.move.split('|'); return moveItem(id, section); }
  if (t.dataset.up) return nudgeSection(t.dataset.up, -1);
  if (t.dataset.down) return nudgeSection(t.dataset.down, 1);
});

el.list.addEventListener('keydown', (e) => {
  if (e.target.classList.contains('name-edit') && e.key === 'Enter') {
    e.preventDefault();
    renameItem(e.target.dataset.edit, e.target.value);
  }
});
el.list.addEventListener('focusout', (e) => {
  if (e.target.classList.contains('name-edit')) renameItem(e.target.dataset.edit, e.target.value);
});

// connectivity + freshness
window.addEventListener('online', () => { setOffline(false); flushQueue().then(syncFromServer); });
window.addEventListener('offline', () => setOffline(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { flushQueue().then(syncFromServer); } });
window.addEventListener('focus', () => { flushQueue().then(syncFromServer); });

// ---------- boot ----------
renderAll();
if (!navigator.onLine) setOffline(true);
else { flushQueue().then(syncFromServer); }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
