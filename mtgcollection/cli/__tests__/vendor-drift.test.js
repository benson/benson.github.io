// Guards the vendored copies: they must stay byte-identical to the app source
// (run `npm run sync-vendor` after changing app modules) and must import in
// bare Node with no DOM. This is the real "self-contained, zero-dep" gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(here, '..', 'vendor');
const APP = join(here, '..', '..');
const files = readdirSync(VENDOR).filter(f => f.endsWith('.js'));

test('vendor: files are byte-identical to app source', () => {
  assert.ok(files.length >= 8, 'expected vendored modules');
  for (const f of files) {
    assert.equal(
      readFileSync(join(VENDOR, f), 'utf8'),
      readFileSync(join(APP, f), 'utf8'),
      `vendor/${f} has drifted from ../../${f} — run \`npm run sync-vendor\``,
    );
  }
});

test('vendor: every module imports in bare node (no DOM/localStorage)', async () => {
  for (const f of files) await import(pathToFileURL(join(VENDOR, f)).href);
});
