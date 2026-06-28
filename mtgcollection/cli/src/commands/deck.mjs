import { loadSnapshot } from '../mutate.mjs';
import { findContainer, containerCards } from '../snapshot.mjs';
import { cardRow, CARD_COLUMNS } from '../render.mjs';
import { usageError, CliError } from '../errors.mjs';
import { runDeckExport } from './deckExport.mjs';

const BOARDS = ['main', 'sideboard', 'maybe'];

async function deckShow(ctx, name) {
  const { out } = ctx;
  if (!name) throw usageError('usage: bp deck show <name>');
  const session = ctx.makeSession();
  const { snapshot } = await loadSnapshot(session);
  const { matches } = findContainer(snapshot, 'deck:' + name);
  const decks = matches.filter(m => m.type === 'deck');
  if (!decks.length) throw new CliError(`no deck named "${name}"`);

  const deck = decks[0];
  const cards = containerCards(snapshot, deck);
  const boards = { main: [], sideboard: [], maybe: [] };
  for (const c of cards) (boards[c.deckBoard] || boards.main).push(c);

  out.emit({ deck: { name: deck.name, meta: deck.deck || null }, boards }, () => {
    out.line(out.c.bold('deck: ' + deck.name));
    const meta = deck.deck || {};
    if (meta.format) out.line('  format: ' + meta.format);
    if (meta.commander?.name) out.line('  commander: ' + meta.commander.name);
    for (const b of BOARDS) {
      const list = boards[b];
      if (!list.length) continue;
      const n = list.reduce((s, c) => s + (parseInt(c.qty, 10) || 0), 0);
      out.line('');
      out.line(out.c.bold(`${b} (${n})`));
      out.table(CARD_COLUMNS, list.map(cardRow));
    }
  });
  return 0;
}

export default {
  summary: 'inspect or export a deck',
  help: [
    'usage: bp deck show <name>',
    '       bp deck export <name> [--preset plain|moxfield|arena|mtgo|csv|json] [--boards main,sideboard,maybe]',
  ].join('\n'),
  async run(ctx) {
    const [sub, ...rest] = ctx.args;
    if (sub === 'show') return deckShow(ctx, rest.join(' '));
    if (sub === 'export') return runDeckExport(ctx, rest);
    throw usageError('usage: bp deck <show|export> <name>');
  },
};
