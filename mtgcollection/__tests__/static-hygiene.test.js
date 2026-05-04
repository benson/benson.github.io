import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');

function sourceFiles(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(fullPath, extensions);
      if (entry.isFile() && extensions.has(path.extname(entry.name))) return [fullPath];
      return [];
    });
}

test('static files do not contain common UTF-8 mojibake sequences', () => {
  const files = [
    ...sourceFiles(path.join(projectRoot, 'mtgcollection'), new Set(['.html', '.js', '.css'])),
    ...sourceFiles(path.join(projectRoot, 'shared'), new Set(['.js', '.css', '.html'])),
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
  assert.match(headStart, /<link\s+rel="stylesheet"\s+href="\.\/styles\.css">/);
  assert.doesNotMatch(html, /<style>/);
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.js"><\/script>/);
});

test('history UI does not expose CSV export controls', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'index.html'), 'utf8');
  const changelog = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'changelog.js'), 'utf8');

  assert.doesNotMatch(html, /exportHistoryBtn|history-export-btn/);
  assert.doesNotMatch(html, /history[^<]*export csv|export csv[^<]*history/i);
  assert.doesNotMatch(changelog, /exportLogCsv|downloadCsv/);
});

test('account menu keeps import/export IA consolidated', () => {
  const syncUi = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'syncUi.js'), 'utf8');
  const syncEngine = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'syncEngine.js'), 'utf8');
  const persistence = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'persistence.js'), 'utf8');

  assert.match(syncUi, /export data/);
  assert.doesNotMatch(syncUi, /import local|export json|import json|sync now/i);
  assert.doesNotMatch(syncEngine, /cloud collection loaded/i);
  assert.doesNotMatch(persistence, /backup nag|data-backup-action|loads_since_backup/i);
});

test('mobile css keeps sheet and browsing guardrails in place', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'mtgcollection', 'styles.css'), 'utf8');

  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.app-shell[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /body\.view-list\.right-drawer-open \.app-right[\s\S]*height: 100dvh/);
  assert.match(css, /body\.view-list \.list-view\.active tbody tr,[\s\S]*body\.view-binder \.binder-list-table tbody tr[\s\S]*display: flex/);
  assert.match(css, /body\.view-binder \.binder-list-table \.col-check[\s\S]*display: none/);
  assert.match(css, /\.deck-workspace-controls[\s\S]*position: sticky/);
});

test('shared ESM files declare their module package boundary', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared', 'package.json'), 'utf8'));

  assert.equal(pkg.type, 'module');
});

function productionMtgJsFiles() {
  const mtgRoot = path.join(projectRoot, 'mtgcollection');
  return sourceFiles(mtgRoot, new Set(['.js']))
    .filter(file => !file.includes(path.sep + '__tests__' + path.sep))
    .filter(file => !file.includes(path.sep + '.wrangler' + path.sep));
}

function relativeMtgPath(file) {
  return path.relative(path.join(projectRoot, 'mtgcollection'), file).replace(/\\/g, '/');
}

function mtgImportGraph() {
  const mtgRoot = path.join(projectRoot, 'mtgcollection');
  const files = productionMtgJsFiles();
  const nodes = files.map(relativeMtgPath);
  const graph = new Map(nodes.map(node => [node, []]));
  const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const deps = [];
    let match;
    while ((match = importPattern.exec(text))) {
      let target = path.normalize(path.join(path.dirname(file), match[1]));
      if (!target.endsWith('.js')) target += '.js';
      if (target.startsWith(mtgRoot) && fs.existsSync(target)) deps.push(relativeMtgPath(target));
    }
    graph.set(relativeMtgPath(file), [...new Set(deps)]);
  }

  return graph;
}

function stronglyConnectedComponents(graph) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const index = new Map();
  const lowlink = new Map();
  const components = [];

  function visit(node) {
    index.set(node, nextIndex);
    lowlink.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const dep of graph.get(node) || []) {
      if (!index.has(dep)) {
        visit(dep);
        lowlink.set(node, Math.min(lowlink.get(node), lowlink.get(dep)));
      } else if (onStack.has(dep)) {
        lowlink.set(node, Math.min(lowlink.get(node), index.get(dep)));
      }
    }

    if (lowlink.get(node) === index.get(node)) {
      const component = [];
      let current;
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      components.push(component.sort());
    }
  }

  for (const node of graph.keys()) {
    if (!index.has(node)) visit(node);
  }
  return components;
}

test('mtgcollection production modules stay acyclic', () => {
  const graph = mtgImportGraph();
  const cycles = stronglyConnectedComponents(graph)
    .filter(component => component.length > 1 || (graph.get(component[0]) || []).includes(component[0]))
    .map(component => component.join(' -> '));

  assert.deepEqual(cycles, []);
});
