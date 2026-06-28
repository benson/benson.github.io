import { collectionKey } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { boolFlag, intFlag } from '../args.mjs';
import { requireWrite, selectorFrom, requireStacks, persistUndo, printWrite } from './writeHelpers.mjs';

export default {
  summary: 'remove a card (stack) from your collection',
  help: [
    'usage: bp rm <name> [--set --cn --finish --condition --location] [--qty n] [--all] [--dry-run]',
    '',
    'removes whole matching stacks. --qty n removes only n copies. --all removes every',
    'matching stack when a name is ambiguous.',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const sel = selectorFrom(flags, args);
    const removeQty = intFlag(flags, 'qty', null);

    const result = await applyMutation(session, (draft) => {
      const stacks = requireStacks(draft.app.collection, sel, { all: boolFlag(flags, 'all') });
      const keys = new Set(stacks.map(collectionKey));
      if (removeQty != null) {
        for (const e of draft.app.collection) if (keys.has(collectionKey(e))) e.qty = Math.max(0, (parseInt(e.qty, 10) || 0) - removeQty);
        draft.app.collection = draft.app.collection.filter(e => (parseInt(e.qty, 10) || 0) > 0);
      } else {
        draft.app.collection = draft.app.collection.filter(e => !keys.has(collectionKey(e)));
      }
      return { removed: stacks.length };
    }, { dryRun: boolFlag(flags, 'dry-run') });

    persistUndo(result);
    printWrite(out, result, () => out.info(out.c.green('✓ removed') + ` ${result.meta.removed} stack(s)`));
    return 0;
  },
};
