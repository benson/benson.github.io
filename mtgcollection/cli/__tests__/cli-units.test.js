import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseArgs, strFlag, boolFlag, intFlag } from '../src/args.mjs';
import { createPkce, randomState } from '../src/pkce.mjs';
import { createOutput } from '../src/output.mjs';

test('parseArgs: positionals, value flags, booleans, =, --', () => {
  const { positionals, flags } = parseArgs(['search', 't:creature', '--sort', 'price', '--desc', '--limit=5', '--', '--literal']);
  assert.deepEqual(positionals, ['search', 't:creature', '--literal']);
  assert.equal(flags.sort, 'price');
  assert.equal(flags.desc, true);
  assert.equal(flags.limit, '5');
});

test('parseArgs: a boolean flag does not swallow the next token', () => {
  const { positionals, flags } = parseArgs(['rm', '--dry-run', 'Sol Ring']);
  assert.equal(flags['dry-run'], true);
  assert.deepEqual(positionals, ['rm', 'Sol Ring']);
});

test('parseArgs: value-less flags before a positional do not swallow it', () => {
  const search = parseArgs(['search', '--desc', 't:creature']);
  assert.equal(search.flags.desc, true);
  assert.deepEqual(search.positionals, ['search', 't:creature']);

  const imp = parseArgs(['import', '--no-resolve', 'file.csv']);
  assert.equal(imp.flags['no-resolve'], true);
  assert.deepEqual(imp.positionals, ['import', 'file.csv']);

  const exp = parseArgs(['export', '--archive', 'f:foil']);
  assert.equal(exp.flags.archive, true);
  assert.deepEqual(exp.positionals, ['export', 'f:foil']);
});

test('flag coercion helpers', () => {
  const flags = { set: 'c21', n: '3', yes: true };
  assert.equal(strFlag(flags, 'set', 's'), 'c21');
  assert.equal(strFlag(flags, 'missing'), null);
  assert.equal(intFlag(flags, 'n'), 3);
  assert.equal(intFlag(flags, 'missing', 1), 1);
  assert.equal(boolFlag(flags, 'yes'), true);
});

test('pkce: S256 challenge matches sha256(verifier)', () => {
  const { verifier, challenge, method } = createPkce();
  assert.equal(method, 'S256');
  const expected = createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  assert.equal(challenge, expected);
  assert.notEqual(randomState(), randomState());
});

test('output: --json emits a stable success envelope', () => {
  const out = createOutput({ json: true, color: false });
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  try { out.emit({ hello: 'world' }, () => out.line('human')); } finally { process.stdout.write = orig; }
  assert.deepEqual(JSON.parse(chunks.join('')), { ok: true, data: { hello: 'world' } });
});

test('output: --json error envelope carries message + extra', () => {
  const out = createOutput({ json: true, color: false });
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  try { out.error({ message: 'boom', extra: { code: 42 } }); } finally { process.stdout.write = orig; }
  const parsed = JSON.parse(chunks.join(''));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.message, 'boom');
});
