import { collectionKey } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { loadUndo, clearUndo } from '../store.mjs';
import { requireWrite, printWrite } from './writeHelpers.mjs';
import { CliError } from '../errors.mjs';

export default {
  summary: 'undo the last change made by this cli',
  help: 'usage: bp undo\n\nrestores exactly the cards and containers your last cli write touched.',
  async run(ctx) {
    const { out } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const record = loadUndo();
    if (!record) throw new CliError('nothing to undo');

    const result = await applyMutation(session, (draft) => {
      for (const [key, before] of Object.entries(record.collection || {})) {
        draft.app.collection = draft.app.collection.filter(e => collectionKey(e) !== key);
        if (before) draft.app.collection.push(before);
      }
      if (Object.keys(record.containers || {}).length && !draft.app.containers) draft.app.containers = {};
      for (const [key, before] of Object.entries(record.containers || {})) {
        if (before) draft.app.containers[key] = before;
        else delete draft.app.containers[key];
      }
      return { undone: true };
    });

    clearUndo();
    printWrite(out, result, () => out.info(out.c.green('✓ undone')));
    return 0;
  },
};
