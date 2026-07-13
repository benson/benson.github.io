import test from "node:test";
import assert from "node:assert/strict";
import { BOONS } from "../data.js";
import { Simulation } from "../engine.js";
import {
  AUGMENT_DISCOVERY_IDS, RARE_DISCOVERY_IDS, RARE_DISCOVERY_REGISTRY, RARE_DISCOVERY_STORAGE_KEY,
  awardRareDiscoveries, createRareDiscoveryRunState, loadRareDiscoveryCollection, normalizeRareDiscoveryCollection,
  rareDiscoveryIdForBoon, recordRareDiscovery, revealNextAugmentDossier, saveRareDiscoveryCollection,
  validateRareDiscoveryCollection, validateRareDiscoveryRegistry, validateRareDiscoveryRunState,
} from "../rare-discoveries.js";

const memoryStorage = (initial = {}) => ({
  values: new Map(Object.entries(initial)),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, value); },
});

test("rare discovery registry is strict, immutable, and complete", () => {
  assert.deepEqual(validateRareDiscoveryRegistry(RARE_DISCOVERY_REGISTRY), []);
  assert.equal(RARE_DISCOVERY_IDS.length, 27);
  assert.equal(new Set(RARE_DISCOVERY_IDS).size, 27);
  assert.equal(Object.isFrozen(RARE_DISCOVERY_REGISTRY.entries[0]), true);
  assert.match(rareDiscoveryIdForBoon({ name: "Squad Shield" }), /^boon:/);
  assert.deepEqual(validateRareDiscoveryRegistry({ ...RARE_DISCOVERY_REGISTRY, extra: true }), ["rare discovery registry: invalid root"]);
});

test("run discoveries are canonical, one-shot, and feature gated", () => {
  const initial = createRareDiscoveryRunState(true);
  const first = recordRareDiscovery(initial, "event:treasure-runner");
  assert.equal(first.discovery.name, "Treasure runner");
  assert.equal(validateRareDiscoveryRunState(first.state), true);
  assert.equal(recordRareDiscovery(first.state, "event:treasure-runner").discovery, null);
  assert.equal(recordRareDiscovery(createRareDiscoveryRunState(false), "event:treasure-runner").state.encountered.length, 0);
  assert.throws(() => recordRareDiscovery(initial, "event:not-real"), /Invalid/);
});

test("augment dossier order is deterministic, bounded, and does not consume gameplay RNG", () => {
  let left = createRareDiscoveryRunState(true), right = createRareDiscoveryRunState(true);
  const ids = [];
  for (let index = 0; index < AUGMENT_DISCOVERY_IDS.length + 2; index++) {
    const a = revealNextAugmentDossier(left, "0123456789abcdef"), b = revealNextAugmentDossier(right, "0123456789abcdef");
    left = a.state; right = b.state;
    assert.deepEqual(left, right);
    if (a.discovery) ids.push(a.discovery.id);
  }
  assert.equal(new Set(ids).size, AUGMENT_DISCOVERY_IDS.length);
  assert.equal(left.dossierSequence, AUGMENT_DISCOVERY_IDS.length + 2);
});

test("local collection isolates malformed state and persists only bounded ids and anonymous claims", () => {
  const storage = memoryStorage({ [RARE_DISCOVERY_STORAGE_KEY]: JSON.stringify({ discovered: ["event:relay-ball", "bad"], appliedClaims: ["a".repeat(16), "private-room"] }) });
  const loaded = loadRareDiscoveryCollection(storage);
  assert.deepEqual(loaded.discovered, ["event:relay-ball"]);
  assert.deepEqual(loaded.appliedClaims, ["a".repeat(16)]);
  const saved = saveRareDiscoveryCollection(storage, loaded);
  assert.equal(validateRareDiscoveryCollection(saved), true);
  assert.equal(JSON.stringify(saved).includes("room"), false);
  assert.equal(validateRareDiscoveryCollection(normalizeRareDiscoveryCollection(null)), true);
});

test("terminal report awards are shared, bounded, and idempotent", () => {
  const report = { schema: "lastlight.squad-run-report.v4", fingerprint: "1".repeat(16), discoveries: ["boon:fired-up", "event:relay-ball"] };
  const first = awardRareDiscoveries(null, report);
  assert.deepEqual(first.award.discovered, report.discoveries);
  assert.equal(first.award.total, 2);
  const repeated = awardRareDiscoveries(first.state, report);
  assert.equal(repeated.award, null);
  assert.deepEqual(repeated.state, first.state);
  assert.throws(() => awardRareDiscoveries(null, { ...report, discoveries: ["not-real"] }), /Invalid/);
});

test("authoritative encounters record events, affixes, and boons without duplicates", () => {
  const sim = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [{ id: "p", name: "P", specialist: "zuri", replaySlot: 0 }] }, { seed: "0123456789abcdef0123456789abcdef" });
  sim.spawnTreasureRunner();
  sim.spawnRelayBall();
  sim.applyBoon(BOONS[0]);
  sim.applyBoon(BOONS[0]);
  assert.ok(sim.discoveryState.encountered.includes("event:treasure-runner"));
  assert.ok(sim.discoveryState.encountered.includes("event:relay-ball"));
  assert.ok(sim.discoveryState.encountered.includes("boon:cruise-control"));
  assert.equal(sim.discoveryState.encountered.filter((id) => id === "boon:cruise-control").length, 1);
  assert.ok(sim.events.some((event) => event.type === "discovery" && event.discoveryId === "event:treasure-runner"));
});
