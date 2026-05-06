import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { clampChatPosition, initMcpChat } from '../mcpChat.js';

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
