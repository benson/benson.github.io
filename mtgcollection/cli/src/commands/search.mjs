import { loadSnapshot } from '../mutate.mjs';
import { runQuery, collectionOf } from '../snapshot.mjs';
import { cardRow, CARD_COLUMNS, cardsToCsv } from '../render.mjs';
import { strFlag, intFlag, boolFlag } from '../args.mjs';

export default {
  summary: 'search your collection (app query syntax)',
  help: [
    'usage: bp search <query> [--sort field] [--desc] [--limit n] [--csv|--json]',
    '',
    'uses the same query grammar as the web app, e.g.:',
    '  bp search "t:creature c:rg cmc<=3 -t:legendary"',
    '  bp search rare f:foil --sort price --desc',
    '',
    'fields: t/type c/color ci/identity cmc/mv o/oracle r/rarity s/set f/finish',
    '        loc/location tag cond/condition lang qty   (prefix with - to negate)',
    'sort:   name set cn finish rarity condition location qty price cmc',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    const { snapshot } = await loadSnapshot(session);
    const query = args.join(' ');
    const sort = strFlag(flags, 'sort') || 'name';
    const dir = boolFlag(flags, 'desc') ? 'desc' : (strFlag(flags, 'dir') || 'asc');

    let list = runQuery(collectionOf(snapshot), query, { sort, dir });
    const limit = intFlag(flags, 'limit', null);
    if (limit != null) list = list.slice(0, limit);

    if (boolFlag(flags, 'csv')) {
      out.raw(cardsToCsv(list, strFlag(flags, 'format') || 'canonical'));
      return 0;
    }
    out.emit({ count: list.length, cards: list }, () => {
      if (!list.length) { out.info('no cards match.'); return; }
      out.table(CARD_COLUMNS, list.map(cardRow));
      out.info(out.c.dim(`${list.length} stack${list.length === 1 ? '' : 's'}`));
    });
    return 0;
  },
};
