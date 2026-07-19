import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_SCHEMA, BRAND_VERSION, LASTLIGHT_BRAND, validateBrandContract } from "../brand-contract.js";
import { ENEMY_TYPES, MAPS, SPECIALISTS, WEAPONS } from "../data.js";
import { MATERIAL_CLASSES } from "../material-impacts.js";
import { READABILITY_PASS_ORDER } from "../readability.js";
import { LASTLIGHT_THEME } from "../themes/lastlight.js";
import { Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sorted = (values) => [...values].sort();
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const leafStrings = (value) => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(leafStrings) : [];
const frozenTree = (value) => !value || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(frozenTree));

test("brand contract is strict, immutable, versioned, and identity-free", () => {
  assert.equal(BRAND_SCHEMA, "lastlight.brand.v1");
  assert.equal(BRAND_VERSION, 1);
  assert.deepEqual(validateBrandContract(), []);
  assert.equal(frozenTree(LASTLIGHT_BRAND), true);
  assert.doesNotMatch(JSON.stringify(LASTLIGHT_BRAND), /callsign|playerId|roomCode|authToken|runSeed/i);

  const extraRoot = structuredClone(LASTLIGHT_BRAND); extraRoot.owner = "Final City";
  assert.deepEqual(validateBrandContract(extraRoot), ["brand: fields mismatch"]);
  const extraIdentity = structuredClone(LASTLIGHT_BRAND); extraIdentity.specialists.zuri.portrait = "optional";
  assert.match(validateBrandContract(extraIdentity).join("\n"), /identity fields mismatch/);
  const missingType = structuredClone(LASTLIGHT_BRAND); delete missingType.typography.casing;
  assert.match(validateBrandContract(missingType).join("\n"), /typography: fields mismatch/);
  const slowMotion = structuredClone(LASTLIGHT_BRAND); slowMotion.motion.panelMs = 500;
  assert.match(validateBrandContract(slowMotion).join("\n"), /timing out of bounds/);
  const malformedAssets = structuredClone(LASTLIGHT_BRAND); malformedAssets.assetFamilies[0] = null;
  assert.match(validateBrandContract(malformedAssets).join("\n"), /assets/);
});

test("identity, weapon, material, and render taxonomies cover the runtime contracts exactly", () => {
  assert.deepEqual(Object.keys(LASTLIGHT_BRAND.specialists), Object.keys(SPECIALISTS));
  assert.deepEqual(Object.keys(LASTLIGHT_BRAND.enemies), Object.keys(ENEMY_TYPES));
  assert.deepEqual(Object.keys(LASTLIGHT_BRAND.maps), Object.keys(MAPS));
  assert.deepEqual(Object.keys(LASTLIGHT_BRAND.apexes), Object.keys(MAPS));
  assert.deepEqual(LASTLIGHT_BRAND.weapons.signatures, Object.keys(SPECIALISTS));
  assert.deepEqual(LASTLIGHT_BRAND.weapons.universal, Object.keys(WEAPONS));
  assert.deepEqual(LASTLIGHT_BRAND.materials, MATERIAL_CLASSES);
  assert.deepEqual(LASTLIGHT_BRAND.renderPriority, READABILITY_PASS_ORDER);
  assert.match(LASTLIGHT_BRAND.assetFamilies.find(({ id }) => id === "audio").provenance, /cc0-recordings-and-project-authored-runtime/);
});

test("every theme asset exists and every checked-in asset belongs to a declared family", () => {
  const themePaths = leafStrings(LASTLIGHT_THEME.assets).filter((value) => /^assets\//.test(value));
  const motionPaths = [LASTLIGHT_THEME.animations.specialists, LASTLIGHT_THEME.animations.enemies, LASTLIGHT_THEME.animations.bosses]
    .flatMap((group) => Object.values(group).map((rig) => rig.atlas.src));
  for (const path of [...themePaths, ...motionPaths]) assert.equal(existsSync(join(root, path)), true, `missing ${path}`);

  const assetPaths = walk(join(root, "assets")).map((path) => relative(root, path).replaceAll("\\", "/"));
  assert.equal(assetPaths.length, 245);
  const covered = assetPaths.filter((path) => /^(?:assets\/(?:archive|audio|branding|effects|enemies|environment-chunks|environments|guide|map-devices|map-mechanics|motion|motion-normalized|sprites|supply-containers|weapons)\/|assets\/(?:og|squad-atlas))/.test(path));
  assert.deepEqual(sorted(covered), sorted(assetPaths));
});

test("CSS tokens and written bible agree with the machine contract", () => {
  const css = readFileSync(join(root, "styles.css"), "utf8");
  for (const [token, color] of Object.entries(LASTLIGHT_BRAND.palette)) {
    const cssName = token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    assert.match(css, new RegExp(`--brand-${cssName}:\\s*${color}`, "i"));
  }
  assert.match(css, new RegExp(`--duration-press:\\s*${LASTLIGHT_BRAND.motion.pressMs}ms`));
  assert.match(css, new RegExp(`--duration-micro:\\s*${LASTLIGHT_BRAND.motion.microMs}ms`));
  assert.match(css, new RegExp(`--duration-panel:\\s*${LASTLIGHT_BRAND.motion.panelMs}ms`));
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /scale\(0(?:[.),]|\s)/);

  const bible = readFileSync(join(root, "ART-BIBLE.md"), "utf8");
  const inventory = readFileSync(join(root, "ASSET-INVENTORY.md"), "utf8");
  for (const heading of ["The promise", "Mark and naming", "Color", "Typography and voice", "Geometry, layers, and iconography", "Materials and effects", "Motion", "Character and threat identity", "Maps and environment", "Audio identity", "Surface audit", "Asset inventory and provenance", "Production checklist"]) assert.match(bible, new RegExp(`## ${heading}`));
  for (const collection of [LASTLIGHT_BRAND.specialists, LASTLIGHT_BRAND.enemies, LASTLIGHT_BRAND.apexes, LASTLIGHT_BRAND.maps]) for (const { label } of Object.values(collection)) assert.match(bible, new RegExp(label, "i"));
  for (const { id } of LASTLIGHT_BRAND.assetFamilies) assert.match(`${bible}\n${inventory}`, new RegExp(id.replaceAll("-", "[- ]"), "i"));
  assert.match(inventory, /241 files/);
});

test("branding remains presentation-only and preserves exact simulation hashes", () => {
  for (const file of ["engine.js", "replay.js", "recovery.js", "protocol.js", "run-archive.js", "telemetry.js"].filter((name) => existsSync(join(root, name)))) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /brand-contract|LASTLIGHT_BRAND/);
  }
  const hashes = Object.keys(LASTLIGHT_BRAND.palette).map(() => {
    const simulation = new Simulation({ players: [{ id: "p1", name: "Brand", specialist: "zuri" }] }, { seed: "0123456789abcdef0123456789abcdef" });
    for (let tick = 0; tick < 120; tick++) {
      simulation.setInput("p1", { x: tick % 40 < 20 ? 1 : -1, y: .25, aim: tick / 20, autoAim: false });
      simulation.update(1 / 60);
    }
    return hashSimulationState(simulation);
  });
  assert.equal(new Set(hashes).size, 1);
});
