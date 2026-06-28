import { readFileSync } from 'node:fs';
import { parseCsv } from '../../vendor/importParsing.js';
import { detectAdapter } from '../../vendor/adapters.js';
import { mergeIntoCollection } from '../../vendor/importMerge.js';
import { normalizeCollectionEntry } from '../../vendor/collection.js';
import { resolvePrinting, cardToFields, sleep } from '../scryfall.mjs';
import { applyMutation } from '../mutate.mjs';
import { boolFlag } from '../args.mjs';
import { requireWrite, ensureContainer, printWrite } from './writeHelpers.mjs';
import { usageError, CliError } from '../errors.mjs';

// Pushed in chunks so a large import stays within the worker's per-request CPU
// and payload limits; each chunk is one revision. Not undoable (too large).
const CHUNK = 150;

export default {
  summary: 'import cards from a csv file (moxfield/manabox/deckbox/canonical)',
  help: [
    'usage: bp import <file.csv> [--no-resolve] [--dry-run]',
    '',
    'auto-detects the csv format and merges the cards into your cloud collection.',
    'by default each card is resolved on scryfall so it is fully searchable; pass',
    '--no-resolve to import as-is (faster, but no oracle/color/price data).',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    requireWrite(session);
    const path = args[0];
    if (!path) throw usageError('usage: bp import <file.csv>');

    let text;
    try { text = readFileSync(path, 'utf8'); } catch { throw new CliError('cannot read file: ' + path); }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new CliError('no rows found in ' + path);
    const adapter = detectAdapter(rows[0]);
    if (!adapter) throw new CliError('could not detect a supported csv format (moxfield/manabox/deckbox/canonical)');
    let entries = adapter.parse(rows);
    if (!entries.length) throw new CliError('no cards parsed from ' + path);

    let resolved = 0;
    let unresolved = 0;
    if (!boolFlag(flags, 'no-resolve')) {
      out.info(`resolving ${entries.length} card(s) on scryfall…`);
      const next = [];
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        let card = null;
        try { card = await resolvePrinting({ scryfallId: e.scryfallId || null, set: e.setCode, cn: e.cn, name: e.name }); } catch { /* leave unresolved */ }
        if (card) {
          resolved += 1;
          next.push(normalizeCollectionEntry({
            ...cardToFields(card, e.finish), finish: e.finish, qty: e.qty,
            condition: e.condition, language: e.language, location: e.location, tags: e.tags,
            ...(e._source ? { _source: e._source } : {}),
          }, { preserveResolvedFields: true }));
        } else {
          unresolved += 1;
          next.push(e);
        }
        if ((i + 1) % 25 === 0) out.info(out.c.dim(`  ${i + 1}/${entries.length}`));
        await sleep(80);
      }
      entries = next;
    }

    if (boolFlag(flags, 'dry-run')) {
      const result = await applyMutation(session, (draft) => {
        for (const e of entries) ensureContainer(draft, e.location);
        draft.app.collection = mergeIntoCollection(draft.app.collection, entries);
        return { format: adapter.id, imported: entries.length, resolved, unresolved };
      }, { dryRun: true });
      printWrite(out, result, () => out.info(out.c.dim(`dry run — would import ${entries.length} card(s) (${adapter.id})`)));
      return 0;
    }

    let revision = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const result = await applyMutation(session, (draft) => {
        for (const e of chunk) ensureContainer(draft, e.location);
        draft.app.collection = mergeIntoCollection(draft.app.collection, chunk);
      });
      revision = result.revision || revision;
      if (entries.length > CHUNK) out.info(out.c.dim(`  pushed ${Math.min(i + CHUNK, entries.length)}/${entries.length}`));
    }

    out.emit(
      { changed: true, imported: entries.length, format: adapter.id, resolved, unresolved, revision },
      () => out.info(out.c.green('✓ imported') + ` ${entries.length} card(s) (${adapter.id})` + (unresolved ? `, ${unresolved} unresolved` : '')),
    );
    return 0;
  },
};
