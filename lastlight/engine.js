import {
  SPECIALISTS, PASSIVES, WEAPONS, MAPS, DIFFICULTIES, ENEMY_TYPES,
  WAVE_NAMES, BOONS, MAP_OBSTACLES, clamp, distance,
} from "./data.js?v=20260711.8";
import { BALANCE_HASH, BALANCE_VERSION, getBalanceConfig, valueAtLevel } from "./balance-config.js?v=20260711.8";
import { createRandomSeed, SeededRng } from "./rng.js?v=20260711.5";
import { gameplayFeatureContract, validateGameplayFeatureContract } from "./feature-config.js?v=20260711.5";
import { advancePlayerMovement, beginDashRecovery, ensureMovementState, resetPlayerMovement } from "./movement.js?v=20260711.8";

const BALANCE = getBalanceConfig();

const TAU = Math.PI * 2;
const WORLD = { width: 3600, height: 2400 };
export const SIMULATION_TICK_RATE = 60;
const RECONNECT_WINDOW_TICKS = 180 * SIMULATION_TICK_RATE;

function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function fromAngle(angle, speed) { return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }; }
function circleHit(a, b, pad = 0) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (a.radius + b.radius + pad) ** 2; }
function replaySlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot <= 3 ? slot : undefined;
}
function compactPoint(e) {
  const result = {};
  for (const [key, value] of Object.entries(e)) {
    result[key] = typeof value === "number" ? Math.round(value * 10) / 10 : value;
  }
  return result;
}

const RECOVERY_STATE_VERSION = 1;
const RECOVERY_SCALARS = [
  "tick", "time", "remaining", "stage", "paused", "pauseReason", "wave", "teamXP", "level", "xpNeed", "kills", "gold",
  "spawnClock", "nextElite", "nextMiniBoss", "nextTreasure", "nextRelayBall", "objectiveIndex", "bossElapsed", "bossPhase", "enraged",
];
const RECOVERY_LIST_LIMITS = Object.freeze({
  drones: 32, enemies: 5_000, projectiles: 8_000, hostile: 8_000, effects: 4_000, orbs: 8_000, drops: 1_000,
  pods: 256, objectives: 64, relayBalls: 32, tasks: 1_000, feathers: 4_000,
});

function serializeRecoveryValue(value, playerIds) {
  if (value instanceof Set) return { $set: [...value].map((entry) => serializeRecoveryValue(entry, playerIds)) };
  if (Array.isArray(value)) return value.map((entry) => serializeRecoveryValue(entry, playerIds));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeRecoveryValue(entry, playerIds)]));
  }
  if (typeof value === "string" && playerIds.has(value)) return playerIds.get(value);
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Recovery state contains a non-finite number");
  return value;
}

function deserializeRecoveryValue(value) {
  if (Array.isArray(value)) return value.map(deserializeRecoveryValue);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && Array.isArray(value.$set)) return new Set(value.$set.map(deserializeRecoveryValue));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deserializeRecoveryValue(entry)]));
  }
  return value;
}

function recoveryRecord(value, playerIds) {
  if (value === null) return null;
  const result = {};
  for (const [key, entry] of Object.entries(value || {})) result[playerIds.get(key) || key] = serializeRecoveryValue(entry, playerIds);
  return result;
}

export function collidesWithCover(x, y, radius) {
  for (const [left, top, width, height] of MAP_OBSTACLES) {
    const nearestX = clamp(x, left, left + width), nearestY = clamp(y, top, top + height);
    if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2) return true;
  }
  return false;
}

export function segmentCoverImpact(startX, startY, endX, endY, radius = 0, obstacles = MAP_OBSTACLES) {
  const dx = endX - startX, dy = endY - startY, padding = Math.max(0, Number(radius) || 0);
  let earliest = null;
  for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
    const [left, top, width, height] = obstacles[obstacleIndex];
    const bounds = [left - padding, top - padding, left + width + padding, top + height + padding];
    let entry = 0, exit = 1, valid = true;
    for (const [origin, delta, minimum, maximum] of [[startX, dx, bounds[0], bounds[2]], [startY, dy, bounds[1], bounds[3]]]) {
      if (Math.abs(delta) < 1e-9) { if (origin < minimum || origin > maximum) valid = false; continue; }
      const first = (minimum - origin) / delta, second = (maximum - origin) / delta;
      entry = Math.max(entry, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
      if (entry > exit) { valid = false; break; }
    }
    if (!valid || exit < 0 || entry > 1) continue;
    const t = clamp(entry, 0, 1);
    if (!earliest || t < earliest.t) earliest = { t, obstacleIndex, x: startX + dx * t, y: startY + dy * t };
  }
  return earliest;
}

export function projectileBlockedByCover(projectile, hostile = false) {
  if (!projectile || projectile.coverPiercing) return false;
  if (hostile && projectile.bossShot) return false;
  return hostile || projectile.sourceId !== "rail";
}

export function moveEntityWithCover(entity, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 18));
  for (let step = 0; step < steps; step++) {
    const nextX = clamp(entity.x + dx / steps, -WORLD.width / 2 + 40, WORLD.width / 2 - 40);
    if (!collidesWithCover(nextX, entity.y, entity.radius)) entity.x = nextX;
    const nextY = clamp(entity.y + dy / steps, -WORLD.height / 2 + 40, WORLD.height / 2 - 40);
    if (!collidesWithCover(entity.x, nextY, entity.radius)) entity.y = nextY;
  }
  return entity;
}

export function playerMovementSpeed(player) {
  let value = player.baseSpeed * (1 + Number(player.passives?.move || 0) * BALANCE.passives.move.amount);
  if (player.specialist === "fang") value *= 1 + (1 - player.hp / player.maxHp);
  if (player.specialist === "rift") value *= 1 + Number(player.weapons?.signature?.level || 1) * .05;
  if (player.specialist === "zuri" && player.hotTime > 0) {
    const tuning = BALANCE.identityTuning.zuri;
    value *= 1 + Math.min(Number(player.hotStacks || 0), tuning.maxHotStacks) * tuning.speedPerHotStack;
  }
  if (player.speedBuff > 0) value *= 2;
  return value;
}

export function playerCombatStat(player, stat) {
  const lvl = (key) => Number(player.passives?.[key] || 0);
  if (stat === "damage") {
    let value = 1 + lvl("damage") * BALANCE.passives.damage.amount;
    if (player.specialist === "fang") value *= 1 + (1 - player.hp / player.maxHp) * BALANCE.identityTuning.fang.missingHealthDamageBonus;
    if (player.specialist === "rift") value *= 1.1;
    if (player.hotTime > 0) value *= 1.18;
    return value;
  }
  if (stat === "haste") return lvl("haste") * BALANCE.passives.haste.amount + (player.hotTime > 0 ? 150 : 0) + (player.hasteBuff > 0 ? 150 : 0) + (player.frenzy > 0 ? 250 : 0);
  if (stat === "speed") return playerMovementSpeed(player);
  if (stat === "area") {
    let value = 1 + lvl("area") * BALANCE.passives.area.amount;
    if (player.specialist === "sola") value += player.armor * .003 + player.maxHp * .001 + lvl("regen") * .003;
    return value;
  }
  if (stat === "crit") return lvl("crit") * BALANCE.passives.crit.amount + (player.specialist === "gale" ? .15 : 0);
  if (stat === "duration") return 1 + lvl("duration") * BALANCE.passives.duration.amount;
  if (stat === "projectiles") return Math.floor(lvl("projectiles"));
  if (stat === "pickup") return 85 * (1 + lvl("pickup") * BALANCE.passives.pickup.amount);
  if (stat === "regen") return lvl("regen") * BALANCE.passives.regen.amount;
  if (stat === "xp") return 1 + lvl("xp") * BALANCE.passives.xp.amount;
  return 1;
}

export function applyPlayerUpgrade(player, choice) {
  const [kind, target] = String(choice?.id || "").split(":");
  if (kind === "weapon") {
    if (target === "signature") player.weapons.signature.level = Math.min(BALANCE.core.maxWeaponLevel, player.weapons.signature.level + 1);
    else if (player.weapons[target]) player.weapons[target].level = Math.min(BALANCE.core.maxWeaponLevel, player.weapons[target].level + 1);
    else player.weapons[target] = { level: 1, evolved: false };
  } else if (kind === "passive") {
    player.passives[target] = Math.floor(Number(player.passives[target] || 0)) + 1;
    if (target === "maxHealth") { player.maxHp += BALANCE.passives.maxHealth.amount; player.hp += BALANCE.passives.maxHealth.amount; }
    if (target === "armor") player.armor += BALANCE.passives.armor.amount;
  } else if (choice?.id === "heal") player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .25);
  return player;
}

export function previewPlayerUpgrade(player, choice) {
  const preview = {
    ...player,
    weapons: Object.fromEntries(Object.entries(player.weapons || {}).map(([id, weapon]) => [id, { ...weapon }])),
    passives: { ...(player.passives || {}) },
  };
  return applyPlayerUpgrade(preview, choice);
}

export class Simulation {
  constructor(config = {}, options = {}) {
    const balanceVersion = options.balanceVersion ?? config.balanceVersion ?? BALANCE_VERSION;
    const balanceHash = options.balanceHash ?? config.balanceHash ?? BALANCE_HASH;
    if (balanceVersion !== BALANCE_VERSION) throw new RangeError(`Unsupported balance version: ${balanceVersion}`);
    if (balanceHash !== BALANCE_HASH) throw new RangeError(`Unsupported balance hash: ${balanceHash}`);
    const features = validateGameplayFeatureContract(options.features ?? config.features ?? gameplayFeatureContract());
    this.seed = options.seed ?? config.seed ?? createRandomSeed();
    const rootRng = SeededRng.fromHex(this.seed);
    this.gameplayRng = rootRng.fork("gameplay");
    this.cosmeticRng = rootRng.fork("cosmetic");
    this.tick = 0;
    this.gameplaySequence = 1;
    this.cosmeticSequence = 1;
    this.eventSequence = 1;
    this.map = MAPS[config.map] || MAPS.warehouse;
    this.difficulty = DIFFICULTIES[config.difficulty] || DIFFICULTIES.story;
    this.balanceVersion = BALANCE_VERSION;
    this.balanceHash = BALANCE_HASH;
    this.gameplayVersion = features.gameplayVersion;
    this.objectiveEvents = features.objectiveEvents;
    this.duration = Number(config.duration) || BALANCE.core.defaultDurationSeconds;
    this.time = 0;
    this.remaining = this.duration;
    this.stage = "running";
    this.paused = false;
    this.pauseReason = "";
    this.wave = 0;
    this.teamXP = 0;
    this.level = BALANCE.core.startingLevel;
    this.xpNeed = BALANCE.core.startingXpNeed;
    this.kills = 0;
    this.gold = 0;
    this.spawnClock = 0;
    const events = BALANCE.waves.events;
    this.nextElite = this.duration * events.firstEliteAt;
    this.nextMiniBoss = this.duration * events.firstMinibossAt;
    this.nextTreasure = Math.max(events.treasureFirstMin, Math.min(events.treasureFirstMax, this.duration * events.treasureFirstAt));
    this.nextRelayBall = Math.max(events.relayFirstMin, Math.min(events.relayFirstMax, this.duration * events.relayFirstAt));
    this.objectiveIndex = 0;
    this.pendingChoices = null;
    this.choiceReady = {};
    this.selectedChoices = {};
    this.events = [];
    this.players = [];
    this.disconnectedPlayers = new Map();
    this.drones = [];
    this.enemies = [];
    this.projectiles = [];
    this.hostile = [];
    this.effects = [];
    this.orbs = [];
    this.drops = [];
    this.pods = [];
    this.objectives = [];
    this.relayBalls = [];
    this.tasks = [];
    this.feathers = [];
    this.machine = { x: 0, y: 0, charge: 0, cooldown: 0, active: 0 };
    this.bossElapsed = 0;
    this.bossPhase = 1;
    this.enraged = false;

    const players = config.players?.length ? config.players : [{ id: "solo", name: "Rookie", specialist: "zuri" }];
    players.forEach((p, index) => this.addPlayer(p, index));
    this.seedPods();
    this.pushEvent("directive", `Survive ${Math.round(this.duration / 60)} minutes`, "The breach is open");
  }

  nextGameplayId(prefix = "e") { return `${prefix}${this.gameplaySequence++}`; }
  nextCosmeticId(prefix = "fx") { return `${prefix}c${this.cosmeticSequence++}`; }
  random(min, max) { return this.gameplayRng.float(min, max); }
  pick(list) { return list.length ? this.gameplayRng.pick(list) : undefined; }
  chance(probability) { return this.gameplayRng.nextFloat() < probability; }
  cosmeticChance(probability) { return this.cosmeticRng.nextFloat() < probability; }
  secondsToTicks(seconds) { return Math.max(1, Math.round(seconds * SIMULATION_TICK_RATE)); }

  scheduleTask(kind, delaySeconds, payload) {
    const task = { id: this.nextGameplayId("task"), dueTick: this.tick + this.secondsToTicks(delaySeconds), kind, payload: { ...payload } };
    this.tasks.push(task);
    return task;
  }

