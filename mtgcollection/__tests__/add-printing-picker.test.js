import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createAddPrintingPicker } from '../addPrintingPicker.js';

function installDom() {
  const win = new Window();
  win.document.body.innerHTML = `
    <div id="picker"></div>
    <ol id="list"></ol>
    <div id="caption"></div>
  `;
  return {
    pickerEl: win.document.getElementById('picker'),
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
  assert.deepEqual(selected[0].opts, { preserveFields: true });
  assert.equal(hiddenFeedback, 1);
});

test('createAddPrintingPicker: binds row clicks to selection', async () => {
  const dom = installDom();
  const selected = [];
  const picker = createAddPrintingPicker({
    ...dom,
    onSelect: (card) => selected.push(card.collector_number),
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

  assert.deepEqual(selected, ['1', '2']);
  assert.equal(dom.listEl.children[1].classList.contains('selected'), true);
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
