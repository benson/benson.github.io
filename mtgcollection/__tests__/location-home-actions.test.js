import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  bindLocationHomeInteractions,
  locationDeleteMessage,
  readLocationCreateType,
  syncLocationTypeLabels,
} from '../locationHomeActions.js';

function setup(html) {
  const win = new Window();
  win.document.body.innerHTML = `<section id="locations">${html}</section>`;
  return {
    win,
    locationsEl: win.document.getElementById('locations'),
  };
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('readLocationCreateType: prefers checked radio and falls back to hidden or box', () => {
  let { locationsEl } = setup(`
    <form id="locationsCreateForm">
      <input type="hidden" name="locationsCreateType" value="deck">
      <label class="locations-create-type"><input type="radio" name="locationsCreateType" value="box"></label>
      <label class="locations-create-type"><input type="radio" name="locationsCreateType" value="binder" checked></label>
    </form>
  `);
  assert.equal(readLocationCreateType(locationsEl.querySelector('form')), 'binder');

  ({ locationsEl } = setup(`
    <form id="locationsCreateForm">
      <input type="hidden" name="locationsCreateType" value="deck">
    </form>
  `));
  assert.equal(readLocationCreateType(locationsEl.querySelector('form')), 'deck');

  ({ locationsEl } = setup(`<form id="locationsCreateForm"></form>`));
  assert.equal(readLocationCreateType(locationsEl.querySelector('form')), 'box');
});

test('syncLocationTypeLabels: mirrors checked state to selected classes', () => {
  const { locationsEl } = setup(`
    <label class="locations-create-type is-selected"><input type="radio" name="locationsCreateType" value="box"></label>
    <label class="locations-create-type"><input type="radio" name="locationsCreateType" value="binder" checked></label>
  `);

  syncLocationTypeLabels(locationsEl);

  const labels = [...locationsEl.querySelectorAll('.locations-create-type')];
  assert.equal(labels[0].classList.contains('is-selected'), false);
  assert.equal(labels[1].classList.contains('is-selected'), true);
});

test('bindLocationHomeInteractions: creates locations and refreshes the shell', () => {
  const { win, locationsEl } = setup(`
    <form id="locationsCreateForm">
      <input type="hidden" name="locationsCreateType" value="deck">
      <input id="locationsCreateName" value="breya">
    </form>
  `);
  const calls = [];
  bindLocationHomeInteractions({
    locationsEl,
    ensureContainerImpl: loc => {
      calls.push(['ensure', loc]);
      return { type: loc.type, name: loc.name, deck: { title: loc.name } };
    },
    recordEventImpl: event => calls.push(['record', event.type, event.deckLocation]),
    containerExistsImpl: () => false,
    saveImpl: () => calls.push(['save']),
    populateFiltersImpl: () => calls.push(['populate']),
    renderImpl: () => calls.push(['render']),
    documentObj: win.document,
  });

  locationsEl.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, [
    ['ensure', { type: 'deck', name: 'breya' }],
    ['record', 'deck-create', 'deck:breya'],
    ['save'],
    ['populate'],
    ['render'],
  ]);
  assert.equal(locationsEl.querySelector('#locationsCreateName').value, '');
});

test('bindLocationHomeInteractions: ghost create tile focuses the deck name field', () => {
  const { win, locationsEl } = setup(`
    <form id="locationsCreateForm">
      <input type="hidden" name="locationsCreateType" value="deck">
      <input id="locationsCreateName" value="breya">
    </form>
    <button type="button" data-location-create-focus>add deck</button>
  `);
  bindLocationHomeInteractions({
    locationsEl,
    documentObj: win.document,
  });

  click(win, locationsEl.querySelector('[data-location-create-focus]'));

  assert.equal(win.document.activeElement, locationsEl.querySelector('#locationsCreateName'));
});

