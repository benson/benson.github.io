import test from "node:test";
import assert from "node:assert/strict";
import { MAP_OBSTACLES } from "../data.js";
import { projectileBlockedByCover, segmentCoverImpact, Simulation } from "../engine.js";

function releasePendingCast(sim) {
  const task = sim.tasks.find(({ kind }) => kind === "player-cast-release");
  assert.ok(task, "accepted cast must schedule an authoritative release");
  sim.tick = task.dueTick;
  sim.updateTasks();
}

test("swept cover collision blocks ordinary fire without tunneling and preserves authored exceptions", () => {
  const obstacle = [[0, -20, 40, 40]];
  const impact = segmentCoverImpact(-100, 0, 100, 0, 5, obstacle);
  assert.equal(impact.obstacleIndex, 0);
  assert.ok(Math.abs(impact.x + 5) < .01);
  assert.equal(impact.y, 0);
  assert.equal(projectileBlockedByCover({ sourceId: "signature" }), true);
  assert.equal(projectileBlockedByCover({ sourceId: "rail" }), false, "rail lanes intentionally penetrate cover");
  assert.equal(projectileBlockedByCover({ bossShot: true }, true), false, "apex fire remains an explicit cover-piercing exception");
  assert.equal(projectileBlockedByCover({ ownerId: "spitter" }, true), true);
});

test("friendly and ordinary hostile projectiles stop at raised cover and emit a contact marker", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const [left, top, , height] = MAP_OBSTACLES[0];
  sim.projectiles = [{ id: "friendly", owner: "p1", sourceId: "signature", x: left - 40, y: top + height / 2, vx: 900, vy: 0, radius: 6, damage: 10, life: 2, pierce: 0, color: "#fff", dead: false, hit: new Set(), age: 0 }];
  sim.hostile = [{ id: "hostile", ownerId: "spitter", x: left - 40, y: top + height / 2 + 20, vx: 900, vy: 0, radius: 6, damage: 1, life: 2, color: "#f00", dead: false }];
  sim.updateProjectiles(.05);
  assert.ok(sim.projectiles[0].dead && sim.hostile[0].dead);
  assert.equal(sim.effects.filter((effect) => effect.kind === "coverImpact").length, 2);
  assert.ok(sim.effects.every((effect) => effect.x <= left));
});

test("supply containers use deterministic varied kinds and never overlap cover or each other", () => {
  const seed = "c0ffee00000000000000000000000000";
  const left = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] }, { seed });
  const right = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] }, { seed });
  assert.equal(left.pods.length, 12);
  assert.deepEqual(left.pods, right.pods);
  assert.deepEqual([...new Set(left.pods.map(({ kind }) => kind))].sort(), ["cargo", "pressure", "utility"]);
  for (const [index, pod] of left.pods.entries()) {
    assert.equal(left.collidesWithCover(pod.x, pod.y, pod.radius + 8), false, `container ${index} must clear fitted cover`);
    for (const other of left.pods.slice(index + 1)) {
      assert.ok(Math.hypot(pod.x - other.x, pod.y - other.y) >= pod.radius + other.radius + 36);
    }
  }
  assert.deepEqual(left.snapshot().pods.map(({ kind }) => kind), left.pods.map(({ kind }) => kind));
  const restored = Simulation.fromRecoveryState(left.exportRecoveryState());
  assert.deepEqual(restored.pods.map(({ kind }) => kind), left.pods.map(({ kind }) => kind));
});

test("a run transitions from survival to an apex fight", () => {
  const sim = new Simulation({ duration: .1, players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  for (let i = 0; i < 5; i++) sim.update(.05);
  assert.equal(sim.stage, "boss");
  assert.ok(sim.enemies.some((enemy) => enemy.boss));
});

test("level-up choices pause and resume the whole simulation", () => {
  const sim = new Simulation({ duration: 240, players: [{ id: "p1", name: "One", specialist: "echo" }] });
  sim.teamXP = sim.xpNeed;
  sim.updatePickups(.016);
  assert.equal(sim.paused, true);
  assert.equal(sim.pendingChoices.p1.length, 3);
  sim.choose("p1", sim.pendingChoices.p1[0].id);
  assert.equal(sim.paused, false);
  assert.equal(sim.level, 2);
});

test("upgrade rounds expose each locked choice until the squad finishes", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri" },
    { id: "p2", name: "Two", specialist: "echo" },
  ] });
  sim.beginUpgradeChoice();
  const oneChoice = sim.pendingChoices.p1[0].id;
  sim.choose("p1", oneChoice);
  assert.equal(sim.selectedChoices.p1, oneChoice);
  assert.equal(sim.choiceReady.p1, true);
  assert.ok(sim.pendingChoices.p1);
  assert.equal(sim.paused, true);
  sim.choose("p2", sim.pendingChoices.p2[0].id);
  assert.equal(sim.pendingChoices, null);
  assert.equal(sim.paused, false);
});

