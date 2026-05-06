import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  addPendingDraftsForTest,
  addPendingPreviewsForTest,
  appendMcpChatMessageForTest,
  calculateChatResize,
  clampChatPosition,
  clampChatSize,
  formatChatCardResultsForCopy,
  initMcpChat,
  replaceLatestDraftGuidanceForTest,
  renderChatCardResultsForTest,
} from '../mcpChat.js';
import { state } from '../state.js';
import { collectionKey } from '../collection.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <section id="mcpChatDetails" aria-hidden="true">
      <header id="mcpChatDragHandle" data-mcp-chat-drag-handle>
        <button id="mcpChatClear" type="button"></button>
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

test('calculateChatResize: left handle preserves the right edge while resizing', () => {
  assert.deepEqual(
    calculateChatResize({
      edge: 'left',
      startRect: { left: 100, top: 120, width: 430, height: 360 },
      delta: { x: -70, y: 0 },
      viewport: { width: 1000, height: 800 },
    }),
    {
      position: { left: 30, top: 120 },
      size: { width: 500, height: 360 },
    }
  );

  assert.deepEqual(
    calculateChatResize({
      edge: 'left',
      startRect: { left: 100, top: 120, width: 430, height: 360 },
      delta: { x: 200, y: 0 },
      viewport: { width: 1000, height: 800 },
    }),
    {
      position: { left: 190, top: 120 },
      size: { width: 340, height: 360 },
    }
  );
});

test('calculateChatResize: bottom-right handle grows to the viewport edge', () => {
  assert.deepEqual(
    calculateChatResize({
      edge: 'bottom-right',
      startRect: { left: 500, top: 300, width: 430, height: 360 },
      delta: { x: 300, y: 300 },
      viewport: { width: 1000, height: 800 },
    }),
    {
      position: { left: 500, top: 300 },
      size: { width: 488, height: 488 },
    }
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

test('initMcpChat: adds resize handles for sides and bottom corners', () => {
  const { document } = setup();
  initMcpChat({ documentObj: document });

  assert.deepEqual(
    Array.from(document.querySelectorAll('[data-mcp-chat-resize-handle]')).map(el => el.dataset.mcpChatResizeHandle),
    ['left', 'right', 'bottom', 'bottom-left', 'bottom-right']
  );
});

test('initMcpChat: empty transcript shows example prompts', () => {
  const { document } = setup();
  initMcpChat({ documentObj: document });

  const empty = document.querySelector('.mcp-chat-empty');
  assert.ok(empty);
  assert.match(empty.textContent, /no chat yet/);
  assert.match(empty.textContent, /petrified hamlet/);
});

test('initMcpChat: new chat clears transcript prompt and pending previews', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  document.getElementById('mcpChatInput').value = 'what foils do i have?';
  appendMcpChatMessageForTest('user', 'what foils do i have?');
  appendMcpChatMessageForTest('assistant', 'I found 3 foil cards.');
  addPendingPreviewsForTest([{ changeToken: 'preview.token', summary: 'added 1 island' }]);

  assert.equal(document.querySelectorAll('.mcp-chat-message').length, 2);
  assert.equal(document.getElementById('mcpChatPreviewPanel').hidden, false);
  win.confirm = () => {
    throw new Error('new chat should not open a browser confirm');
  };

  click(win, document.getElementById('mcpChatClear'));

  assert.equal(document.getElementById('mcpChatInput').value, '');
  assert.equal(document.querySelectorAll('.mcp-chat-message').length, 0);
  assert.ok(document.querySelector('.mcp-chat-empty'));
  assert.equal(document.getElementById('mcpChatPreviewPanel').hidden, true);
});

test('initMcpChat: pending previews hide internal revision metadata', () => {
  const { document } = setup();
  initMcpChat({ documentObj: document });

  addPendingPreviewsForTest([{
    changeToken: 'preview.token',
    summary: 'added 1 hangarback walker',
    expectedRevision: 160,
    opCount: 2,
    expiresAt: '2026-05-06T21:12:00.000Z',
  }]);

  const panel = document.getElementById('mcpChatPreviewPanel');
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /added 1 hangarback walker/);
  assert.doesNotMatch(panel.textContent, /preview rev/i);
  assert.doesNotMatch(panel.textContent, /sync ops/i);
  assert.doesNotMatch(panel.textContent, /expires/i);
});

test('initMcpChat: location summary tokens render as location pills', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });
  click(win, document.getElementById('mcpChatClear'));

  appendMcpChatMessageForTest('assistant', 'Applied: moved 1 Lotho to {loc:box:bulk}');
  addPendingPreviewsForTest([{ changeToken: 'preview.loc', summary: 'Moved 1 Sol Ring to {loc:binder:trade binder}' }]);

  const body = document.querySelector('.mcp-chat-body');
  assert.match(body.textContent, /Applied: moved 1 Lotho to bulk/);
  assert.doesNotMatch(body.textContent, /\{loc:/);
  assert.equal(body.querySelector('.loc-pill-box')?.dataset.locName, 'bulk');

  const summary = document.querySelector('.mcp-chat-preview-summary');
  assert.match(summary.textContent, /Moved 1 Sol Ring to trade binder/);
  assert.doesNotMatch(summary.textContent, /\{loc:/);
  assert.equal(summary.querySelector('.loc-pill-binder')?.dataset.locName, 'trade binder');

  click(win, document.getElementById('mcpChatClear'));
});

