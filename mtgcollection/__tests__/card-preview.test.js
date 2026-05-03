import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  hideCardPreview,
  hideImageLightbox,
  initCardPreview,
  isLightboxVisible,
  showCardPreview,
  showImageLightbox,
} from '../ui/cardPreview.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

afterEach(() => {
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
});

function installDom() {
  const win = new Window();
  Object.defineProperty(win, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.body.innerHTML = `
    <div id="cardPreview"><img alt=""></div>
    <div id="imageLightbox" aria-hidden="true">
      <button id="lightboxFlip" class="lightbox-flip"></button>
      <img id="imageLightboxImg" alt="">
    </div>
    <button
      id="previewLink"
      class="card-preview-link"
      data-preview-url="https://img.test/cards/normal/front.jpg"
      data-preview-finish="foil"
    >Sol Ring</button>
  `;
  const link = win.document.getElementById('previewLink');
  link.getBoundingClientRect = () => ({
    left: 100,
    right: 180,
    top: 200,
    bottom: 220,
    width: 80,
    height: 20,
  });
  return win.document;
}

test('card preview positions, marks finish, and hides without coupling to view.js', () => {
  const doc = installDom();
  assert.equal(initCardPreview(doc), true);

  const link = doc.getElementById('previewLink');
  showCardPreview(link);

  const preview = doc.getElementById('cardPreview');
  const img = preview.querySelector('img');
  assert.equal(preview.classList.contains('visible'), true);
  assert.equal(preview.classList.contains('is-foil'), true);
  assert.equal(preview.style.left, '200px');
  assert.equal(img.getAttribute('src'), 'https://img.test/cards/normal/front.jpg');

  hideCardPreview();
  assert.equal(preview.classList.contains('visible'), false);
});

test('image lightbox flips between front and back large images', () => {
  const doc = installDom();
  initCardPreview(doc);

  showImageLightbox(
    'https://img.test/cards/normal/front.jpg',
    'https://img.test/cards/normal/back.jpg'
  );

  const lightbox = doc.getElementById('imageLightbox');
  const img = doc.getElementById('imageLightboxImg');
  const flip = doc.getElementById('lightboxFlip');
  assert.equal(isLightboxVisible(), true);
  assert.equal(lightbox.getAttribute('aria-hidden'), 'false');
  assert.equal(img.getAttribute('src'), 'https://img.test/cards/large/front.jpg');
  assert.equal(flip.classList.contains('hidden'), false);

  flip.click();
  assert.equal(img.getAttribute('src'), 'https://img.test/cards/large/back.jpg');

  hideImageLightbox();
  assert.equal(isLightboxVisible(), false);
  assert.equal(lightbox.getAttribute('aria-hidden'), 'true');
});

test('initCardPreview: missing chrome fails softly', () => {
  const win = new Window();
  assert.equal(initCardPreview(win.document), false);
});
