import { coalesceCollection, ensureContainersForCollection } from './collection.js';
import { save } from './persistence.js';
import { runCollectionCommitHooks } from './appRuntime.js';

// App-level commit coordinator: data modules mutate state, then call here to
// normalize derived collection data, persist, and notify the app shell.
export function commitCollectionChange({ coalesce = false } = {}) {
  if (coalesce) coalesceCollection();
  ensureContainersForCollection();
  save();
  runCollectionCommitHooks({ coalesce });
}
