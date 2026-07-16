import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENVIRONMENT_CHUNK_MAP_IDS } from "../environment-chunks.js";
import { LASTLIGHT_THEME, getThemeAsset, getThemeEnvironmentChunks, validateTheme } from "../themes/lastlight.js";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function webpMetadata(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString(), "VP8X");
  return {
    alpha: Boolean(bytes[20] & 0x10),
    width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
    height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    hasAlphaChunk: bytes.indexOf(Buffer.from("ALPH")) >= 0,
  };
}

test("every operation owns a unique bounded alpha atlas through the theme contract", () => {
  assert.equal(validateTheme(LASTLIGHT_THEME).valid, true);
  assert.equal(getThemeEnvironmentChunks().schema, "lastlight.environment-chunks.v4");
  const paths = ENVIRONMENT_CHUNK_MAP_IDS.map((mapId) => getThemeAsset(`environmentChunks.${mapId}`));
  assert.equal(new Set(paths).size, 4);
  for (const relativePath of paths) {
    const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
    const metadata = webpMetadata(path);
    assert.deepEqual(metadata, { alpha: true, width: 1254, height: 1254, hasAlphaChunk: true });
    assert.ok(statSync(path).size <= 300_000, `${relativePath} exceeds the 300KB atlas budget`);
  }
});

test("simulation and renderer derive the same solid chunks without snapshot growth", () => {
  const render = source("render.js"), engine = source("engine.js"), replay = source("replay.js");
  assert.match(render, /environmentChunksForBounds\(/);
  assert.match(render, /environmentChunkLayouts\.has\(environmentLayoutKey\)/);
  assert.match(render, /getThemeAsset\(`environmentChunks\.\$\{map\.id\}`\)/);
  assert.match(render, /type: "environment-chunk"/);
  assert.match(render, /this\.drawEnvironmentChunk\(map, item\.value\)/);
  assert.match(render, /chunk\.collider/);
  assert.match(render, /drawEnvironmentChunkImage\(map, chunk/);
  assert.match(render, /physics all derive from the atlas alpha/);
  assert.match(render, /collision: "solid"/);
  assert.match(engine, /environmentChunkObstacles\(/);
  assert.match(engine, /coverObstaclesForMap\(/);
  assert.match(render, /snapshotBytes: 0/);
  assert.doesNotMatch(replay, /environment-chunks|environmentChunks/);
});

test("Field Manual explains solid structures and the contract remains theme-swappable", () => {
  const game = source("game.js"), html = source("index.html"), docs = source("ENVIRONMENT-CHUNKS.md");
  assert.match(html, /href="#guide-environments">Environments<\/a>/);
  assert.match(game, /id="guide-environments"/);
  assert.match(game, /eight solid structures/);
  assert.match(game, /ordinary shots stop on contact/);
  assert.match(game, /getThemeAsset\(environment\.atlasKey\)/);
  assert.match(docs, /snapshot-byte neutral/);
  assert.match(docs, /graphics settings cannot change cover/);
  assert.match(docs, /replacement theme supplies both/i);
  assert.match(docs, /alpha mask/i);
});
