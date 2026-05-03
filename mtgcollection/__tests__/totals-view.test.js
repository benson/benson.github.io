import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderCollectionTotals,
  renderCountValueTotals,
  renderDeckTotals,
  summarizeCards,
} from '../views/totalsView.js';

test('summarizeCards counts rows, quantity, and priced quantity value', () => {
  assert.deepEqual(summarizeCards([
    { qty: 2, price: 1.5 },
    { qty: 1, price: 3 },
    { qty: 4, price: null },
  ]), {
    unique: 3,
    qty: 7,
    value: 6,
  });
});

test('renderCollectionTotals shows global totals without filtered suffix', () => {
  const html = renderCollectionTotals([
    { qty: 2, price: 1.5 },
    { qty: 1, price: 3 },
  ]);

  assert.match(html, /<strong>2<\/strong> unique/);
  assert.match(html, /<strong>3<\/strong> qty/);
  assert.match(html, /<strong>\$6\.00<\/strong> value/);
});

test('renderCollectionTotals shows filtered of global totals', () => {
  const html = renderCollectionTotals(
    [{ qty: 2, price: 1.5 }],
    [{ qty: 2, price: 1.5 }, { qty: 3, price: 2 }],
    { filteredActive: true }
  );

  assert.match(html, /<strong>1 of 2<\/strong> unique/);
  assert.match(html, /<strong>2 of 5<\/strong> qty/);
  assert.match(html, /<strong>\$3\.00 of \$9\.00<\/strong> value/);
});

test('renderDeckTotals keeps board counts in the bottom strip format', () => {
  const html = renderDeckTotals({ main: 98, sideboard: 1, maybe: 1, value: 123.456 });

  assert.match(html, /<strong>98<\/strong> main/);
  assert.match(html, /<strong>1<\/strong> side/);
  assert.match(html, /<strong>1<\/strong> maybe/);
  assert.match(html, /<strong>\$123\.46<\/strong> value/);
});

test('renderCountValueTotals supports filtered homes', () => {
  const html = renderCountValueTotals({
    label: 'decks',
    count: 1,
    totalCount: 3,
    value: 50,
    totalValue: 75,
    filteredActive: true,
  });

  assert.match(html, /<strong>1 of 3<\/strong> decks/);
  assert.match(html, /<strong>\$50\.00 of \$75\.00<\/strong> value/);
});
