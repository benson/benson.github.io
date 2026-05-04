import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createAddPrintingPicker } from '../addPrintingPicker.js';

function installDom() {
  const win = new Window();
  win.document.body.innerHTML = `
    <div id="picker"></div>
    <input id="search">
    <ol id="list"></ol>
    <div id="caption"></div>
  `;
  return {
    pickerEl: win.document.getElementById('picker'),
    searchEl: win.document.getElementById('search'),
    listEl: win.document.getElementById('list'),
    captionEl: win.document.getElementById('caption'),
  };
}

function printing(extra = {}) {
  return {
    id: 'card-' + (extra.collector_number || '1'),
    set: 'cmm',
    set_name: 'Commander Masters',
    collector_number: '1',
    released_at: '2023-08-04',
    finishes: ['nonfoil'],
    ...extra,
  };
}

test('createAddPrintingPicker: loads, renders, and selects the first printing', async () => {
  const dom = installDom();
  const selected = [];
  let hiddenFeedback = 0;
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: (card, opts) => selected.push({ card, opts }),
    shouldPreserveFields: () => true,
    hideFeedbackImpl: () => { hiddenFeedback++; },
    loadPrintingsImpl: async () => ({
      status: 'ok',
      printings: [printing(), printing({ collector_number: '2' })],
      totalCount: 2,
      truncated: false,
    }),
  });

  await picker.load('Sol Ring');

  assert.equal(dom.pickerEl.classList.contains('active'), true);
  assert.equal(dom.captionEl.textContent, 'showing 2 of 2');
  assert.equal(dom.listEl.querySelectorAll('.printing-row').length, 2);
  assert.equal(dom.listEl.children[0].classList.contains('selected'), true);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].card.collector_number, '1');
  assert.deepEqual(selected[0].opts, { preserveFields: true, userSelected: false });
  assert.equal(hiddenFeedback, 1);
});

test('createAddPrintingPicker: binds row clicks to selection', async () => {
  const dom = installDom();
  const selected = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: (card, opts) => selected.push({ cn: card.collector_number, userSelected: opts.userSelected }),
    loadPrintingsImpl: async () => ({
      status: 'ok',
      printings: [printing(), printing({ collector_number: '2' })],
      totalCount: 2,
      truncated: false,
    }),
    hideFeedbackImpl: () => {},
  });

  picker.bind();
  await picker.load('Sol Ring');
  dom.listEl.children[1].click();

  assert.deepEqual(selected, [
    { cn: '1', userSelected: false },
    { cn: '2', userSelected: true },
  ]);
  assert.equal(dom.listEl.children[1].classList.contains('selected'), true);
});

test('createAddPrintingPicker: preselects the preferred Scryfall id when loaded', async () => {
  const dom = installDom();
  const selected = [];
  const picker = createAddPrintingPicker({
    ...dom,
    getPreferredScryfallId: () => 'target-id',
    onSelect: (card) => selected.push(card.id),
    loadPrintingsImpl: async () => ({
      status: 'ok',
      printings: [printing({ id: 'first-id' }), printing({ id: 'target-id', collector_number: '2' })],
      totalCount: 2,
      truncated: false,
    }),
    hideFeedbackImpl: () => {},
  });

  await picker.load('Sol Ring');

  assert.deepEqual(selected, ['target-id']);
  assert.equal(dom.listEl.children[1].classList.contains('selected'), true);
});

test('createAddPrintingPicker: filters loaded printings by set code or name', async () => {
  const dom = installDom();
  const selected = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: (card) => selected.push(card.set),
    loadPrintingsImpl: async () => ({
      status: 'ok',
      printings: [
        printing({ set: 'cmm', set_name: 'Commander Masters', collector_number: '1' }),
        printing({ set: 'sld', set_name: 'Secret Lair Drop', collector_number: '2' }),
      ],
      totalCount: 2,
      truncated: false,
    }),
    hideFeedbackImpl: () => {},
  });

  picker.bind();
  await picker.load('Sol Ring');
  dom.searchEl.value = 'secret';
  dom.searchEl.dispatchEvent(new dom.searchEl.ownerDocument.defaultView.Event('input'));

  assert.equal(dom.captionEl.textContent, 'showing 1 of 2 loaded');
  assert.equal(dom.listEl.querySelectorAll('.printing-row').length, 1);
  assert.equal(dom.listEl.querySelector('.printing-set-code').textContent, 'SLD');
  assert.deepEqual(selected, ['cmm', 'sld']);
});

