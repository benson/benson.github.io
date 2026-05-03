import test from 'node:test';
import assert from 'node:assert/strict';
import { deckDetailsViewModel, renderDeckDetailsHeaderHtml } from '../views/deckHeaderView.js';

test('deckDetailsViewModel: builds read-first deck header data', () => {
  const model = deckDetailsViewModel(
    { name: 'breya' },
    {
      title: 'Artifact Loop',
      description: 'small artifact engines',
      format: 'commander',
      commander: 'Breya, Etherium Shaper',
      partner: 'Silas Renn, Seeker Adept',
    },
    { total: 100, main: 98, sideboard: 1, maybe: 1, value: 123.456 },
    ''
  );

  assert.equal(model.displayTitle, 'Artifact Loop');
  assert.equal(model.descriptionText, 'small artifact engines');
  assert.equal(model.format, 'commander');
  assert.equal(model.commander, 'Breya, Etherium Shaper');
  assert.equal(model.partner, 'Silas Renn, Seeker Adept');
  assert.equal(model.total, 100);
  assert.equal(model.main, 98);
  assert.equal(model.sideboard, 1);
  assert.equal(model.maybe, 1);
  assert.equal(model.valueText, '$123.46');
});

test('deckDetailsViewModel: falls back to container name and selected format', () => {
  const model = deckDetailsViewModel(
    { name: 'breya' },
    { title: '', description: '', format: '', commander: '', partner: '' },
    { total: 0, main: 0, sideboard: 0, maybe: 0, value: 0 },
    'modern'
  );

  assert.equal(model.displayTitle, 'breya');
  assert.equal(model.descriptionText, 'No description yet.');
  assert.equal(model.format, 'modern');
  assert.equal(model.formatInput, 'modern');
  assert.equal(model.valueText, '-');
});

test('renderDeckDetailsHeaderHtml: keeps metadata editor hidden until requested', () => {
  const model = deckDetailsViewModel(
    { name: 'breya' },
    {
      title: 'Artifact Loop',
      description: 'small artifact engines',
      format: 'commander',
      commander: 'Breya, Etherium Shaper',
      partner: '',
    },
    { total: 100, main: 98, sideboard: 0, maybe: 2, value: 42 },
    ''
  );
  const html = renderDeckDetailsHeaderHtml(model);

  assert.ok(html.indexOf('class="deck-hero"') < html.indexOf('id="deckDetailsEditor"'));
  assert.match(html, /data-edit-deck-details/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="deck-details-editor hidden"/);
  assert.match(html, /<strong>100<\/strong> total/);
  assert.match(html, /Breya, Etherium Shaper/);
});

