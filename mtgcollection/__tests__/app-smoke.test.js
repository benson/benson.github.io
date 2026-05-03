import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');
const appDir = path.join(projectRoot, 'mtgcollection');

function jsonResponse(data, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status || 200,
    async json() { return data; },
    async text() { return JSON.stringify(data); },
  };
}

function inferType(name) {
  const lower = String(name || '').toLowerCase();
  if (/(den|tomb|mesa|tower|fountain|island|mountain|plains|swamp|furnace|delta|triome|saga|vault|orchard|crypt|city|pools|shrine|confluence|industry|fair|heath)/.test(lower)) {
    return 'Land';
  }
  if (/(signet|ring|vault|mox|talisman|chalice|clamp|sword|lantern|petal|citadel|key|scales)/.test(lower)) {
    return 'Artifact';
  }
  if (/(tutor|rift|dispatch|will|swat|invention|plowshares)/.test(lower)) {
    return 'Instant';
  }
  return 'Creature';
}

function fakeCard(identifier, index) {
  const set = String(identifier.set || 'tst').toLowerCase();
  const collectorNumber = String(identifier.collector_number || index + 1);
  const name = String(identifier.name || 'Test Card ' + collectorNumber);
  const id = identifier.id || `${set}-${collectorNumber}`;
  const typeLine = inferType(name);
  const isLand = typeLine === 'Land';

  return {
    id,
    name,
    set,
    set_name: set.toUpperCase(),
    collector_number: collectorNumber,
    rarity: isLand ? 'common' : 'rare',
    cmc: isLand ? 0 : 2,
    colors: isLand ? [] : ['U'],
    color_identity: isLand ? [] : ['U'],
    type_line: typeLine,
    oracle_text: '',
    legalities: {
      commander: 'legal',
      standard: 'legal',
      pioneer: 'legal',
      modern: 'legal',
      legacy: 'legal',
      vintage: 'legal',
      pauper: isLand ? 'legal' : 'not_legal',
    },
    scryfall_uri: 'https://scryfall.test/card/' + encodeURIComponent(id),
    image_uris: {
      normal: 'https://images.test/' + encodeURIComponent(id) + '/normal.jpg',
      large: 'https://images.test/' + encodeURIComponent(id) + '/large.jpg',
    },
    prices: {
      usd: '1.00',
      usd_foil: '2.00',
      usd_etched: '3.00',
    },
  };
}

function createFetchMock() {
  return async (input, init = {}) => {
    const url = String(input);

    if (url.includes('metadata.json')) {
      const metadata = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared', 'metadata.json'), 'utf8'));
      return jsonResponse(metadata);
    }

    if (url.includes('/sets')) {
      return jsonResponse({
        has_more: false,
        data: [
          { code: 'cmm', icon_svg_uri: 'https://svgs.test/cmm.svg' },
          { code: 'sld', icon_svg_uri: 'https://svgs.test/sld.svg' },
        ],
      });
    }

    if (url.includes('/cards/collection')) {
      const body = JSON.parse(init.body || '{}');
      const identifiers = Array.isArray(body.identifiers) ? body.identifiers : [];
      return jsonResponse({
        data: identifiers.map(fakeCard),
        not_found: [],
      });
    }

    if (url.includes('/cards/autocomplete')) {
      return jsonResponse({ data: [] });
    }

    if (url.includes('/cards/search')) {
      return jsonResponse({ data: [], has_more: false });
    }

    return jsonResponse({}, { ok: false, status: 404 });
  };
}

function exposeWindow(window) {
  const globals = {
    window,
    document: window.document,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    history: window.history,
    navigator: window.navigator,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    CustomEvent: window.CustomEvent,
    FormData: window.FormData,
    Blob: window.Blob,
    File: window.File,
    FileReader: window.FileReader,
    DOMParser: window.DOMParser,
    getComputedStyle: window.getComputedStyle.bind(window),
    confirm: () => true,
    alert: () => {},
  };

  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }

  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async () => {} },
    configurable: true,
  });
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
}

async function bootApp() {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const window = new Window({
    url: 'http://localhost/mtgcollection/index.html',
    settings: { disableJavaScriptEvaluation: true },
  });
  exposeWindow(window);
  window.document.write(html);
  window.document.close();

  const appUrl = pathToFileURL(path.join(appDir, 'app.js')).href + '?smoke=' + Date.now();
  await import(appUrl);

  return window;
}

async function waitFor(predicate, label, timeoutMs = 5000) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const value = predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  if (lastError) throw lastError;
  assert.fail('Timed out waiting for ' + label);
}

function click(window, selectorOrElement) {
  const el = typeof selectorOrElement === 'string'
    ? window.document.querySelector(selectorOrElement)
    : selectorOrElement;
  assert.ok(el, 'Expected clickable element: ' + selectorOrElement);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('app smoke: seed data, navigate routes, tweak deck, and draw a hand', async () => {
  const window = await bootApp();
  const { state } = await import('../state.js');

  await waitFor(() => window.document.body.classList.contains('view-collection'), 'collection boot');

  click(window, '#loadTestDataBtn');
  await waitFor(
    () => state.containers['deck:breya']?.deckList?.length > 50,
    'Breya test deck seed'
  );

  assert.ok(state.collection.length > 0);
  assert.equal(window.document.querySelector('#uniqueCount').textContent, String(state.collection.length));

  click(window, '[data-view="decks"]');
  await waitFor(() => window.document.body.classList.contains('view-decks-home'), 'decks home');
  const deckHomeCard = window.document.querySelector('.deck-home-card[data-loc-name="breya"]');
  assert.ok(deckHomeCard);

  click(window, deckHomeCard);
  await waitFor(() => window.document.body.classList.contains('view-deck'), 'deck workspace');
  assert.match(window.document.querySelector('#deckColumns').textContent, /breya/i);
  assert.ok(window.document.querySelectorAll('#deckColumns .deck-card').length > 20);

  click(window, '#deckColumns [data-card-action="move-board"][data-board-target="sideboard"]');
  await waitFor(
    () => state.containers['deck:breya'].deckList.some(entry => entry.board === 'sideboard'),
    'card moved to sideboard'
  );

  click(window, '#deckColumns [data-deck-mode="hands"]');
  await waitFor(() => window.document.querySelector('#deckSampleHand'), 'sample hand panel');
  click(window, '#deckColumns [data-sample-hand="draw"]');
  await waitFor(
    () => window.document.querySelectorAll('#deckHandCards .deck-card').length === 7,
    'seven-card sample hand'
  );

  click(window, '[data-view="storage"]');
  await waitFor(() => window.document.body.classList.contains('view-storage-home'), 'storage home');
  assert.ok(window.document.querySelector('.location-card[data-loc-type="box"][data-loc-name="bulk"]'));
  assert.ok(window.document.querySelector('.location-card[data-loc-type="binder"][data-loc-name="trade binder"]'));

  const visibleText = window.document.body.textContent;
  assert.doesNotMatch(visibleText, /\u00c2|\u00c3|\u00e2|\ufffd/);

  window.close();
});
