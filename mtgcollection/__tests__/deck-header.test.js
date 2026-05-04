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
      commanderScryfallId: 'cmd-1',
      commanderScryfallUri: 'https://scryfall.test/card/cmd-1',
      commanderImageUrl: 'breya.jpg',
      commanderFinish: 'foil',
      partner: 'Silas Renn, Seeker Adept',
      partnerScryfallId: 'partner-1',
      partnerScryfallUri: 'https://scryfall.test/card/partner-1',
      partnerImageUrl: 'silas.jpg',
      partnerFinish: 'etched',
    },
    { total: 100, main: 98, sideboard: 1, maybe: 1, value: 123.456 },
    ''
  );

  assert.equal(model.displayTitle, 'Artifact Loop');
  assert.equal(model.descriptionText, 'small artifact engines');
  assert.equal(model.format, 'commander');
  assert.equal(model.commander, 'Breya, Etherium Shaper');
  assert.equal(model.commanderScryfallUri, 'https://scryfall.test/card/cmd-1');
  assert.equal(model.commanderFinish, 'foil');
  assert.equal(model.partner, 'Silas Renn, Seeker Adept');
  assert.equal(model.partnerScryfallUri, 'https://scryfall.test/card/partner-1');
  assert.equal(model.partnerFinish, 'etched');
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
      commanderScryfallId: 'cmd-1',
      commanderScryfallUri: 'https://scryfall.test/card/cmd-1',
      commanderImageUrl: 'breya.jpg',
      commanderFinish: 'foil',
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
  assert.doesNotMatch(html, /deck-hero-stats/);
  assert.match(html, /Breya, Etherium Shaper/);
  assert.match(html, /<dt>commander<\/dt><dd class="deck-meta-value">\s*<button class="deck-meta-card-link"[^>]+data-scryfall-id="cmd-1"[^>]+>Breya, Etherium Shaper<\/button>/);
  assert.doesNotMatch(html, /class="deck-commander-widget"/);
  assert.doesNotMatch(html, /<dt>format<\/dt>/);
});

test('renderDeckDetailsHeaderHtml: keeps commander format prompt until commander is set', () => {
  const model = deckDetailsViewModel(
    { name: 'breya' },
    { title: 'Artifact Loop', format: 'commander', commander: '' },
    { total: 0 },
    ''
  );
  const html = renderDeckDetailsHeaderHtml(model);

  assert.doesNotMatch(html, /class="deck-commander-widget"/);
  assert.match(html, /<dt>format<\/dt><dd class="deck-meta-value">commander<\/dd>/);
});

test('renderDeckDetailsHeaderHtml: renders commander and partner as compact metadata', () => {
  const model = deckDetailsViewModel(
    { name: 'partners' },
    {
      format: 'commander',
      commander: 'Tymna the Weaver',
      commanderScryfallId: 'tymna',
      commanderImageUrl: 'tymna.jpg',
      commanderFinish: 'foil',
      partner: 'Thrasios, Triton Hero',
      partnerScryfallId: 'thrasios',
      partnerImageUrl: 'thrasios.jpg',
      partnerFinish: 'etched',
    },
    {},
    ''
  );
  const html = renderDeckDetailsHeaderHtml(model);

  assert.match(html, /<dt>commander<\/dt><dd class="deck-meta-value">\s*<button class="deck-meta-card-link"[^>]+data-scryfall-id="tymna"[^>]+>Tymna the Weaver<\/button>/);
  assert.match(html, /<dt>partner<\/dt><dd class="deck-meta-value">\s*<button class="deck-meta-card-link"[^>]+data-scryfall-id="thrasios"[^>]+>Thrasios, Triton Hero<\/button>/);
  assert.doesNotMatch(html, /src="tymna\.jpg"/);
  assert.doesNotMatch(html, /src="thrasios\.jpg"/);
});

