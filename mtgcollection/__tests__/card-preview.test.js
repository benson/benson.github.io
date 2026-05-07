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
const previousFetch = globalThis.fetch;

afterEach(() => {
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
  globalThis.fetch = previousFetch;
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

test('card preview lazily resolves an image when row metadata has no cached URL', async () => {
  const doc = installDom();
  assert.equal(initCardPreview(doc), true);
  const link = doc.getElementById('previewLink');
  delete link.dataset.previewUrl;
  link.dataset.previewSet = 'ddu';
  link.dataset.previewCn = '179';
  link.dataset.previewName = 'Dreamroot Cascade';
  const fetched = [];
  globalThis.fetch = async url => {
    fetched.push(String(url));
    if (String(url) === 'https://api.scryfall.com/cards/ddu/179') {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    assert.equal(String(url), 'https://api.scryfall.com/cards/named?exact=Dreamroot%20Cascade');
    return Response.json({
      name: 'Dreamroot Cascade',
      image_uris: { normal: 'https://img.test/dreamroot.jpg' },
    });
  };

  link.dispatchEvent(new doc.defaultView.MouseEvent('mouseover', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const preview = doc.getElementById('cardPreview');
  const img = preview.querySelector('img');
  assert.deepEqual(fetched, [
    'https://api.scryfall.com/cards/ddu/179',
    'https://api.scryfall.com/cards/named?exact=Dreamroot%20Cascade',
  ]);
  assert.equal(link.dataset.previewUrl, 'https://img.test/dreamroot.jpg');
  assert.equal(preview.classList.contains('visible'), true);
  assert.equal(img.getAttribute('src'), 'https://img.test/dreamroot.jpg');
});

test('card preview renders collection entry details beside the image', () => {
  const doc = installDom();
  assert.equal(initCardPreview(doc), true);
  const link = doc.getElementById('previewLink');
  link.dataset.previewEntryName = 'Mana Confluence';
  link.dataset.previewEntrySet = 'JOU';
  link.dataset.previewEntryCn = '163';
  link.dataset.previewEntryFinish = 'normal';
  link.dataset.previewEntryCondition = 'nm';
  link.dataset.previewEntryLanguage = 'en';
  link.dataset.previewEntryQty = '1';
  link.dataset.previewEntryLocation = 'box:bulk';
  link.dataset.previewEntryPrice = '$32.08';

  showCardPreview(link);

  const preview = doc.getElementById('cardPreview');
  const info = preview.querySelector('.card-preview-info');
  assert.equal(preview.classList.contains('has-entry-info'), true);
  assert.equal(info.hidden, false);
  assert.match(info.textContent, /collection entry/);
  assert.match(info.textContent, /Mana Confluence/);
  assert.match(info.textContent, /JOU #163/);
  assert.match(info.textContent, /box:bulk/);
});

test('initCardPreview: missing chrome fails softly', () => {
  const win = new Window();
  assert.equal(initCardPreview(win.document), false);
});
