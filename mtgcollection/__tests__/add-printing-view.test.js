import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderPrintingList, renderPrintingRows } from '../addPrintingView.js';

function printing(extra = {}) {
  return {
    set: 'sld',
    set_name: 'Secret Lair Drop',
    collector_number: '1011',
    released_at: '2024-03-01',
    finishes: ['nonfoil', 'foil'],
    ...extra,
  };
}

test('renderPrintingRows: renders set metadata and year without finish badges', () => {
  const win = new Window();
  const wrap = win.document.createElement('ol');
  wrap.innerHTML = renderPrintingRows([
    printing(),
    printing({ set: 'rex', collector_number: '7', finishes: ['foil', 'etched'] }),
  ]);

  const rows = wrap.querySelectorAll('.printing-row');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector('.printing-set-code').textContent, 'SLD');
  assert.equal(rows[0].querySelector('.printing-cn').textContent, '#1011');
  assert.equal(rows[0].querySelector('.printing-year').textContent, '2024');
  assert.equal(wrap.querySelector('.printing-finish-badge'), null);
  assert.equal(wrap.querySelector('.printing-finishes'), null);
});

test('renderPrintingRows: can show exact-printing ownership badges', () => {
  const win = new Window();
  const wrap = win.document.createElement('ol');
  wrap.innerHTML = renderPrintingRows([
    printing({ id: 'owned' }),
    printing({ id: 'missing', collector_number: '2' }),
  ], {
    ownershipLookup: card => card.id === 'owned' ? 3 : 0,
  });

  assert.equal(wrap.querySelector('.printing-owned-badge').textContent, 'owned \u00d73');
  assert.equal(wrap.querySelectorAll('.printing-owned-badge').length, 1);
});

test('renderPrintingList: renders empty and truncated captions', () => {
  const win = new Window();
  const listEl = win.document.createElement('ol');
  const captionEl = win.document.createElement('div');

  renderPrintingList({ listEl, captionEl, printings: [], totalCount: 0, truncated: false });
  assert.equal(listEl.innerHTML, '');
  assert.equal(captionEl.textContent, 'No printings found');

  renderPrintingList({
    listEl,
    captionEl,
    printings: [printing()],
    totalCount: 12,
    truncated: true,
  });
  assert.equal(listEl.querySelectorAll('.printing-row').length, 1);
  assert.match(captionEl.textContent, /showing 1 of 12/);
  assert.match(captionEl.textContent, /More available/);
});
