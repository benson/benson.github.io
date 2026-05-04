import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { initMcpChat } from '../mcpChat.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <section id="mcpChatDetails" aria-hidden="true">
      <button id="mcpChatClose" type="button"></button>
      <select id="mcpChatProvider"><option value="groq">Groq</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select>
      <input id="mcpChatModel">
      <button id="mcpChatKeyToggle" type="button" aria-expanded="false"></button>
      <input id="mcpChatKey" hidden>
      <div id="mcpChatLog"></div>
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

test('initMcpChat: API key field stays tucked behind the own-key toggle', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  const key = document.getElementById('mcpChatKey');
  const toggle = document.getElementById('mcpChatKeyToggle');
  assert.equal(key.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');

  click(win, toggle);
  assert.equal(key.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});