  addPlayer(info, index = this.players.length) {
    const existing = this.players.find((player) => player.id === info.id);
    if (existing) return existing;
    const spec = SPECIALISTS[info.specialist] || SPECIALISTS.zuri;
    const recoveryKey = /^[a-f0-9]{24,32}$/.test(String(info.resumeToken || "")) ? String(info.resumeToken) : "";
    const recovery = recoveryKey ? this.disconnectedPlayers.get(recoveryKey) : null;
    if (recovery && this.tick - recovery.leftTick <= RECONNECT_WINDOW_TICKS) {
      const player = recovery.player, oldId = player.id;
      player.id = info.id; player.name = String(info.name || player.name).slice(0, 16);
      if (player.replaySlot === undefined) player.replaySlot = replaySlot(info.replaySlot);
      player.input = { x: 0, y: 0, aim: player.facing || 0, autoAim: true };
      resetPlayerMovement(player);
      player.dead = false; player.downed = false; player.downTimer = 0; player.reviveProgress = 0;
      player.hp = Math.max(player.hp, player.maxHp * .5); player.invuln = 3; player.reconnected = true;
      for (const list of [this.projectiles, this.effects, this.feathers, this.drones]) {
        for (const entity of list) if (entity.owner === oldId) entity.owner = player.id;
      }
      this.disconnectedPlayers.delete(recoveryKey);
      this.players.push(player);
      if (this.pendingChoices) {
        this.pendingChoices[player.id] = this.generateChoices(player);
        this.choiceReady[player.id] = false;
      }
      return player;
    }
    const angle = (index / Math.max(1, 4)) * TAU;
    const player = {
      id: info.id, name: String(info.name || "Rookie").slice(0, 16), specialist: spec.id,
      replaySlot: replaySlot(info.replaySlot),
      reconnectKey: recoveryKey,
      x: Math.cos(angle) * 75, y: Math.sin(angle) * 75, radius: 31,
      hp: spec.health, maxHp: spec.health, armor: spec.armor, baseSpeed: spec.speed,
      input: { x: 0, y: 0, aim: 0, autoAim: true },
      facing: 0, aimFacing: 0, movementFacing: 0, dashFacing: 0, moving: false,
      moveVx: 0, moveVy: 0, moveInputX: 0, moveInputY: 0, moveSpeedRatio: 0, movementMode: "idle", dashRecovery: 0,
      animState: "idle", animTime: 0, weaponFlash: 0, recoilAngle: 0, skidTime: 0,
      eCd: 0, eCdMax: 0, rCd: 0, rCdMax: 0, shield: 0, invuln: 2, hitGrace: 0, hurtFlash: 0, hurtAngle: 0, knockVx: 0, knockVy: 0, frenzy: 0, hasteBuff: 0, speedBuff: 0,
      dead: false, downed: false, downTimer: 0, respawnTimer: 0, reviveProgress: 0, deaths: 0,
      weaponTimers: {}, weapons: { signature: { level: 1, evolved: false } }, passives: {},
      flow: 0, charge: 0, spirits: 0, hotKills: 0, hotStacks: 0, hotTime: 0,
      traveled: 0, feathers: [], damage: 0, damageBySource: {}, kills: 0, xpCollected: 0, damageTaken: 0, revives: 0,
      firedUpBuff: 0, healthbackBuff: 0, stopwavesBuff: 0, stopwaveClock: 0,
      lastHit: 0, iceReady: false, iceTimer: 0,
    };
    if (spec.id === "gale") player.passives.crit = 1.875;
    if (spec.id === "vesper") player.passives.pickup = 4;
    this.players.push(player);
    if (this.pendingChoices) {
      this.pendingChoices[player.id] = this.generateChoices(player);
      this.choiceReady[player.id] = false;
    }
    return player;
  }

  removePlayer(playerId) {
    const player = this.players.find((entry) => entry.id === playerId);
    if (player?.reconnectKey) this.disconnectedPlayers.set(player.reconnectKey, { player, leftTick: this.tick });
    this.players = this.players.filter((p) => p.id !== playerId);
    this.drones = this.drones.filter((drone) => drone.owner !== playerId);
    if (this.pendingChoices) {
      delete this.pendingChoices[playerId];
      delete this.choiceReady[playerId];
      delete this.selectedChoices[playerId];
      this.maybeResumeFromChoices();
    }
  }

  setInput(playerId, input) {
    const p = this.players.find((player) => player.id === playerId);
    const aim = Number(input?.aim);
    if (!p || !Number.isFinite(aim)) return false;
    p.input = {
      x: clamp(Number(input.x) || 0, -1, 1), y: clamp(Number(input.y) || 0, -1, 1),
      aim, autoAim: Boolean(input.autoAim),
    };
    return true;
  }

  update(dt) {
    dt = Math.min(.05, Math.max(0, dt));
    if (this.stage === "won" || this.stage === "lost" || this.paused) return;
    if (dt > 0) this.tick += Math.max(1, Math.round(dt * SIMULATION_TICK_RATE));
    this.updateTasks();
    this.updatePlayers(dt);
    this.updateMachine(dt);
    this.updateObjectives(dt);
    this.updateRelayBalls(dt);
    this.updateDrones(dt);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateEnemies(dt);
    this.updatePickups(dt);
    this.cleanup();

    if (this.stage === "running") {
      this.time += dt;
      this.remaining = Math.max(0, this.duration - this.time);
      this.wave = Math.min(BALANCE.waves.survivalWaveCount - 1, Math.floor((this.time / this.duration) * BALANCE.waves.survivalWaveCount));
      this.updateSpawns(dt);
      this.updateScheduledEvents();
      if (this.remaining <= 0) this.spawnBoss();
    } else if (this.stage === "boss") {
      this.bossElapsed += dt;
      if (this.bossElapsed >= BALANCE.waves.boss.enrageAtSeconds && !this.enraged) {
        this.enraged = true;
        this.pushEvent("danger", "APEX ENRAGED", "Thirty seconds to lethal nova");
      }
      if (this.bossElapsed >= BALANCE.waves.boss.lethalAtSeconds) this.lose("The apex consumed the operation.");
    }
  }

  updatePlayers(dt) {
    for (const p of this.players) {
      const spec = SPECIALISTS[p.specialist];
      if (p.downed) {
        resetPlayerMovement(p);
        p.downTimer -= dt;
        const rescuers = this.players.filter((ally) => !ally.dead && !ally.downed && distance(p, ally) < 90);
        p.reviveProgress += rescuers.length * dt;
        if (p.reviveProgress >= 3) { for (const ally of rescuers) ally.revives++; this.revive(p); }
        else if (p.downTimer <= 0) {
          p.downed = false; p.dead = true; p.respawnTimer = Math.min(60, 15 + Math.max(0, p.deaths - 1) * 9);
        }
        continue;
      }
      if (p.dead) {
        resetPlayerMovement(p);
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) this.revive(p);
        continue;
      }

      p.eCd = Math.max(0, p.eCd - dt);
      p.rCd = Math.max(0, p.rCd - dt);
      p.invuln = Math.max(0, p.invuln - dt);
      p.hitGrace = Math.max(0, p.hitGrace - dt);
      p.hurtFlash = Math.max(0, (p.hurtFlash || 0) - dt);
      p.animTime = Math.max(0, (p.animTime || 0) - dt);
      p.weaponFlash = Math.max(0, (p.weaponFlash || 0) - dt);
      p.skidTime = Math.max(0, (p.skidTime || 0) - dt);
      p.frenzy = Math.max(0, p.frenzy - dt);
      p.hasteBuff = Math.max(0, p.hasteBuff - dt);
      p.speedBuff = Math.max(0, p.speedBuff - dt);
      p.firedUpBuff = Math.max(0, (p.firedUpBuff || 0) - dt);
      p.healthbackBuff = Math.max(0, (p.healthbackBuff || 0) - dt);
      p.stopwavesBuff = Math.max(0, (p.stopwavesBuff || 0) - dt);
      p.stopwaveClock = Math.max(0, (p.stopwaveClock || 0) - dt);
      if (p.stopwavesBuff > 0 && p.stopwaveClock <= 0) {
        p.stopwaveClock = 2.5;
        for (const enemy of this.enemies) if (distance(p, enemy) < 460) enemy.stun = Math.max(enemy.stun, 1.35);
        this.effects.push({ id: this.nextCosmeticId("fx"), x: p.x, y: p.y, radius: 460, life: .45, maxLife: .45, damage: 0, owner: p.id, color: "#63f2df", kind: "freeze" });
      }
      p.hotTime = Math.max(0, p.hotTime - dt);
      if (p.hotTime <= 0) p.hotStacks = 0;
      p.shield = Math.max(0, p.shield - Math.max(.01, p.maxHp * .015) * dt);

      let movementInput = p.input;
      if (p.frenzy > 0) {
        const target = this.nearestEnemy(p);
        if (target) {
          const a = angleTo(p, target);
          movementInput = { ...p.input, x: Math.cos(a), y: Math.sin(a), aim: a };
          p.input.aim = a;
        }
      }
      const speed = this.playerStat(p, "speed");
      const wasMoving = p.moving;
      ensureMovementState(p);
      const movement = advancePlayerMovement(p, movementInput, dt, speed, (entity, dx, dy) => this.movePlayer(entity, dx, dy));
      const knockX = (p.knockVx || 0) * dt, knockY = (p.knockVy || 0) * dt;
      const knockBeforeX = p.x, knockBeforeY = p.y;
      this.movePlayer(p, knockX, knockY);
      const knockDistance = Math.hypot(p.x - knockBeforeX, p.y - knockBeforeY);
      const knockFriction = Math.pow(.018, dt); p.knockVx *= knockFriction; p.knockVy *= knockFriction;
      if (wasMoving && !p.moving) p.skidTime = .16;
      if (p.animTime <= 0) p.animState = p.moving ? "run" : "idle";
      p.traveled += movement.distance + knockDistance;
      p.charge += movement.distance;

      if (p.specialist === "rift" && p.charge >= 120) {
        p.charge %= 120;
        this.blast(p.x, p.y, 95 * this.playerStat(p, "area"), (32 + this.level * 2) * this.playerStat(p, "damage"), p.id, spec.color, true, "kinetic", "passive:rift");
      }
      if (p.specialist === "gale") p.flow = Math.min(100, p.flow + 25 * dt);
      if (p.specialist === "nova") {
        const expected = Math.floor(this.level / 7);
        if (p.spirits < expected) { p.spirits = expected; this.pushEvent("upgrade", "Spirit acquired", `${p.name} now trails ${expected} wisp${expected === 1 ? "" : "s"}`); }
        for (let i = 0; i < p.spirits; i++) {
          const a = this.time * .8 - i * .8;
          const sx = p.x - Math.cos(a) * (70 + i * 30), sy = p.y - Math.sin(a) * (70 + i * 30);
          if (this.chance(dt * 4)) this.blast(sx, sy, 75, 10 + this.level * 1.4, p.id, spec.color, false, "hex");
        }
      }

      // Story mode stands in for a few ranks of Swarm's permanent upgrade
      // economy so a fresh browser player is not entering with a zero-meta save.
      const regen = this.playerStat(p, "regen") + this.difficulty.passiveRegen;
      let bonusRegen = 0;
      for (const ally of this.players.filter((ally) => ally.specialist === "bront")) {
        for (const effect of this.effects.filter((e) => e.kind === "totem" && e.owner === ally.id)) if (distance(p, effect) < 260) bonusRegen += .1;
      }
      if (regen + bonusRegen > 0) p.hp = Math.min(p.maxHp, p.hp + (regen + bonusRegen) * dt);
    }

