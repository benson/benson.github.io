import { loadSnapshot } from '../mutate.mjs';
import { listContainers } from '../snapshot.mjs';
import { usageError } from '../errors.mjs';

const TYPES = { decks: 'deck', binders: 'binder', boxes: 'box', deck: 'deck', binder: 'binder', box: 'box' };

export default {
  summary: 'list containers (decks / binders / boxes)',
  help: 'usage: bp ls [decks|binders|boxes]\n\nlists your containers with card counts and value. with no argument, lists all.',
  async run(ctx) {
    const { out, args } = ctx;
    let type = null;
    if (args[0]) {
      type = TYPES[args[0].toLowerCase()];
      if (!type) throw usageError(`unknown container type: ${args[0]} (use decks, binders, or boxes)`);
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
