import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  copyDecklist,
  downloadDeckExport,
  moxfieldDeckText,
  runDeckExportAction,
} from '../deckExportActions.js';

const card = (name, opts = {}) => ({
  name,
  resolvedName: name,
  qty: opts.qty || 1,
  deckBoard: opts.deckBoard || 'main',
  setCode: opts.setCode || 'cmm',
  cn: opts.cn || '1',
  finish: opts.finish || 'normal',
});

function exportForm(html = '') {
  const win = new Window();
  win.document.body.innerHTML = `<form id="deckExportForm">${html}</form>`;
  global.FormData = win.FormData;
  return {
    win,
    form: win.document.getElementById('deckExportForm'),
  };
}

test('moxfieldDeckText: builds portable text with printing details', () => {
  const text = moxfieldDeckText([card('Sol Ring', { qty: 2, cn: '700' })], {});

  assert.equal(text, 'Mainboard\n2 Sol Ring (CMM) 700');
});

test('copyDecklist: writes moxfield text to the clipboard and reports success', async () => {
  const writes = [];
  const feedback = [];

  const ok = await copyDecklist({
    list: [card('Sol Ring')],
    metadata: {},
    clipboard: { writeText: async text => writes.push(text) },
    showFeedback: (message, type) => feedback.push({ message, type }),
  });

  assert.equal(ok, true);
  assert.deepEqual(writes, ['Mainboard\n1 Sol Ring (CMM) 1']);
  assert.deepEqual(feedback, [{ message: 'decklist copied', type: 'success' }]);
});

test('copyDecklist: reports clipboard failures without throwing', async () => {
  const feedback = [];

  const ok = await copyDecklist({
    list: [card('Sol Ring')],
    metadata: {},
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    showFeedback: (message, type) => feedback.push({ message, type }),
  });

  assert.equal(ok, false);
  assert.deepEqual(feedback, [{ message: 'clipboard unavailable: denied', type: 'error' }]);
});

test('runDeckExportAction: copies export form output and surfaces warnings', async () => {
  const { form } = exportForm(`
    <select name="preset"><option value="plain" selected>plain</option></select>
    <input type="checkbox" name="includeCommander" checked>
    <input type="checkbox" name="board" value="main" checked>
  `);
  const writes = [];
  const feedback = [];

  const result = await runDeckExportAction({
    action: 'copy',
    form,
    list: [card('Forest')],
    metadata: { commander: 'Missing Commander' },
    clipboard: { writeText: async text => writes.push(text) },
    showFeedback: (message, type) => feedback.push({ message, type }),
  });

  assert.match(writes[0], /^Commander\n1 Missing Commander/);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(feedback, [
    { message: 'deck export copied', type: 'success' },
    { message: 'commander "Missing Commander" was not found in the mainboard; exported as name-only.', type: 'info' },
  ]);
});

test('runDeckExportAction: downloads export form output', async () => {
  const { form, win } = exportForm(`
    <select name="preset"><option value="json" selected>json</option></select>
    <input type="checkbox" name="includeCommander">
    <input type="checkbox" name="board" value="main" checked>
  `);
  const feedback = [];
  const urls = [];
  class BlobMock {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }

  const result = await runDeckExportAction({
    action: 'download',
    form,
    list: [card('Sol Ring')],
    metadata: { title: 'Breya' },
    documentRef: win.document,
    BlobImpl: BlobMock,
    URLImpl: {
      createObjectURL: blob => {
        urls.push({ action: 'create', blob });
        return 'blob:test';
      },
      revokeObjectURL: url => urls.push({ action: 'revoke', url }),
    },
    showFeedback: (message, type) => feedback.push({ message, type }),
  });

  assert.equal(result.mime, 'application/json');
  assert.equal(urls[0].blob.type, 'application/json');
  assert.deepEqual(urls.map(item => item.action), ['create', 'revoke']);
  assert.deepEqual(feedback, [{ message: 'deck export downloaded', type: 'success' }]);
});

test('downloadDeckExport: returns useful download metadata for tests', () => {
  const win = new Window();
  const calls = [];
  class BlobMock {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }

  const result = downloadDeckExport(
    { body: 'deck text', mime: 'text/plain', filename: 'deck.txt' },
    {
      documentRef: win.document,
      BlobImpl: BlobMock,
      URLImpl: {
        createObjectURL: blob => {
          calls.push(['create', blob.type]);
          return 'blob:test';
        },
        revokeObjectURL: url => calls.push(['revoke', url]),
      },
    },
  );

  assert.equal(result.filename, 'deck.txt');
  assert.equal(result.url, 'blob:test');
  assert.deepEqual(calls, [['create', 'text/plain'], ['revoke', 'blob:test']]);
});
