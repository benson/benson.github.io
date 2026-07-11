import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOOL = path.join(ROOT, "tooling", "sprite_tool.py");
const MANIFEST = path.join(ROOT, "tooling", "sprite-manifest.json");
const PYTHON = process.env.PYTHON || "python";
const QA_RELATIVE = `artifacts/sprite-tooling-test-${process.pid}`;
const QA = path.join(ROOT, QA_RELATIVE);

after(() => rmSync(QA, { recursive: true, force: true }));

function run(mode, args = []) {
  return execFileSync(PYTHON, [TOOL, mode, ...args], { cwd: ROOT, encoding: "utf8" });
}

function hash(data) { return createHash("sha256").update(data).digest("hex"); }

function fileMap(directory, prefix = "") {
  const result = {};
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name), relative = path.join(prefix, name).replaceAll("\\", "/");
    if (statSync(absolute).isDirectory()) Object.assign(result, fileMap(absolute, relative));
    else result[relative] = hash(readFileSync(absolute));
  }
  return result;
}

function productionManifest() { return JSON.parse(readFileSync(MANIFEST, "utf8")); }

function writeManifest(name, manifest) {
  mkdirSync(QA, { recursive: true });
  const target = path.join(QA, name);
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  return path.relative(ROOT, target).replaceAll("\\", "/");
}

function buildResult(manifestRelative) {
  return spawnSync(PYTHON, [TOOL, "build", "--manifest", manifestRelative, "--output-dir", `${QA_RELATIVE}/invalid-output`], { cwd: ROOT, encoding: "utf8" });
}

test("committed atlas is a byte-identical rebuild with complete theme coverage", () => {
  const report = JSON.parse(run("verify"));
  assert.equal(report.schema, "lastlight.sprite-report.v1");
  assert.deepEqual(report.theme.animatedSpecialists, ["zuri"]);
  assert.equal(report.atlases[0].frameCount, 20);
  assert.equal(report.atlases[0].outputSha256, productionManifest().atlases[0].output.sha256);
  assert.ok(report.atlases[0].frames.every((frame) => frame.alphaBounds.every(Number.isInteger)));
});

test("two builds create byte-stable atlases, contact sheets, reports, and preview metadata", () => {
  const first = `${QA_RELATIVE}/first`, second = `${QA_RELATIVE}/second`;
  run("build", ["--output-dir", first]);
  run("build", ["--output-dir", second]);
  assert.deepEqual(fileMap(path.join(ROOT, first)), fileMap(path.join(ROOT, second)));
  const preview = JSON.parse(readFileSync(path.join(ROOT, first, "zuri-motion", "preview.json"), "utf8"));
  assert.equal(preview.schema, "lastlight.sprite-preview.v1");
  assert.deepEqual(preview.directions, ["south", "west", "north", "east"]);
  assert.equal(preview.frames.length, 20);
  assert.ok(statSync(path.join(ROOT, first, "zuri-motion", "contact-sheet.png")).size > 100_000);
});

test("schema accepts generic 4x6 sheets, semantic rows, reused clips, and unused cells", () => {
  const manifest = productionManifest(), atlas = manifest.atlases[0];
  const stateIds = ["idle-a", "idle-b", "run-a", "run-b", "action", "hurt-down"];
  atlas.layout.rows = 6; atlas.layout.cellHeight = 209; atlas.output.height = 1254;
  atlas.output.sha256 = "0".repeat(64);
  atlas.processing.edgePolicy = "clear";
  atlas.layout.states = stateIds.map((id, row) => ({ id, row }));
  atlas.layout.frames = [];
  const widths = [314, 313, 314, 313], starts = [0, 314, 627, 941];
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 4; column++) {
      if (row === 5 && column === 3) continue;
      const direction = atlas.layout.directions[column], state = stateIds[row];
      atlas.layout.frames.push({ id: `${state}.${direction}`, state, direction, cell: [column, row], sourceRect: [starts[column], row * 209, widths[column], 209] });
    }
  }
  atlas.layout.unusedCells = [[3, 5]];
  atlas.clips.idle.frames = [{ row: 0, ms: 240 }, { row: 1, ms: 240 }];
  atlas.clips.run.frames = [{ row: 2, ms: 70 }, { row: 3, ms: 70 }];
  for (const clip of ["dash", "castE", "castR"]) atlas.clips[clip].frames = [{ row: 4, ms: 160 }];
  for (const clip of ["hurt", "down"]) atlas.clips[clip].frames = [{ row: 5, ms: 220 }];
  atlas.clips.revive.frames = [{ row: 1, ms: 300 }]; atlas.clips.victory.frames = [{ row: 0, ms: 300 }];
  const relative = writeManifest("manifest-4x6.json", manifest);
  const report = JSON.parse(run("build", ["--manifest", relative, "--output-dir", `${QA_RELATIVE}/four-by-six`]));
  assert.deepEqual(report.atlases[0].dimensions, [1256, 1254]);
  assert.equal(report.atlases[0].frameCount, 23);
  assert.equal(report.atlases[0].unusedCellCount, 1);
});

