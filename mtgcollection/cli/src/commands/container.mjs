import { locationKey } from '../../vendor/collection.js';
import { applyMutation } from '../mutate.mjs';
import { parseContainerRef } from '../snapshot.mjs';
import { boolFlag } from '../args.mjs';
import { requireWrite, parseLocationFlag, ensureContainer, persistUndo, printWrite } from './writeHelpers.mjs';
import { usageError, CliError } from '../errors.mjs';

function resolveContainer(draft, ref) {
  const containers = draft.app.containers || {};
  const loc = parseLocationFlag(ref);
  if (loc && containers[loc.type + ':' + loc.name]) return { key: loc.type + ':' + loc.name, container: containers[loc.type + ':' + loc.name] };
  const name = parseContainerRef(ref).name;
  const matches = Object.entries(containers).filter(([, c]) => c.name === name);
  if (!matches.length) throw new CliError(`no container "${ref}"`);
  if (matches.length > 1) throw new CliError(`"${ref}" is ambiguous — use type:name (${matches.map(([k]) => k).join(', ')})`);
  return { key: matches[0][0], container: matches[0][1] };
}

export default {
  summary: 'create / rename / delete a container',
  help: [
    'usage: bp container create <type:name>            (type = deck|binder|box)',
    '       bp container rename <type:name> <new-name>',
    '       bp container delete <type:name> [--force]   (--force unfiles its cards)',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const [sub, ref, ...rest] = args;

    if (sub === 'create') {
      const loc = parseLocationFlag(ref);
      if (!loc) throw usageError('usage: bp container create <type:name>');
      const result = await applyMutation(session, (draft) => { ensureContainer(draft, loc); return { created: loc.type + ':' + loc.name }; }, { dryRun: boolFlag(flags, 'dry-run') });
      persistUndo(result);
      printWrite(out, result, () => out.info(out.c.green('✓ created') + ` ${loc.type}:${loc.name}`));
      return 0;
    }

    if (sub === 'rename') {
      const newName = parseContainerRef(rest.join(' ')).name;
      if (!ref || !newName) throw usageError('usage: bp container rename <type:name> <new-name>');
      const result = await applyMutation(session, (draft) => {
        const { key, container } = resolveContainer(draft, ref);
        const newKey = container.type + ':' + newName;
        if (draft.app.containers[newKey]) throw new CliError(`a ${container.type} named "${newName}" already exists`);
        const renamed = { ...container, name: newName };
        // Keep the deck's display title in sync if it tracked the old name.
        if (renamed.deck && (!renamed.deck.title || renamed.deck.title === container.name)) {
          renamed.deck = { ...renamed.deck, title: newName };
        }
        draft.app.containers[newKey] = renamed;
        delete draft.app.containers[key];
        for (const e of draft.app.collection) if (locationKey(e.location) === key) e.location = { type: container.type, name: newName };
        return { renamed: key, to: newKey };
      }, { dryRun: boolFlag(flags, 'dry-run') });
      persistUndo(result);
      printWrite(out, result, () => out.info(out.c.green('✓ renamed') + ` ${result.meta.renamed} → ${result.meta.to}`));
      return 0;
    }

    if (sub === 'delete') {
      const result = await applyMutation(session, (draft) => {
        const { key, container } = resolveContainer(draft, ref);
        const cards = draft.app.collection.filter(e => locationKey(e.location) === key);
        if (cards.length && !boolFlag(flags, 'force')) {
          throw new CliError(`${container.type}:${container.name} holds ${cards.length} stack(s) — pass --force to delete and unfile them`);
        }
        for (const e of draft.app.collection) if (locationKey(e.location) === key) { e.location = null; delete e.deckBoard; }
        delete draft.app.containers[key];
        return { deleted: key, unfiled: cards.length };
      }, { dryRun: boolFlag(flags, 'dry-run') });
      persistUndo(result);
      printWrite(out, result, () => out.info(out.c.green('✓ deleted') + ` ${result.meta.deleted}` + (result.meta.unfiled ? ` (unfiled ${result.meta.unfiled})` : '')));
      return 0;
    }

    throw usageError('usage: bp container <create|rename|delete> <type:name>');
  },
};
