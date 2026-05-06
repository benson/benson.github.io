import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  clampChatPosition,
  clampChatSize,
  formatChatCardResultsForCopy,
  initMcpChat,
  renderChatCardResultsForTest,
} from '../mcpChat.js';
import { state } from '../state.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <section id="mcpChatDetails" aria-hidden="true">
      <header id="mcpChatDragHandle" data-mcp-chat-drag-handle>
        <button id="mcpChatClose" type="button"></button>
      </header>
      <div id="mcpChatLog"></div>
      <section id="mcpChatDraftPanel" hidden></section>
      <section id="mcpChatPreviewPanel" hidden></section>
      <form id="mcpChatForm"><textarea id="mcpChatInput"></textarea><button id="mcpChatSend"></button></form>
    </section>
    <button data-mcp-chat-toggle aria-expanded="false"></button>
  `;
  return { win, document: win.document };
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pointer(win, type, props = {}) {
  const event = new win.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: props.button ?? 0 },
    clientX: { value: props.clientX ?? 0 },
    clientY: { value: props.clientY ?? 0 },
    pointerId: { value: props.pointerId ?? 1 },
  });
  return event;
}

test('clampChatPosition: keeps the floating chat inside the viewport', () => {
  assert.deepEqual(
    clampChatPosition({ left: -200, top: 900 }, { width: 1000, height: 800 }, { width: 430, height: 300 }),
    { left: 12, top: 488 }
  );
});

test('clampChatSize: keeps resized chat dimensions usable inside the viewport', () => {
  assert.deepEqual(
    clampChatSize({ width: 2000, height: 120 }, { width: 1000, height: 800 }),
    { width: 976, height: 320 }
  );
});

test('initMcpChat: chat FAB toggles the floating widget without using the right drawer', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  const toggle = document.querySelector('[data-mcp-chat-toggle]');
  const panel = document.getElementById('mcpChatDetails');

  click(win, toggle);
  assert.equal(document.body.classList.contains('mcp-chat-open'), true);
  assert.equal(document.body.classList.contains('right-drawer-open'), false);
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  click(win, document.getElementById('mcpChatClose'));
  assert.equal(document.body.classList.contains('mcp-chat-open'), false);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('initMcpChat: empty transcript shows example prompts', () => {
  const { document } = setup();
  initMcpChat({ documentObj: document });

  const empty = document.querySelector('.mcp-chat-empty');
  assert.ok(empty);
  assert.match(empty.textContent, /no chat yet/);
  assert.match(empty.textContent, /petrified hamlet/);
});

test('renderChatCardResultsForTest: inventory cards are hoverable and movable', () => {
  const { document } = setup();
  const previousCollection = state.collection;
  const previousContainers = state.containers;
  state.collection = [];
  state.containers = {
    'binder:trade binder': { type: 'binder', name: 'trade binder' },
    'deck:breya': { type: 'deck', name: 'breya' },
  };

  try {
    const section = renderChatCardResultsForTest([{
      itemKey: 'card-1',
      name: 'Maelstrom Artisan // Rocket Volley',
      scryfallId: 'sos-122',
      setCode: 'sos',
      cn: '122',
      finish: 'normal',
      condition: 'near_mint',
      qty: 1,
      location: { type: 'binder', name: 'trade binder' },
    }], document);
    document.body.appendChild(section);

    const cardLink = document.querySelector('.mcp-chat-card-name.card-preview-link');
    assert.ok(cardLink);
    assert.equal(cardLink.dataset.previewId, 'sos-122');
    assert.equal(cardLink.dataset.previewSet, 'sos');
    assert.equal(cardLink.dataset.previewCn, '122');
    assert.match(document.querySelector('.mcp-chat-card-meta').textContent, /binder:trade binder/);
    assert.equal(document.querySelector('[data-chat-card-action="toggleMove"]').textContent, 'move');
    assert.equal(document.querySelector('[data-chat-move-target] option[value="deck:breya"]').textContent, 'breya');
    assert.equal(document.querySelector('.mcp-chat-card-results-copy').textContent, 'copy');
  } finally {
    state.collection = previousCollection;
    state.containers = previousContainers;
  }
});

test('formatChatCardResultsForCopy: returns spreadsheet-friendly card rows', () => {
  const text = formatChatCardResultsForCopy([{
    itemKey: 'card-1',
    name: 'Breya, Etherium Shaper',
    scryfallId: 'c16-29',
    setCode: 'c16',
    cn: '29',
    finish: 'foil',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'box', name: 'bulk' },
    price: 12.5,
  }]);
  assert.equal(
    text,
    'name\tset\tcollector_number\tqty\tlocation\tcondition\tfinish\tlanguage\tprice\n'
      + 'Breya, Etherium Shaper\tC16\t29\t1\tbox:bulk\tnm\tfoil\ten\t12.5'
  );
});

test('initMcpChat: escape closes the floating widget', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  click(win, document.querySelector('[data-mcp-chat-toggle]'));
  document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(document.body.classList.contains('mcp-chat-open'), false);
});

test('initMcpChat: header drag repositions the floating widget', () => {
  const { win, document } = setup();
  Object.defineProperties(win, {
    innerWidth: { value: 1200, configurable: true },
    innerHeight: { value: 900, configurable: true },
  });
  const panel = document.getElementById('mcpChatDetails');
  panel.getBoundingClientRect = () => ({ left: 760, top: 420, width: 430, height: 300, right: 1190, bottom: 720 });
  initMcpChat({ documentObj: document });

  const handle = document.getElementById('mcpChatDragHandle');
  handle.dispatchEvent(pointer(win, 'pointerdown', { clientX: 1000, clientY: 500 }));
  document.dispatchEvent(pointer(win, 'pointermove', { clientX: 900, clientY: 450 }));
  document.dispatchEvent(pointer(win, 'pointerup', { clientX: 900, clientY: 450 }));

  assert.equal(panel.classList.contains('is-positioned'), true);
  assert.equal(panel.style.getPropertyValue('--mcp-chat-left'), '658px');
  assert.equal(panel.style.getPropertyValue('--mcp-chat-top'), '370px');
});

test('initMcpChat: Enter submits and Shift+Enter keeps editing in the prompt', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  const form = document.getElementById('mcpChatForm');
  const input = document.getElementById('mcpChatInput');
  let submitted = 0;
  form.requestSubmit = () => {
    submitted += 1;
  };

  const enter = new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  assert.equal(submitted, 1);
  assert.equal(enter.defaultPrevented, true);

  const shifted = new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(shifted);
  assert.equal(submitted, 1);
  assert.equal(shifted.defaultPrevented, false);
});
