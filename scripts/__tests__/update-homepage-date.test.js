const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateFooter } = require('../update-homepage-date');

test('updates only the footer and uses the New York calendar month', () => {
  const html = '<main>unchanged</main>\n<footer>last updated august 2026</footer>';
  assert.equal(updateFooter(html, '2026-10-01T02:00:00Z'),
    '<main>unchanged</main>\n<footer>last updated september 2026</footer>');
  assert.equal(updateFooter(html, '2026-10-08T12:00:00Z'),
    '<main>unchanged</main>\n<footer>last updated october 2026</footer>');
});

test('fails instead of silently publishing a missing footer or invalid date', () => {
  assert.throws(() => updateFooter('<main>no footer</main>', '2026-10-08'), /footer not found/);
  assert.throws(() => updateFooter('<footer>last updated old</footer>', ''), RangeError);
});
