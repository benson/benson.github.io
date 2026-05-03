import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  closeDeckCardMenus,
  moveFocusInDeckCardMenu,
  openDeckCardMenu,
  toggleDeckCardMenu,
} from '../deckCardMenu.js';

function installDom() {
  const win = new Window();
  global.document = win.document;
  win.document.body.innerHTML = `
    <div id="deckColumns">
      <article class="deck-card">
        <button data-card-menu-toggle aria-expanded="false">menu</button>
        <div class="deck-card-menu" hidden>
          <button role="menuitem" id="first">first</button>
          <button role="menuitem" id="second">second</button>
        </div>
      </article>
      <article class="deck-card menu-open">
        <button data-card-menu-toggle aria-expanded="true">menu</button>
        <div class="deck-card-menu">
          <button role="menuitem">other</button>
        </div>
      </article>
    </div>
  `;
  return {
    win,
    root: win.document.getElementById('deckColumns'),
    firstCard: win.document.querySelector('.deck-card'),
    firstToggle: win.document.querySelector('[data-card-menu-toggle]'),
    firstMenu: win.document.querySelector('.deck-card-menu'),
  };
}

test('deck card menu: open closes sibling menus and can focus the first item', () => {
  const dom = installDom();

  openDeckCardMenu(dom.firstToggle, { root: dom.root, focusFirst: true });

  assert.equal(dom.firstCard.classList.contains('menu-open'), true);
  assert.equal(dom.firstToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.firstMenu.hidden, false);
  assert.equal(dom.win.document.activeElement.id, 'first');
  assert.equal(dom.root.querySelectorAll('.deck-card.menu-open').length, 1);
});

test('deck card menu: close resets menu state', () => {
  const dom = installDom();

  closeDeckCardMenus(dom.root);

  assert.equal(dom.root.querySelectorAll('.deck-card.menu-open').length, 0);
  assert.equal(dom.firstToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.firstMenu.hidden, true);
});

test('deck card menu: toggle closes an open card and opens a closed card', () => {
  const dom = installDom();

  openDeckCardMenu(dom.firstToggle, { root: dom.root });
  toggleDeckCardMenu(dom.firstToggle);
  assert.equal(dom.firstCard.classList.contains('menu-open'), false);

  toggleDeckCardMenu(dom.firstToggle);
  assert.equal(dom.firstCard.classList.contains('menu-open'), true);
});

test('deck card menu: moveFocusInDeckCardMenu wraps through enabled items', () => {
  const dom = installDom();
  const first = dom.win.document.getElementById('first');
  const second = dom.win.document.getElementById('second');

  moveFocusInDeckCardMenu(dom.firstMenu, first, 1);
  assert.equal(dom.win.document.activeElement, second);

  moveFocusInDeckCardMenu(dom.firstMenu, second, 1);
  assert.equal(dom.win.document.activeElement, first);
});
