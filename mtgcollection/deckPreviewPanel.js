import { normalizeLocation } from './collection.js';

export function createDeckPreviewPanel({
  panelEl,
  getCollection = () => [],
  getDeckScope = () => null,
  openDetail = () => {},
  normalizeLocationImpl = normalizeLocation,
} = {}) {
  function setCard(card) {
    if (!panelEl) return;
    if (!card) {
      panelEl.classList.add('hidden');
      panelEl.dataset.index = '';
      panelEl.dataset.previewIndex = '';
      return;
    }
    panelEl.classList.remove('hidden');
    const collection = getCollection();
    const idx = collection.indexOf(card);
    panelEl.dataset.index = String(idx);
    panelEl.dataset.previewIndex = String(idx);

    const name = card.resolvedName || card.name || '?';
    const imgEl = panelEl.querySelector('.deck-preview-card');
    const placeholderEl = panelEl.querySelector('.deck-preview-placeholder');
    const nameEl = panelEl.querySelector('.deck-preview-name');
    const metaEl = panelEl.querySelector('.deck-preview-meta');
    const flipRow = panelEl.querySelector('.deck-preview-flip-row');

    if (card.imageUrl) {
      imgEl.src = card.imageUrl;
      imgEl.alt = name;
      imgEl.dataset.current = 'front';
      imgEl.classList.remove('hidden');
      placeholderEl.classList.add('hidden');
    } else {
      imgEl.classList.add('hidden');
      imgEl.removeAttribute('src');
      placeholderEl.textContent = name;
      placeholderEl.classList.remove('hidden');
    }
    if (flipRow) flipRow.classList.toggle('hidden', !card.backImageUrl || !card.imageUrl);
    imgEl.parentElement.classList.toggle('is-foil', card.finish === 'foil');
    imgEl.parentElement.classList.toggle('is-etched', card.finish === 'etched');
    nameEl.textContent = name;

    const qty = card.qty || 1;
    const priceTotal = (card.price || 0) * qty;
    const priceStr = card.price
      ? `$${card.price.toFixed(2)}${qty > 1 ? ` \u00b7 $${priceTotal.toFixed(2)} total` : ''}`
      : '';
    metaEl.textContent = `\u00d7${qty}${priceStr ? '  \u00b7  ' + priceStr : ''}`;
  }

  function showFromTarget(target) {
    if (!target?.closest) return;
    const collection = getCollection();
    const card = target.closest('.deck-card');
    if (card) {
      const idx = parseInt(card.dataset.inventoryIndex || '-1', 10);
      if (idx >= 0) {
        const entry = collection[idx];
        if (entry) {
          setCard(entry);
          return;
        }
      }
      const name = card.dataset.cardName || '';
      const imageUrl = card.dataset.imageUrl || '';
      if (name || imageUrl) {
        setCard({
          name,
          resolvedName: name,
          imageUrl,
          backImageUrl: card.dataset.backImageUrl || '',
          qty: parseInt(card.dataset.cardQty || '1', 10),
          finish: card.dataset.cardFinish || 'normal',
          price: parseFloat(card.dataset.cardPrice || '0') || 0,
        });
      }
      return;
    }

    const metaLink = target.closest('.deck-meta-preview-link');
    if (!metaLink) return;
    const scryfallId = metaLink.dataset.scryfallId;
    const deckScope = getDeckScope();
    let entry = null;
    if (scryfallId) {
      entry = collection.find(candidate =>
        candidate.scryfallId === scryfallId
        && normalizeLocationImpl(candidate.location)?.type === 'deck'
        && (!deckScope || normalizeLocationImpl(candidate.location)?.name === deckScope.name)
      );
    }
    if (entry) {
      setCard(entry);
      return;
    }

    const name = metaLink.dataset.cardName || '';
    const imageUrl = metaLink.dataset.imageUrl || '';
    const backImageUrl = metaLink.dataset.backImageUrl || '';
    if (name || imageUrl) {
      setCard({
        name,
        resolvedName: name,
        imageUrl,
        backImageUrl,
        qty: 1,
        finish: 'normal',
        price: 0,
      });
    }
  }

  function openCurrentDetail(event) {
    if (event?.target?.closest('.deck-preview-flip-row')) return;
    const idx = parseInt(panelEl.dataset.index, 10);
    if (Number.isNaN(idx)) return;
    openDetail(idx);
  }

  function flipCurrent(event) {
    event.stopPropagation();
    const idx = parseInt(panelEl.dataset.index, 10);
    if (Number.isNaN(idx)) return;
    const entry = getCollection()[idx];
    if (!entry || !entry.backImageUrl) return;
    const imgEl = panelEl.querySelector('.deck-preview-card');
    if (!imgEl) return;
    const showingBack = imgEl.dataset.current === 'back';
    imgEl.dataset.current = showingBack ? 'front' : 'back';
    imgEl.src = showingBack ? entry.imageUrl : entry.backImageUrl;
  }

  function bind() {
    if (!panelEl) return;
    panelEl.addEventListener('click', openCurrentDetail);
    panelEl.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.deck-preview-flip-row')) return;
      const idx = parseInt(panelEl.dataset.index, 10);
      if (Number.isNaN(idx)) return;
      event.preventDefault();
      openDetail(idx);
    });
    const flipBtn = panelEl.querySelector('#deckPreviewFlipBtn');
    if (flipBtn) flipBtn.addEventListener('click', flipCurrent);
  }

  return {
    bind,
    setCard,
    showFromTarget,
  };
}
