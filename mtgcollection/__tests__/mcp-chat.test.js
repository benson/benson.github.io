import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { initMcpChat } from '../mcpChat.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <section id="mcpChatDetails" aria-hidden="true">
      <button id="mcpChatClose" type="button"></button>
      <div id="mcpChatLog"></div>
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

test('initMcpChat: escape closes the floating widget', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  click(win, document.querySelector('[data-mcp-chat-toggle]'));
  document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(document.body.classList.contains('mcp-chat-open'), false);
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
