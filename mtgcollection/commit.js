import { state } from './state.js';
import { coalesceCollection, ensureContainersForCollection } from './collection.js';
import { save } from './persistence.js';
import { populateFilters } from './detail.js';
import { render } from './view.js';
import { schedulePushForDeck } from './share.js';

// App-level commit coordinator: data modules mutate state, then call here to
// persist, refresh derived UI, and mirror shared decks.
export function commitCollectionChange({ coalesce = false } = {}) {
  if (coalesce) coalesceCollection();
  ensureContainersForCollection();
  save();
  populateFilters();
  render();

  if (!state.shareSnapshot) {
    for (const container of Object.values(state.containers || {})) {
      if (container.shareId) schedulePushForDeck(container);
    }
  }
}
