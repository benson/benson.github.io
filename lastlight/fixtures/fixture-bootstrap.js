import { BALANCE_HASH, BALANCE_IDS, BALANCE_VERSION, getBalanceConfig } from "../balance-config.js";
import { ENEMY_TYPES, MAPS, DIFFICULTIES, PASSIVES, SPECIALISTS, WEAPONS, clamp } from "../data.js";
import { SIMULATION_TICK_RATE, Simulation, WORLD } from "../engine.js";
import { SeededRng } from "../rng.js";

const PLAYER_KEYS = new Set(["id", "specialist", "x", "y", "invulnerableSeconds", "weapons", "evolved", "passives", "downed"]);
const POPULATION_KEYS = new Set(["enemies", "friendlyProjectiles", "hostileProjectiles", "orbs", "effects", "objective", "completeRelayBall"]);

function assertKeys(value, allowed, path) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) throw new TypeError(`${path}.${key} is unsupported`);
}

function finite(value, path) {
  if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite`);
  return value;
}

function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${path} must be an integer from ${min} to ${max}`);
  return value;
}

function position(rng, index, count, radiusBase = 430) {
  const ring = Math.floor(index / 48), slot = index % 48;
  const angle = slot / Math.min(48, Math.max(1, count)) * Math.PI * 2 + rng.float(-0.025, 0.025);
  const radius = radiusBase + ring * 115 + rng.float(-18, 18);
  return {
    x: clamp(Math.cos(angle) * radius, -WORLD.width / 2 + 80, WORLD.width / 2 - 80),
    y: clamp(Math.sin(angle) * radius, -WORLD.height / 2 + 80, WORLD.height / 2 - 80),
  };
}

function setCheckpoint(sim, checkpoint) {
  assertKeys(checkpoint, new Set(["elapsedTicks", "level", "objectiveIndex", "boss", "bossHealthRatio"]), "checkpoint");
  sim.tick = integer(checkpoint.elapsedTicks, 0, 216_000, "checkpoint.elapsedTicks");
  sim.time = Math.min(sim.duration, sim.tick / SIMULATION_TICK_RATE);
  sim.remaining = Math.max(0, sim.duration - sim.time);
  sim.wave = Math.min(6, Math.floor(sim.time / sim.duration * 7));
  sim.level = integer(checkpoint.level, 1, 100, "checkpoint.level");
  sim.objectiveIndex = integer(checkpoint.objectiveIndex, 0, 2, "checkpoint.objectiveIndex");
  // Checkpoint fixtures own their scheduled content. Suppress historical events
  // that would otherwise all fire on the first resumed tick.
  const afterFixture = sim.time + sim.duration + 1;
  sim.nextElite = afterFixture;
  sim.nextMiniBoss = afterFixture;
  sim.nextTreasure = afterFixture;
  sim.nextRelayBall = afterFixture;
}

function patchPlayer(player, fixture) {
  assertKeys(fixture, PLAYER_KEYS, `players.${fixture.id || "unknown"}`);
  player.x = finite(fixture.x, `players.${fixture.id}.x`);
  player.y = finite(fixture.y, `players.${fixture.id}.y`);
  player.invuln = finite(fixture.invulnerableSeconds, `players.${fixture.id}.invulnerableSeconds`);
  player.weapons = {};
  for (const [weaponId, level] of Object.entries(fixture.weapons || {})) {
    if (weaponId !== "signature" && !WEAPONS[weaponId]) throw new TypeError(`Unknown fixture weapon ${weaponId}`);
    player.weapons[weaponId] = { level: integer(level, 1, 5, `players.${fixture.id}.weapons.${weaponId}`), evolved: (fixture.evolved || []).includes(weaponId) };
  }
  if (!player.weapons.signature) player.weapons.signature = { level: 1, evolved: false };
  player.passives = {};
  for (const [passiveId, level] of Object.entries(fixture.passives || {})) {
    if (!PASSIVES[passiveId]) throw new TypeError(`Unknown fixture passive ${passiveId}`);
    player.passives[passiveId] = integer(level, 0, 5, `players.${fixture.id}.passives.${passiveId}`);
  }
  if (fixture.downed) {
    player.hp = 0;
    player.downed = true;
    player.dead = false;
    player.downTimer = 10;
    player.reviveProgress = 0;
  }
}

function addEnemies(sim, entries, rng) {
  let index = 0;
  for (const [entryIndex, entry] of (entries || []).entries()) {
    assertKeys(entry, new Set(["type", "count", "healthMultiplier"]), `population.enemies.${entryIndex}`);
    if (!ENEMY_TYPES[entry.type]) throw new TypeError(`Unknown fixture enemy ${entry.type}`);
    const count = integer(entry.count, 0, 500, `population.enemies.${entryIndex}.count`);
    const healthMultiplier = entry.healthMultiplier === undefined ? 1 : finite(entry.healthMultiplier, `population.enemies.${entryIndex}.healthMultiplier`);
    for (let local = 0; local < count; local++, index++) {
      const enemy = sim.spawnEnemy(entry.type);
      Object.assign(enemy, position(rng, index, count), { hp: enemy.hp * healthMultiplier, maxHp: enemy.maxHp * healthMultiplier, attackCd: 2, shotCd: 2 });
    }
  }
}

