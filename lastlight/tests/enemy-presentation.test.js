import test from "node:test";
import assert from "node:assert/strict";
import { settingsForPreset } from "../quality-settings.js";

globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
};
globalThis.Image = class {
  complete = false;
  naturalWidth = 0;
  set src(value) { this.currentSrc = value; }
};

const { Renderer } = await import("../render.js?enemy-presentation-tests");

function recordingRenderer() {
  const calls = [];
  const context = new Proxy({
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    measureText: () => ({ width: 0 }),
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([String(key), ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = {
    clientWidth: 800, clientHeight: 600, width: 0, height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  return { renderer: new Renderer(canvas), calls };
}

test("authoritative enemy intent remains visible when minimal sprite budgets omit its owner", () => {
  const { renderer, calls } = recordingRenderer();
  renderer.setQualitySettings(settingsForPreset("minimal"));
  const enemies = [
    { id: "ordinary-0", type: "mite", x: -30, y: 0, radius: 19, behaviorState: { phase: "acquire", handlerId: "swarm-contact-v1" } },
    { id: "charge-1", type: "hound", x: 0, y: 0, radius: 24, attackAngle: 0, behaviorState: { phase: "windup", handlerId: "charge-v1" }, behaviorStartedTick: 10, behaviorUntilTick: 40 },
  ];
  const before = structuredClone(enemies);
  const spriteSelection = renderer.budget(enemies, 1);
  assert.equal(spriteSelection.some(({ id }) => id === "charge-1"), false, "fixture must omit the telegraph owner from the sprite pass");

  renderer.drawEnemyBehaviorTelegraphs(enemies, null, 1, { tick: 25 });

  assert.ok(calls.some(([name]) => name === "stroke"), "essential intent draws independently of effect density");
  assert.ok(calls.some(([name, dash]) => name === "setLineDash" && Array.isArray(dash) && dash.length), "intent includes a non-color lane pattern");
  assert.deepEqual(enemies, before, "presentation never mutates authoritative enemies");
});

test("volatile affix windups draw under reduced motion even while archetype behavior is acquiring", () => {
  const { renderer, calls } = recordingRenderer();
  renderer.setQualitySettings(settingsForPreset("minimal"));
  const enemy = {
    id: "volatile-elite", type: "brute", x: 0, y: 0, radius: 36, elite: true,
    behaviorState: { phase: "acquire", handlerId: "slam-v1" },
    affixIds: ["volatile"], affixState: { volatile: { phase: "windup", startedTick: 50, untilTick: 83 } },
  };
  renderer.drawEnemyBehaviorTelegraphs([enemy], null, 1, { tick: 60 });
  assert.ok(calls.filter(([name]) => name === "arc").length >= 2, "volatile warning retains its toothed ring and countdown arc");
  assert.ok(calls.some(([name]) => name === "fill"), "warning retains a static threat footprint");
});

test("elite affix badges use stable patterns and expose behavior through inspection", () => {
  const { renderer, calls } = recordingRenderer();
  renderer.drawEnemyAffixBadges({ affixIds: ["hasted", "shielded", "volatile"] }, -45);
  assert.equal(calls.filter(([name]) => name === "strokeRect").length, 3);
  assert.ok(calls.filter(([name]) => name === "arc").length >= 1, "volatile has a ring pattern");
  assert.ok(calls.filter(([name]) => name === "lineTo").length >= 6, "hasted and shielded have shape cues independent of color");

  renderer.camera.x = 0; renderer.camera.y = 0;
  const result = renderer.inspectAt(400, 300, {
    map: "warehouse", machine: { charge: 0, cooldown: 0 },
    enemies: [{
      id: "elite-1", type: "hound", x: 0, y: 0, radius: 24, hp: 80, maxHp: 100, damage: 2, speed: 132, elite: true,
      behaviorState: { phase: "windup", handlerId: "charge-v1" }, behaviorStartedTick: 1, behaviorUntilTick: 31,
      affixIds: ["hasted", "shielded"], affixState: { shielded: { barrier: 30 } },
    }],
    drops: [], orbs: [], pods: [], objectives: [], relayBalls: [], drones: [], projectiles: [], hostile: [], effects: [],
  });
  assert.equal(result.name, "Hasted Shielded Rusher");
  assert.equal(result.stats.Intent, "Charge windup");
  assert.equal(result.stats.Affixes, "Hasted · Shielded");
  assert.equal(result.stats.Barrier, 30);
  assert.match(result.description, /Current intent: Charge windup/);
});

test("committed charge geometry, facing, and shield meter remain authoritative", () => {
  const { renderer, calls } = recordingRenderer();
  const charge = {
    id: "charge", type: "hound", x: 30, y: 0, radius: 24, hp: 80, maxHp: 100, damage: 2, speed: 132,
    behaviorState: "charge", behaviorStartedTick: 10, behaviorUntilTick: 40, attackAngle: 0,
    behaviorEndX: 70, behaviorEndY: 0, behaviorRange: 132, affixIds: ["shielded"], affixState: { shield: 25 },
  };
  renderer.drawEnemyBehaviorTelegraphs([charge], null, 1, { tick: 25, effects: [] });
  assert.ok(calls.some(([name, x]) => name === "lineTo" && Math.abs(Number(x) - 40) < .001), "active lane ends at the fixed remaining endpoint");

  let bar = null;
  renderer.drawSegmentedHealthBar = (options) => { bar = options; };
  renderer.drawEnemies([charge], null, 1, { id: "warehouse", accent: "#fff" }, [{ id: "p", x: 30, y: -200, radius: 18, dead: false, downed: false }]);
  assert.equal(renderer.enemyVisuals.get("charge").aimFacing, 0, "sprite faces its locked committed lane rather than the moving target");
  assert.equal(bar.shield, 25, "enemy health presentation exposes the remaining barrier");
});