test('createAddPrintingPicker: marks owned exact printings in the printing list', async () => {
  const dom = installDom();
  const picker = createAddPrintingPicker({
    ...dom,
    getCollection: () => [
      { scryfallId: 'owned-id', name: 'Island', qty: 2 },
      { name: 'Island', setCode: 'm21', cn: '264', qty: 20 },
    ],
    onSelect: () => {},
    loadPrintingsImpl: async () => ({
      status: 'ok',
      printings: [
        printing({ id: 'owned-id', name: 'Island', set: 'stx', collector_number: '369' }),
        printing({ id: 'other-id', name: 'Island', set: 'm21', collector_number: '264' }),
      ],
      totalCount: 2,
      truncated: false,
    }),
    hideFeedbackImpl: () => {},
  });

  await picker.load('Island');

  const badges = dom.listEl.querySelectorAll('.printing-owned-badge');
  assert.equal(badges.length, 2);
  assert.equal(badges[0].textContent, 'owned \u00d72');
  assert.equal(badges[1].textContent, 'owned \u00d720');
});

test('createAddPrintingPicker: shows empty state and feedback when no card is found', async () => {
  const dom = installDom();
  const feedback = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: () => {},
    loadPrintingsImpl: async () => ({ status: 'empty', printings: [], totalCount: 0, truncated: false }),
    showFeedbackImpl: (html, type) => feedback.push({ html, type }),
  });

  await picker.load('Totally Missing');

  assert.equal(dom.captionEl.textContent, 'No printings found');
  assert.deepEqual(feedback, [{ html: 'no card found for Totally Missing', type: 'error' }]);
});

test('createAddPrintingPicker: reports load errors but still selects fallback printings', async () => {
  const dom = installDom();
  const feedback = [];
  const selected = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: (card) => selected.push(card.id),
    loadPrintingsImpl: async () => ({
      status: 'fallback-error',
      error: new Error('boom'),
      printings: [printing({ id: 'fallback' })],
      totalCount: 1,
      truncated: false,
    }),
    showFeedbackImpl: (html, type) => feedback.push({ html, type }),
  });

  await picker.load('Sol Ring');

  assert.deepEqual(feedback, [{ html: "couldn't load printings: boom", type: 'error' }]);
  assert.deepEqual(selected, ['fallback']);
});

test('createAddPrintingPicker: uses offline-friendly copy for network errors', async () => {
  const dom = installDom();
  const feedback = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: () => {},
    loadPrintingsImpl: async () => ({
      status: 'error-empty',
      error: new TypeError('Failed to fetch'),
      printings: [],
      totalCount: 0,
      truncated: false,
    }),
    showFeedbackImpl: (html, type) => feedback.push({ html, type }),
  });

  await picker.load('Sol Ring');

  assert.deepEqual(feedback, [{
    html: 'scryfall lookup needs a network connection. collection edits you can make without lookup will still sync later.',
    type: 'error',
  }]);
});

test('createAddPrintingPicker: hide clears UI and aborts in-flight lookup', () => {
  const dom = installDom();
  let signal = null;
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: () => {},
    loadPrintingsImpl: ({ signal: lookupSignal }) => {
      signal = lookupSignal;
      return new Promise(() => {});
    },
  });

  picker.load('Sol Ring');
  assert.equal(signal.aborted, false);
  picker.hide();

  assert.equal(signal.aborted, true);
  assert.equal(dom.pickerEl.classList.contains('active'), false);
  assert.equal(dom.listEl.innerHTML, '');
  assert.equal(dom.captionEl.textContent, '');
  assert.deepEqual(picker.getPrintings(), []);
});
