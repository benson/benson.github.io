import { writeFileSync } from 'node:fs';
import { loadSnapshot } from '../mutate.mjs';
import { runQuery, collectionOf } from '../snapshot.mjs';
import { getAdapter } from '../../vendor/adapters.js';
import { buildPortableArchive, portableArchiveToJson } from '../../vendor/portableArchive.js';
import { strFlag, boolFlag } from '../args.mjs';
import { usageError, CliError } from '../errors.mjs';

const CSV_FORMATS = ['canonical', 'moxfield', 'manabox', 'deckbox'];

export default {
  summary: 'export your collection to csv / json',
  help: [
    'usage: bp export [query] [--format canonical|moxfield|manabox|deckbox|json] [--output file]',
    '       bp export --archive [--output backup.json]   (full round-trippable backup)',
    '',
    'with a query, exports only the matching cards (e.g. bp export "f:foil" --format moxfield).',
    'writes to stdout unless --output is given.',
  ].join('\n'),
  async run(ctx) {
    const { out, flags, args } = ctx;
    const session = ctx.makeSession();
    const { snapshot } = await loadSnapshot(session);
    const file = strFlag(flags, 'output', 'o');

    let body;
    let meta;
    if (boolFlag(flags, 'archive')) {
      const archive = buildPortableArchive({ snapshot });
      if (!archive) throw new CliError('could not build archive');
      body = portableArchiveToJson(archive);
      meta = { kind: 'archive' };
    } else {
      const cards = runQuery(collectionOf(snapshot), args.join(' '));
      const format = strFlag(flags, 'format') || 'canonical';
      if (format === 'json') {
        body = JSON.stringify(cards, null, 2);
      } else if (CSV_FORMATS.includes(format)) {
        body = getAdapter(format).export(cards);
      } else {
        throw usageError(`unknown format: ${format} (use ${CSV_FORMATS.join('/')}, json, or --archive)`);
      }
      meta = { format, count: cards.length };
    }

    if (file) {
      writeFileSync(file, body.endsWith('\n') ? body : body + '\n');
      out.emit({ file, ...meta }, () => out.info(`wrote ${file}`));
    } else if (out.json) {
      out.emit({ ...meta, body });
    } else {
      out.raw(body);
    }
    return 0;
  },
};
