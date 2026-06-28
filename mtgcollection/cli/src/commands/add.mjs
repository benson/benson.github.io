import { resolvePrinting, cardToFields } from '../scryfall.mjs';
import { normalizeCollectionEntry } from '../../vendor/collection.js';
import { mergeIntoCollection } from '../../vendor/importMerge.js';
import { applyMutation } from '../mutate.mjs';
import { strFlag, intFlag, boolFlag } from '../args.mjs';
import { requireWrite, parseLocationFlag, ensureContainer, persistUndo, printWrite } from './writeHelpers.mjs';
import { usageError, CliError } from '../errors.mjs';

export default {
  summary: 'add a card to your collection',
  help: [
    'usage: bp add <name> [--set xxx --cn 123] [--finish foil] [--condition lightly_played]',
    '                     [--qty 2] [--location "deck:breya"] [--tags trade,wishlist] [--dry-run]',
    '       bp add --scryfall-id <id> [...]',
    '',
    'resolves the printing on scryfall (give --set + --cn to pin an exact printing),',
    'then adds it to your cloud collection. coalesces with an identical existing stack.',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);

    const scryfallId = strFlag(flags, 'scryfall-id', 'id');
    const set = strFlag(flags, 'set', 's');
    const cn = strFlag(flags, 'cn');
    const name = args.join(' ').trim();
    if (!scryfallId && !(set && cn) && !name) throw usageError('usage: bp add <name> [--set --cn] | --scryfall-id <id>');

    const finish = strFlag(flags, 'finish') || 'normal';
    const card = await resolvePrinting({ scryfallId, set, cn, name });
    if (!card) throw new CliError("couldn't find that printing — try specifying --set and --cn");

    const tags = strFlag(flags, 'tags', 'tag');
    const entry = normalizeCollectionEntry({
      ...cardToFields(card, finish),
      finish,
      qty: intFlag(flags, 'qty', 1) || 1,
      condition: strFlag(flags, 'condition', 'cond') || 'near_mint',
      language: strFlag(flags, 'lang', 'language') || 'en',
      location: parseLocationFlag(strFlag(flags, 'location', 'loc', 'to')),
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    }, { preserveResolvedFields: true });

    const result = await applyMutation(session, (draft) => {
      ensureContainer(draft, entry.location);
      draft.app.collection = mergeIntoCollection(draft.app.collection, [entry]);
      return { added: { name: entry.name, set: entry.setCode.toUpperCase(), cn: entry.cn, finish: entry.finish, qty: entry.qty } };
    }, { dryRun: boolFlag(flags, 'dry-run') });

    persistUndo(result);
    printWrite(out, result, () => out.info(
      out.c.green('✓ added') + ` ${entry.qty}x ${entry.name} (${entry.setCode.toUpperCase()} ${entry.cn}${entry.finish !== 'normal' ? ' ' + entry.finish : ''})`
      + (entry.location ? ` → ${entry.location.type}:${entry.location.name}` : '')));
    return 0;
  },
};