test("draft controls are per-player, revision-guarded, and isolated from combat RNG", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri", replaySlot: 0 },
    { id: "p2", name: "Two", specialist: "echo", replaySlot: 1 },
  ] }, { seed: "0123456789abcdef0123456789abcdef" });
  sim.beginUpgradeChoice();
  const combatRng = sim.gameplayRng.snapshot(), teammate = structuredClone(sim.pendingChoices.p2);
  const before = sim.pendingChoices.p1.map(({ id }) => id);
  const reroll = sim.draftAction("p1", { type: "reroll", round: 1, revision: 0 });
  assert.equal(reroll.accepted, true);
  assert.equal(sim.players[0].draft.rerolls, 1);
  assert.equal(sim.players[0].draft.revision, 1);
  assert.notDeepEqual(sim.pendingChoices.p1.map(({ id }) => id), before);
  assert.deepEqual(sim.pendingChoices.p2, teammate);
  assert.deepEqual(sim.gameplayRng.snapshot(), combatRng);
  const stale = structuredClone(sim.snapshot());
  assert.deepEqual(sim.draftAction("p1", { type: "reroll", round: 1, revision: 0 }), { accepted: false, reason: "stale_revision" });
  assert.deepEqual(sim.snapshot(), stale);
});

test("banish persists for the run and skip resolves the multiplayer barrier with its premium", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri", replaySlot: 0 },
    { id: "p2", name: "Two", specialist: "echo", replaySlot: 1 },
  ] }, { seed: "fedcba9876543210fedcba9876543210" });
  sim.beginUpgradeChoice();
  const banished = sim.pendingChoices.p1.find(({ kind }) => kind === "weapon" || kind === "passive");
  const result = sim.draftAction("p1", { type: "banish", choiceId: banished.id, round: 1, revision: 0 });
  assert.equal(result.accepted, true);
  assert.equal(sim.players[0].draft.banishes, 1);
  assert.ok(sim.players[0].draft.banished.includes(banished.id));
  assert.ok(!sim.pendingChoices.p1.some(({ id }) => id === banished.id));
  sim.draftAction("p1", { type: "skip", round: 1, revision: 1 });
  assert.equal(sim.selectedChoices.p1, "draft:skip");
  assert.equal(sim.gold, 30);
  assert.equal(sim.paused, true);
  sim.choose("p2", sim.pendingChoices.p2[0].id);
  assert.equal(sim.paused, false);
  assert.equal(sim.gold, 40);
  sim.beginUpgradeChoice();
  assert.ok(!sim.pendingChoices.p1.some(({ id }) => id === banished.id));
});

test("full loadouts require one atomic explicit replacement and clean source state", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri", replaySlot: 0 }] });
  const player = sim.players[0];
  player.weapons = {
    signature: { level: 1, evolved: false }, aura: { level: 3, evolved: false }, mines: { level: 2, evolved: false },
    crossbow: { level: 1, evolved: false }, drone: { level: 4, evolved: true },
  };
  player.weaponTimers.drone = 2; player.weaponActivations.drone = 7;
  sim.drones.push({ id: "owned-drone", owner: player.id, x: 0, y: 0 });
  sim.beginUpgradeChoice();
  const offered = { id: "weapon:uwu", kind: "weapon", name: "Twin Needle", copy: "", glyph: "", icon: "", level: 1, max: 5 };
  sim.pendingChoices.p1 = [offered];
  assert.equal(sim.draftAction("p1", { type: "pick", choiceId: offered.id }).reason, "replacement_required");
  const replaced = sim.draftAction("p1", { type: "replace", choiceId: offered.id, replacementId: "drone" });
  assert.equal(replaced.accepted, true);
  assert.equal(Object.keys(player.weapons).length, 5);
  assert.equal(player.weapons.drone, undefined);
  assert.deepEqual(player.weapons.uwu, { level: 1, evolved: false });
  assert.equal(player.weaponTimers.drone, undefined);
  assert.equal(player.weaponActivations.drone, undefined);
  assert.equal(sim.drones.some(({ owner }) => owner === player.id), false);
  assert.equal(sim.gold, 10);
  assert.equal(replaced.decisionId, "replace:weapon:uwu:drone");
});

test("access cards evolve a level-five weapon with its passive", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "gale" }] });
  const player = sim.players[0];
  player.weapons.signature.level = 5;
  player.passives.crit = 1;
  sim.useAccessCard();
  assert.equal(player.weapons.signature.evolved, true);
  assert.equal(sim.events.at(-1).type, "evolution");
  assert.equal(sim.events.at(-1).title, "Weapon evolved");
  assert.match(sim.events.at(-1).copy, /One:/);
});