test('initMcpChat: assistant prose renders known card and container references richly', () => {
  const { win, document } = setup();
  const previousCollection = state.collection;
  const previousContainers = state.containers;
  const force = {
    name: 'Force of Will',
    resolvedName: 'Force of Will',
    scryfallId: 'force-1',
    setCode: '2xm',
    cn: '51',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'binder', name: 'trade binder' },
    price: 75.04,
  };
  state.collection = [force];
  state.containers = {
    'binder:trade binder': { type: 'binder', name: 'trade binder' },
    'box:bulk': { type: 'box', name: 'bulk' },
  };

  try {
    initMcpChat({ documentObj: document });
    click(win, document.getElementById('mcpChatClear'));
    appendMcpChatMessageForTest('user', 'take my force of will out of my trade binder');
    appendMcpChatMessageForTest('assistant', 'I can help move **Force of Will** out of your trade binder. Where should it go?');

    const assistant = document.querySelector('.mcp-chat-assistant');
    assert.equal(assistant.querySelector('.loc-pill-binder')?.dataset.locName, 'trade binder');
    assert.equal(assistant.querySelector('.card-name-button.card-preview-link')?.textContent, 'Force of Will');
    assert.equal(assistant.querySelector('.price-cell')?.textContent, '$75.04');
  } finally {
    click(win, document.getElementById('mcpChatClear'));
    state.collection = previousCollection;
    state.containers = previousContainers;
  }
});

test('initMcpChat: staged add drafts reuse the assistant guidance message', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  appendMcpChatMessageForTest('user', 'add a foil swords to plowshares');
  appendMcpChatMessageForTest('assistant', 'Choose options below.', { draftGuidance: true });

  assert.equal(document.querySelectorAll('.mcp-chat-message').length, 2);
  assert.equal(replaceLatestDraftGuidanceForTest(), true);

  const messages = Array.from(document.querySelectorAll('.mcp-chat-message'));
  assert.equal(messages.length, 2);
  assert.equal(messages[1].querySelector('.mcp-chat-body').textContent, 'Preview ready below.');
  assert.equal(document.querySelectorAll('.mcp-chat-role').length, 2);

  click(win, document.getElementById('mcpChatClear'));
});

