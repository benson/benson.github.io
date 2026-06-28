import { loadSnapshot } from '../mutate.mjs';
import { listContainers } from '../snapshot.mjs';
import { usageError } from '../errors.mjs';

// binder/box are legacy aliases for the unified container type.
const TYPES = { decks: 'deck', deck: 'deck', containers: 'container', container: 'container', binders: 'container', boxes: 'container', binder: 'container', box: 'container' };

export default {
  summary: 'list containers (decks / containers)',
  help: 'usage: bp ls [decks|containers]\n\nlists your decks and storage containers with card counts and value. with no argument, lists all.',
  async run(ctx) {
    const { out, args } = ctx;
    let type = null;
    if (args[0]) {
      type = TYPES[args[0].toLowerCase()];
      if (!type) throw usageError(`unknown container type: ${args[0]} (use decks or containers)`);
    }
    const session = ctx.makeSession();
    const { snapshot } = await loadSnapshot(session);
    const rows = listContainers(snapshot, type);

    out.emit({ containers: rows }, () => {
      if (!rows.length) { out.info('no containers.'); return; }
      out.table(
        [{ header: 'type' }, { header: 'name' }, { header: 'cards', align: 'right' }, { header: 'value', align: 'right' }],
        rows.map(r => [r.type, r.name, String(r.total), '$' + r.value.toFixed(2)]),
      );
    });
    return 0;
  },
};