test("co-op teammates can revive a downed specialist", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri" },
    { id: "p2", name: "Two", specialist: "sola" },
  ] });
  const [one, two] = sim.players;
  one.invuln = 0;
  sim.takeDamage(one, 100_000);
  assert.equal(one.downed, true);
  two.x = one.x; two.y = one.y;
  for (let i = 0; i < 70; i++) sim.updatePlayers(.05);
  assert.equal(one.downed, false);
  assert.ok(one.hp > 0);
  assert.ok(one.invuln > 0);
  assert.equal(two.revives, 1);
});

test("per-player combat, pickup, and damage stats are credited", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "echo" }] });
  const player = sim.players[0];
  const enemy = sim.spawnEnemy("hound");
  enemy.hp = 25;
  enemy.maxHp = 25;
  sim.damageEnemy(enemy, 40, player.id, false, "uwu");
  assert.equal(player.damage, 25);
  assert.equal(player.damageBySource.uwu, 25);
  assert.equal(player.kills, 1);

  sim.orbs.push({ id: "test-orb", x: player.x, y: player.y, radius: 5, value: 7, color: "#fff", dead: false });
  sim.updatePickups(.016);
  assert.equal(player.xpCollected, 7);

  player.invuln = 0;
  player.hitGrace = 0;
  const attacker = sim.spawnEnemy("hound");
  attacker.x = player.x - 30;
  attacker.y = player.y;
  sim.takeDamage(player, 2, attacker);
  assert.ok(player.damageTaken > 0);
  assert.ok(player.damageTaken <= 2);
  assert.ok(player.hurtFlash > 0);
  assert.ok(player.knockVx > 0);
  assert.ok(attacker.attackFlash > 0);
  assert.equal(player.animState, "hurt");
  assert.ok(player.animTime > 0);
});

test("level-five Echo shields stay on the ten-vitality scale under sustained Story contact", () => {
  const sim = new Simulation(
    { map: "warehouse", difficulty: "story", duration: 240, players: [{ id: "p1", name: "Rookie", specialist: "echo" }] },
    { seed: "81700000000000000000000000000000" },
  );
  sim.level = 5;
  const player = sim.players[0];
  player.invuln = 0;
  player.hitGrace = 0;
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.equal(player.shield, 2.5);

  player.eCd = 0;
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.equal(player.shield, player.maxHp * 0.5, "repeat casts cap at half a health bar");
  player.eCd = 0;
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.equal(player.shield, player.maxHp * 0.5, "the cap cannot be bypassed by rapid recasts");

  const brute = sim.spawnEnemy("mite");
  Object.assign(brute, { x: 0, y: 0, radius: 1_000, speed: 0, hp: 1e12, maxHp: 1e12, attackCd: 0, shotCd: 1e9 });
  let contacts = 0;
  for (let tick = 0; tick < 20 * 20 && sim.stage === "running"; tick++) {
    if (player.eCd <= 0) sim.cast(player.id, "e");
    sim.updatePlayers(0.05);
    player.x = 0; player.y = 0; player.knockVx = 0; player.knockVy = 0;
    brute.x = 0; brute.y = 0;
    const previousCooldown = brute.attackCd;
    sim.updateEnemies(0.05);
    if (brute.attackCd > previousCooldown) contacts++;
  }
  assert.ok(contacts >= 4, `expected repeated contact, received ${contacts} hits`);
  assert.equal(sim.stage, "lost", "a sustained overlapping brute must eventually down Echo");
  assert.ok(player.damageTaken >= player.maxHp, `health damage was ${player.damageTaken}`);
});

test("all repeatable active shields share the bounded vitality-scale contract", () => {
  for (const specialist of ["sola", "gale", "rift"]) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] }, { seed: "81710000000000000000000000000000" });
    sim.level = 5;
    const player = sim.players[0];
    assert.equal(sim.cast(player.id, "e"), true, specialist);
    releasePendingCast(sim);
    assert.ok(player.shield > 0 && player.shield <= player.maxHp * 0.5, `${specialist} shield was ${player.shield}`);
    for (let cast = 0; cast < 5; cast++) { player.eCd = 0; sim.cast(player.id, "e"); }
    assert.ok(player.shield <= player.maxHp * 0.5, `${specialist} repeat shield was ${player.shield}`);
  }
});

test("combat actions expose concise authored animation state", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  sim.shoot(player, 0, 10);
  assert.ok(player.weaponFlash > 0);
  assert.equal(player.recoilAngle, 0);
  sim.level = 3;
  assert.equal(sim.cast(player.id, "e"), true);
  assert.equal(player.animState, "castE");
  assert.ok(player.animTime > 0);
  sim.updatePlayers(.4);
  assert.equal(player.animState, player.moving ? "run" : "idle");
});