function addSyntheticPopulation(sim, population, rng) {
  const friendly = integer(population.friendlyProjectiles || 0, 0, 2_000, "population.friendlyProjectiles");
  const hostile = integer(population.hostileProjectiles || 0, 0, 2_000, "population.hostileProjectiles");
  const orbs = integer(population.orbs || 0, 0, 5_000, "population.orbs");
  const effects = integer(population.effects || 0, 0, 1_000, "population.effects");
  const owner = sim.players[0].id;
  for (let index = 0; index < friendly; index++) {
    sim.projectiles.push({ id: sim.nextGameplayId("fixture-shot"), owner, x: -1680 + index % 40 * 12, y: -1080 + Math.floor(index / 40) * 6, vx: 0, vy: 0, radius: 4, damage: .1, life: 20, pierce: 0, color: "#63f2df", age: 0, hit: new Set(), sourceId: "fixture" });
  }
  for (let index = 0; index < hostile; index++) {
    sim.hostile.push({ id: sim.nextGameplayId("fixture-hostile"), ownerId: "fixture", x: 1650 - index % 40 * 12, y: 1080 - Math.floor(index / 40) * 6, vx: 0, vy: 0, radius: 7, damage: .1, life: 20, color: "#ff5d48", dead: false });
  }
  for (let index = 0; index < orbs; index++) {
    const side = index % 2 ? 1 : -1;
    sim.orbs.push({ id: sim.nextGameplayId("fixture-orb"), x: side * (1550 + index % 20 * 4), y: -1050 + Math.floor(index / 20) % 200 * 10, radius: 5, value: 1, color: "#63f2df", dead: false });
  }
  for (let index = 0; index < effects; index++) {
    const point = position(rng, index, effects, 700);
    sim.effects.push({ id: sim.nextCosmeticId("fixture-effect"), ...point, radius: 12, life: 20, maxLife: 20, damage: 0, owner, color: "#fff", kind: "pop", hit: new Set() });
  }
}

export function createFixtureSimulation(scenario, manifest) {
  getBalanceConfig(manifest.balance.version);
  if (manifest.balance.version !== BALANCE_VERSION || manifest.balance.hash !== BALANCE_HASH) throw new TypeError("Fixture balance contract is stale");
  const players = scenario.players.map((entry, replaySlot) => {
    if (!BALANCE_IDS.specialists.includes(entry.specialist) || !SPECIALISTS[entry.specialist]) throw new TypeError(`Unknown fixture specialist ${entry.specialist}`);
    return { id: entry.id, name: `Fixture ${replaySlot + 1}`, specialist: entry.specialist, replaySlot };
  });
  const sim = new Simulation({ ...scenario.simulation, players }, { seed: scenario.seed, balanceVersion: manifest.balance.version, balanceHash: manifest.balance.hash });
  setCheckpoint(sim, scenario.checkpoint);
  scenario.players.forEach((fixture) => patchPlayer(sim.players.find((player) => player.id === fixture.id), fixture));
  assertKeys(scenario.population, POPULATION_KEYS, "population");
  const bootstrapRng = SeededRng.fromHex(scenario.seed).fork("fixture-bootstrap");
  addEnemies(sim, scenario.population.enemies, bootstrapRng);
  addSyntheticPopulation(sim, scenario.population, bootstrapRng);
  if (scenario.population.objective) {
    if (scenario.population.objective !== "uplink" && scenario.population.objective !== "trial") throw new TypeError("population.objective is unsupported");
    sim.objectives.push({ id: sim.nextGameplayId("fixture-objective"), x: 0, y: 0, radius: 85, progress: 0, life: 38, kind: scenario.population.objective });
  }
  if (scenario.population.completeRelayBall) {
    sim.spawnRelayBall();
    const ball = sim.relayBalls.at(-1);
    ball.x = ball.targetX;
    ball.y = ball.targetY;
  }
  if (scenario.checkpoint.boss) {
    sim.spawnBoss();
    const boss = sim.enemies.find((enemy) => enemy.boss);
    boss.hp = boss.maxHp * finite(scenario.checkpoint.bossHealthRatio, "checkpoint.bossHealthRatio");
  }
  return sim;
}

export function applyFixtureAction(sim, action) {
  if (action.kind === "input") return sim.setInput(action.player, { x: action.x, y: action.y, aim: action.aim, autoAim: action.autoAim });
  if (action.kind === "cast") return sim.cast(action.player, action.slot);
  if (action.kind === "choose") return sim.choose(action.player, action.choiceId);
  throw new TypeError(`Unsupported fixture action ${action.kind}`);
}

export function resolveFixtureChoices(sim) {
  if (!sim.pendingChoices) return;
  for (const playerId of Object.keys(sim.pendingChoices).sort()) {
    if (!sim.pendingChoices) break;
    const choice = [...(sim.pendingChoices[playerId] || [])].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (choice) sim.choose(playerId, choice.id);
  }
}