test('initMcpChat: add drafts use the shared add preview and printing rows', () => {
  const { win, document } = setup();
  initMcpChat({ documentObj: document });

  addPendingDraftsForTest([{
    status: 'needs_selection',
    resolvedName: 'nissa, worldwaker',
    totalCount: 2,
    candidates: [
      {
        name: 'Nissa, Worldwaker',
        scryfallId: 'nissa-ps14-187',
        setCode: 'ps14',
        setName: 'San Diego Comic-Con 2014',
        collectorNumber: '187',
        rarity: 'mythic',
        typeLine: 'Legendary Planeswalker - Nissa',
        releasedAt: '2014-07-24',
        imageUrl: 'https://img.test/nissa.jpg',
        finishes: ['foil'],
        previewAddArgs: { scryfallId: 'nissa-ps14-187', name: 'Nissa, Worldwaker', setCode: 'ps14', cn: '187', finish: 'foil' },
      },
      {
        name: 'Nissa, Who Shakes the World',
        scryfallId: 'nissa-war-169',
        setCode: 'war',
        setName: 'War of the Spark',
        collectorNumber: '169',
        rarity: 'rare',
        typeLine: 'Legendary Planeswalker - Nissa',
        releasedAt: '2019-05-03',
        imageUrl: 'https://img.test/nissa-war.jpg',
        finishes: ['normal', 'foil'],
        previewAddArgs: { scryfallId: 'nissa-war-169', name: 'Nissa, Who Shakes the World', setCode: 'war', cn: '169', finish: 'foil' },
      },
    ],
  }]);

  assert.equal(document.querySelector('.mcp-chat-draft-add-preview.add-preview.active .add-preview-name').textContent, 'Nissa, Worldwaker');
  assert.match(document.querySelector('.mcp-chat-draft-add-preview .add-preview-meta').textContent, /San Diego Comic-Con 2014/);
  assert.equal(document.querySelector('.mcp-chat-draft-row > .mcp-chat-preview-copy'), null);
  assert.doesNotMatch(document.querySelector('.mcp-chat-draft-row').textContent, /choose details/i);
  assert.equal(document.querySelectorAll('.mcp-chat-draft-printing-picker .printing-row').length, 2);
  assert.equal(document.querySelector('.mcp-chat-draft-printing-picker .printing-row.selected .printing-set-code').textContent, 'PS14');

  click(win, document.querySelectorAll('.mcp-chat-draft-printing-picker .printing-row')[1]);

  assert.equal(document.querySelector('.mcp-chat-draft-add-preview .add-preview-name').textContent, 'Nissa, Who Shakes the World');
  assert.equal(document.querySelector('.mcp-chat-draft-printing-picker .printing-row.selected .printing-set-code').textContent, 'WAR');
});

test('renderChatCardResultsForTest: inventory cards are hoverable and movable', () => {
  const { document } = setup();
  const previousCollection = state.collection;
  const previousContainers = state.containers;
  const card = {
    name: 'Maelstrom Artisan // Rocket Volley',
    scryfallId: 'sos-122',
    setCode: 'sos',
    cn: '122',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'binder', name: 'trade binder' },
    tags: ['spells'],
    price: 0.26,
  };
  state.collection = [card];
  state.containers = {
    'binder:trade binder': { type: 'binder', name: 'trade binder' },
    'deck:breya': { type: 'deck', name: 'breya' },
  };

  try {
    const section = renderChatCardResultsForTest([{
      ...card,
      itemKey: collectionKey(card),
    }], document);
    document.body.appendChild(section);

    assert.equal(document.querySelector('.mcp-chat-card-results-head span').textContent, 'card referenced');
    const cardLink = document.querySelector('.card-name-button.card-preview-link');
    assert.ok(cardLink);
    assert.equal(cardLink.dataset.previewId, 'sos-122');
    assert.equal(cardLink.dataset.previewSet, 'sos');
    assert.equal(cardLink.dataset.previewCn, '122');
    assert.equal(document.querySelector('.set-cell').textContent.trim(), 'SOS');
    assert.equal(document.querySelector('.condition-cell').textContent, 'nm');
    assert.equal(document.querySelector('.loc-pill').dataset.locName, 'trade binder');
    assert.equal(document.querySelector('.row-tag').textContent.includes('spells'), true);
    assert.equal(document.querySelector('.row-tag-input').dataset.index, '0');
    assert.equal(document.querySelector('.price-cell').textContent, '$0.26');
    assert.equal(document.querySelector('[data-chat-card-action="toggleMove"]').textContent, 'edit');
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
