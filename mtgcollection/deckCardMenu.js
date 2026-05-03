export function closeDeckCardMenus(root = globalThis.document) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.deck-card.menu-open').forEach(card => {
    card.classList.remove('menu-open');
    const toggle = card.querySelector('[data-card-menu-toggle]');
    const menu = card.querySelector('.deck-card-menu');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
}

export function openDeckCardMenu(toggle, { focusFirst = false, root = null } = {}) {
  const card = toggle?.closest('.deck-card');
  const menu = card?.querySelector('.deck-card-menu');
  if (!card || !menu) return;
  const closeRoot = root || globalThis.document?.getElementById('deckColumns') || globalThis.document;
  closeDeckCardMenus(closeRoot);
  card.classList.add('menu-open');
  menu.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  if (focusFirst) {
    const first = menu.querySelector('[role="menuitem"]:not([disabled])');
    if (first) first.focus();
  }
}

export function toggleDeckCardMenu(toggle) {
  const card = toggle?.closest('.deck-card');
  if (!card) return;
  if (card.classList.contains('menu-open')) {
    closeDeckCardMenus(card.parentElement || globalThis.document);
  } else {
    openDeckCardMenu(toggle);
  }
}

export function moveFocusInDeckCardMenu(menu, current, direction) {
  const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
  if (!items.length) return;
  const idx = Math.max(0, items.indexOf(current));
  items[(idx + direction + items.length) % items.length].focus();
}
