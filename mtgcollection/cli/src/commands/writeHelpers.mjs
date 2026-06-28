import { normalizeLocation, locationKey, makeContainer } from '../../vendor/collection.js';
import { saveUndo } from '../store.mjs';
import { CliError } from '../errors.mjs';
import { strFlag, intFlag } from '../args.mjs';

export function requireWrite(session) {
  if (!session.hasScope('collection.write')) {
    throw new CliError('this session is read-only — run `bp login --write`', 3);
  }
}

export function parseLocationFlag(value) {
  return value ? normalizeLocation(value) : null;
}

// Build a stack selector from the card name (positional) + qualifier flags.
export function selectorFrom(flags, nameParts) {
  const name = (nameParts || []).join(' ').trim();
  return {
    name: name || null,
    scryfallId: strFlag(flags, 'scryfall-id', 'id'),
    set: strFlag(flags, 'set', 's'),
    cn: strFlag(flags, 'cn'),
    finish: strFlag(flags, 'finish'),
    condition: strFlag(flags, 'condition', 'cond'),
    location: parseLocationFlag(strFlag(flags, 'location', 'loc')),
  };
}

export function matchStack(c, sel) {
  if (sel.scryfallId && c.scryfallId !== sel.scryfallId) return false;
  if (sel.name && !(String(c.resolvedName || c.name || '').toLowerCase().includes(sel.name.toLowerCase()))) return false;
  if (sel.set && String(c.setCode || '').toLowerCase() !== sel.set.toLowerCase()) return false;
  if (sel.cn && String(c.cn) !== String(sel.cn)) return false;
  if (sel.finish && c.finish !== sel.finish) return false;
  if (sel.condition && c.condition !== sel.condition) return false;
  if (sel.location && locationKey(c.location) !== locationKey(sel.location)) return false;
  return true;
}

export function findStacks(collection, sel) {
  return (collection || []).filter(c => matchStack(c, sel));
}

// Resolve a selector to exactly one stack unless `all`, with a helpful
// disambiguation error listing the candidates.
export function requireStacks(collection, sel, { all = false } = {}) {
  if (!sel.name && !sel.scryfallId && !sel.set) throw new CliError('specify a card (name, or --set/--cn, or --scryfall-id)');
  const stacks = findStacks(collection, sel);
  if (!stacks.length) throw new CliError('no matching card in your collection');
  if (stacks.length > 1 && !all) {
    const lines = stacks.slice(0, 10).map(c =>
      `  ${c.resolvedName || c.name} · ${(c.setCode || '').toUpperCase()} ${c.cn} · ${c.finish} · ${c.condition} · ${locationKey(c.location) || '—'}`);
    throw new CliError(`${stacks.length} stacks match — narrow with --set/--cn/--finish/--condition/--location, or pass --all:\n${lines.join('\n')}`);
  }
  return stacks;
}

export function ensureContainer(draft, location) {
  if (!location) return;
  const key = location.type + ':' + location.name;
  if (!draft.app.containers) draft.app.containers = {};
  if (!draft.app.containers[key]) draft.app.containers[key] = makeContainer({ type: location.type, name: location.name });
}

export function persistUndo(result) {
  if (result?.undo && !result.dryRun && !result.noop) saveUndo(result.undo);
}

export function printWrite(out, result, humanFn) {
  if (result.noop) { out.emit({ changed: false }, () => out.info('no change.')); return; }
  if (result.dryRun) {
    out.emit(
      { dryRun: true, ops: result.ops.length, opTypes: result.ops.map(o => o.type) },
      () => out.info(out.c.dim(`dry run — ${result.ops.length} op(s): ${result.ops.map(o => o.type).join(', ')}`)),
    );
    return;
  }
  out.emit({ changed: true, revision: result.revision, ops: result.ops.length, ...(result.meta || {}) }, humanFn);
}

export { intFlag };
