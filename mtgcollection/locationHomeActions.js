import { containerStats, ensureContainer } from './collection.js';
import {
  deleteContainerAndUnlocateCardsCommand,
  deleteEmptyContainerCommand,
  renameContainerCommand,
} from './commands.js';

export function syncLocationTypeLabels(root, selector = '.locations-create-type') {
  if (!root) return;
  root.querySelectorAll(selector).forEach(label => {
    const input = label.querySelector('input');
    label.classList.toggle('is-selected', !!(input && input.checked));
  });
}

export function readLocationCreateType(form) {
  if (!form) return 'box';
  const checked = form.querySelector('input[name="locationsCreateType"]:checked');
  const hidden = form.querySelector('input[type="hidden"][name="locationsCreateType"]');
  return checked ? checked.value : (hidden ? hidden.value : 'box');
}

export function locationDeleteMessage(loc, stats) {
  const type = loc?.type || 'location';
  const name = loc?.name || '';
  if (stats?.total > 0) {
    return 'delete ' + type + ' "' + name + '"?\n\nthis will clear the location from '
      + stats.total + ' card' + (stats.total === 1 ? '' : 's')
      + ' (' + stats.unique + ' unique). the cards stay in your collection.';
  }
  return 'delete ' + type + ' "' + name + '"?';
}

export function bindLocationHomeInteractions({
  locationsEl,
  ensureContainerImpl = ensureContainer,
  containerStatsImpl = containerStats,
  renameContainerImpl = renameContainerCommand,
  deleteContainerAndUnlocateCardsImpl = deleteContainerAndUnlocateCardsCommand,
  deleteEmptyContainerImpl = deleteEmptyContainerCommand,
  navigateToLocationImpl = () => {},
  saveImpl = () => {},
  populateFiltersImpl = () => {},
  renderImpl = () => {},
  confirmImpl = globalThis.confirm,
  documentObj = globalThis.document,
} = {}) {
  if (!locationsEl) return () => {};

  const onCreateTypeChange = event => {
    if (event.target.name !== 'locationsCreateType') return;
    syncLocationTypeLabels(locationsEl);
  };

  const onSubmit = event => {
    if (event.target.id !== 'locationsCreateForm') return;
    event.preventDefault();
    const form = event.target;
    const nameInput = form.querySelector('#locationsCreateName');
    const created = ensureContainerImpl({
      type: readLocationCreateType(form),
      name: nameInput ? nameInput.value : '',
    });
    if (!created) return;
    if (nameInput) nameInput.value = '';
    saveImpl();
    populateFiltersImpl();
    renderImpl();
  };

  const onEditTypeChange = event => {
    if (!event.target || event.target.type !== 'radio') return;
    if (!event.target.name || !event.target.name.startsWith('editLocType_')) return;
    const card = event.target.closest('.location-card');
    if (!card) return;
    syncLocationTypeLabels(card, '.location-card-edit-row .loc-type-radio');
  };

  const onDocumentClick = event => {
    if (event.target.closest('.location-card-menu-btn') || event.target.closest('.location-card-menu')) return;
    locationsEl.querySelectorAll('.location-card.menu-open').forEach(card => card.classList.remove('menu-open'));
  };

  const onClick = event => {
    const card = event.target.closest('.location-card');
    if (!card) return;
    const loc = { type: card.dataset.locType, name: card.dataset.locName };

    if (event.target.closest('.location-card-menu-btn')) {
      event.stopPropagation();
      const wasOpen = card.classList.contains('menu-open');
      locationsEl.querySelectorAll('.location-card.menu-open').forEach(openCard => openCard.classList.remove('menu-open'));
      if (!wasOpen) card.classList.add('menu-open');
      return;
    }

    if (event.target.closest('.location-card-edit-btn')) {
      event.stopPropagation();
      card.classList.add('editing');
      card.classList.remove('menu-open');
      const input = card.querySelector('.location-rename-input');
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }

    if (event.target.closest('.location-rename-cancel')) {
      card.classList.remove('editing');
      return;
    }

    if (event.target.closest('.location-rename-save')) {
      const input = card.querySelector('.location-rename-input');
      const checked = card.querySelector('.location-card-edit-row input[type="radio"]:checked');
      renameContainerImpl(loc, {
        type: checked ? checked.value : loc.type,
        name: input ? input.value : loc.name,
      });
      return;
    }

    if (event.target.closest('.location-delete')) {
      const stats = containerStatsImpl(loc);
      if (!confirmImpl(locationDeleteMessage(loc, stats))) return;
      if (stats.total > 0) {
        deleteContainerAndUnlocateCardsImpl(loc);
      } else {
        deleteEmptyContainerImpl(loc);
      }
      return;
    }

    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    if (event.target.closest('.location-card-edit-row')) return;
    navigateToLocationImpl(loc.type, loc.name);
  };

  const onKeydown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.location-card');
    if (!card || event.target !== card) return;
    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    event.preventDefault();
    navigateToLocationImpl(card.dataset.locType, card.dataset.locName);
  };

  locationsEl.addEventListener('change', onCreateTypeChange);
  locationsEl.addEventListener('submit', onSubmit);
  locationsEl.addEventListener('change', onEditTypeChange);
  locationsEl.addEventListener('click', onClick);
  locationsEl.addEventListener('keydown', onKeydown);
  documentObj?.addEventListener('click', onDocumentClick);

  return () => {
    locationsEl.removeEventListener('change', onCreateTypeChange);
    locationsEl.removeEventListener('submit', onSubmit);
    locationsEl.removeEventListener('change', onEditTypeChange);
    locationsEl.removeEventListener('click', onClick);
    locationsEl.removeEventListener('keydown', onKeydown);
    documentObj?.removeEventListener('click', onDocumentClick);
  };
}