test("Nova signature hits apply a mark that level-three Veilstep detonates", () => {
  const sim = new Simulation({ players: [{ id: "nova", name: "Nova", specialist: "nova" }] }, { seed: "83420000000000000000000000000000" });
  sim.level = 3;
  const player = sim.players[0];
  player.invuln = 0;
  const enemy = sim.spawnEnemy("brute");
  Object.assign(enemy, { x: 100, y: 0, hp: 1_000, maxHp: 1_000, speed: 0, hexed: 0 });
  sim.fireSignature(player);
  for (const projectile of sim.projectiles) Object.assign(projectile, { x: enemy.x, y: enemy.y, vx: 0, vy: 0 });
  sim.updateProjectiles(.016);
  assert.equal(enemy.hexed, 8);
  const before = enemy.hp;
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.ok(enemy.hp < before);
  assert.equal(enemy.hexed, 0);
  assert.ok(player.damageBySource["ability:e"] > 0);
});

test("Vesper Blade Recall credits the active ability", () => {
  const sim = new Simulation({ players: [{ id: "vesper", name: "Vesper", specialist: "vesper" }] });
  sim.level = 3;
  const player = sim.players[0];
  sim.feathers.push({ id: "feather", owner: player.id, x: 100, y: 0, radius: 7, life: 15, color: "#fff" });
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.equal(sim.projectiles[0].sourceId, "ability:e");
  const enemy = sim.spawnEnemy("brute");
  Object.assign(enemy, { x: 50, y: 0, hp: 1_000, maxHp: 1_000, speed: 0 });
  Object.assign(sim.projectiles[0], { x: enemy.x, y: enemy.y, vx: 0, vy: 0 });
  sim.updateProjectiles(.016);
  assert.ok(player.damageBySource["ability:e"] > 0);
  assert.equal(player.damageBySource.signature, undefined);
});

test("Vesper recall daggers continuously home to a moving owner and survive recovery", () => {
  const sim = new Simulation({ players: [{ id: "vesper", name: "Vesper", specialist: "vesper", replaySlot: 0 }] });
  sim.level = 3;
  const player = sim.players[0];
  sim.coverObstacles = [];
  sim.pods = [];
  sim.enemies = [];
  sim.feathers.push({ id: "feather", owner: player.id, x: 300, y: 0, radius: 7, life: 15, color: "#fff" });
  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  const recall = sim.projectiles[0];
  assert.equal(recall.recallTarget, player.id);
  assert.equal(recall.recallSpeed, 950);

  Object.assign(player, { x: 0, y: 300 });
  sim.updateProjectiles(.01);
  assert.ok(recall.vx < 0 && recall.vy > 0, "recall should turn toward the owner's new position");
  const firstHeading = Math.atan2(recall.vy, recall.vx);
  Object.assign(player, { x: -300, y: -100 });
  sim.updateProjectiles(.01);
  assert.notEqual(Math.atan2(recall.vy, recall.vx), firstHeading, "recall heading must be recomputed every tick");
  assert.ok(Math.abs(Math.hypot(recall.vx, recall.vy) - 950) < 1e-9);

  const restored = Simulation.fromRecoveryState(sim.exportRecoveryState());
  const restoredRecall = restored.projectiles.find(({ id }) => id === recall.id);
  assert.equal(restoredRecall.recallTarget, restored.players[0].id);
  assert.equal(restoredRecall.recallSpeed, 950);
  assert.doesNotThrow(() => JSON.stringify(restored.snapshot()));
});

test("Nova wisps use the authored hex duration and a distinct damage source", () => {
  const sim = new Simulation({ players: [{ id: "nova", name: "Nova", specialist: "nova" }] });
  const player = sim.players[0];
  sim.level = 7;
  sim.chance = () => true;
  const enemy = sim.spawnEnemy("brute");
  Object.assign(enemy, { x: -70, y: 0, hp: 1_000, maxHp: 1_000, speed: 0, hexed: 0 });
  sim.updatePlayers(.016);
  assert.equal(enemy.hexed, 8);
  assert.ok(player.damageBySource["passive:nova"] > 0);
  assert.equal(player.damageBySource.hex, undefined);
});

test("Vesper's innate pickup reach is visible without consuming passive ranks", () => {
  const sim = new Simulation({ players: [{ id: "vesper", name: "Vesper", specialist: "vesper" }] });
  const player = sim.players[0];
  assert.equal(player.passives.pickup || 0, 0);
  assert.equal(sim.playerStat(player, "pickup"), 384);
  player.passives.pickup = 1;
  assert.equal(sim.playerStat(player, "pickup"), 413.75);
});

