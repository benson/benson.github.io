import { collectionKey } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { strFlag, boolFlag } from '../args.mjs';
import { requireWrite, selectorFrom, requireStacks, parseLocationFlag, ensureContainer, persistUndo, printWrite } from './writeHelpers.mjs';
import { usageError } from '../errors.mjs';

export default {
  summary: 'move a card to a different container',
  help: [
    'usage: bp move <name> --to "deck:breya" [--board sideboard] [--set --cn --finish ...] [--all] [--dry-run]',
    '',
    'changes a stack\'s location. --to accepts "deck:x", "container:x", or a bare name',
    '(treated as a container). --board sets the deck board (main/sideboard/maybe).',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const to = parseLocationFlag(strFlag(flags, 'to'));
    if (!to) throw usageError('move requires --to <container>');
    const board = strFlag(flags, 'board');
    const sel = selectorFrom(flags, args);

    const result = await applyMutation(session, (draft) => {
      const stacks = requireStacks(draft.app.collection, sel, { all: boolFlag(flags, 'all') });
      ensureContainer(draft, to);
      const keys = new Set(stacks.map(collectionKey));
      for (const e of draft.app.collection) {
        if (!keys.has(collectionKey(e))) continue;
        e.location = { type: to.type, name: to.name };
        if (to.type === 'deck') e.deckBoard = board || e.deckBoard || 'main';
        else delete e.deckBoard;
      }
      return { moved: stacks.length, to: to.type + ':' + to.name };
    }, { dryRun: boolFlag(flags, 'dry-run') });

    persistUndo(result);
    printWrite(out, result, () => out.info(out.c.green('✓ moved') + ` ${result.meta.moved} stack(s) → ${result.meta.to}`));
    return 0;
  },
};
