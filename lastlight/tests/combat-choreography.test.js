import test from "node:test";
import assert from "node:assert/strict";
import { abilityChoreography, castMotionPlan, choreographyAuditRows, combatDensityPlan } from "../combat-choreography.js";
import { runCombatChoreographyAudit } from "../combat-choreography-audit.js";
import { Simulation } from "../engine.js";

test("all eighteen specialist abilities own bounded authored choreography", () => {
  const rows = choreographyAuditRows();
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows.map(({ specialist, slot }) => `${specialist}:${slot}`)).size, 18);
  for (const row of rows) {
    assert.ok(row.anticipationTicks >= 2 && row.anticipationTicks <= 6, `${row.specialist}:${row.slot}`);
    assert.ok(row.recoveryTicks >= 15 && row.recoveryTicks <= 28, `${row.specialist}:${row.slot}`);
  }
});

test("accepted casts release gameplay and audio metadata on the authored contact tick", () => {
  for (const specialist of choreographyAuditRows().filter(({ slot }) => slot === "e").map(({ specialist }) => specialist)) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] });
    sim.level = 6;
    const player = sim.players[0], plan = abilityChoreography(specialist, "e");
    assert.equal(sim.cast(player.id, "e"), true, specialist);
    assert.equal(sim.events.some(({ type }) => type === "cast"), false, specialist);
    const task = sim.tasks.find(({ kind }) => kind === "player-cast-release");
    assert.equal(task.dueTick, plan.anticipationTicks, specialist);
    sim.tick = task.dueTick; sim.updateTasks();
    const event = sim.events.find(({ type }) => type === "cast");
    assert.deepEqual({ specialistId: event.specialistId, slot: event.slot, family: event.family }, { specialistId: specialist, slot: "e", family: plan.family });
    assert.equal(player.castContactTick, sim.tick);
  }
});

test("different ability slots may overlap windups without consuming either release", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  sim.level = 6;
  assert.equal(sim.cast("p", "e"), true);
  assert.equal(sim.cast("p", "r"), true);
  assert.equal(sim.tasks.filter(({ kind }) => kind === "player-cast-release").length, 2);
  for (const task of [...sim.tasks].sort((left, right) => left.dueTick - right.dueTick)) {
    sim.tick = task.dueTick; sim.updateTasks();
  }
  assert.deepEqual(sim.events.filter(({ type }) => type === "cast").map(({ slot }) => slot), ["e", "r"]);
});

test("reduced motion preserves phase information while removing displacement", () => {
  const player = { specialist: "fang", castSlot: "r", castStartedTick: 10, castContactTick: 13, castRecoveryUntilTick: 36 };
  const plan = castMotionPlan(player, 13, { reducedMotion: true });
  assert.equal(plan.phase, "contact");
  assert.deepEqual({ x: plan.translateX, y: plan.translateY, rotation: plan.rotation, scaleX: plan.scaleX, scaleY: plan.scaleY }, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
});

test("density suppression removes decorative pressure without hiding combat", () => {
  const plan = combatDensityPlan({ enemies: Array(80), projectiles: Array(600), hostile: Array(200), effects: Array(300) }, 1);
  assert.equal(plan.saturated, true);
  assert.ok(plan.cosmeticDensity >= .25 && plan.cosmeticDensity < .5);
});

test("deterministic choreography audit passes every contract", () => {
  const report = runCombatChoreographyAudit();
  assert.equal(report.passed, report.total);
});