test("close-range signatures keep targets in their authored follow-up range", () => {
  for (const specialist of ["fang", "rift"]) {
    const signature = new Simulation({ players: [{ id: specialist, name: specialist, specialist }] });
    const ordinary = new Simulation({ players: [{ id: specialist, name: specialist, specialist }] });
    const signatureTarget = signature.spawnEnemy("brute"), ordinaryTarget = ordinary.spawnEnemy("brute");
    Object.assign(signatureTarget, { x: 80, y: 0, hp: 1_000, maxHp: 1_000, speed: 0, knockVx: 0, knockVy: 0 });
    Object.assign(ordinaryTarget, { x: 80, y: 0, hp: 1_000, maxHp: 1_000, speed: 0, knockVx: 0, knockVy: 0 });
    signature.damageEnemy(signatureTarget, 100, signature.players[0].id, false, "signature");
    ordinary.damageEnemy(ordinaryTarget, 100, ordinary.players[0].id, false, "ability:e");
    assert.ok(Math.hypot(signatureTarget.knockVx, signatureTarget.knockVy) < Math.hypot(ordinaryTarget.knockVx, ordinaryTarget.knockVy) * .3, specialist);
  }
});

test("specialist identity passives affect their native combat paths", () => {
  const fangFull = new Simulation({ players: [{ id: "fang", name: "Fang", specialist: "fang" }] });
  const fangLow = new Simulation({ players: [{ id: "fang", name: "Fang", specialist: "fang" }] });
  const fullTarget = fangFull.spawnEnemy("brute"), lowTarget = fangLow.spawnEnemy("brute");
  Object.assign(fullTarget, { x: 70, y: 0, hp: 5_000, maxHp: 5_000, speed: 0 });
  Object.assign(lowTarget, { x: 70, y: 0, hp: 5_000, maxHp: 5_000, speed: 0 });
  fangLow.players[0].hp = fangLow.players[0].maxHp * .1;
  fangFull.fireSignature(fangFull.players[0]); fangLow.fireSignature(fangLow.players[0]);
  assert.ok((5_000 - lowTarget.hp) > (5_000 - fullTarget.hp) * 1.45, "Fang's low-health damage must amplify Rending Swipe");

  const rift = new Simulation({ players: [{ id: "rift", name: "Rift", specialist: "rift" }] });
  const riftTarget = rift.spawnEnemy("brute");
  Object.assign(riftTarget, { hp: 1_000, maxHp: 1_000, speed: 0 });
  rift.damageEnemy(riftTarget, 100, rift.players[0].id, false, "signature");
  assert.ok(rift.players[0].shield > 0, "Rift converts dealt damage into bounded shield");
  assert.ok(rift.players[0].shield <= rift.players[0].maxHp * .35);
});

test("Rift's damage barrier cannot refresh through sustained incoming contact", () => {
  const sim = new Simulation({ difficulty: "story", players: [{ id: "rift", name: "Rift", specialist: "rift" }] });
  const player = sim.players[0], target = sim.spawnEnemy("brute"), attacker = sim.spawnEnemy("mite");
  Object.assign(target, { hp: 100_000, maxHp: 100_000, speed: 0 });
  Object.assign(attacker, { x: player.x, y: player.y, speed: 0 });
  player.invuln = 0; sim.time = 10;
  sim.damageEnemy(target, 1_000, player.id, false, "signature");
  assert.equal(player.shield, player.maxHp * .35);
  const initialHp = player.hp;
  for (let hit = 0; hit < 20; hit++) {
    player.hitGrace = 0;
    sim.takeDamage(player, attacker.damage * sim.difficulty.attack, attacker);
    sim.time += .8;
    sim.damageEnemy(target, 1_000, player.id, false, "signature");
  }
  assert.ok(player.hp < initialHp, `sustained contact left Rift at ${player.hp}/${initialHp} health`);
  assert.ok(player.damageTaken > 0);
});

test("Zuri hot stacks add speed and Curtain Call executes wounded targets", () => {
  const sim = new Simulation({ players: [{ id: "zuri", name: "Zuri", specialist: "zuri" }] });
  const player = sim.players[0];
  const baseSpeed = sim.playerStat(player, "speed");
  player.hotTime = 8; player.hotStacks = 2;
  assert.ok(sim.playerStat(player, "speed") >= baseSpeed * 1.19);

  const hit = (hp) => {
    const local = new Simulation({ players: [{ id: "zuri", name: "Zuri", specialist: "zuri" }] });
    local.level = 6;
    const enemy = local.spawnEnemy("brute");
    Object.assign(enemy, { x: 50, y: 0, hp, maxHp: 10_000, speed: 0 });
    local.castR(local.players[0]);
    Object.assign(local.projectiles[0], { x: enemy.x, y: enemy.y, vx: 0, vy: 0 });
    const before = enemy.hp;
    local.updateProjectiles(.016);
    return before - enemy.hp;
  };
  assert.ok(hit(5_000) > hit(10_000) * 1.45);
});

