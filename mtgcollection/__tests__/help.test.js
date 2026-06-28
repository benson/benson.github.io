import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { initHelp } from '../help.js';

function click(win, el) {
  const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

test('initHelp: legacy help.html FAB opens the in-app help panel', () => {
  const win = new Window({ url: 'https://biblioplex.test/' });
  win.document.body.innerHTML = `
    <a class="fab-btn help-fab" href="./help.html">help</a>
    <section id="helpPanel" aria-hidden="true">
      <button data-help-close type="button">close</button>
      <div id="helpBody"></div>
    </section>
  `;

  initHelp({
    documentObj: win.document,
    locationObj: win.location,
    historyObj: win.history,
  });

  const link = win.document.querySelector('.help-fab');
  const panel = win.document.getElementById('helpPanel');
  const event = click(win, link);

  assert.equal(event.defaultPrevented, true);
  assert.equal(panel.classList.contains('visible'), true);
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(link.getAttribute('aria-expanded'), 'true');
  assert.equal(win.location.hash, '#help-start');
  assert.equal(win.document.querySelectorAll('.help-nav-btn').length, 8);
});