    if (this.players.length && this.players.every((p) => p.dead || p.downed)) this.lose("Every specialist is down.");
  }

  playerStat(p, stat) {
    return playerCombatStat(p, stat);
  }

  collidesWithCover(x, y, radius) {
    return collidesWithCover(x, y, radius);
  }

  movePlayer(p, dx, dy) {
    moveEntityWithCover(p, dx, dy);
  }

  updateSpawns(dt) {
    const progress = clamp(this.time / this.duration, 0, 1);
    const livePlayers = Math.max(1, this.players.filter((p) => !p.dead).length);
    // Swarm's early waves leave room to learn a kit before the arena fills. The
    // extra opening multiplier fades over the first 35 seconds, then the curve
    // accelerates toward a genuinely crowded final minute.
    const spawn = BALANCE.waves.spawn;
    const openingRamp = clamp(this.time / spawn.openingRampSeconds, 0, 1);
    const interval = ((spawn.intervalStart - progress * spawn.intervalProgressReduction) * (spawn.openingIntervalMultiplier - openingRamp * spawn.openingMultiplierReduction))
      / this.difficulty.spawn / Math.sqrt(livePlayers);
    this.spawnClock += dt;
    const cap = spawn.capStart + Math.floor(progress * spawn.capProgress) + (livePlayers - 1) * spawn.capPerAdditionalPlayer;
    while (this.spawnClock >= interval && this.enemies.length < cap) {
      this.spawnClock -= interval;
      let type = "mite";
      const roll = this.gameplayRng.nextFloat();
      const match = spawn.composition.find((entry) => progress > entry.after && roll < entry.rollBelow);
      if (match) type = match.id;
      this.spawnEnemy(type);
    }
  }

  spawnEnemy(typeId, options = {}) {
    const type = ENEMY_TYPES[typeId] || ENEMY_TYPES.mite;
    const focus = this.pick(this.players.filter((p) => !p.dead && !p.downed)) || this.players[0] || { x: 0, y: 0 };
    const a = this.random(0, TAU), r = this.random(BALANCE.waves.spawn.distanceMin, BALANCE.waves.spawn.distanceMax);
    const elite = Boolean(options.elite);
    const scale = this.difficulty.health * (1 + this.time / Math.max(1, this.duration) * BALANCE.waves.spawn.healthProgressScale);
    const enemy = {
      id: this.nextGameplayId("m"), type: type.id, x: clamp(focus.x + Math.cos(a) * r, -WORLD.width / 2 + 30, WORLD.width / 2 - 30),
      y: clamp(focus.y + Math.sin(a) * r, -WORLD.height / 2 + 30, WORLD.height / 2 - 30),
      radius: type.radius * (elite ? 1.45 : 1), hp: type.health * scale * (elite ? 7 : 1),
      maxHp: type.health * scale * (elite ? 7 : 1), speed: type.speed * (elite ? .88 : 1),
      damage: type.damage * this.difficulty.attack * (elite ? 1.4 : 1), color: type.color,
      elite, miniboss: type.miniboss, boss: false, attackCd: this.random(0, 1), shotCd: this.random(.2, 1.5),
      stun: 0, hitFlash: 0, attackFlash: 0, spawnLife: .24, knockVx: 0, knockVy: 0, dead: false, xp: type.xp * (elite ? 4 : 1),
    };
    this.enemies.push(enemy);
    return enemy;
  }

  updateScheduledEvents() {
    if (this.objectiveEvents && this.time >= this.nextTreasure) {
      this.spawnTreasureRunner();
      this.nextTreasure += Math.max(BALANCE.waves.events.treasureRepeatMin, this.duration * BALANCE.waves.events.treasureRepeat);
    }
    if (this.objectiveEvents && this.time >= this.nextRelayBall) {
      this.spawnRelayBall();
      this.nextRelayBall += Math.max(BALANCE.waves.events.relayRepeatMin, this.duration * BALANCE.waves.events.relayRepeat);
    }
    if (this.time >= this.nextElite) {
      const elite = this.spawnEnemy(this.time / this.duration > BALANCE.waves.events.eliteBruteAfter ? "brute" : "hound", { elite: true });
      elite.x = clamp(elite.x, -WORLD.width / 2 + 100, WORLD.width / 2 - 100);
      this.nextElite += this.duration * BALANCE.waves.events.eliteRepeat;
      this.pushEvent("danger", "Elite signal", "An access key is on the line");
    }
    if (this.time >= this.nextMiniBoss) {
      this.spawnEnemy("shark");
      this.nextMiniBoss += this.duration * BALANCE.waves.events.minibossRepeat;
      this.pushEvent("danger", "Siegebreaker inbound", "Heavy target marked");
    }
    const objectiveTimes = BALANCE.waves.events.objectivesAt.map((progress) => this.duration * progress);
    if (this.objectiveEvents && this.objectiveIndex < objectiveTimes.length && this.time >= objectiveTimes[this.objectiveIndex]) {
      const a = this.random(0, TAU), r = this.random(420, 720);
      this.objectives.push({ id: this.nextGameplayId("o"), x: Math.cos(a) * r, y: Math.sin(a) * r, radius: 85, progress: 0, life: 38, kind: this.objectiveIndex ? "trial" : "uplink" });
      this.objectiveIndex++;
      this.pushEvent("objective", this.objectiveIndex === 1 ? "Capture the uplink" : "Survive the breach trial", "Optional directive");
    }
  }

  spawnTreasureRunner() {
    const runner = this.spawnEnemy("hound", { elite: true });
    const health = 720 * this.difficulty.health * (1 + this.time / Math.max(1, this.duration));
    Object.assign(runner, { eventType: "treasure", radius: 31, hp: health, maxHp: health, speed: 195, damage: 0, color: "#ffd45d", life: 28, xp: 120 });
    this.pushEvent("objective", "Treasure runner detected", "Catch it before the signal escapes");
  }

  spawnRelayBall() {
    const angle = this.random(0, TAU), radius = this.random(340, 560);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    this.relayBalls.push({ id: this.nextGameplayId("ball"), x, y, targetX: -x, targetY: -y, radius: 42, vx: 0, vy: 0, life: 62, done: false });
    this.pushEvent("objective", "Relay ball online", "Push the core into its destination ring");
  }

  updateRelayBalls(dt) {
    for (const ball of this.relayBalls) {
      if (ball.done) continue;
      ball.life -= dt;
      for (const player of this.players) {
        if (player.dead || player.downed) continue;
        const d = distance(player, ball);
        if (d > player.radius + ball.radius + 14) continue;
        const angle = angleTo(player, ball), force = 680 * (1 - clamp(d / (player.radius + ball.radius + 14), 0, 1) * .35);
        ball.vx += Math.cos(angle) * force * dt; ball.vy += Math.sin(angle) * force * dt;
      }
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 290) { ball.vx = ball.vx / speed * 290; ball.vy = ball.vy / speed * 290; }
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const friction = Math.pow(.14, dt); ball.vx *= friction; ball.vy *= friction;
      if (Math.abs(ball.x) > WORLD.width / 2 - ball.radius) { ball.x = clamp(ball.x, -WORLD.width / 2 + ball.radius, WORLD.width / 2 - ball.radius); ball.vx *= -.65; }
      if (Math.abs(ball.y) > WORLD.height / 2 - ball.radius) { ball.y = clamp(ball.y, -WORLD.height / 2 + ball.radius, WORLD.height / 2 - ball.radius); ball.vy *= -.65; }
      if (Math.hypot(ball.x - ball.targetX, ball.y - ball.targetY) < 82) {
        ball.done = true; this.gold += Math.round(70 * this.difficulty.gold); this.teamXP += this.xpNeed * .8;
        this.drops.push({ id: this.nextGameplayId("d"), type: "card", x: ball.targetX, y: ball.targetY, radius: 18 });
        this.applyBoon(this.pick(BOONS)); this.pushEvent("upgrade", "Relay delivered", "Gold, data, and an access card secured");
      } else if (ball.life <= 0) {
        ball.done = true; this.pushEvent("danger", "Relay lost", "The destination window closed");
      }
    }
  }

  updateObjectives(dt) {
    for (const objective of this.objectives) {
      objective.life -= dt;
      const inside = this.players.filter((p) => !p.dead && !p.downed && distance(p, objective) < objective.radius).length;
      if (inside) objective.progress += inside * dt / 5;
      if (objective.kind === "trial" && this.chance(dt * 2.3) && this.enemies.length < 280) {
        const e = this.spawnEnemy(this.chance(.25) ? "brute" : "hound");
        const a = this.random(0, TAU); e.x = objective.x + Math.cos(a) * 310; e.y = objective.y + Math.sin(a) * 310;
      }
      if (objective.progress >= 1) {
        objective.done = true;
        if (objective.kind === "uplink") this.applyBoon(this.pick(BOONS));
        else {
          this.teamXP += this.xpNeed * .75;
          this.gold += Math.round(45 * this.difficulty.gold);
          for (let i = 0; i < 2; i++) this.drops.push({ id: this.nextGameplayId("d"), type: "card", x: objective.x + this.random(-40, 40), y: objective.y + this.random(-40, 40), radius: 18 });
          this.pushEvent("upgrade", "Trial complete", "Data, gold, and access keys secured");
        }
      } else if (objective.life <= 0) {
        objective.done = true;
        this.pushEvent("danger", "Directive failed", "The signal collapsed");
      }
    }
  }

  applyBoon(boon) {
    for (const p of this.players) {
      if (boon.name === "Cruise Control") p.speedBuff = 15;
      else if (boon.name === "Squad Shield") p.shield += p.maxHp * .75;
      else if (boon.name === "Ultra Rapid Fire-r") p.hasteBuff = 15;
      else if (boon.name === "Healthback") { p.healthbackBuff = 15; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .2); }
      else if (boon.name === "Stopwaves") { p.stopwavesBuff = 15; p.stopwaveClock = 0; for (const enemy of this.enemies) enemy.stun = Math.max(enemy.stun, 4); }
      else if (boon.name === "Fired Up") { p.firedUpBuff = 15; p.weaponTimers.boonFire = 0; }
    }
    this.pushEvent("boon", boon.name, boon.copy);
  }

  updateMachine(dt) {
    this.machine.cooldown = Math.max(0, this.machine.cooldown - dt);
    this.machine.active = Math.max(0, this.machine.active - dt);
    const near = this.players.filter((p) => !p.dead && !p.downed && Math.hypot(p.x, p.y) < 95).length;
    if (near && this.machine.cooldown <= 0) this.machine.charge += near * dt;
    else this.machine.charge = Math.max(0, this.machine.charge - dt * .35);
    if (this.machine.charge >= 2.4) {
      this.machine.charge = 0;
      if (this.map.id === "warehouse") {
        for (const p of this.players) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .5);
        this.machine.cooldown = 75;
        this.pushEvent("boon", "Healing relay charged", "Squad restored by 50%");
      } else if (this.map.id === "outskirts") {
        this.machine.active = 30; this.machine.cooldown = 70;
        this.pushEvent("boon", "Ion cannon online", "Thirty seconds of orbital fire");
      } else if (this.map.id === "lab") {
        for (const enemy of this.enemies) enemy.stun = Math.max(enemy.stun, 5);
        this.machine.cooldown = 45;
        this.pushEvent("boon", "Freeze core discharged", "The horde is frozen");
      }
    }
    if (this.machine.active > 0 && this.chance(dt * 8)) {
      const enemy = this.pick(this.enemies.filter((e) => !e.dead));
      if (enemy) this.blast(enemy.x, enemy.y, 140, 240, this.players[0]?.id, this.map.accent, true, "blast", "environment");
    }
  }

  seedPods() {
    for (let i = 0; i < 14; i++) {
      const a = this.random(0, TAU), r = this.random(260, 1080);
      this.pods.push({ id: this.nextGameplayId("p"), x: Math.cos(a) * r, y: Math.sin(a) * r, radius: 25, hp: 100, dead: false });
    }
  }

  updateTasks() {
    const due = this.tasks.filter((task) => task.dueTick <= this.tick)
      .sort((left, right) => left.dueTick - right.dueTick);
    this.tasks = this.tasks.filter((task) => task.dueTick > this.tick);
    for (const task of due) this.executeTask(task);
  }

  executeTask(task) {
    const payload = task.payload || {};
    if (task.kind === "echo-repeat") {
      const player = this.players.find((candidate) => candidate.id === payload.ownerId);
      if (!player || player.dead || player.downed) return;
      for (let index = 0; index < payload.count; index++) {
        this.shoot(player, payload.aim + (index - (payload.count - 1) / 2) * payload.spread, payload.speed, payload.damage, {
          radius: payload.radius, color: payload.color, pierce: payload.pierce, life: payload.life, wave: true,
        });
      }
      return;
    }
    if (task.kind === "echo-projectile-repeat") {
      const player = this.players.find((candidate) => candidate.id === payload.ownerId);
      if (!player || player.dead || player.downed) return;
      this.shoot(player, payload.angle, payload.speed, payload.damage, { ...(payload.options || {}), echoRepeat: true });
      return;
    }
    if (task.kind === "bront-repeat-blast") {
      const target = this.enemies.find((candidate) => candidate.id === payload.targetId && !candidate.dead);
      this.blast(target?.x ?? payload.x, target?.y ?? payload.y, payload.radius, payload.damage, payload.ownerId, payload.color, true, "blast", "signature");
      return;
    }
    if (task.kind === "sola-detonate" || task.kind === "sola-aftershock") {
      const player = this.players.find((candidate) => candidate.id === payload.ownerId);
      if (!player) return;
      if (task.kind === "sola-detonate") {
        player.armor = Math.max(SPECIALISTS.sola.armor, player.armor - Number(payload.armorBonus || 0));
        this.blast(player.x, player.y, 400 * payload.area, 160 + this.level * 15, player.id, payload.color, true, "blast", "ability:e");
        this.grantShieldAmount(player, player.maxHp * BALANCE.identityTuning.sola.aftershockShieldMaxHealth);
      } else {
        this.blast(player.x, player.y, 300 * payload.area, 100 + this.level * 10, player.id, payload.color, true, "blast", "ability:e");
      }
      return;
    }
    if (task.kind === "bomber-detonate") {
      const enemy = this.enemies.find((candidate) => candidate.id === payload.enemyId && !candidate.dead);
      if (!enemy) return;
      for (const player of this.players) if (!player.dead && distance(enemy, player) < 170) this.takeDamage(player, enemy.damage, enemy);
      enemy.dead = true;
      enemy.detonationScheduled = false;
      return;
    }
    throw new RangeError(`Unknown simulation task kind: ${task.kind}`);
  }

  cooldown(p, base) { return base * (100 / (100 + this.playerStat(p, "haste"))); }

  aimForPlayer(p) {
    if (p.input.autoAim) {
      const enemy = this.nearestEnemy(p);
      if (enemy) return angleTo(p, enemy);
    }
    return p.input.aim || 0;
  }

  mobilityAimForPlayer(p) {
    // Auto-aim is useful for weapons, but movement abilities authored as
    // "to the cursor" must always respect the player's latest pointer angle.
    return Number.isFinite(p.input?.aim) ? p.input.aim : (p.facing || 0);
  }

  ensureDrone(p, weapon = p.weapons.drone) {
    if (!weapon) return null;
    let drone = this.drones.find((entry) => entry.owner === p.id);
    if (!drone) {
      const orbitAngle = this.players.indexOf(p) * (TAU / Math.max(1, this.players.length));
      drone = {
        id: this.nextGameplayId("drone"), owner: p.id, x: p.x, y: p.y, radius: 19,
        level: weapon.level || 1, evolved: Boolean(weapon.evolved), orbitAngle,
        facing: p.facing || 0, fireFlash: 0, collectFlash: 0,
        repairFlash: 0, repairClock: Math.max(BALANCE.weapons.universal.drone.initialRepairCooldownMin, BALANCE.weapons.universal.drone.repairCooldownBase + (weapon.level || 1) * BALANCE.weapons.universal.drone.repairCooldownPerLevel),
      };
      this.drones.push(drone);
    }
    drone.level = weapon.level || 1;
    drone.evolved = Boolean(weapon.evolved);
    return drone;
  }

  updateDrones(dt) {
    const liveOwners = new Set();
    for (const p of this.players) {
      const weapon = p.weapons.drone;
      if (!weapon || p.dead || p.downed) continue;
      liveOwners.add(p.id);
      const drone = this.ensureDrone(p, weapon);
      const tuning = BALANCE.weapons.universal.drone;
      drone.orbitAngle += dt * (tuning.orbitSpeedBase + drone.level * tuning.orbitSpeedPerLevel);
      const orbitRadius = tuning.orbitRadiusBase + drone.level * tuning.orbitRadiusPerLevel;
      const targetX = p.x + Math.cos(drone.orbitAngle) * orbitRadius;
      const targetY = p.y + Math.sin(drone.orbitAngle) * orbitRadius * .68;
      const follow = 1 - Math.pow(.0008, dt);
      const oldX = drone.x, oldY = drone.y;
      drone.x += (targetX - drone.x) * follow;
      drone.y += (targetY - drone.y) * follow;
      if (Math.hypot(drone.x - oldX, drone.y - oldY) > .01) drone.facing = Math.atan2(drone.y - oldY, drone.x - oldX);
      drone.fireFlash = Math.max(0, drone.fireFlash - dt);
      drone.collectFlash = Math.max(0, drone.collectFlash - dt);
      drone.repairFlash = Math.max(0, drone.repairFlash - dt);
      drone.repairClock -= dt;
      if (drone.repairClock <= 0) {
        this.drops.push({ id: this.nextGameplayId("d"), type: "heal", x: drone.x, y: drone.y, radius: 15, source: "drone" });
        drone.repairFlash = .7;
        drone.repairClock = Math.max(tuning.repairCooldownMin, tuning.repairCooldownBase + drone.level * tuning.repairCooldownPerLevel) * (drone.evolved ? tuning.evolvedRepairMultiplier : 1);
      }
    }
    this.drones = this.drones.filter((drone) => liveOwners.has(drone.owner));
  }

  nearestEnemy(point, limit = Infinity) {
    let best = null, bestD = limit * limit;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = (enemy.x - point.x) ** 2 + (enemy.y - point.y) ** 2;
      if (d < bestD) { best = enemy; bestD = d; }
    }
    return best;
  }

  updateWeapons(dt) {
    for (const p of this.players) {
      if (p.dead || p.downed) continue;
      for (const key of Object.keys(p.weaponTimers)) p.weaponTimers[key] -= dt;
      const sig = p.weapons.signature;
      const sigTuning = BALANCE.weapons.signatures[p.specialist];
      const sigBase = valueAtLevel(sigTuning.cycle, sigTuning.cyclePerLevel, sig.level);
      if ((p.weaponTimers.signature ?? 0) <= 0) {
        const evolvedCycle = sigTuning.evolvedCycleSeconds ? sigTuning.evolvedCycleSeconds / sigBase : sigTuning.evolvedCycle;
        if (this.fireSignature(p)) p.weaponTimers.signature = this.cooldown(p, sig.evolved ? sigBase * evolvedCycle : sigBase);
        else p.weaponTimers.signature = BALANCE.weapons.system.failedSignatureRetry;
      }

      for (const [weaponId, weapon] of Object.entries(p.weapons)) {
        if (weaponId === "signature") continue;
        if ((p.weaponTimers[weaponId] ?? 0) > 0) continue;
        p.weaponTimers[weaponId] = this.fireCommonWeapon(p, weaponId, weapon);
      }
      if (p.firedUpBuff > 0 && (p.weaponTimers.boonFire ?? 0) <= 0) {
        const enemy = this.nearestEnemy(p);
        if (enemy) this.shoot(p, angleTo(p, enemy), 520, 72, { radius: 9, color: "#ff8b48", explosion: 85, sourceId: "boon:firedUp" });
        p.weaponTimers.boonFire = .35;
      }
    }
  }

  fireSignature(p) {
    const spec = SPECIALISTS[p.specialist];
    const sig = p.weapons.signature;
    const level = sig.level;
    const tuning = BALANCE.weapons.signatures[p.specialist];
    const aim = this.aimForPlayer(p);
    const area = this.playerStat(p, "area");
    const extra = this.playerStat(p, "projectiles");

    if (p.specialist === "zuri") {
      const count = tuning.countBase + level * tuning.countPerLevel + extra;
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: spec.color, pierce: sig.evolved ? tuning.evolvedPierce : 0, life: tuning.life });
    } else if (p.specialist === "echo") {
      const count = Math.min(tuning.countCap, level * tuning.countPerLevel + extra);
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: spec.color, pierce: tuning.pierce, life: sig.evolved ? tuning.evolvedLife : tuning.life, wave: true });
    } else if (p.specialist === "sola") {
      const count = tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra;
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel + p.armor * tuning.armorDamage, { radius: tuning.radius * area, color: spec.color, pierce: tuning.pierce, life: tuning.life });
    } else if (p.specialist === "bront") {
      const target = this.nearestEnemy(p, tuning.range);
      if (!target) return false;
      this.blast(target.x, target.y, (tuning.radiusBase + level * tuning.radiusPerLevel) * area, tuning.damageBase + level * tuning.damagePerLevel, p.id, spec.color, true, "blast", "signature");
      if (sig.evolved) this.scheduleTask("bront-repeat-blast", tuning.evolvedDelay, {
        ownerId: p.id, targetId: target.id, x: target.x, y: target.y,
        radius: tuning.evolvedRadius * area, damage: tuning.evolvedDamageBase + level * tuning.damagePerLevel, color: spec.color,
      });
    } else if (p.specialist === "fang") {
      const tx = p.x + Math.cos(aim) * tuning.offset, ty = p.y + Math.sin(aim) * tuning.offset;
      this.blast(tx, ty, (tuning.radiusBase + level * tuning.radiusPerLevel) * area, (tuning.damageBase + level * tuning.damagePerLevel + p.maxHp * tuning.maxHealthDamage) * this.playerStat(p, "damage"), p.id, spec.color, true, sig.evolved ? "bleed" : "slash", "signature");
      if (p.frenzy > 0) p.hp = Math.min(p.maxHp, p.hp + .1 + (p.maxHp - p.hp) * .05);
    } else if (p.specialist === "gale") {
      if (p.flow < tuning.flowCost) return false;
      p.flow = 0;
      const count = Math.min(tuning.countCap, tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra);
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: (tuning.radiusBase + level * tuning.radiusPerLevel) * area, color: spec.color, pierce: sig.evolved ? tuning.evolvedPierce : tuning.pierce, life: tuning.life, tornado: true });
    } else if (p.specialist === "rift") {
      const tx = p.x + Math.cos(aim) * tuning.offset, ty = p.y + Math.sin(aim) * tuning.offset;
      this.blast(tx, ty, (tuning.radiusBase + level * tuning.radiusPerLevel) * area, (tuning.damageBase + level * tuning.damagePerLevel) * this.playerStat(p, "damage"), p.id, spec.color, true, "slash", "signature");
    } else if (p.specialist === "nova") {
      const count = Math.min(tuning.countCap, tuning.countBase + Math.ceil(level / tuning.countEveryLevels) + extra);
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: spec.color, pierce: tuning.pierce, life: sig.evolved ? tuning.evolvedLife : tuning.life, hex: true });
    } else if (p.specialist === "vesper") {
      const count = tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra;
      for (let i = 0; i < count; i++) this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: spec.color, pierce: sig.evolved ? tuning.evolvedPierce : tuning.pierce, life: tuning.life, dagger: true, leaveFeather: true });
    }
    return true;
  }

  fireCommonWeapon(p, weaponId, weapon) {
    const level = weapon.level;
    const evolved = weapon.evolved;
    const tuning = BALANCE.weapons.universal[weaponId];
    const aim = this.aimForPlayer(p);
    const area = this.playerStat(p, "area");
    const extra = this.playerStat(p, "projectiles");
    if (weaponId === "uwu") {
      const enemy = this.nearestEnemy(p);
      if (enemy) for (let i = 0; i < tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra; i++) this.shoot(p, angleTo(p, enemy) + this.random(-tuning.spreadRandom, tuning.spreadRandom), tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#f58cff", pierce: evolved ? tuning.evolvedPierce : 0, sourceId: weaponId });
      return this.cooldown(p, evolved ? tuning.evolvedCooldown : tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "slicers") {
      const count = tuning.countBase + level * tuning.countPerLevel + extra;
      for (let i = 0; i < count; i++) {
        const a = this.time * (evolved ? tuning.evolvedOrbitSpeed : tuning.orbitSpeed) + i * TAU / count;
        this.blast(p.x + Math.cos(a) * tuning.orbitRadius * area, p.y + Math.sin(a) * tuning.orbitRadius * area, tuning.radius * area, tuning.damageBase + level * tuning.damagePerLevel, p.id, "#8be6ff", true, "slicer", weaponId);
      }
      return this.cooldown(p, tuning.cooldown);
    }
    if (weaponId === "aura") {
      this.blast(p.x, p.y, (tuning.radiusBase + level * tuning.radiusPerLevel) * area, tuning.damageBase + level * tuning.damagePerLevel + p.maxHp * tuning.maxHealthDamage, p.id, "#ffd861", false, evolved ? "eruption" : "aura", weaponId);
      return this.cooldown(p, tuning.cooldown);
    }
    if (weaponId === "mines") {
      const count = tuning.countBase + level * tuning.countPerLevel + extra;
      for (let i = 0; i < count; i++) {
        const a = i * TAU / count + this.random(-tuning.spreadRandom, tuning.spreadRandom), r = tuning.orbitBase + level * tuning.orbitPerLevel;
        this.effects.push({ id: this.nextGameplayId("fx"), x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, radius: (tuning.radiusBase + level * tuning.radiusPerLevel) * area, life: tuning.fuseBase + i * tuning.fusePerMine, maxLife: tuning.fuseBase + i * tuning.fusePerMine, damage: tuning.damageBase + level * tuning.damagePerLevel, owner: p.id, color: "#ff8d55", kind: evolved ? "minePlus" : "mine", sourceId: weaponId, delayed: true, hit: new Set() });
      }
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "crossbow") {
      const base = this.random(0, TAU), count = tuning.countBase + level * tuning.countPerLevel + extra;
      for (let i = 0; i < count; i++) this.shoot(p, base + (i - (count - 1) / 2) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#f7d76a", pierce: evolved ? tuning.evolvedPierce : tuning.pierce, sourceId: weaponId });
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "boomerang") {
      const enemy = this.nearestEnemy(p);
      if (enemy) for (let i = 0; i < tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra; i++) this.shoot(p, angleTo(p, enemy) + (i - 1) * tuning.spread, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#8cefff", pierce: tuning.pierce, life: tuning.life, boomerang: true, originX: p.x, originY: p.y, sourceId: weaponId });
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "rail") {
      const count = tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * tuning.laneSpacing;
        this.shoot({ ...p, y: p.y + offset }, 0, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#ffcd71", pierce: tuning.pierce, sourceId: weaponId });
        this.shoot({ ...p, y: p.y + offset }, Math.PI, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#ffcd71", pierce: tuning.pierce, sourceId: weaponId });
      }
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "glove") {
      const streams = evolved ? tuning.evolvedStreams : tuning.streams;
      for (let s = 0; s < streams; s++) for (let i = 0; i < tuning.countBase + level * tuning.countPerLevel + extra; i++) {
        const a = this.time * tuning.orbitSpeed * (s ? -1 : 1) + i * tuning.spread;
        this.shoot(p, a, tuning.speed, tuning.damageBase + level * tuning.damagePerLevel, { radius: tuning.radius, color: "#77e3ff", pierce: tuning.pierce, life: tuning.life, sourceId: weaponId });
      }
      return this.cooldown(p, tuning.cooldown);
    }
    if (weaponId === "transit") {
      const y = p.y + this.random(-tuning.yRange, tuning.yRange);
      this.effects.push({ id: this.nextGameplayId("fx"), x: -WORLD.width / 2, y, radius: tuning.radius, life: tuning.life, maxLife: tuning.life, damage: tuning.damageBase + level * tuning.damagePerLevel, owner: p.id, color: "#ff7157", kind: "train", sourceId: weaponId, vx: tuning.speed, hit: new Set(), evolved });
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "ice") {
      p.iceReady = true;
      return this.cooldown(p, evolved ? tuning.evolvedCooldown : tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "annihilator") {
      this.effects.push({ id: this.nextGameplayId("fx"), x: p.x, y: p.y, radius: tuning.radius * area, life: tuning.fuse, maxLife: tuning.fuse, damage: tuning.damageBase + level * tuning.damagePerLevel, owner: p.id, color: "#f7f1bd", kind: "annihilator", sourceId: weaponId, delayed: true, hit: new Set() });
      return this.cooldown(p, evolved ? tuning.evolvedCooldown : tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    if (weaponId === "drone") {
      const drone = this.ensureDrone(p, weapon);
      const enemy = drone && this.nearestEnemy(drone, tuning.rangeBase + level * tuning.rangePerLevel);
      if (enemy) {
        const aim = angleTo(drone, enemy), count = tuning.countBase + Math.floor((level - 1) / tuning.countEveryLevels);
        for (let i = 0; i < count; i++) {
          this.shoot(p, aim + (i - (count - 1) / 2) * tuning.spread, tuning.speedBase + level * tuning.speedPerLevel, tuning.damageBase + level * tuning.damagePerLevel, {
            radius: tuning.radius, color: "#77efcf", pierce: evolved ? tuning.evolvedPierce : tuning.pierce,
            spawnX: drone.x, spawnY: drone.y, sourceRadius: drone.radius, droneBolt: true, sourceId: weaponId,
          });
        }
        drone.facing = aim; drone.fireFlash = .18;
      }
      return this.cooldown(p, tuning.cooldownBase + level * tuning.cooldownPerLevel);
    }
    return 1;
  }

  shoot(p, angle, speed, damage, options = {}) {
    const velocity = fromAngle(angle, speed);
    const crit = this.chance(this.playerStat(p, "crit"));
    const projectile = {
      id: this.nextGameplayId("b"), owner: p.id,
      x: (options.spawnX ?? p.x) + Math.cos(angle) * ((options.sourceRadius ?? p.radius) + 5),
      y: (options.spawnY ?? p.y) + Math.sin(angle) * ((options.sourceRadius ?? p.radius) + 5),
      radius: options.radius || BALANCE.weapons.system.defaultProjectileRadius, vx: velocity.x, vy: velocity.y,
      damage: damage * this.playerStat(p, "damage") * (crit ? BALANCE.weapons.system.criticalDamageMultiplier : 1), life: options.life || BALANCE.weapons.system.defaultProjectileLife,
      pierce: options.pierce || 0, color: options.color || "#fff", crit, dead: false,
      explosion: options.explosion || 0, wave: options.wave, tornado: options.tornado, hex: options.hex,
      dagger: options.dagger, leaveFeather: options.leaveFeather, boomerang: options.boomerang,
      droneBolt: options.droneBolt, sourceId: options.sourceId || "signature",
      executeMissingHealthBonus: Number(options.executeMissingHealthBonus || 0),
      originX: options.originX, originY: options.originY, age: 0, hit: new Set(),
    };
    this.projectiles.push(projectile);
    const echoTuning = BALANCE.identityTuning.echo;
    if (p.specialist === "echo" && !options.echoRepeat && (projectile.sourceId === "signature" || WEAPONS[projectile.sourceId]) && this.chance(echoTuning.repeatChance)) {
      const repeatOptions = { ...options, sourceId: projectile.sourceId, echoRepeat: true };
      this.scheduleTask("echo-projectile-repeat", echoTuning.repeatDelay, { ownerId: p.id, angle, speed, damage, options: repeatOptions });
    }
    if (options.spawnX === undefined && options.spawnY === undefined) {
      p.weaponFlash = Math.max(p.weaponFlash || 0, .09); p.recoilAngle = angle; p.aimFacing = angle;
    }
    return projectile;
  }

  cast(playerId, slot) {
    const p = this.players.find((player) => player.id === playerId);
    if (!p || p.dead || p.downed || this.paused) return false;
    const spec = SPECIALISTS[p.specialist];
    if (slot === "e") {
      if (this.level < 3 || p.eCd > 0) return false;
      p.eCd = p.eCdMax = this.cooldown(p, spec.cooldownE);
      p.animState = "castE"; p.animTime = .28;
      this.castE(p);
      return true;
    }
    if (slot === "r") {
      if (this.level < 6 || p.rCd > 0) return false;
      p.rCd = p.rCdMax = this.cooldown(p, spec.cooldownR);
      p.animState = "castR"; p.animTime = .42;
      this.castR(p);
      return true;
    }
    return false;
  }

  grantShield(p, tuning, level = this.level) {
    const amount = valueAtLevel(tuning.flatBase, tuning.flatPerLevel, level) + p.maxHp * tuning.maxHealth;
    return this.grantShieldAmount(p, amount, tuning.capMaxHealth);
  }

  grantShieldAmount(p, amount, capMaxHealth = 0.5) {
    const available = Math.max(0, p.maxHp * capMaxHealth - p.shield);
    const granted = Math.min(amount, available);
    p.shield += granted;
    return granted;
  }

  castE(p) {
    const spec = SPECIALISTS[p.specialist], aim = this.aimForPlayer(p), mobilityAim = this.mobilityAimForPlayer(p), area = this.playerStat(p, "area");
    if (p.specialist === "zuri") {
      for (let i = 0; i < 9 + this.playerStat(p, "projectiles"); i++) this.shoot(p, aim + (i - 4) * .13, 560, 49 + this.level * 6, { radius: 9, color: spec.color, explosion: 95 * area, life: 2.4, sourceId: "ability:e" });
    } else if (p.specialist === "echo") {
      for (const ally of this.players) if (!ally.dead && distance(p, ally) < 800) { this.grantShield(ally, BALANCE.shields.echoE); ally.speedBuff = 3; }
      this.effects.push({ id: this.nextCosmeticId("fx"), x: p.x, y: p.y, radius: 800, life: .6, maxLife: .6, damage: 0, owner: p.id, color: spec.color, kind: "shield" });
    } else if (p.specialist === "sola") {
      const armorBonus = p.armor * (BALANCE.identityTuning.sola.armorMultiplier - 1);
      p.armor += armorBonus; this.grantShield(p, BALANCE.shields.solaE);
      this.scheduleTask("sola-detonate", 3, { ownerId: p.id, area, color: spec.color, armorBonus });
      this.scheduleTask("sola-aftershock", 5, { ownerId: p.id, area, color: spec.color });
    } else if (p.specialist === "bront") {
      this.dashPlayer(p, mobilityAim, BALANCE.identityTuning.bront.crashDashDistance);
      const tx = p.x, ty = p.y;
      this.blast(tx, ty, 150 * area, 100 + this.level * 5, p.id, spec.color, true, "knockup", "ability:e");
      this.effects.push({ id: this.nextGameplayId("fx"), x: tx, y: ty, radius: 70, life: 16 * this.playerStat(p, "duration"), maxLife: 16, damage: 24, owner: p.id, color: spec.color, kind: "totem", sourceId: "ability:e", tick: .7, hit: new Set() });
    } else if (p.specialist === "fang") {
      this.dashPlayer(p, mobilityAim, 150); p.frenzy = 6 * this.playerStat(p, "duration");
    } else if (p.specialist === "gale") {
      this.grantShield(p, BALANCE.shields.galeE); p.invuln = .22; this.dashPlayer(p, mobilityAim, 475);
      this.blast(p.x, p.y, 170, 90 + this.level * 7, p.id, spec.color, true, "slash", "ability:e"); p.flow = 100;
    } else if (p.specialist === "rift") {
      this.dashPlayer(p, mobilityAim, 250); this.grantShield(p, BALANCE.shields.riftE); this.blast(p.x, p.y, 250 * area, (135 + this.level * 15) * this.playerStat(p, "damage"), p.id, spec.color, true, "stun", "ability:e");
    } else if (p.specialist === "nova") {
      this.dashPlayer(p, mobilityAim, 250); p.invuln = 2.5; p.speedBuff = 2.5;
      for (const enemy of this.enemies.filter((e) => e.hexed)) { this.blast(enemy.x, enemy.y, 95 * area, 65 + this.level * 8, p.id, spec.color, true, "blast", "ability:e"); enemy.hexed = 0; }
    } else if (p.specialist === "vesper") {
      for (const feather of this.feathers.filter((f) => f.owner === p.id)) {
        const a = angleTo(feather, p), v = fromAngle(a, 950);
        this.projectiles.push({ id: this.nextGameplayId("b"), owner: p.id, x: feather.x, y: feather.y, radius: 8, vx: v.x, vy: v.y, damage: (54 + this.level * 6) * this.playerStat(p, "damage"), life: 2, pierce: BALANCE.identityTuning.vesper.recallPierce, color: spec.color, dead: false, hit: new Set(), dagger: true, sourceId: "ability:e", age: 0 });
        feather.dead = true;
      }
    }
    this.pushEvent("cast", spec.active[0], p.name);
  }

  castR(p) {
    const spec = SPECIALISTS[p.specialist], aim = this.aimForPlayer(p), mobilityAim = this.mobilityAimForPlayer(p), area = this.playerStat(p, "area");
    if (p.specialist === "zuri") this.shoot(p, aim, 900, 450 + this.level * 50, { radius: 24, color: "#ffb050", explosion: 600 * area, life: 2.5, pierce: 0, sourceId: "ability:r", executeMissingHealthBonus: BALANCE.identityTuning.zuri.executeMissingHealthBonus });
    else if (p.specialist === "echo") {
      for (const ally of this.players) ally.invuln = 3;
      for (const enemy of this.enemies) enemy.stun = Math.max(enemy.stun, 2.5);
      this.blast(p.x, p.y, 1150, 140 + this.level * 8, p.id, spec.color, true, "perfect", "ability:r");
    } else if (p.specialist === "sola") {
      const target = { x: p.x + Math.cos(aim) * 470, y: p.y + Math.sin(aim) * 470 };
      this.effects.push({ id: this.nextGameplayId("fx"), ...target, radius: 430 * area, life: .7, maxLife: .7, damage: 180 + this.level * 20, owner: p.id, color: spec.color, kind: "solar", sourceId: "ability:r", delayed: true, stun: 3, hit: new Set() });
    } else if (p.specialist === "bront") {
      this.dashPlayer(p, mobilityAim, 160); this.blast(p.x, p.y, 500 * area, 490 + this.level * 10, p.id, spec.color, true, "shockwave", "ability:r"); p.hasteBuff = 8 * this.playerStat(p, "duration");
    } else if (p.specialist === "fang") {
      p.invuln = .9; this.dashPlayer(p, mobilityAim, 700); this.blast(p.x, p.y, 430 * area, (240 + this.level * 16) * this.playerStat(p, "damage"), p.id, spec.color, true, "bomb", "ability:r");
    } else if (p.specialist === "gale") {
      const v = fromAngle(aim, 260);
      this.effects.push({ id: this.nextGameplayId("fx"), x: p.x, y: p.y, radius: 90, life: 5, maxLife: 5, damage: 28 + this.level * 4, owner: p.id, color: spec.color, kind: "windwall", sourceId: "ability:r", vx: v.x, vy: v.y, tick: .25, hit: new Set() });
    } else if (p.specialist === "rift") {
      p.speedBuff = 15 * this.playerStat(p, "duration"); p.hasteBuff = 15; p.eCd = 0;
    } else if (p.specialist === "nova") {
      this.dashPlayer(p, mobilityAim, 320); p.invuln = 1; this.blast(p.x, p.y, 620 * area, 135 + this.level * 15, p.id, spec.color, true, "spirit", "ability:r");
    } else if (p.specialist === "vesper") {
      p.invuln = 2; p.speedBuff = 2;
      const count = 12 + this.playerStat(p, "projectiles") * 3;
      for (let i = 0; i < count; i++) this.shoot(p, i * TAU / count, 620, 80 + this.level * 9, { radius: 7, color: spec.color, pierce: 12, life: 1.8, dagger: true, leaveFeather: true, sourceId: "ability:r" });
    }
    this.pushEvent("cast", spec.ultimate[0], p.name);
  }

  dashPlayer(p, angle, distanceAmount) {
    const beforeX = p.x, beforeY = p.y;
    this.movePlayer(p, Math.cos(angle) * distanceAmount, Math.sin(angle) * distanceAmount);
    const moved = Math.hypot(p.x - beforeX, p.y - beforeY);
    p.facing = angle; p.movementFacing = angle; p.dashFacing = angle; p.animState = "dash"; p.animTime = Math.max(p.animTime || 0, .18);
    beginDashRecovery(p);
    p.traveled += moved; p.charge += moved;
  }

  updateProjectiles(dt) {
    for (const bullet of this.projectiles) {
      bullet.age = (bullet.age || 0) + dt;
      bullet.life -= dt;
      if (bullet.boomerang && bullet.age > .72) {
        const owner = this.players.find((p) => p.id === bullet.owner);
        if (owner) {
          const a = angleTo(bullet, owner), speed = Math.hypot(bullet.vx, bullet.vy);
          bullet.vx = Math.cos(a) * speed; bullet.vy = Math.sin(a) * speed;
        }
      }
      const startX = bullet.x, startY = bullet.y, endX = startX + bullet.vx * dt, endY = startY + bullet.vy * dt;
      const coverImpact = projectileBlockedByCover(bullet) ? segmentCoverImpact(startX, startY, endX, endY, bullet.radius) : null;
      if (coverImpact) {
        bullet.x = coverImpact.x; bullet.y = coverImpact.y; bullet.dead = true; bullet.coverImpact = coverImpact.obstacleIndex;
        this.effects.push({ id: this.nextCosmeticId("cover"), x: bullet.x, y: bullet.y, radius: Math.max(10, bullet.radius * 1.6), life: .18, maxLife: .18, damage: 0, owner: bullet.owner || "cover", sourceId: bullet.sourceId, color: bullet.color, kind: "coverImpact", obstacleIndex: coverImpact.obstacleIndex, hit: new Set() });
      } else { bullet.x = endX; bullet.y = endY; }
      if (Math.abs(bullet.x) > WORLD.width / 2 + 150 || Math.abs(bullet.y) > WORLD.height / 2 + 150) bullet.dead = true;

      for (const pod of this.pods) {
        if (pod.dead || bullet.dead || bullet.hit.has(pod.id) || !circleHit(bullet, pod)) continue;
        bullet.hit.add(pod.id); pod.hp -= bullet.damage;
        if (pod.hp <= 0) this.breakPod(pod);
        if (bullet.pierce-- <= 0) bullet.dead = true;
      }
      for (const enemy of this.enemies) {
        if (enemy.dead || bullet.dead || bullet.hit.has(enemy.id) || !circleHit(bullet, enemy)) continue;
        bullet.hit.add(enemy.id);
        const missingHealth = 1 - Math.max(0, enemy.hp) / Math.max(1, enemy.maxHp || enemy.health || enemy.hp);
        const impactDamage = bullet.damage * (1 + missingHealth * Number(bullet.executeMissingHealthBonus || 0));
        this.damageEnemy(enemy, impactDamage, bullet.owner, bullet.crit, bullet.sourceId || "signature");
        if (bullet.hex) enemy.hexed = BALANCE.identityTuning.nova.hexDuration;
        if (bullet.tornado) enemy.stun = Math.max(enemy.stun, .25);
        if (bullet.explosion) this.blast(bullet.x, bullet.y, bullet.explosion, impactDamage * .55, bullet.owner, bullet.color, true, "explosion", bullet.sourceId || "signature");
        if (bullet.pierce-- <= 0) bullet.dead = true;
      }
      if (bullet.life <= 0) bullet.dead = true;
      if (bullet.dead && bullet.leaveFeather && !bullet.featherMade) {
        bullet.featherMade = true;
        this.feathers.push({ id: this.nextGameplayId("f"), owner: bullet.owner, x: bullet.x, y: bullet.y, radius: 7, life: 15, color: bullet.color });
      }
    }

    for (const bullet of this.hostile) {
      bullet.life -= dt;
      const startX = bullet.x, startY = bullet.y, endX = startX + bullet.vx * dt, endY = startY + bullet.vy * dt;
      const coverImpact = projectileBlockedByCover(bullet, true) ? segmentCoverImpact(startX, startY, endX, endY, bullet.radius) : null;
      if (coverImpact) {
        bullet.x = coverImpact.x; bullet.y = coverImpact.y; bullet.dead = true; bullet.coverImpact = coverImpact.obstacleIndex;
        this.effects.push({ id: this.nextCosmeticId("cover"), x: bullet.x, y: bullet.y, radius: Math.max(10, bullet.radius * 1.6), life: .18, maxLife: .18, damage: 0, owner: "cover", color: bullet.color, kind: "coverImpact", obstacleIndex: coverImpact.obstacleIndex, hit: new Set() });
      } else { bullet.x = endX; bullet.y = endY; }
      for (const p of this.players) {
        if (p.dead || p.downed || bullet.dead || !circleHit(bullet, p)) continue;
        this.takeDamage(p, bullet.damage, bullet); bullet.dead = true;
      }
      if (bullet.life <= 0) bullet.dead = true;
    }
  }

  updateEffects(dt) {
    for (const effect of this.effects) {
      effect.life -= dt;
      if (effect.vx) { effect.x += effect.vx * dt; effect.y += (effect.vy || 0) * dt; }
      if (effect.kind === "windwall") {
        const tuning = BALANCE.identityTuning.gale;
        for (const bullet of this.hostile) {
          if (bullet.dead || Math.hypot(bullet.x - effect.x, bullet.y - effect.y) > effect.radius + bullet.radius + tuning.windwallProjectilePadding) continue;
          bullet.dead = true;
        }
        for (const enemy of this.enemies) {
          if (enemy.dead || Math.hypot(enemy.x - effect.x, enemy.y - effect.y) > effect.radius + enemy.radius) continue;
          const angle = Math.atan2(enemy.y - effect.y, enemy.x - effect.x);
          enemy.knockVx = (enemy.knockVx || 0) + Math.cos(angle) * tuning.windwallKnockback;
          enemy.knockVy = (enemy.knockVy || 0) + Math.sin(angle) * tuning.windwallKnockback;
        }
      }
      if (effect.kind === "totem" || effect.kind === "windwall") {
        effect.tickClock = (effect.tickClock || 0) - dt;
        if (effect.tickClock <= 0) {
          effect.tickClock = effect.tick || .5;
          effect.hit = new Set();
          this.damageArea(effect.x, effect.y, effect.radius, effect.damage, effect.owner, effect.color, effect.kind, 0, effect.sourceId || effect.kind);
        }
      } else if (effect.kind === "train") {
        for (const enemy of this.enemies) {
          if (enemy.dead || effect.hit.has(enemy.id) || Math.abs(enemy.y - effect.y) > 58 || Math.abs(enemy.x - effect.x) > 110) continue;
          effect.hit.add(enemy.id); this.damageEnemy(enemy, effect.damage, effect.owner, false, effect.sourceId || "transit"); enemy.stun = 1;
        }
      } else if (effect.delayed && effect.life <= 0 && !effect.triggered) {
        effect.triggered = true;
        this.damageArea(effect.x, effect.y, effect.radius, effect.damage, effect.owner, effect.color, effect.kind, effect.stun, effect.sourceId || effect.kind);
      }
    }
    for (const feather of this.feathers) feather.life -= dt;
  }

  blast(x, y, radius, damage, owner, color = "#fff", visual = true, kind = "blast", sourceId = kind) {
    this.damageArea(x, y, radius, damage, owner, color, kind, 0, sourceId);
    if (visual) this.effects.push({ id: this.nextCosmeticId("fx"), x, y, radius, life: .28, maxLife: .28, damage: 0, owner, color, kind, hit: new Set() });
  }

  damageArea(x, y, radius, damage, owner, color, kind, stun = 0, sourceId = kind) {
    for (const enemy of this.enemies) {
      if (enemy.dead || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.radius) continue;
      this.damageEnemy(enemy, damage, owner, false, sourceId);
      if (kind === "hex") enemy.hexed = 6;
      if (kind === "stun" || kind === "knockup" || stun) enemy.stun = Math.max(enemy.stun, stun || 1.2);
    }
    for (const pod of this.pods) {
      if (pod.dead || Math.hypot(pod.x - x, pod.y - y) > radius + pod.radius) continue;
      pod.hp -= damage;
      if (pod.hp <= 0) this.breakPod(pod);
    }
  }

  updateEnemies(dt) {
    const living = this.players.filter((p) => !p.dead && !p.downed);
    if (!living.length) return;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.attackFlash = Math.max(0, (enemy.attackFlash || 0) - dt);
      enemy.spawnLife = Math.max(0, (enemy.spawnLife || 0) - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.hexed = Math.max(0, (enemy.hexed || 0) - dt);
      enemy.attackCd -= dt; enemy.shotCd -= dt;
      enemy.x += (enemy.knockVx || 0) * dt; enemy.y += (enemy.knockVy || 0) * dt;
      const knockFriction = Math.pow(.01, dt); enemy.knockVx *= knockFriction; enemy.knockVy *= knockFriction;
      if (enemy.boss) { this.updateBoss(enemy, dt, living); continue; }
      if (enemy.eventType === "treasure") {
        enemy.life -= dt;
        if (enemy.life <= 0) { enemy.dead = true; this.pushEvent("danger", "Treasure signal escaped", "The runner vanished into the breach"); continue; }
        if (enemy.stun > 0) continue;
        const hunter = living.reduce((best, player) => !best || distance(enemy, player) < distance(enemy, best) ? player : best, null);
        if (!hunter) continue;
        let angle = angleTo(hunter, enemy);
        if (Math.abs(enemy.x) > WORLD.width / 2 - 240 || Math.abs(enemy.y) > WORLD.height / 2 - 240) angle = Math.atan2(-enemy.y, -enemy.x);
        enemy.x = clamp(enemy.x + Math.cos(angle) * enemy.speed * dt, -WORLD.width / 2 + 55, WORLD.width / 2 - 55);
        enemy.y = clamp(enemy.y + Math.sin(angle) * enemy.speed * dt, -WORLD.height / 2 + 55, WORLD.height / 2 - 55);
        continue;
      }
      if (enemy.stun > 0) continue;
      const target = living.reduce((best, p) => !best || distance(enemy, p) < distance(enemy, best) ? p : best, null);
      if (!target) continue;
      const a = angleTo(enemy, target), type = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.mite;
      const desired = type.ranged ? 330 : 0;
      const d = distance(enemy, target);
      if (d > desired + 25) {
        enemy.x += Math.cos(a) * enemy.speed * dt;
        enemy.y += Math.sin(a) * enemy.speed * dt;
      } else if (type.ranged && d < desired - 70) {
        enemy.x -= Math.cos(a) * enemy.speed * .6 * dt;
        enemy.y -= Math.sin(a) * enemy.speed * .6 * dt;
      }
      if (type.ranged && enemy.shotCd <= 0) {
        enemy.shotCd = this.random(1.6, 2.4);
        const v = fromAngle(a, 260);
        this.hostile.push({ id: this.nextGameplayId("h"), ownerId: enemy.id, x: enemy.x, y: enemy.y, vx: v.x, vy: v.y, radius: 9, damage: enemy.damage * this.difficulty.spell, life: 4, color: enemy.color, dead: false });
      }
      if (type.bomber && d < 70 && !enemy.detonationScheduled) {
        enemy.detonationScheduled = true;
        this.effects.push({ id: this.nextCosmeticId("fx"), x: enemy.x, y: enemy.y, radius: 150, life: .55, maxLife: .55, damage: 0, owner: "enemy", color: enemy.color, kind: "danger" });
        this.scheduleTask("bomber-detonate", .5, { enemyId: enemy.id });
      }
      if (circleHit(enemy, target, -4) && enemy.attackCd <= 0) {
        enemy.attackCd = enemy.miniboss ? 1.3 : .8;
        this.takeDamage(target, enemy.damage, enemy);
      }
    }
  }

  updateBoss(boss, dt, living) {
    const target = living.reduce((best, p) => !best || distance(boss, p) < distance(boss, best) ? p : best, null);
    if (!target || boss.stun > 0) return;
    const a = angleTo(boss, target), speedBoost = this.enraged ? 1.35 : 1;
    if (distance(boss, target) > 120) { boss.x += Math.cos(a) * boss.speed * speedBoost * dt; boss.y += Math.sin(a) * boss.speed * speedBoost * dt; }
    if (circleHit(boss, target, 8) && boss.attackCd <= 0) { boss.attackCd = 1.1; this.takeDamage(target, boss.damage * (this.enraged ? 1.2 : 1), boss); }
    if (boss.shotCd <= 0) {
      boss.shotCd = this.map.id === "lab" ? 1.3 : 2.2;
      const count = this.map.id === "lab" ? 12 : this.map.id === "beachhead" ? 8 : 5;
      for (let i = 0; i < count; i++) {
        const shotAngle = this.map.id === "lab" ? i * TAU / count + this.time * .15 : a + (i - (count - 1) / 2) * .22;
        const v = fromAngle(shotAngle, this.map.id === "beachhead" ? 330 : 240);
        this.hostile.push({ id: this.nextGameplayId("h"), ownerId: boss.id, bossShot: true, x: boss.x, y: boss.y, vx: v.x, vy: v.y, radius: 13, damage: boss.damage * .72 * this.difficulty.spell, life: 6, color: this.map.accent, dead: false });
      }
      this.effects.push({ id: this.nextCosmeticId("fx"), x: boss.x, y: boss.y, radius: 170, life: .45, maxLife: .45, damage: 0, owner: "enemy", color: this.map.accent, kind: "bossCast" });
    }
    if (this.map.id === "outskirts" && boss.attackCd <= .02 && this.chance(dt * 5)) {
      boss.x = clamp(boss.x + Math.cos(a) * 170, -WORLD.width/2, WORLD.width/2);
      boss.y = clamp(boss.y + Math.sin(a) * 170, -WORLD.height/2, WORLD.height/2);
    }
    if (this.map.id === "beachhead" && this.bossPhase === 1 && boss.hp <= boss.maxHp * .5) {
      this.bossPhase = 2; boss.hp = boss.maxHp * .62; boss.damage *= 1.25;
      this.pushEvent("danger", "Abyss Blade · phase two", "The ocean is rising from the east");
    }
    if (this.map.id === "beachhead" && this.bossPhase === 2) {
      const floodX = WORLD.width / 2 - clamp(this.bossElapsed * 24, 0, WORLD.width / 2);
      for (const p of living) if (p.x > floodX) this.takeDamage(p, .5 * dt / .165);
    }
  }

  takeDamage(p, amount, source = null) {
    if (p.invuln > 0 || p.hitGrace > 0 || p.dead || p.downed) return;
    if (p.iceReady) {
      p.iceReady = false;
      for (const enemy of this.enemies) if (distance(p, enemy) < 230) enemy.stun = Math.max(enemy.stun, 2.4);
      this.effects.push({ id: this.nextCosmeticId("fx"), x: p.x, y: p.y, radius: 230, life: .55, maxLife: .55, damage: 0, owner: p.id, color: "#9de7ff", kind: "freeze" });
      return;
    }
    const reduction = 100 / (100 + Math.max(0, p.armor));
    const scaledAmount = source?.bossShot ? Math.max(amount, p.maxHp * .36 / reduction) : amount;
    let damage = scaledAmount * reduction;
    if (p.frenzy > 0) damage *= p.hp < p.maxHp * .5 ? .5 : .75;
    if (p.shield > 0) { const blocked = Math.min(p.shield, damage); p.shield -= blocked; damage -= blocked; }
    p.damageTaken += Math.max(0, Math.min(damage, p.hp));
    p.hp -= damage; p.lastHit = this.time;
    let impactAngle = p.facing + Math.PI;
    if (source && (source.vx || source.vy)) impactAngle = Math.atan2(source.vy || 0, source.vx || 0);
    else if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) impactAngle = Math.atan2(p.y - source.y, p.x - source.x);
    const knockback = clamp(75 + amount * 1.8, 85, source?.boss ? 320 : 235);
    p.knockVx = (p.knockVx || 0) + Math.cos(impactAngle) * knockback;
    p.knockVy = (p.knockVy || 0) + Math.sin(impactAngle) * knockback;
    p.hurtAngle = impactAngle; p.hurtFlash = .24;
    p.animState = "hurt"; p.animTime = .24;
    const attacker = source?.ownerId ? this.enemies.find((enemy) => enemy.id === source.ownerId) : this.enemies.includes(source) ? source : null;
    if (attacker) { attacker.attackFlash = .2; attacker.attackAngle = impactAngle; }
    // Prevent stacked contact bodies from applying a whole pack's damage in a
    // single frame while keeping individual hits meaningful.
    p.hitGrace = .22;
    this.effects.push({ id: this.nextCosmeticId("fx"), x: p.x, y: p.y, radius: p.radius * 1.8, life: .24, maxLife: .24, damage: 0, owner: "enemy", color: "#ff405f", kind: "hurt", angle: impactAngle });
    if (p.hp <= 0) this.downPlayer(p);
  }

  downPlayer(p) {
    p.hp = 0; p.deaths++; p.animState = "down"; p.animTime = 10;
    if (this.players.length === 1) { p.dead = true; this.lose(`${p.name} was overwhelmed.`); return; }
    p.downed = true; p.downTimer = 10; p.reviveProgress = 0;
    this.pushEvent("danger", `${p.name} is down`, "Stand in the ring to revive");
  }

  revive(p) {
    p.dead = false; p.downed = false; p.hp = p.maxHp * .5; p.invuln = 4; p.reviveProgress = 0; p.respawnTimer = 0; p.animState = "revive"; p.animTime = .4;
    resetPlayerMovement(p);
    this.pushEvent("boon", `${p.name} rejoined`, "Four seconds of invulnerability");
  }

  damageEnemy(enemy, amount, ownerId, critical = false, source = "") {
    if (enemy.dead) return;
    const dealt = Math.min(amount, Math.max(0, enemy.hp));
    enemy.hp -= amount; enemy.hitFlash = .1;
    if (source === "hex") enemy.hexed = 8;
    const owner = this.players.find((p) => p.id === ownerId);
    if (owner) {
      owner.damage += dealt;
      const sourceKey = String(source || "other");
      owner.damageBySource[sourceKey] = (owner.damageBySource[sourceKey] || 0) + dealt;
      const impactAngle = Math.atan2(enemy.y - owner.y, enemy.x - owner.x), knockback = clamp(amount * .28, 8, enemy.boss ? 22 : 72);
      enemy.hitAngle = impactAngle; enemy.knockVx = (enemy.knockVx || 0) + Math.cos(impactAngle) * knockback; enemy.knockVy = (enemy.knockVy || 0) + Math.sin(impactAngle) * knockback;
      if (owner.specialist === "rift" && dealt > 0) {
        const tuning = BALANCE.identityTuning.rift;
        this.grantShieldAmount(owner, dealt * tuning.damageShieldRatio, tuning.damageShieldCapMaxHealth);
      }
    }
    if (critical || amount > 180) this.effects.push({ id: this.nextCosmeticId("n"), x: enemy.x, y: enemy.y - enemy.radius, radius: 0, life: .55, maxLife: .55, damage: Math.round(amount), owner: ownerId, color: critical ? "#ffe073" : "#fff", kind: "number", critical });
    if (enemy.hp <= 0) this.killEnemy(enemy, ownerId);
  }

  killEnemy(enemy, ownerId) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.kills++;
    const owner = this.players.find((p) => p.id === ownerId);
    if (owner) owner.kills++;
    if (owner?.healthbackBuff > 0) owner.hp = Math.min(owner.maxHp, owner.hp + owner.maxHp * .018);
    if (enemy.boss) { this.win(); return; }
    if (enemy.eventType === "treasure") {
      this.gold += Math.round(110 * this.difficulty.gold); this.teamXP += this.xpNeed;
      for (let i = 0; i < 2; i++) this.drops.push({ id: this.nextGameplayId("d"), type: "card", x: enemy.x + this.random(-34, 34), y: enemy.y + this.random(-34, 34), radius: 18 });
      for (let i = 0; i < 5; i++) this.drops.push({ id: this.nextGameplayId("d"), type: "gold", x: enemy.x + this.random(-55, 55), y: enemy.y + this.random(-55, 55), radius: 9 });
      this.pushEvent("upgrade", "Treasure runner caught", "Bonus gold, data, and access cards recovered");
    }
    this.orbs.push({ id: this.nextGameplayId("x"), x: enemy.x, y: enemy.y, radius: enemy.elite || enemy.miniboss ? 10 : 5, value: enemy.xp, color: enemy.elite ? "#d7fdff" : "#63f2df", dead: false });
    if (this.chance(.035)) this.drops.push({ id: this.nextGameplayId("d"), type: "gold", x: enemy.x + this.random(-8, 8), y: enemy.y + this.random(-8, 8), radius: 9 });
    if (enemy.elite || enemy.miniboss) {
      this.drops.push({ id: this.nextGameplayId("d"), type: "card", x: enemy.x, y: enemy.y, radius: 18 });
      this.gold += Math.round((enemy.elite ? 14 : 25) * this.difficulty.gold);
    }
    if (owner?.specialist === "zuri") {
      owner.hotKills += enemy.elite ? 70 : 1;
      if (owner.hotKills >= 70) { owner.hotKills %= 70; owner.hotStacks++; owner.hotTime = 8; }
    }
    this.effects.push({ id: this.nextCosmeticId("fx"), x: enemy.x, y: enemy.y, radius: enemy.radius * 1.8, life: .22, maxLife: .22, damage: 0, owner: ownerId, color: enemy.color, kind: "pop" });
  }

  breakPod(pod) {
    pod.dead = true;
    const roll = this.gameplayRng.nextFloat();
    const type = roll < .28 ? "heal" : roll < .48 ? "vacuum" : roll < .74 ? "mine" : "gold";
    this.drops.push({ id: this.nextGameplayId("d"), type, x: pod.x, y: pod.y, radius: 15 });
  }

  updatePickups(dt) {
    for (const orb of this.orbs) {
      let collector = null, target = null, best = Infinity;
      for (const p of this.players) {
        if (p.dead || p.downed) continue;
        const d = distance(orb, p), range = this.playerStat(p, "pickup") + (p.specialist === "vesper" ? 180 : 0);
        if ((orb.vacuumTarget === p.id || d < range) && d < best) { collector = p; target = p; best = d; }
      }
      for (const drone of this.drones) {
        const owner = this.players.find((p) => p.id === drone.owner && !p.dead && !p.downed);
        if (!owner) continue;
        const d = distance(orb, drone), range = 115 + drone.level * 38 + (drone.evolved ? 95 : 0);
        if (d < range && d < best) { collector = drone; target = owner; best = d; }
      }
      if (target && collector) {
        const a = angleTo(orb, collector), droneBonus = collector.owner ? 55 + collector.level * 15 : 0;
        const speed = (orb.vacuumTarget ? 760 : 240) + (this.playerStat(target, "pickup") - 85) * 1.4 + droneBonus;
        orb.x += Math.cos(a) * speed * dt; orb.y += Math.sin(a) * speed * dt;
        if (target.specialist === "vesper" && this.chance(dt * 8)) this.blast(orb.x, orb.y, 30, 9 + this.level * 1.3, target.id, SPECIALISTS.vesper.color, false, "pickup");
        if (circleHit(orb, collector, 4)) {
          const gained = orb.value * (1 + Number(target.passives.xp || 0) * .1);
          orb.dead = true; target.xpCollected += gained; this.teamXP += gained;
          if (collector.owner) collector.collectFlash = .24;
          if (this.cosmeticChance(.35)) this.effects.push({ id: this.nextCosmeticId("fx"), x: target.x, y: target.y, radius: 24, life: .18, maxLife: .18, damage: 0, owner: target.id, color: orb.color, kind: "pickup" });
        }
      }
    }
    for (const drop of this.drops) {
      const target = this.players.find((p) => !p.dead && !p.downed && distance(drop, p) < p.radius + drop.radius + 8);
      if (!target) continue;
      drop.dead = true;
      this.effects.push({ id: this.nextCosmeticId("fx"), x: target.x, y: target.y, radius: drop.type === "card" ? 72 : 38, life: .32, maxLife: .32, damage: 0, owner: target.id, color: drop.type === "card" ? "#f7d76a" : "#63f2df", kind: "pickup" });
      if (drop.type === "card") this.useAccessCard();
      else if (drop.type === "gold") this.gold += Math.round(8 * this.difficulty.gold);
      else if (drop.type === "heal") for (const p of this.players) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .2);
      else if (drop.type === "vacuum") {
        for (const orb of this.orbs) if (!orb.dead) orb.vacuumTarget = target.id;
        this.effects.push({ id: this.nextCosmeticId("fx"), x: target.x, y: target.y, radius: 460, life: .5, maxLife: .5, damage: 0, owner: target.id, color: "#63f2df", kind: "vacuum" });
        this.pushEvent("boon", "Data vacuum engaged", "Every loose shard is inbound");
      }
      else if (drop.type === "mine") for (const enemy of this.enemies) if (!enemy.boss) this.damageEnemy(enemy, 260, target.id, false, "seaMine");
    }
    while (!this.paused && this.teamXP >= this.xpNeed && this.stage !== "won" && this.stage !== "lost") {
      this.teamXP -= this.xpNeed;
      this.level++;
      this.xpNeed = Math.round(BALANCE.waves.xp.base * Math.pow(this.level, BALANCE.waves.xp.exponent));
      if (this.level >= BALANCE.waves.xp.activeLevel && this.level - BALANCE.waves.xp.activeLevel <= 1) this.pushEvent("upgrade", "Active ability online", "Press E to cast");
      if (this.level >= BALANCE.waves.xp.ultimateLevel && this.level - BALANCE.waves.xp.ultimateLevel <= 1) this.pushEvent("upgrade", "Ultimate online", "Press R when the line breaks");
      this.beginUpgradeChoice();
    }
  }

  beginUpgradeChoice() {
    this.paused = true; this.pauseReason = "upgrade"; this.pendingChoices = {}; this.choiceReady = {}; this.selectedChoices = {};
    for (const p of this.players) {
      this.pendingChoices[p.id] = this.generateChoices(p);
      this.choiceReady[p.id] = false;
    }
  }

  generateChoices(p) {
    const candidates = [];
    const sig = p.weapons.signature;
    if (sig.level < BALANCE.core.maxWeaponLevel) {
      const signature = SPECIALISTS[p.specialist].signature;
      candidates.push({ id: "weapon:signature", kind: "weapon", name: signature.name, copy: "Upgrade your specialist's signature weapon.", glyph: signature.glyph, icon: signature.icon, level: sig.level + 1, max: BALANCE.core.maxWeaponLevel });
    }
    const weaponSlots = Object.keys(p.weapons).length;
    for (const weapon of Object.values(WEAPONS)) {
      const current = p.weapons[weapon.id];
      if (current && current.level < BALANCE.core.maxWeaponLevel) candidates.push({ id: `weapon:${weapon.id}`, kind: "weapon", name: weapon.name, copy: weapon.copy, glyph: weapon.glyph, icon: weapon.icon, level: current.level + 1, max: BALANCE.core.maxWeaponLevel });
      else if (!current && weaponSlots < BALANCE.core.maxWeaponSlots) candidates.push({ id: `weapon:${weapon.id}`, kind: "weapon", name: weapon.name, copy: weapon.copy, glyph: weapon.glyph, icon: weapon.icon, level: 1, max: BALANCE.core.maxWeaponLevel });
    }
    const passiveSlots = Object.keys(p.passives).filter((key) => p.passives[key] >= 1).length;
    for (const passive of Object.values(PASSIVES)) {
      const current = Number(p.passives[passive.id] || 0);
      if ((current > 0 && current < passive.max) || (current === 0 && passiveSlots < BALANCE.core.maxPassiveSlots)) candidates.push({ id: `passive:${passive.id}`, kind: "passive", name: passive.name, copy: passive.amount, glyph: passive.glyph, icon: passive.icon, level: Math.floor(current) + 1, max: passive.max });
    }
    const chosen = [];
    while (candidates.length && chosen.length < 3) chosen.push(candidates.splice(this.gameplayRng.int(candidates.length), 1)[0]);
    if (!chosen.length) chosen.push({ id: "heal", kind: "utility", name: "Field Repair", copy: "Restore 25% health.", glyph: "+", icon: PASSIVES.regen.icon, level: 1, max: 1 });
    return chosen;
  }

  choose(playerId, choiceId) {
    if (!this.pendingChoices?.[playerId] || this.choiceReady[playerId]) return;
    const choice = this.pendingChoices[playerId].find((item) => item.id === choiceId);
    const p = this.players.find((player) => player.id === playerId);
    if (!choice || !p) return;
    this.applyUpgrade(p, choice);
    this.selectedChoices[playerId] = choiceId;
    this.choiceReady[playerId] = true;
    this.maybeResumeFromChoices();
  }

  applyUpgrade(p, choice) {
    applyPlayerUpgrade(p, choice);
    this.gold += 10;
  }

  maybeResumeFromChoices() {
    if (!this.pendingChoices || !Object.keys(this.pendingChoices).every((playerId) => this.choiceReady[playerId])) return;
    this.pendingChoices = null; this.choiceReady = {}; this.selectedChoices = {}; this.paused = false; this.pauseReason = "";
  }

  useAccessCard() {
    const upgraded = [];
    for (const p of this.players) {
      let evolved = false;
      for (const [weaponId, state] of Object.entries(p.weapons)) {
        const requirement = weaponId === "signature" ? SPECIALISTS[p.specialist].signature.passive : WEAPONS[weaponId]?.passive;
        if (state.level >= BALANCE.core.maxWeaponLevel && !state.evolved && Number(p.passives[requirement] || 0) > 0) {
          state.evolved = true; evolved = true;
          const name = weaponId === "signature" ? SPECIALISTS[p.specialist].signature.evolve : WEAPONS[weaponId].evolve;
          upgraded.push(`${p.name}: ${name}`); break;
        }
      }
      if (!evolved) {
        const options = Object.entries(p.weapons).filter(([, state]) => state.level < BALANCE.core.maxWeaponLevel);
        if (options.length) { const [weaponId, state] = this.pick(options); state.level++; upgraded.push(`${p.name}: ${weaponId === "signature" ? SPECIALISTS[p.specialist].signature.name : WEAPONS[weaponId].name} +1`); }
        else p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .25);
      }
    }
    this.pushEvent("upgrade", "Access key decrypted", upgraded.join(" · ") || "Squad repaired");
  }

  spawnBoss() {
    this.stage = "boss"; this.remaining = 0; this.enemies = this.enemies.filter((enemy) => enemy.elite || enemy.miniboss);
    const boss = BALANCE.waves.boss;
    const health = boss.baseHealth * this.difficulty.health * (1 + (this.players.length - 1) * boss.healthPerAdditionalPlayer);
    this.enemies.push({ id: this.nextGameplayId("boss"), type: "boss", x: 720, y: 0, radius: 92, hp: health, maxHp: health, speed: boss.speed, damage: boss.contactDamage * this.difficulty.attack, color: this.map.accent, elite: false, miniboss: false, boss: true, attackCd: 1, shotCd: 1.5, stun: 0, hitFlash: 0, attackFlash: 0, spawnLife: .5, knockVx: 0, knockVy: 0, dead: false, xp: 0 });
    this.pushEvent("danger", `${this.map.boss} HAS ARRIVED`, "Defeat the apex before enrage");
  }

  win() {
    this.stage = "won"; this.paused = false;
    for (const player of this.players) { player.animState = "victory"; player.animTime = 10; }
    this.pushEvent("victory", "Apex neutralized", "Final City gets another sunrise");
  }
  lose(copy) { if (this.stage === "won") return; this.stage = "lost"; this.paused = false; this.pushEvent("defeat", "Operation lost", copy); }

  pushEvent(type, title, copy = "") {
    this.events.push({ seq: this.eventSequence++, type, title, copy, at: this.tick });
    if (this.events.length > 20) this.events.splice(0, this.events.length - 20);
  }

  cleanup() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((e) => !e.dead);
    this.hostile = this.hostile.filter((e) => !e.dead);
    this.effects = this.effects.filter((e) => e.life > 0 || (e.delayed && !e.triggered));
    this.orbs = this.orbs.filter((e) => !e.dead);
    this.drops = this.drops.filter((e) => !e.dead);
    this.pods = this.pods.filter((e) => !e.dead);
    this.objectives = this.objectives.filter((e) => !e.done);
    this.relayBalls = this.relayBalls.filter((e) => !e.done);
    this.feathers = this.feathers.filter((e) => !e.dead && e.life > 0);
    // Preserve damage fields and telegraphs while bounding disposable combat
    // flashes during late-wave projectile storms.
    if (this.effects.length > 260) {
      let overflow = this.effects.length - 260;
      this.effects = this.effects.filter((effect) => {
        const cosmetic = !effect.delayed && (effect.kind === "number" || (!effect.damage && ["pickup", "pop", "hurt"].includes(effect.kind)));
        if (cosmetic && overflow > 0) { overflow--; return false; }
        return true;
      });
    }
  }

  deterministicState() {
    return {
      seed: this.seed,
      balanceVersion: this.balanceVersion,
      balanceHash: this.balanceHash,
      features: { gameplayVersion: this.gameplayVersion, objectiveEvents: this.objectiveEvents },
      tick: this.tick,
      rng: { gameplay: this.gameplayRng.snapshot(), cosmetic: this.cosmeticRng.snapshot() },
      sequences: { gameplay: this.gameplaySequence, cosmetic: this.cosmeticSequence, event: this.eventSequence },
      tasks: this.tasks.map((task) => ({ id: task.id, dueTick: task.dueTick, kind: task.kind, payload: { ...task.payload } })),
    };
  }

  exportRecoveryState() {
    if (this.stage !== "running" && this.stage !== "boss") throw new TypeError("Only an active run can be checkpointed");
    const usedSlots = new Set();
    const playerIds = new Map();
    for (const [index, player] of this.players.entries()) {
      const slot = replaySlot(player.replaySlot) ?? index;
      if (slot > 3 || usedSlots.has(slot)) throw new TypeError("Recovery roster requires unique anonymous slots");
      usedSlots.add(slot); playerIds.set(player.id, `slot-${slot}`);
    }
    const players = this.players.map((player, index) => {
      const sanitized = {};
      for (const [key, value] of Object.entries(player)) {
        if (key === "name" || key === "reconnectKey") continue;
        sanitized[key] = serializeRecoveryValue(value, playerIds);
      }
      sanitized.id = playerIds.get(player.id);
      sanitized.replaySlot = replaySlot(player.replaySlot) ?? index;
      return sanitized;
    });
    const scalars = Object.fromEntries(RECOVERY_SCALARS.map((key) => [key, this[key]]));
    const lists = Object.fromEntries(Object.keys(RECOVERY_LIST_LIMITS).map((key) => [key, serializeRecoveryValue(this[key], playerIds)]));
    return {
      version: RECOVERY_STATE_VERSION,
      header: {
        seed: this.seed, balanceVersion: this.balanceVersion, balanceHash: this.balanceHash,
        gameplayVersion: this.gameplayVersion, objectiveEvents: this.objectiveEvents,
        map: this.map.id, difficulty: this.difficulty.id, duration: this.duration,
      },
      rng: { gameplay: this.gameplayRng.snapshot(), cosmetic: this.cosmeticRng.snapshot() },
      sequences: { gameplay: this.gameplaySequence, cosmetic: this.cosmeticSequence, event: this.eventSequence },
      scalars,
      machine: serializeRecoveryValue(this.machine, playerIds),
      players,
      lists,
      pendingChoices: recoveryRecord(this.pendingChoices, playerIds),
      choiceReady: recoveryRecord(this.choiceReady, playerIds),
      selectedChoices: recoveryRecord(this.selectedChoices, playerIds),
    };
  }

  static fromRecoveryState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== RECOVERY_STATE_VERSION) throw new TypeError("Unsupported recovery state");
    const expected = ["version", "header", "rng", "sequences", "scalars", "machine", "players", "lists", "pendingChoices", "choiceReady", "selectedChoices"];
    const actual = Object.keys(value).sort();
    if (actual.length !== expected.length || expected.sort().some((key, index) => key !== actual[index])) throw new TypeError("Recovery state has unexpected fields");
    const header = value.header;
    if (!header || !MAPS[header.map] || !DIFFICULTIES[header.difficulty] || !Number.isFinite(header.duration) || header.duration < 60 || header.duration > 3_600) throw new TypeError("Recovery header is invalid");
    if (!Array.isArray(value.players) || value.players.length < 1 || value.players.length > 4) throw new TypeError("Recovery roster is invalid");
    const slots = new Set();
    const roster = value.players.map((stored, index) => {
      const slot = replaySlot(stored?.replaySlot);
      if (slot === undefined || slots.has(slot) || stored.id !== `slot-${slot}` || !SPECIALISTS[stored.specialist]) throw new TypeError(`Recovery player ${index} is invalid`);
      slots.add(slot);
      return { id: stored.id, name: `Specialist ${slot + 1}`, specialist: stored.specialist, replaySlot: slot };
    });
    if (!value.scalars || !RECOVERY_SCALARS.every((key) => Object.hasOwn(value.scalars, key))) throw new TypeError("Recovery scalars are incomplete");
    if (!Number.isInteger(value.scalars.tick) || value.scalars.tick < 0 || !["running", "boss"].includes(value.scalars.stage)) throw new TypeError("Recovery progress is invalid");
    for (const key of RECOVERY_SCALARS) {
      const entry = value.scalars[key];
      if (typeof entry === "number" && !Number.isFinite(entry)) throw new TypeError(`Recovery scalar ${key} is invalid`);
    }
    if (!value.lists || typeof value.lists !== "object") throw new TypeError("Recovery lists are invalid");
    for (const [key, limit] of Object.entries(RECOVERY_LIST_LIMITS)) {
      if (!Array.isArray(value.lists[key]) || value.lists[key].length > limit) throw new TypeError(`Recovery list ${key} exceeds bounds`);
    }
    const sim = new Simulation({
      map: header.map, difficulty: header.difficulty, duration: header.duration, players: roster,
      balanceVersion: header.balanceVersion, balanceHash: header.balanceHash,
      features: { gameplayVersion: header.gameplayVersion, objectiveEvents: header.objectiveEvents },
    }, {
      seed: header.seed, balanceVersion: header.balanceVersion, balanceHash: header.balanceHash,
      features: { gameplayVersion: header.gameplayVersion, objectiveEvents: header.objectiveEvents },
    });
    sim.gameplayRng = SeededRng.fromSnapshot(value.rng?.gameplay);
    sim.cosmeticRng = SeededRng.fromSnapshot(value.rng?.cosmetic);
    for (const key of RECOVERY_SCALARS) sim[key] = value.scalars[key];
    for (const [key, stored] of Object.entries(value.sequences || {})) {
      if (!Number.isInteger(stored) || stored < 1) throw new TypeError(`Recovery sequence ${key} is invalid`);
    }
    sim.gameplaySequence = value.sequences.gameplay;
    sim.cosmeticSequence = value.sequences.cosmetic;
    sim.eventSequence = value.sequences.event;
    sim.machine = deserializeRecoveryValue(value.machine);
    sim.players = value.players.map((stored) => {
      const restored = deserializeRecoveryValue(stored);
      restored.name = `Specialist ${restored.replaySlot + 1}`;
      restored.reconnectKey = "";
      return restored;
    });
    for (const key of Object.keys(RECOVERY_LIST_LIMITS)) sim[key] = deserializeRecoveryValue(value.lists[key]);
    sim.pendingChoices = deserializeRecoveryValue(value.pendingChoices);
    sim.choiceReady = deserializeRecoveryValue(value.choiceReady) || {};
    sim.selectedChoices = deserializeRecoveryValue(value.selectedChoices) || {};
    sim.events = [];
    sim.disconnectedPlayers = new Map();
    return sim;
  }

  snapshot() {
    const clean = (list, omit = []) => list.map((entry) => {
      const result = {};
      for (const [key, value] of Object.entries(entry)) {
        if (omit.includes(key) || value instanceof Set || typeof value === "function") continue;
        result[key] = typeof value === "number" ? Math.round(value * 10) / 10 : value;
      }
      return result;
    });
    return {
      balanceVersion: this.balanceVersion, balanceHash: this.balanceHash,
      features: { gameplayVersion: this.gameplayVersion, objectiveEvents: this.objectiveEvents },
      tick: this.tick, determinism: this.deterministicState(),
      map: this.map.id, difficulty: this.difficulty.id, duration: this.duration, time: Math.round(this.time * 10) / 10,
      remaining: Math.round(this.remaining * 10) / 10, stage: this.stage, paused: this.paused, pauseReason: this.pauseReason,
      wave: this.wave, waveName: WAVE_NAMES[this.stage === "boss" ? 7 : this.wave], teamXP: Math.round(this.teamXP),
      level: this.level, xpNeed: this.xpNeed, kills: this.kills, gold: this.gold, bossElapsed: this.bossElapsed,
      bossPhase: this.bossPhase, enraged: this.enraged, machine: compactPoint(this.machine),
      players: clean(this.players, ["input", "reconnectKey"]), drones: clean(this.drones), enemies: clean(this.enemies), projectiles: clean(this.projectiles, ["hit"]),
      hostile: clean(this.hostile), effects: clean(this.effects, ["hit"]), orbs: clean(this.orbs), drops: clean(this.drops),
      pods: clean(this.pods), objectives: clean(this.objectives), relayBalls: clean(this.relayBalls), feathers: clean(this.feathers),
      pendingChoices: this.pendingChoices, choiceReady: this.choiceReady, selectedChoices: this.selectedChoices, events: this.events.slice(-5),
    };
  }
}

export { WORLD };