test("Echo repeats compatible universal projectiles and Gale Windwall intercepts hostile fire", () => {
  const echo = new Simulation({ players: [{ id: "echo", name: "Echo", specialist: "echo" }] });
  echo.chance = () => true;
  echo.shoot(echo.players[0], 0, 500, 25, { sourceId: "uwu" });
  assert.equal(echo.tasks.at(-1).kind, "echo-projectile-repeat");
  echo.executeTask(echo.tasks.at(-1));
  assert.equal(echo.projectiles.length, 2);

  const gale = new Simulation({ players: [{ id: "gale", name: "Gale", specialist: "gale" }] });
  gale.level = 6;
  gale.castR(gale.players[0]);
  const wall = gale.effects.find((effect) => effect.kind === "windwall");
  gale.hostile.push({ id: "bolt", x: wall.x, y: wall.y, radius: 6, vx: 0, vy: 0, damage: 1, life: 2, dead: false });
  const enemy = gale.spawnEnemy("brute");
  Object.assign(enemy, { x: wall.x + 20, y: wall.y, speed: 0, knockVx: 0, knockVy: 0 });
  gale.updateEffects(.016);
  assert.equal(gale.hostile[0].dead, true);
  assert.ok(Math.hypot(enemy.knockVx, enemy.knockVy) > 0);
});

test("Gale has one authored critical bonus and flow responds to haste and evolution", () => {
  const countShots = ({ evolved = false, hasteRanks = 0 } = {}) => {
    const sim = new Simulation({ players: [{ id: "gale", name: "Gale", specialist: "gale" }] });
    const player = sim.players[0];
    player.passives.haste = hasteRanks;
    player.weapons.signature.evolved = evolved;
    for (let tick = 0; tick < 12 * 60; tick++) {
      sim.updatePlayers(1 / 60);
      sim.updateWeapons(1 / 60);
    }
    return sim.projectiles.length;
  };
  const fresh = new Simulation({ players: [{ id: "gale", name: "Gale", specialist: "gale" }] });
  assert.equal(fresh.playerStat(fresh.players[0], "crit"), .15);
  const base = countShots();
  const haste = countShots({ hasteRanks: 5 });
  const evolved = countShots({ evolved: true });
  const combined = countShots({ evolved: true, hasteRanks: 5 });
  assert.ok(haste > base);
  assert.ok(evolved > base);
  assert.ok(combined > haste && combined > evolved);
});

test("Sola's relative armor buff and delayed shield obey the active shield cap", () => {
  const sim = new Simulation({ players: [{ id: "sola", name: "Sola", specialist: "sola" }] });
  sim.level = 3;
  const player = sim.players[0];
  player.armor = 41;
  sim.castE(player);
  assert.equal(player.armor, 82);
  const detonation = sim.tasks.find((task) => task.kind === "sola-detonate");
  sim.executeTask(detonation);
  assert.equal(player.armor, 41);
  assert.ok(player.shield <= player.maxHp * .5);
});

test("area attacks damage supply caches", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "fang" }] });
  const player = sim.players[0];
  sim.pods = [{ id: "cache", x: 75, y: 0, radius: 25, hp: 100, kind: "pressure", dead: false }];
  sim.blast(0, 0, 90, 120, player.id, "#fff", true, "slash", "signature");
  assert.equal(sim.pods[0].dead, true);
  assert.equal(sim.drops.length, 1);
  assert.deepEqual(sim.effects.find((effect) => effect.kind === "containerBreak") && {
    kind: sim.effects.find((effect) => effect.kind === "containerBreak").containerKind,
    mapId: sim.effects.find((effect) => effect.kind === "containerBreak").mapId,
  }, { kind: "pressure", mapId: "warehouse" });
});

test("raised cover blocks movement and long dashes", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "gale" }] });
  const player = sim.players[0];
  player.x = -720; player.y = 320;
  sim.movePlayer(player, 180, 0);
  assert.ok(player.x <= -670, `player stopped at ${player.x}`);
  const before = player.x;
  sim.dashPlayer(player, 0, 475);
  assert.ok(player.x <= -670);
  assert.ok(player.x >= before);
});

test("data vacuum visibly attracts motes before collecting them", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  sim.orbs = [{ id: "far-data", x: 500, y: 0, radius: 5, value: 10, color: "#fff", dead: false }];
  sim.drops = [{ id: "vacuum", type: "vacuum", x: player.x, y: player.y, radius: 15 }];
  sim.updatePickups(.016);
  assert.equal(sim.orbs[0].dead, false);
  assert.equal(sim.orbs[0].vacuumTarget, player.id);
  assert.equal(player.xpCollected, 0);
  for (let i = 0; i < 100 && !sim.orbs[0].dead; i++) sim.updatePickups(.016);
  assert.equal(sim.orbs[0].dead, true);
  assert.equal(player.xpCollected, 10);
});

