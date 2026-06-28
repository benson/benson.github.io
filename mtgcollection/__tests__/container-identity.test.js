import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import { containerIdentityHtml } from '../view.js';

test('containerIdentityHtml: renders a static container name in view mode', () => {
  const html = containerIdentityHtml({ type: 'container', name: 'trade binder' });

  assert.doesNotMatch(html, /data-container-rename/);
  assert.match(html, /container-identity-name-static/);
  assert.match(html, /trade binder/);
  assert.match(html, /loc-pill-container/);
  assert.match(html, /id="binderSummary"/);
});

test('containerIdentityHtml: renders container rename target in organize mode', () => {
  state.binderMode = 'organize';
  const html = containerIdentityHtml({ type: 'container', name: 'trade binder' });
  state.binderMode = 'view';

  assert.match(html, /data-container-rename/);
  assert.match(html, /aria-label="edit container name: trade binder"/);
  assert.match(html, /data-loc-type="container"/);
  assert.match(html, /data-loc-name="trade binder"/);
  assert.match(html, /trade binder/);
  assert.match(html, /loc-pill-container/);
});
