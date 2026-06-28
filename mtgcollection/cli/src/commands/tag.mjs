import { collectionKey, normalizeTag } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { boolFlag } from '../args.mjs';
import { requireWrite, selectorFrom, requireStacks, persistUndo, printWrite } from './writeHelpers.mjs';
import { usageError } from '../errors.mjs';

export default {
  summary: 'add or remove a tag on a stack',
  help: [
    'usage: bp tag add <tag> <name> [--set --cn --finish ...] [--all]',
    '       bp tag rm  <tag> <name> [...]',
    '',
    'adds/removes a single tag on matching stacks.',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const [op, rawTag, ...nameParts] = args;
    if ((op !== 'add' && op !== 'rm') || !rawTag) throw usageError('usage: bp tag <add|rm> <tag> <name>');
    const tag = normalizeTag(rawTag);
    const sel = selectorFrom(flags, nameParts);

    const result = await applyMutation(session, (draft) => {
      const stacks = requireStacks(draft.app.collection, sel, { all: boolFlag(flags, 'all') });
      const keys = new Set(stacks.map(collectionKey));
      for (const e of draft.app.collection) {
        if (!keys.has(collectionKey(e))) continue;
        const tags = new Set((e.tags || []).map(normalizeTag).filter(Boolean));
        if (op === 'add') tags.add(tag); else tags.delete(tag);
        e.tags = [...tags];
      }
      return { tagged: stacks.length, op, tag };
    }, { dryRun: boolFlag(flags, 'dry-run') });

    persistUndo(result);
    printWrite(out, result, () => out.info(out.c.green('✓ ' + (op === 'add' ? 'tagged' : 'untagged')) + ` ${result.meta.tagged} stack(s) (${tag})`));
    return 0;
  },
};