test("RGBA copy sources assemble without invoking chroma processing", () => {
  const manifest = productionManifest(), atlas = manifest.atlases[0];
  atlas.source = { path: atlas.output.path, sha256: atlas.output.sha256, width: atlas.output.width, height: atlas.output.height, mode: "RGBA" };
  atlas.processing = { method: "copy", chromaKey: null, bleed: 2, edgePolicy: "validate", png: { compressLevel: 9, optimize: false } };
  atlas.output.sha256 = "0".repeat(64);
  atlas.layout.frames = atlas.layout.frames.map((frame) => ({
    id: frame.id, state: frame.state, direction: frame.direction, cell: frame.cell,
    sourceRect: [frame.cell[0] * atlas.layout.cellWidth, frame.cell[1] * atlas.layout.cellHeight, atlas.layout.cellWidth, atlas.layout.cellHeight],
  }));
  const relative = writeManifest("manifest-rgba-copy.json", manifest);
  const report = JSON.parse(run("build", ["--manifest", relative, "--output-dir", `${QA_RELATIVE}/rgba-copy`]));
  assert.equal(report.atlases[0].frameCount, 20);
  assert.equal(report.atlases[0].dimensions[0], 1256);
});

test("strict schema rejects unknown keys, naming drift, duplicate cells, bad bounds, hashes, and direction order", () => {
  const cases = [
    ["unknown", (manifest) => { manifest.extra = true; }, /unknown fields/],
    ["naming", (manifest) => { manifest.atlases[0].id = "Bad_Name"; }, /kebab-case/],
    ["duplicate", (manifest) => { manifest.atlases[0].layout.frames[1].cell = [0, 0]; }, /ordering|duplicate/],
    ["bounds", (manifest) => { manifest.atlases[0].layout.frames[0].sourceRect = [1200, 0, 314, 251]; }, /outside the source/],
    ["hash", (manifest) => { manifest.atlases[0].source.sha256 = "f".repeat(64); }, /SHA-256 mismatch/],
    ["directions", (manifest) => { manifest.atlases[0].layout.directions = ["west", "south", "north", "east"]; }, /directions must be/],
    ["coverage", (manifest) => { manifest.theme.requiredAnimatedSpecialists = ["zuri", "echo"]; }, /coverage/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const manifest = productionManifest(); mutate(manifest);
    const result = buildResult(writeManifest(`invalid-${name}.json`, manifest));
    assert.notEqual(result.status, 0, `${name} should fail`);
    assert.match(result.stderr, pattern);
  }
});

test("verify rejects render anchors or timing that drift from runtime theme metadata", () => {
  const manifest = productionManifest(); manifest.atlases[0].render.anchor = [0.4, 0.82];
  const relative = writeManifest("invalid-runtime-drift.json", manifest);
  const result = spawnSync(PYTHON, [TOOL, "verify", "--manifest", relative], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtime metadata drift/);
});

test("manifest pins the raw source and runtime output SHA-256 records", () => {
  const manifest = productionManifest(), atlas = manifest.atlases[0];
  assert.equal(hash(readFileSync(path.join(ROOT, atlas.source.path))), atlas.source.sha256);
  assert.equal(hash(readFileSync(path.join(ROOT, atlas.output.path))), atlas.output.sha256);
  assert.equal(manifest.tool.pillowVersion, "12.1.1");
  assert.equal(atlas.processing.edgePolicy, "validate", "Zuri frames satisfy the same bleed gate as newly authored sheets");
});