test("apex attacks acquire a locked, readable intent before dealing damage", () => {
  const sim = new Simulation({ difficulty: "story", players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  player.invuln = 0; player.hitGrace = 0;
  sim.spawnBoss();
  const boss = sim.enemies.find((enemy) => enemy.boss);
  boss.apexReadyTick = sim.tick;
  sim.updateBoss(boss, .016, [player]);
  assert.equal(boss.apexActionState, "windup");
  assert.ok(boss.apexActionUntilTick > sim.tick);
  assert.ok(boss.apexGeometry && Number.isFinite(boss.apexGeometry.originX));
  assert.deepEqual(boss.apexTargetIds, [player.id]);
});

test("treasure runners pay out bonus cards, gold, and data when caught", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  const goldBefore = sim.gold;
  sim.spawnTreasureRunner();
  const runner = sim.enemies.find((enemy) => enemy.eventType === "treasure");
  assert.ok(runner);
  sim.damageEnemy(runner, runner.hp + 1, player.id);
  assert.equal(runner.dead, true);
  assert.ok(sim.gold > goldBefore);
  assert.ok(sim.teamXP >= sim.xpNeed);
  assert.ok(sim.drops.filter((drop) => drop.type === "card").length >= 2);
});

test("relay balls reward the squad when pushed into the destination ring", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "sola" }] });
  const goldBefore = sim.gold;
  sim.spawnRelayBall();
  const ball = sim.relayBalls[0];
  ball.x = ball.targetX;
  ball.y = ball.targetY;
  sim.updateRelayBalls(.016);
  assert.equal(ball.done, true);
  assert.ok(sim.gold > goldBefore);
  assert.ok(sim.teamXP > 0);
  assert.ok(sim.drops.some((drop) => drop.type === "card"));
});

test("difficulty tiers materially increase pressure and enemy lethality", () => {
  const config = { players: [{ id: "p1", name: "One", specialist: "echo" }] };
  const story = new Simulation({ ...config, difficulty: "story" });
  const hard = new Simulation({ ...config, difficulty: "hard" });
  const extreme = new Simulation({ ...config, difficulty: "extreme" });
  const storyEnemy = story.spawnEnemy("mite");
  const hardEnemy = hard.spawnEnemy("mite");
  const extremeEnemy = extreme.spawnEnemy("mite");
  assert.ok(storyEnemy.hp > 42, "Story should no longer use the base training health");
  assert.ok(hardEnemy.hp > storyEnemy.hp * 2);
  assert.ok(extremeEnemy.hp > hardEnemy.hp * 1.7);
  assert.ok(hardEnemy.damage > storyEnemy.damage);
  assert.ok(extremeEnemy.damage > hardEnemy.damage);
  assert.ok(storyEnemy.damage >= .9, "Even the lightest Story contact should cost about one of ten vitality points");
  assert.ok(story.difficulty.spawn < 1, "Story should trade a slightly smaller opening horde for more dangerous hits");
  assert.ok(hard.difficulty.spawn > story.difficulty.spawn);
  assert.ok(extreme.difficulty.spawn > hard.difficulty.spawn);
});

test("cursor-directed mobility ignores weapon auto-aim", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "gale" }] });
  const player = sim.players[0];
  sim.level = 3;
  const enemy = sim.spawnEnemy("hound");
  enemy.x = player.x - 300;
  enemy.y = player.y;
  sim.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: true });
  const startX = player.x, startY = player.y;

  assert.equal(sim.cast(player.id, "e"), true);
  releasePendingCast(sim);
  assert.equal(player.eCdMax, player.eCd);
  assert.ok(player.x > startX + 450, "dash should move right toward the cursor, not left toward the auto-aim target");
  assert.ok(Math.abs(player.y - startY) < .001);
});

test("Yuum.AI is a persistent, scaling combat and collection companion", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  player.weapons.drone = { level: 3, evolved: false };
  sim.updateDrones(.016);
  const drone = sim.drones[0];
  assert.ok(drone);
  assert.equal(drone.owner, player.id);
  assert.equal(drone.level, 3);

  const enemy = sim.spawnEnemy("hound");
  enemy.x = drone.x + 240;
  enemy.y = drone.y;
  sim.projectiles = [];
  const levelThreeCooldown = sim.fireCommonWeapon(player, "drone", player.weapons.drone);
  assert.equal(sim.projectiles.length, 2, "rank three adds a second autonomous pulse");
  assert.ok(sim.projectiles.every((projectile) => projectile.droneBolt));
  assert.ok(sim.projectiles.every((projectile) => Math.hypot(projectile.x - drone.x, projectile.y - drone.y) < 40));
  assert.ok(drone.fireFlash > 0);

  sim.orbs.push({ id: "drone-data", x: drone.x, y: drone.y, radius: 5, value: 3, color: "#fff", dead: false });
  sim.updatePickups(.016);
  assert.equal(player.xpCollected, 3);
  assert.ok(drone.collectFlash > 0);

  drone.repairClock = 0;
  sim.updateDrones(.016);
  assert.ok(sim.drops.some((drop) => drop.type === "heal" && drop.source === "drone"));
  assert.ok(drone.repairFlash > 0);

  player.weapons.drone.level = 5;
  sim.updateDrones(.016);
  sim.projectiles = [];
  const levelFiveCooldown = sim.fireCommonWeapon(player, "drone", player.weapons.drone);
  assert.equal(sim.projectiles.length, 3, "rank five adds a third autonomous pulse");
  assert.ok(levelFiveCooldown < levelThreeCooldown);
  assert.equal(sim.snapshot().drones[0].level, 5);
});

