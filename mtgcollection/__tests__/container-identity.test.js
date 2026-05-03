import test from 'node:test';
import assert from 'node:assert/strict';
import { containerIdentityHtml } from '../view.js';

test('containerIdentityHtml: renders a rename target plus type badge', () => {
  const html = containerIdentityHtml({ type: 'binder', name: 'trade binder' });

  assert.match(html, /data-container-rename/);
  assert.match(html, /data-loc-type="binder"/);
  assert.match(html, /data-loc-name="trade binder"/);
  assert.match(html, /trade binder/);
  assert.match(html, /loc-pill-binder/);
});
