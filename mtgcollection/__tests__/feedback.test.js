import test from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../feedback.js';

test('esc: handles null/undefined', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('esc: passes through plain text', () => {
  assert.equal(esc('hello world'), 'hello world');
});

test('esc: escapes < > &', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
});

test('esc: escapes ampersand FIRST so other escapes do not double-encode', () => {
  // If we accidentally did `<` first then `&`, the `&lt;` would become `&amp;lt;`
  assert.equal(esc('<'), '&lt;');
});

// Regression for codex finding #3 — esc was called inside attribute contexts
// like data-tag="${esc(tag)}" but didn't escape quotes, so a tag like foo"bar
// would break the attribute.
test('esc: escapes double-quote (attribute-context safety)', () => {
  assert.equal(esc('foo"bar'), 'foo&quot;bar');
});

test('esc: escapes single-quote (attribute-context safety)', () => {
  assert.equal(esc("foo'bar"), 'foo&#39;bar');
});

test('esc: roundtrip through innerHTML preserves the original', () => {
  const original = `weird & tricky "value" with <tags> and 'quotes'`;
  const div = (typeof document !== 'undefined') ? document.createElement('div') : null;
  if (!div) return; // skip in node-only env
  div.innerHTML = `<span data-x="${esc(original)}">${esc(original)}</span>`;
  const span = div.querySelector('span');
  assert.equal(span.getAttribute('data-x'), original);
  assert.equal(span.textContent, original);
});

test('esc: coerces non-strings', () => {
  assert.equal(esc(42), '42');
  assert.equal(esc(true), 'true');
});
