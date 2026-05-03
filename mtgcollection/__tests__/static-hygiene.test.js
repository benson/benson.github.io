import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');

function topLevelFiles(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && extensions.has(path.extname(entry.name)))
    .map(entry => path.join(dir, entry.name));
}

test('static files do not contain common UTF-8 mojibake sequences', () => {
  const files = [
    ...topLevelFiles(path.join(projectRoot, 'mtgcollection'), new Set(['.html', '.js'])),
    ...topLevelFiles(path.join(projectRoot, 'shared'), new Set(['.js', '.css', '.html'])),
  ];
  const mojibake = /\u00c2|\u00c3|\u00e2|\ufffd/;
  const offenders = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (mojibake.test(line)) {
        offenders.push(path.relative(projectRoot, file) + ':' + (index + 1));
      }
    });
  }

  assert.deepEqual(offenders, []);
});

test('mtgcollection document declares UTF-8 before app content', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'index.html'), 'utf8');
  const headStart = html.slice(0, 500).toLowerCase();

  assert.match(headStart, /<meta\s+charset="utf-8">/);
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.js"><\/script>/);
});

test('shared ESM files declare their module package boundary', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared', 'package.json'), 'utf8'));

  assert.equal(pkg.type, 'module');
});
