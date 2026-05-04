import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createRightDrawer } from '../rightDrawer.js';

function installDom() {
  const win = new Window();
  win.document.body.innerHTML = `
    <details id="addDetails"></details>
    <details id="otherPanel"></details>
  `;
  return win.document;
}

test('createRightDrawer: card-browsing shapes open allowed panels in the overlay drawer', () => {
  const documentRef = installDom();
  const seeded = [];
  const drawer = createRightDrawer({
    documentRef,
    getShape: () => 'binder',
    setSelectedLocation: loc => seeded.push(loc),
  });

  drawer.open(['addDetails', 'otherPanel'], { seedLocation: { type: 'binder', name: 'trade binder' } });

  assert.equal(documentRef.body.classList.contains('right-drawer-open'), true);
  assert.equal(documentRef.getElementById('addDetails').open, true);
  assert.equal(documentRef.getElementById('otherPanel').open, false);
  assert.deepEqual(seeded, [{ type: 'binder', name: 'trade binder' }]);
  assert.equal(drawer.isOpen(), true);
});

test('createRightDrawer: non-card shapes open allowed panels inline', () => {
  const documentRef = installDom();
  const drawer = createRightDrawer({
    documentRef,
    getShape: () => 'decks-home',
  });

  drawer.open('addDetails');

  assert.equal(documentRef.body.classList.contains('right-drawer-open'), false);
  assert.equal(documentRef.getElementById('addDetails').open, true);
  assert.equal(drawer.isOpen(), false);
});

test('createRightDrawer: invalid panels are ignored', () => {
  const documentRef = installDom();
  const drawer = createRightDrawer({
    documentRef,
    getShape: () => 'collection',
  });

  drawer.open('otherPanel');

  assert.equal(documentRef.body.classList.contains('right-drawer-open'), false);
  assert.equal(documentRef.getElementById('otherPanel').open, false);
});

test('createRightDrawer: close removes overlay state', () => {
  const documentRef = installDom();
  const drawer = createRightDrawer({
    documentRef,
    getShape: () => 'collection',
  });

  drawer.open('addDetails');
  drawer.close();

  assert.equal(documentRef.body.classList.contains('right-drawer-open'), false);
  assert.equal(drawer.isOpen(), false);
});
