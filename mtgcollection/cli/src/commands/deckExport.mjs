import { writeFileSync } from 'node:fs';
import { loadSnapshot } from '../mutate.mjs';
import { findContainer, containerCards } from '../snapshot.mjs';
import { buildDeckExport } from '../../vendor/deckExport.js';
import { strFlag } from '../args.mjs';
import { usageError, CliError } from '../errors.mjs';

// `bp deck export <name> [--preset ...] [--boards a,b] [--output file]`
export async function runDeckExport(ctx, args) {
  const { out, flags } = ctx;
  const name = args.join(' ');
  if (!name) throw usageError('usage: bp deck export <name> [--preset plain|moxfield|arena|mtgo|csv|json]');

  const session = ctx.makeSession();
  const { snapshot } = await loadSnapshot(session);
  const { matches } = findContainer(snapshot, 'deck:' + name);
  const decks = matches.filter(m => m.type === 'deck');
  if (!decks.length) throw new CliError(`no deck named "${name}"`);

  const deck = decks[0];
  const cards = containerCards(snapshot, deck);
  const preset = strFlag(flags, 'preset') || 'plain';
  const boardsFlag = strFlag(flags, 'boards');
  const boards = boardsFlag ? boardsFlag.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const dm = deck.deck || {};
  // buildDeckExport expects commander/partner as plain name strings; the app
  // stores them as { name, scryfallId, ... } objects.
  const meta = {
    title: deck.name,
    format: dm.format,
    commander: dm.commander?.name || (typeof dm.commander === 'string' ? dm.commander : undefined),
    partner: dm.partner?.name || (typeof dm.partner === 'string' ? dm.partner : undefined),
  };

  const result = buildDeckExport(cards, meta, { preset, ...(boards ? { boards } : {}) });
  for (const w of result.warnings || []) out.info(out.c.yellow('! ' + w));

  const file = strFlag(flags, 'output', 'o');
  if (file) {
    writeFileSync(file, result.body.endsWith('\n') ? result.body : result.body + '\n');
    out.emit({ file, filename: result.filename, preset }, () => out.info(`wrote ${file}`));
  } else if (out.json) {
    out.emit({ preset, filename: result.filename, body: result.body, warnings: result.warnings });
  } else {
    out.raw(result.body);
  }
  return 0;
}
