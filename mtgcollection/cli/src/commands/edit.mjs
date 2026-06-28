import { collectionKey, normalizeCondition, normalizeFinish } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { strFlag, intFlag, boolFlag } from '../args.mjs';
import { requireWrite, selectorFrom, requireStacks, persistUndo, printWrite } from './writeHelpers.mjs';
import { usageError } from '../errors.mjs';

export default {
  summary: 'edit a stack (condition / finish / qty / tags)',
  help: [
    'usage: bp edit <name> [--set --cn ...] [--condition lightly_played] [--finish foil]',
    '                      [--qty 3] [--tags trade,foil] [--all] [--dry-run]',
    '',
    'updates fields on a matching stack. --tags replaces the tag set ("" clears).',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const sel = selectorFrom(flags, args);
    const newCond = strFlag(flags, 'condition', 'cond');
    const newFinish = strFlag(flags, 'finish');
    const newQty = intFlag(flags, 'qty', null);
    const setTags = strFlag(flags, 'tags');
    if (newCond == null && newFinish == null && newQty == null && setTags == null) {
      throw usageError('nothing to edit — pass --condition, --finish, --qty, or --tags');
    }

    const result = await applyMutation(session, (draft) => {
      const stacks = requireStacks(draft.app.collection, sel, { all: boolFlag(flags, 'all') });
      const keys = new Set(stacks.map(collectionKey));
      for (const e of draft.app.collection) {
        if (!keys.has(collectionKey(e))) continue;
        if (newCond) e.condition = normalizeCondition(newCond);
        if (newFinish) e.finish = normalizeFinish(newFinish);
        if (newQty != null) e.qty = Math.max(1, newQty);
        if (setTags != null) e.tags = setTags ? setTags.split(',').map(s => s.trim()).filter(Boolean) : [];
      }
      return { edited: stacks.length };
    }, { dryRun: boolFlag(flags, 'dry-run') });

    persistUndo(result);
    printWrite(out, result, () => out.info(out.c.green('✓ edited') + ` ${result.meta.edited} stack(s)`));
    return 0;
  },
};