test('bindLocationHomeInteractions: records storage container creates', () => {
  const { win, locationsEl } = setup(`
    <form id="locationsCreateForm">
      <input type="hidden" name="locationsCreateType" value="binder">
      <input id="locationsCreateName" value="trade">
    </form>
  `);
  const calls = [];
  bindLocationHomeInteractions({
    locationsEl,
    ensureContainerImpl: loc => ({ type: loc.type, name: loc.name }),
    recordEventImpl: event => calls.push(event),
    containerExistsImpl: () => false,
    documentObj: win.document,
  });

  locationsEl.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'storage-create');
  assert.deepEqual(calls[0].containerAfter, { type: 'binder', name: 'trade' });
});


test('bindLocationHomeInteractions: handles menus, renames, and navigation', () => {
  const { win, locationsEl } = setup(`
    <article class="location-card" data-loc-type="box" data-loc-name="bulk" tabindex="0">
      <button class="location-card-menu-btn" type="button">menu</button>
      <div class="location-card-menu"><button class="location-delete" type="button">delete</button></div>
      <button class="location-card-edit-btn" type="button">edit</button>
      <span class="location-card-name-text">bulk</span>
      <div class="location-card-edit-row">
        <input class="location-rename-input" value="bulk 2">
        <label class="loc-type-radio"><input type="radio" name="editLocType_0" value="box"></label>
        <label class="loc-type-radio"><input type="radio" name="editLocType_0" value="binder" checked></label>
        <button class="location-rename-save" type="button">save</button>
        <button class="location-rename-cancel" type="button">cancel</button>
      </div>
    </article>
  `);
  const navigations = [];
  const renames = [];
  bindLocationHomeInteractions({
    locationsEl,
    renameContainerImpl: (from, to) => renames.push({ from, to }),
    navigateToLocationImpl: (type, name) => navigations.push({ type, name }),
    documentObj: win.document,
  });

  const card = locationsEl.querySelector('.location-card');
  click(win, locationsEl.querySelector('.location-card-menu-btn'));
  assert.equal(card.classList.contains('menu-open'), true);

  click(win, win.document.body);
  assert.equal(card.classList.contains('menu-open'), false);

  click(win, locationsEl.querySelector('.location-card-edit-btn'));
  assert.equal(card.classList.contains('editing'), true);

  click(win, locationsEl.querySelector('.location-rename-save'));
  assert.deepEqual(renames, [{
    from: { type: 'box', name: 'bulk' },
    to: { type: 'binder', name: 'bulk 2' },
  }]);

  click(win, locationsEl.querySelector('.location-rename-cancel'));
  click(win, locationsEl.querySelector('.location-card-name-text'));
  card.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

  assert.deepEqual(navigations, [
    { type: 'box', name: 'bulk' },
    { type: 'box', name: 'bulk' },
  ]);
});

test('bindLocationHomeInteractions: confirms filled and empty deletes', () => {
  const { win, locationsEl } = setup(`
    <article class="location-card" data-loc-type="box" data-loc-name="bulk">
      <button class="location-delete" type="button">delete</button>
    </article>
  `);
  const confirms = [];
  const filledDeletes = [];
  const emptyDeletes = [];
  let stats = { total: 2, unique: 1 };
  bindLocationHomeInteractions({
    locationsEl,
    containerStatsImpl: () => stats,
    confirmImpl: message => {
      confirms.push(message);
      return true;
    },
    deleteContainerAndUnlocateCardsImpl: loc => filledDeletes.push(loc),
    deleteEmptyContainerImpl: loc => emptyDeletes.push(loc),
    documentObj: win.document,
  });

  click(win, locationsEl.querySelector('.location-delete'));
  stats = { total: 0, unique: 0 };
  click(win, locationsEl.querySelector('.location-delete'));

  assert.match(confirms[0], /this will clear the location from 2 cards/);
  assert.equal(confirms[1], 'delete box "bulk"?');
  assert.deepEqual(filledDeletes, [{ type: 'box', name: 'bulk' }]);
  assert.deepEqual(emptyDeletes, [{ type: 'box', name: 'bulk' }]);
});

test('locationDeleteMessage: singular card grammar stays tidy', () => {
  assert.match(
    locationDeleteMessage({ type: 'binder', name: 'trade' }, { total: 1, unique: 1 }),
    /from 1 card \(1 unique\)/
  );
});
