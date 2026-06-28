import { loadSnapshot } from '../mutate.mjs';
import { findContainer, containerCards } from '../snapshot.mjs';
import { runQuery } from '../snapshot.mjs';
import { cardRow, CARD_COLUMNS, cardsToCsv } from '../render.mjs';
import { strFlag, boolFlag } from '../args.mjs';
import { usageError, CliError } from '../errors.mjs';

export default {
  summary: 'show the cards in a container',
  help: 'usage: bp show <container> [--sort field] [--csv|--json]\n\ncontainer may be "deck:breya", "binder:rares", or just "breya" if unambiguous.',
  async run(ctx) {
    const { out, args, flags } = ctx;
    const ref = args.join(' ');
    if (!ref) throw usageError('usage: bp show <container>');
    const session = ctx.makeSession();
    const { snapshot } = await loadSnapshot(session);
    const { matches, name } = findContainer(snapshot, ref);
    if (!matches.length) throw new CliError(`no container named "${name}"`);
    if (matches.length > 1) {
      throw new CliError(`"${name}" is ambiguous — try ${matches.map(m => m.type + ':' + m.name).join(', ')}`);
    }
    const container = matches[0];
    const cards = runQuery(containerCards(snapshot, container), '', { sort: strFlag(flags, 'sort') || 'name', dir: boolFlag(flags, 'desc') ? 'desc' : 'asc' });

    if (boolFlag(flags, 'csv')) { out.raw(cardsToCsv(cards, strFlag(flags, 'format') || 'canonical')); return 0; }
    out.emit({ container: { type: container.type, name: container.name }, count: cards.length, cards }, () => {
      out.line(out.c.bold(container.type + ':' + container.name));
      if (!cards.length) { out.info('(empty)'); return; }
      out.table(CARD_COLUMNS, cards.map(cardRow));
    });
    return 0;
  },
};