test("weapon upgrade choices carry their generated artwork", () => {
  const sim = new Simulation(
    { players: [{ id: "p1", name: "One", specialist: "zuri" }] },
    { seed: "0123456789abcdef0123456789abcdef" },
  );
  const choices = sim.generateChoices(sim.players[0]);
  const weaponChoices = choices.filter((choice) => choice.kind === "weapon");
  assert.ok(weaponChoices.length > 0);
  for (const choice of weaponChoices) assert.match(choice.icon, /^assets\/weapons\/.+\.webp$/);
  const passiveChoices = choices.filter((choice) => choice.kind === "passive");
  for (const choice of passiveChoices) assert.match(choice.icon, /^assets\/guide\/passives\/.+\.webp$/);
});

test("player vitality uses a readable ten-point baseline", () => {
  const sim = new Simulation({ difficulty: "story", players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0], bomber = sim.spawnEnemy("bomber");
  assert.equal(player.maxHp, 10);
  assert.ok(bomber.damage >= player.maxHp * .49 && bomber.damage <= player.maxHp * .51, `bomber dealt ${bomber.damage}`);
});

test("a persistent browser identity can reconnect with its run progress", () => {
  const resumeToken = "a".repeat(24);
  const sim = new Simulation({ players: [{ id: "old", name: "One", specialist: "echo", resumeToken }] });
  const original = sim.players[0];
  original.weapons.signature.level = 4; original.damage = 321; original.hp = 3;
  sim.removePlayer("old");
  const restored = sim.addPlayer({ id: "new", name: "Renamed", specialist: "zuri", resumeToken });
  assert.equal(restored.id, "new");
  assert.equal(restored.specialist, "echo");
  assert.equal(restored.weapons.signature.level, 4);
  assert.equal(restored.damage, 321);
  assert.equal(restored.reconnected, true);
  assert.ok(restored.hp >= restored.maxHp * .5);
});

test("a relay-owned anonymous replay slot reconnects without exposing a browser token", () => {
  const sim = new Simulation({ players: [{ id: "old", name: "One", specialist: "echo", replaySlot: 2, reconnectSlot: "migration-slot-2" }] });
  const original = sim.players[0]; original.weapons.signature.level = 4; original.hp = 3;
  sim.removePlayer("old");
  const restored = sim.addPlayer({ id: "new", name: "Renamed", specialist: "zuri", replaySlot: 2, reconnectSlot: "migration-slot-2" });
  assert.equal(restored, original);
  assert.equal(restored.id, "new");
  assert.equal(restored.weapons.signature.level, 4);
  assert.equal(restored.reconnectKey, "migration-slot-2");
  assert.equal(restored.reconnected, true);
  assert.doesNotMatch(JSON.stringify(sim.exportRecoveryState()), /resumeToken|reconnectKey|migration-slot/);
});

test("duplicate callsigns do not steal another browser's reconnect slot", () => {
  const sim = new Simulation({ players: [{ id: "old", name: "Rookie", specialist: "echo", resumeToken: "a".repeat(24) }] });
  sim.players[0].damage = 321; sim.removePlayer("old");
  const newcomer = sim.addPlayer({ id: "new", name: "Rookie", specialist: "zuri", resumeToken: "b".repeat(24) });
  assert.equal(newcomer.specialist, "zuri");
  assert.equal(newcomer.damage, 0);
  assert.equal(newcomer.reconnected, undefined);
});

test("cosmetic combat effects are bounded without dropping active fields", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "echo" }] });
  const field = { id: "field", x: 0, y: 0, radius: 50, life: 5, maxLife: 5, damage: 20, owner: "p1", color: "#fff", kind: "totem", hit: new Set() };
  sim.effects.push(field);
  for (let i = 0; i < 300; i++) sim.effects.push({ id: `cosmetic-${i}`, x: 0, y: 0, radius: 10, life: 1, maxLife: 1, damage: 0, kind: "pop" });
  sim.cleanup();
  assert.ok(sim.effects.includes(field));
  assert.ok(sim.effects.length <= 260);

  sim.effects = Array.from({ length: 300 }, (_, index) => ({ id: `number-${index}`, x: 0, y: 0, radius: 0, life: 1, maxLife: 1, damage: index + 1, kind: "number" }));
  sim.cleanup();
  assert.equal(sim.effects.length, 260, "damage-number labels should obey the cosmetic effect budget");
});
