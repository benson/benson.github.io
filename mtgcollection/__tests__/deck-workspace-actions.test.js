import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  bindDeckWorkspaceInteractions,
  openDeckCommanderCard,
  runDeckCardAction,
  setDeckPanelOpen,
} from '../deckWorkspaceActions.js';

function setup(html = '') {
  const win = new Window();
  win.document.body.innerHTML = `
    <select id="deckGroupBy">
      <option value="type">type</option>
      <option value="cmc">cmc</option>
      <option value="color">color</option>
    </select>
    <div id="deckColumns">${html}</div>
  `;
  return {
    win,
    document: win.document,
    deckColumnsEl: win.document.getElementById('deckColumns'),
    deckGroupEl: win.document.getElementById('deckGroupBy'),
  };
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function change(win, el) {
  el.dispatchEvent(new win.Event('change', { bubbles: true, cancelable: true }));
}

function baseState() {
  return {
    collection: [{ name: 'Sol Ring' }],
    deckBoardFilter: 'all',
    deckCardSize: 'medium',
    deckGroupBy: 'type',
    deckMode: 'visual',
    deckOwnershipView: 'all',
    deckSampleHand: null,
    deckShowPrices: true,
  };
}

test('setDeckPanelOpen: toggles visibility, trigger state, and focus', () => {
  const { document, deckColumnsEl } = setup(`
    <button data-toggle-deck-export aria-expanded="false">export</button>
    <div id="deckExportPanel" class="hidden"><input id="first"></div>
  `);

  assert.equal(setDeckPanelOpen(deckColumnsEl, 'deckExportPanel', '[data-toggle-deck-export]', true), true);

  assert.equal(document.getElementById('deckExportPanel').classList.contains('hidden'), false);
  assert.equal(document.querySelector('[data-toggle-deck-export]').getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement.id, 'first');

  setDeckPanelOpen(deckColumnsEl, 'deckExportPanel', '[data-toggle-deck-export]', false);
  assert.equal(document.getElementById('deckExportPanel').classList.contains('hidden'), true);
  assert.equal(document.querySelector('[data-toggle-deck-export]').getAttribute('aria-expanded'), 'false');
});

test('runDeckCardAction: opens inventory details and delegates board mutations', () => {
  const { deckColumnsEl } = setup(`
    <article class="deck-card menu-open">
      <button data-card-menu-toggle aria-expanded="true"></button>
      <div class="deck-card-menu"><button role="menuitem"></button></div>
      <button data-card-action="open" data-inventory-index="4"></button>
      <button data-card-action="move-board" data-scryfall-id="sol" data-board="main" data-board-target="sideboard"></button>
      <button data-card-action="remove-from-deck" data-scryfall-id="sol" data-board="sideboard"></button>
    </article>
  `);
  const deck = { type: 'deck', name: 'breya' };
  const calls = [];

  runDeckCardAction(deckColumnsEl.querySelector('[data-card-action="open"]'), {
    root: deckColumnsEl,
    currentDeckContainerImpl: () => deck,
    openDetailImpl: index => calls.push(['detail', index]),
  });
  runDeckCardAction(deckColumnsEl.querySelector('[data-card-action="move-board"]'), {
    root: deckColumnsEl,
    currentDeckContainerImpl: () => deck,
    moveDeckCardToBoardCommandImpl: (...args) => calls.push(['move', ...args]),
  });
  runDeckCardAction(deckColumnsEl.querySelector('[data-card-action="remove-from-deck"]'), {
    root: deckColumnsEl,
    currentDeckContainerImpl: () => deck,
    removeDeckCardFromDeckCommandImpl: (...args) => calls.push(['remove', ...args]),
  });

  assert.deepEqual(calls, [
    ['detail', 4],
    ['move', deck, 'sol', 'main', 'sideboard'],
    ['remove', deck, 'sol', 'sideboard'],
  ]);
  assert.equal(deckColumnsEl.querySelector('.deck-card').classList.contains('menu-open'), false);
});

test('openDeckCommanderCard: opens local inventory or falls back to Scryfall', () => {
  const { deckColumnsEl } = setup(`
    <button data-deck-commander-card data-scryfall-id="cmd-1" data-card-name="Breya" data-scryfall-uri="https://scryfall.test/card/cmd-1"></button>
    <button data-deck-commander-card data-scryfall-id="missing" data-card-name="Silas Renn"></button>
  `);
  const calls = [];

  const local = openDeckCommanderCard(deckColumnsEl.querySelector('[data-scryfall-id="cmd-1"]'), {
    collection: [{ name: 'Sol Ring', scryfallId: 'sol' }, { name: 'Breya', scryfallId: 'cmd-1' }],
    openDetailImpl: index => calls.push(['detail', index]),
    openUrlImpl: url => calls.push(['url', url]),
  });
  const remote = openDeckCommanderCard(deckColumnsEl.querySelector('[data-scryfall-id="missing"]'), {
    collection: [],
    openDetailImpl: index => calls.push(['detail', index]),
    openUrlImpl: url => calls.push(['url', url]),
  });

  assert.deepEqual(local, { ok: true, target: 'inventory', index: 1 });
  assert.equal(remote.target, 'scryfall');
  assert.match(remote.url, /^https:\/\/scryfall\.com\/search\?q=/);
  assert.deepEqual(calls, [
    ['detail', 1],
    ['url', remote.url],
  ]);
});

test('bindDeckWorkspaceInteractions: updates workspace prefs and simple deck actions', () => {
  const { win, deckColumnsEl, deckGroupEl } = setup(`
    <button data-deck-mode="stats"></button>
    <button data-deck-board-filter="sideboard"></button>
    <button data-deck-card-size="large"></button>
    <button data-deck-ownership="decklist"></button>
    <button class="deck-empty-chip"><span class="loc-pill" data-loc-type="deck" data-loc-name="breya"></span></button>
    <button data-deck-action="share"></button>
    <button data-deck-commander-card data-scryfall-id="cmd-1" data-card-name="Breya" data-scryfall-uri="https://scryfall.test/card/cmd-1"></button>
    <button data-deck-commander-card data-scryfall-id="missing" data-card-name="Unknown"></button>
    <label class="deck-metadata-companion"><input name="companion" hidden><button data-add-companion type="button"></button></label>
  `);
  const stateRef = baseState();
  stateRef.collection = [{ name: 'Breya', scryfallId: 'cmd-1' }];
  const deck = { type: 'deck', name: 'breya' };
  const calls = [];

  bindDeckWorkspaceInteractions({
    deckColumnsEl,
    deckGroupEl,
    documentObj: win.document,
    stateRef,
    currentDeckContainerImpl: () => deck,
    navigateToLocationImpl: (type, name) => calls.push(['nav', type, name]),
    openDetailImpl: index => calls.push(['detail', index]),
    openUrlImpl: url => calls.push(['url', url]),
    openShareModalImpl: deckArg => calls.push(['share', deckArg]),
    renderImpl: () => calls.push(['render']),
    saveDeckGroupImpl: () => calls.push(['saveGroup']),
    saveDeckPrefsImpl: () => calls.push(['savePrefs']),
  });

  click(win, deckColumnsEl.querySelector('[data-deck-mode]'));
  click(win, deckColumnsEl.querySelector('[data-deck-board-filter]'));
  click(win, deckColumnsEl.querySelector('[data-deck-card-size]'));
  click(win, deckColumnsEl.querySelector('[data-deck-ownership]'));
  click(win, deckColumnsEl.querySelector('.deck-empty-chip'));
  click(win, deckColumnsEl.querySelector('[data-deck-action="share"]'));
  click(win, deckColumnsEl.querySelector('[data-scryfall-id="cmd-1"]'));
  click(win, deckColumnsEl.querySelector('[data-scryfall-id="missing"]'));
  click(win, deckColumnsEl.querySelector('[data-add-companion]'));
  deckGroupEl.value = 'cmc';
  change(win, deckGroupEl);

  assert.equal(stateRef.deckMode, 'stats');
  assert.equal(stateRef.deckBoardFilter, 'sideboard');
  assert.equal(stateRef.deckCardSize, 'large');
  assert.equal(stateRef.deckOwnershipView, 'decklist');
  assert.equal(stateRef.deckGroupBy, 'cmc');
  assert.equal(deckColumnsEl.querySelector('input[name="companion"]').hidden, false);
  assert.deepEqual(calls.filter(call => call[0] === 'nav'), [['nav', 'deck', 'breya']]);
  assert.deepEqual(calls.filter(call => call[0] === 'share'), [['share', deck]]);
  assert.deepEqual(calls.filter(call => call[0] === 'detail'), [['detail', 0]]);
  assert.deepEqual(calls.filter(call => call[0] === 'url'), [['url', 'https://scryfall.com/search?q=!%22Unknown%22']]);
  assert.equal(calls.filter(call => call[0] === 'savePrefs').length, 4);
  assert.equal(calls.filter(call => call[0] === 'saveGroup').length, 1);
});

test('bindDeckWorkspaceInteractions: handles form changes, metadata submit, hands, and export actions', () => {
  const { win, deckColumnsEl, deckGroupEl } = setup(`
    <select data-deck-group><option value="type">type</option><option value="color">color</option></select>
    <label><input type="checkbox" data-deck-show-prices></label>
    <form id="deckMetadataForm">
      <select data-deck-format-preset name="formatPreset">
        <option value="commander">commander</option>
        <option value="custom">custom</option>
      </select>
      <input data-deck-format-custom name="formatCustom" value="oathbreaker" hidden>
    </form>
    <button data-sample-hand="draw"></button>
    <form id="deckExportForm"></form>
    <button data-export-action="download"></button>
    <button data-copy-decklist></button>
  `);
  const stateRef = baseState();
  const deck = { type: 'deck', name: 'breya' };
  const calls = [];
  const select = deckColumnsEl.querySelector('[data-deck-group]');
  const format = deckColumnsEl.querySelector('[data-deck-format-preset]');
  const price = deckColumnsEl.querySelector('[data-deck-show-prices]');

  bindDeckWorkspaceInteractions({
    deckColumnsEl,
    deckGroupEl,
    documentObj: win.document,
    stateRef,
    currentDeckContainerImpl: () => deck,
    currentDeckMetadataImpl: () => ({ title: 'Breya' }),
    filteredSortedImpl: () => ['card'],
    buildDeckSampleHandImpl: args => ({ drawn: args.handSize, deck: args.deck.name }),
    copyDecklistImpl: args => calls.push(['copy', args.list, args.metadata]),
    runDeckExportActionImpl: args => calls.push(['export', args.action, args.list, args.metadata]),
    saveDeckMetadataFromFormImpl: args => {
      calls.push(['metadata', args.deck, args.form.id]);
      return { added: 2 };
    },
    saveImpl: () => calls.push(['save']),
    renderImpl: () => calls.push(['render']),
    saveDeckGroupImpl: () => calls.push(['saveGroup']),
    saveDeckPrefsImpl: () => calls.push(['savePrefs']),
    showFeedbackImpl: (message, type) => calls.push(['feedback', message, type]),
  });

  select.value = 'color';
  change(win, select);
  format.value = 'custom';
  change(win, format);
  price.checked = false;
  change(win, price);
  deckColumnsEl.querySelector('#deckMetadataForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  click(win, deckColumnsEl.querySelector('[data-sample-hand]'));
  click(win, deckColumnsEl.querySelector('[data-export-action]'));
  click(win, deckColumnsEl.querySelector('[data-copy-decklist]'));

  assert.equal(stateRef.deckGroupBy, 'color');
  assert.equal(deckColumnsEl.querySelector('#deckMetadataForm').dataset.format, 'oathbreaker');
  assert.equal(deckColumnsEl.querySelector('[data-deck-format-custom]').hidden, false);
  assert.equal(stateRef.deckShowPrices, false);
  assert.deepEqual(stateRef.deckSampleHand, { drawn: 7, deck: 'breya' });
  assert.equal(stateRef.deckMode, 'hands');
  assert.ok(calls.some(call => call[0] === 'metadata'));
  assert.ok(calls.some(call => call[0] === 'feedback' && /2 commander cards/.test(call[1])));
  assert.deepEqual(calls.filter(call => call[0] === 'export'), [['export', 'download', ['card'], { title: 'Breya' }]]);
  assert.deepEqual(calls.filter(call => call[0] === 'copy'), [['copy', ['card'], { title: 'Breya' }]]);
});

test('bindDeckWorkspaceInteractions: handles details, text rows, card menus, preview, and outside closes', () => {
  const { win, deckColumnsEl, deckGroupEl } = setup(`
    <button data-edit-deck-details aria-expanded="false"></button>
    <section id="deckDetailsEditor" class="hidden"><input name="title"></section>
    <button data-cancel-deck-details></button>
    <table class="deck-text-table"><tbody>
      <tr class="detail-trigger" data-index="8"><td class="text-cell">row</td><td><button class="card-name-button" data-index="9">name</button></td></tr>
    </tbody></table>
    <article class="deck-card">
      <button data-card-menu-toggle aria-expanded="false"></button>
      <div class="deck-card-menu" hidden>
        <button role="menuitem" id="first">first</button>
        <button role="menuitem" id="second">second</button>
      </div>
      <button data-card-action="move-board" data-scryfall-id="sol" data-board="main" data-board-target="maybe"></button>
    </article>
    <button id="outside"></button>
    <div class="deck-export-menu-wrap">
      <button data-toggle-deck-export aria-expanded="false"></button>
      <div id="deckExportPanel" class="hidden"><button id="panelButton"></button></div>
    </div>
  `);
  const calls = [];
  const previews = [];

  bindDeckWorkspaceInteractions({
    deckColumnsEl,
    deckGroupEl,
    documentObj: win.document,
    stateRef: baseState(),
    currentDeckContainerImpl: () => ({ type: 'deck', name: 'breya' }),
    openDetailImpl: index => calls.push(['detail', index]),
    moveDeckCardToBoardCommandImpl: (...args) => calls.push(['move', ...args.slice(1)]),
    deckPreviewPanel: { showFromTarget: target => previews.push(target.id || target.textContent.trim()) },
  });

  click(win, deckColumnsEl.querySelector('[data-edit-deck-details]'));
  assert.equal(deckColumnsEl.querySelector('#deckDetailsEditor').classList.contains('hidden'), false);
  assert.equal(win.document.activeElement.getAttribute('name'), 'title');
  click(win, deckColumnsEl.querySelector('[data-cancel-deck-details]'));
  assert.equal(deckColumnsEl.querySelector('#deckDetailsEditor').classList.contains('hidden'), true);

  click(win, deckColumnsEl.querySelector('.card-name-button'));
  click(win, deckColumnsEl.querySelector('.text-cell'));
  assert.deepEqual(calls.filter(call => call[0] === 'detail'), [['detail', 9], ['detail', 8]]);

  const menuToggle = deckColumnsEl.querySelector('[data-card-menu-toggle]');
  click(win, menuToggle);
  assert.equal(deckColumnsEl.querySelector('.deck-card').classList.contains('menu-open'), true);
  deckColumnsEl.querySelector('[data-card-action]').click();
  assert.deepEqual(calls.find(call => call[0] === 'move'), ['move', 'sol', 'main', 'maybe']);

  menuToggle.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(win.document.activeElement.id, 'first');
  win.document.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  assert.equal(win.document.activeElement.id, 'second');

  previews.length = 0;
  deckColumnsEl.querySelector('#outside').dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  deckColumnsEl.querySelector('#outside').dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
  assert.deepEqual(previews, ['outside', 'outside']);

  click(win, deckColumnsEl.querySelector('[data-toggle-deck-export]'));
  assert.equal(deckColumnsEl.querySelector('#deckExportPanel').classList.contains('hidden'), false);
  click(win, win.document.body);
  assert.equal(deckColumnsEl.querySelector('#deckExportPanel').classList.contains('hidden'), true);
});
