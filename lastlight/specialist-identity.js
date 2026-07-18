import { BALANCE_CONFIG, BALANCE_IDS, BALANCE_VERSION } from "./balance-config.js?v=20260718.1";
import { SPECIALISTS } from "./data.js?v=20260718.1";

export const SPECIALIST_IDENTITY_VERSION = "lastlight.specialist-identity.v1";

const ENUMS = Object.freeze({
  tier: ["none", "low", "medium", "high", "very-high"],
  range: ["close", "mid", "long"],
  cadence: ["sustained", "burst", "gated", "periodic", "setup-payoff"],
  trigger: ["level", "signature-rank", "signature-evolution", "kill-count", "flow", "distance", "health-ratio", "player-level", "stored-object"],
  source: ["balance-config", "engine", "catalog"],
  role: ["gunner", "support", "vanguard", "controller", "brawler", "duelist", "skirmisher", "caster", "ranger"],
  specialization: ["ramping-damage", "projectile-support", "armor-scaling", "sustain-zones", "missing-health-power", "critical-flow", "movement-damage", "hex-detonation", "pickup-offense"],
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const coreBreakpoints = (cooldownE, cooldownR, passive, extra = []) => [
  { id: "active-unlock", trigger: { kind: "level", value: 3 }, effect: `Active unlocks (${cooldownE}s base cooldown).`, source: "balance-config" },
  { id: "ultimate-unlock", trigger: { kind: "level", value: 6 }, effect: `Ultimate unlocks (${cooldownR}s base cooldown).`, source: "balance-config" },
  { id: "signature-cap", trigger: { kind: "signature-rank", value: 5 }, effect: "Signature reaches its maximum authored rank.", source: "balance-config" },
  { id: "signature-evolution", trigger: { kind: "signature-evolution", value: passive }, effect: `Maximum signature rank plus at least one ${passive} passive rank makes the signature eligible; an elite access card performs the evolution.`, source: "engine" },
  ...extra,
];

const specialists = {
  zuri: {
    id: "zuri", name: "Zuri", role: { primary: "gunner", specialization: "ramping-damage" }, range: "long",
    mobility: { tier: "high", baseSpeed: 285, profile: "skirmisher", facing: "aim", sources: ["fast-base-speed"] },
    durability: { tier: "low", baseHealth: 10, baseArmor: 0, sources: ["range-only"] },
    damageShape: { cadence: "burst", deliveries: ["projectile", "explosion"], patterns: ["aimed-fan", "large-radius-finisher"] },
    scaling: { primary: ["signature-rank", "haste", "projectiles", "kill-count"], secondary: ["damage", "area"] },
    safety: { tier: "low", tools: ["long-range", "fast-base-speed"] }, control: { tier: "none", tools: [] }, support: { tier: "none", tools: [] },
    objectiveValue: { tier: "medium", contributions: ["fast-rotation", "ranged-threat-clear"], limits: ["no-direct-objective-modifier", "no-defensive-utility"] },
    failureModes: [
      { id: "streak-downtime", condition: "Seventy kills are not secured before pressure peaks.", consequence: "Hot Streak's haste and damage window is unavailable." },
      { id: "caught-without-peel", condition: "Enemies close through projectile range.", consequence: "No shield, control, dash, sustain, or invulnerability can reset spacing." },
    ],
    breakpoints: coreBreakpoints(8, 50, "haste", [{ id: "hot-streak", trigger: { kind: "kill-count", value: 70 }, effect: "70 normal kills or one elite starts 8s of +150 haste, +18% damage, and +10% movement speed per concurrent stack (maximum five).", source: "engine" }]),
  },
  echo: {
    id: "echo", name: "Echo", role: { primary: "support", specialization: "projectile-support" }, range: "long",
    mobility: { tier: "medium", baseSpeed: 275, profile: "gunner", facing: "aim", sources: ["temporary-squad-speed"] },
    durability: { tier: "medium", baseHealth: 10, baseArmor: 0, sources: ["self-shield", "squad-invulnerability"] },
    damageShape: { cadence: "burst", deliveries: ["piercing-projectile", "area-pulse"], patterns: ["aimed-fan", "global-control"] },
    scaling: { primary: ["signature-rank", "projectiles", "haste"], secondary: ["duration", "area"] },
    safety: { tier: "very-high", tools: ["squad-shield", "temporary-squad-speed", "squad-invulnerability", "global-stun"] }, control: { tier: "very-high", tools: ["global-stun"] }, support: { tier: "very-high", tools: ["squad-shield", "temporary-squad-speed", "squad-invulnerability"] },
    objectiveValue: { tier: "very-high", contributions: ["protect-capturers", "accelerate-rotation", "global-pressure-reset"], limits: ["no-direct-objective-modifier", "long-cooldowns"] },
    failureModes: [
      { id: "cooldown-window", condition: "Active and ultimate are spent before a critical contest.", consequence: "Baseline defenses return to 10 health and 0 armor." },
      { id: "ally-spacing", condition: "Allies are outside the active's 800-unit radius.", consequence: "They receive neither shield nor speed." },
    ],
    breakpoints: coreBreakpoints(16, 90, "projectiles"),
  },
  sola: {
    id: "sola", name: "Sola", role: { primary: "vanguard", specialization: "armor-scaling" }, range: "mid",
    mobility: { tier: "low", baseSpeed: 245, profile: "vanguard", facing: "hybrid", sources: ["no-native-dash"] },
    durability: { tier: "very-high", baseHealth: 11, baseArmor: 25, sources: ["high-base-armor", "self-shield", "temporary-armor"] },
    damageShape: { cadence: "periodic", deliveries: ["piercing-projectile", "delayed-area"], patterns: ["aimed-fan", "large-radius-stun"] },
    scaling: { primary: ["armor", "max-health", "regeneration", "area"], secondary: ["signature-rank", "haste"] },
    safety: { tier: "high", tools: ["high-base-armor", "self-shield", "temporary-armor"] }, control: { tier: "high", tools: ["large-radius-stun"] }, support: { tier: "medium", tools: ["frontline-presence", "large-radius-stun"] },
    objectiveValue: { tier: "high", contributions: ["durable-body-presence", "area-denial", "large-radius-stun"], limits: ["no-direct-objective-modifier", "low-mobility"] },
    failureModes: [
      { id: "slow-rotation", condition: "The fight relocates beyond immediate range.", consequence: "Low speed and no dash delay impact." },
      { id: "armor-opportunity-cost", condition: "The build adds no armor, health, regeneration, or area.", consequence: "Signature damage and native area scaling underperform." },
    ],
    breakpoints: coreBreakpoints(17, 80, "armor", [{ id: "eclipse-armor", trigger: { kind: "level", value: 3 }, effect: "Eclipse Guard doubles current armor for three seconds; delayed shields remain inside the 50%-max-health active cap.", source: "engine" }]),
  },
  bront: {
    id: "bront", name: "Bront", role: { primary: "controller", specialization: "sustain-zones" }, range: "mid",
    mobility: { tier: "low", baseSpeed: 235, profile: "vanguard", facing: "contact", sources: ["short-ultimate-dash"] },
    durability: { tier: "very-high", baseHealth: 15, baseArmor: 15, sources: ["highest-base-health", "totem-regeneration"] },
    damageShape: { cadence: "periodic", deliveries: ["targeted-area", "persistent-area", "dash-impact"], patterns: ["nearest-target-blast", "sustain-zone", "large-radius-burst"] },
    scaling: { primary: ["duration", "area", "haste"], secondary: ["signature-rank", "damage"] },
    safety: { tier: "high", tools: ["highest-base-health", "totem-regeneration", "enemy-knockup"] }, control: { tier: "medium", tools: ["enemy-knockup", "persistent-area"] }, support: { tier: "high", tools: ["ally-totem-regeneration", "frontline-presence"] },
    objectiveValue: { tier: "very-high", contributions: ["durable-body-presence", "sustain-zone", "persistent-area"], limits: ["no-direct-objective-modifier", "slowest-base-speed"] },
    failureModes: [
      { id: "totem-displacement", condition: "The squad leaves the 260-unit healing radius.", consequence: "Totem regeneration provides no value." },
      { id: "targetless-signature", condition: "No enemy is within the signature's 700-unit search range.", consequence: "The signature fails to fire and retries later." },
    ],
    breakpoints: coreBreakpoints(12, 90, "duration"),
  },
  fang: {
    id: "fang", name: "Fang", role: { primary: "brawler", specialization: "missing-health-power" }, range: "close",
    mobility: { tier: "high", baseSpeed: 270, profile: "brawler", facing: "contact", sources: ["missing-health-speed", "active-dash", "ultimate-dash"] },
    durability: { tier: "high", baseHealth: 12, baseArmor: 15, sources: ["frenzy-damage-reduction", "frenzy-healing", "ultimate-invulnerability"] },
    damageShape: { cadence: "sustained", deliveries: ["close-area", "dash-impact"], patterns: ["contact-swipe", "cursor-dive"] },
    scaling: { primary: ["missing-health", "max-health", "haste"], secondary: ["duration", "area"] },
    safety: { tier: "medium", tools: ["frenzy-damage-reduction", "frenzy-healing", "ultimate-invulnerability", "active-dash", "ultimate-dash"] }, control: { tier: "none", tools: [] }, support: { tier: "none", tools: [] },
    objectiveValue: { tier: "medium", contributions: ["durable-body-presence", "fast-contest-entry", "close-threat-clear"], limits: ["no-direct-objective-modifier", "forced-contact-risk"] },
    failureModes: [
      { id: "contact-requirement", condition: "Targets remain outside swipe radius.", consequence: "Signature pressure and frenzy healing stop." },
      { id: "risk-threshold", condition: "Missing-health bonuses are pursued without mitigation or an exit.", consequence: "The power state also shortens time-to-down." },
    ],
    breakpoints: coreBreakpoints(17, 120, "maxHealth", [{ id: "missing-health-maximum", trigger: { kind: "health-ratio", value: 0 }, effect: "At zero health ratio the formulas reach +100% movement speed and +60% damage.", source: "engine" }]),
  },
  gale: {
    id: "gale", name: "Gale", role: { primary: "duelist", specialization: "critical-flow" }, range: "mid",
    mobility: { tier: "very-high", baseSpeed: 280, profile: "skirmisher", facing: "aim", sources: ["long-active-dash"] },
    durability: { tier: "medium", baseHealth: 9.5, baseArmor: 10, sources: ["self-shield", "brief-active-invulnerability"] },
    damageShape: { cadence: "gated", deliveries: ["piercing-projectile", "moving-area"], patterns: ["flow-gated-fan", "moving-damage-zone"] },
    scaling: { primary: ["critical-chance", "flow", "signature-rank", "projectiles"], secondary: ["area", "haste"] },
    safety: { tier: "high", tools: ["long-active-dash", "self-shield", "brief-active-invulnerability", "projectile-destroying-wall"] }, control: { tier: "medium", tools: ["signature-micro-stun", "moving-enemy-knockback"] }, support: { tier: "low", tools: ["projectile-destroying-wall"] },
    objectiveValue: { tier: "medium", contributions: ["fast-rotation", "moving-area-pressure"], limits: ["no-direct-objective-modifier", "flow-gated-signature"] },
    failureModes: [
      { id: "flow-empty", condition: "Flow is below 100 and the active is unavailable.", consequence: "The signature waits for flow regeneration; haste and evolution shorten this gap." },
      { id: "fragile-between-dashes", condition: "The active shield and dash are unavailable.", consequence: "Low health leaves little contact-damage margin." },
    ],
    breakpoints: coreBreakpoints(10, 25, "crit", [{ id: "flow-ready", trigger: { kind: "flow", value: 100 }, effect: "Signature can fire; base regeneration takes about 3.33s from empty, haste and evolution accelerate it, and the active fills flow immediately.", source: "engine" }]),
  },
  rift: {
    id: "rift", name: "Rift", role: { primary: "skirmisher", specialization: "movement-damage" }, range: "close",
    mobility: { tier: "very-high", baseSpeed: 300, profile: "brawler", facing: "contact", sources: ["highest-base-speed", "signature-rank-speed", "active-dash", "ultimate-speed"] },
    durability: { tier: "high", baseHealth: 10, baseArmor: 20, sources: ["high-base-armor", "self-shield", "damage-to-shield"] },
    damageShape: { cadence: "sustained", deliveries: ["close-area", "movement-pulse", "dash-impact"], patterns: ["contact-slash", "distance-triggered-pulse", "stunning-entry"] },
    scaling: { primary: ["movement-speed", "signature-rank", "area"], secondary: ["haste", "damage"] },
    safety: { tier: "high", tools: ["highest-base-speed", "active-dash", "self-shield", "damage-to-shield", "enemy-stun"] }, control: { tier: "medium", tools: ["enemy-stun"] }, support: { tier: "low", tools: ["enemy-stun"] },
    objectiveValue: { tier: "high", contributions: ["fastest-rotation", "durable-body-presence", "stunning-entry"], limits: ["no-direct-objective-modifier", "close-range-commitment"] },
    failureModes: [
      { id: "stationary-loss", condition: "Movement is interrupted or space is too confined.", consequence: "Distance-triggered pulses and mobility lose value." },
      { id: "commitment-window", condition: "Vector Dash enters without a safe path out.", consequence: "Close damage requires remaining in contact until recovery." },
    ],
    breakpoints: coreBreakpoints(8, 100, "move", [{ id: "kinetic-pulse", trigger: { kind: "distance", value: 120 }, effect: "Each 120 units moved triggers a 95-radius damage pulse.", source: "engine" }]),
  },
  nova: {
    id: "nova", name: "Nova", role: { primary: "caster", specialization: "hex-detonation" }, range: "long",
    mobility: { tier: "very-high", baseSpeed: 295, profile: "caster", facing: "aim", sources: ["fast-base-speed", "active-dash", "ultimate-dash", "active-speed"] },
    durability: { tier: "low", baseHealth: 9, baseArmor: 0, sources: ["active-invulnerability", "ultimate-invulnerability"] },
    damageShape: { cadence: "setup-payoff", deliveries: ["piercing-projectile", "orbiting-area", "global-detonation", "dash-impact"], patterns: ["hex-setup", "global-hex-cashout", "large-radius-burst"] },
    scaling: { primary: ["player-level", "xp-gain", "signature-rank", "projectiles"], secondary: ["area", "haste"] },
    safety: { tier: "high", tools: ["active-dash", "ultimate-dash", "active-invulnerability", "ultimate-invulnerability", "active-speed"] }, control: { tier: "low", tools: ["hex-mark"] }, support: { tier: "none", tools: [] },
    objectiveValue: { tier: "high", contributions: ["fast-rotation", "safe-reposition", "remote-hex-cashout"], limits: ["no-direct-objective-modifier", "lowest-base-health"] },
    failureModes: [
      { id: "unprepared-cashout", condition: "Veilstep is cast before enemies are hexed.", consequence: "Global detonation contributes little or no damage." },
      { id: "invulnerability-downtime", condition: "Both mobility casts are unavailable.", consequence: "Nine health and zero armor provide the smallest raw buffer." },
    ],
    breakpoints: coreBreakpoints(15, 90, "xp", [{ id: "spirit-gain", trigger: { kind: "player-level", value: 7 }, effect: "Gain one trailing damage-and-hex wisp every 7 player levels.", source: "engine" }]),
  },
  vesper: {
    id: "vesper", name: "Vesper", role: { primary: "ranger", specialization: "pickup-offense" }, range: "long",
    mobility: { tier: "medium", baseSpeed: 275, profile: "gunner", facing: "hybrid", sources: ["ultimate-speed"] },
    durability: { tier: "low", baseHealth: 9.5, baseArmor: 0, sources: ["ultimate-invulnerability"] },
    damageShape: { cadence: "setup-payoff", deliveries: ["piercing-projectile", "recalled-projectile", "pickup-pulse"], patterns: ["aimed-fan", "stored-feather-recall", "radial-storm"] },
    scaling: { primary: ["pickup-radius", "stored-feathers", "signature-rank", "projectiles"], secondary: ["xp-gain", "haste"] },
    safety: { tier: "medium", tools: ["long-range", "ultimate-invulnerability", "ultimate-speed"] }, control: { tier: "none", tools: [] }, support: { tier: "medium", tools: ["accelerated-team-xp-collection"] },
    objectiveValue: { tier: "high", contributions: ["wide-xp-collection", "pickup-lane-clear", "fast-resource-recovery"], limits: ["no-direct-objective-modifier", "recall-needs-feather-setup"] },
    failureModes: [
      { id: "empty-recall", condition: "Blade Recall is cast with no live feathers.", consequence: "The active creates no projectiles." },
      { id: "fragile-positioning", condition: "Enemies cross long range while the ultimate is unavailable.", consequence: "Low health and zero armor offer no native mitigation." },
    ],
    breakpoints: coreBreakpoints(13, 90, "pickup", [{ id: "feather-recall", trigger: { kind: "stored-object", value: "feather" }, effect: "Each live feather becomes a high-pierce projectile on active cast; feathers expire after 15s.", source: "engine" }]),
  },
};

export const SPECIALIST_IDENTITY_CONTRACT = deepFreeze({
  schemaVersion: SPECIALIST_IDENTITY_VERSION,
  balanceVersion: BALANCE_VERSION,
  unlocks: { activeLevel: 3, ultimateLevel: 6, signatureMaxRank: 5 },
  specialists,
});

const exactKeys = (errors, path, value, expected) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: must be an object`); return false; }
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) errors.push(`${path}: expected keys ${wanted.join(", ")}; got ${actual.join(", ")}`);
  return true;
};

const validateIds = (errors, path, value, allowEmpty = false) => {
  if (!Array.isArray(value) || (!allowEmpty && !value.length)) { errors.push(`${path}: must be ${allowEmpty ? "an" : "a non-empty"} array`); return; }
  if (new Set(value).size !== value.length) errors.push(`${path}: values must be unique`);
  for (const item of value) if (typeof item !== "string" || !/^[a-z][a-z0-9-]*$/.test(item)) errors.push(`${path}: invalid id ${String(item)}`);
};

export function validateSpecialistIdentityContract(candidate = SPECIALIST_IDENTITY_CONTRACT) {
  const errors = [];
  if (!exactKeys(errors, "contract", candidate, ["schemaVersion", "balanceVersion", "unlocks", "specialists"])) return errors;
  if (candidate.schemaVersion !== SPECIALIST_IDENTITY_VERSION) errors.push(`schemaVersion: expected ${SPECIALIST_IDENTITY_VERSION}`);
  if (candidate.balanceVersion !== BALANCE_VERSION) errors.push(`balanceVersion: expected ${BALANCE_VERSION}`);
  if (exactKeys(errors, "unlocks", candidate.unlocks, ["activeLevel", "ultimateLevel", "signatureMaxRank"])) {
    if (candidate.unlocks.activeLevel !== BALANCE_CONFIG.waves.xp.activeLevel) errors.push("unlocks.activeLevel: does not match balance config");
    if (candidate.unlocks.ultimateLevel !== BALANCE_CONFIG.waves.xp.ultimateLevel) errors.push("unlocks.ultimateLevel: does not match balance config");
    if (candidate.unlocks.signatureMaxRank !== BALANCE_CONFIG.core.maxWeaponLevel) errors.push("unlocks.signatureMaxRank: does not match balance config");
  }
  const ids = Object.keys(candidate.specialists || {});
  if (JSON.stringify(ids) !== JSON.stringify(BALANCE_IDS.specialists)) errors.push(`specialists: expected ordered ids ${BALANCE_IDS.specialists.join(", ")}; got ${ids.join(", ")}`);
  for (const id of BALANCE_IDS.specialists) {
    const entry = candidate.specialists?.[id]; if (!entry) continue;
    const path = `specialists.${id}`, base = BALANCE_CONFIG.specialists[id], movement = BALANCE_CONFIG.movement.specialists[id];
    if (!exactKeys(errors, path, entry, ["id", "name", "role", "range", "mobility", "durability", "damageShape", "scaling", "safety", "control", "support", "objectiveValue", "failureModes", "breakpoints"])) continue;
    if (entry.id !== id) errors.push(`${path}.id: expected ${id}`);
    if (entry.name !== SPECIALISTS[id].name) errors.push(`${path}.name: does not match catalog`);
    if (!ENUMS.range.includes(entry.range)) errors.push(`${path}.range: unsupported value ${entry.range}`);
    else if (entry.range !== SPECIALISTS[id].range.toLowerCase()) errors.push(`${path}.range: does not match catalog`);
    if (exactKeys(errors, `${path}.role`, entry.role, ["primary", "specialization"])) {
      if (!ENUMS.role.includes(entry.role.primary)) errors.push(`${path}.role.primary: unsupported value ${entry.role.primary}`);
      if (!ENUMS.specialization.includes(entry.role.specialization)) errors.push(`${path}.role.specialization: unsupported value ${entry.role.specialization}`);
    }
    if (exactKeys(errors, `${path}.mobility`, entry.mobility, ["tier", "baseSpeed", "profile", "facing", "sources"])) {
      if (!ENUMS.tier.includes(entry.mobility.tier)) errors.push(`${path}.mobility.tier: unsupported value ${entry.mobility.tier}`);
      if (entry.mobility.baseSpeed !== base.speed) errors.push(`${path}.mobility.baseSpeed: does not match balance config`);
      if (entry.mobility.profile !== movement.profile) errors.push(`${path}.mobility.profile: does not match balance config`);
      if (entry.mobility.facing !== movement.facing) errors.push(`${path}.mobility.facing: does not match balance config`);
      validateIds(errors, `${path}.mobility.sources`, entry.mobility.sources);
    }
    if (exactKeys(errors, `${path}.durability`, entry.durability, ["tier", "baseHealth", "baseArmor", "sources"])) {
      if (!ENUMS.tier.includes(entry.durability.tier)) errors.push(`${path}.durability.tier: unsupported value ${entry.durability.tier}`);
      if (entry.durability.baseHealth !== base.health) errors.push(`${path}.durability.baseHealth: does not match balance config`);
      if (entry.durability.baseArmor !== base.armor) errors.push(`${path}.durability.baseArmor: does not match balance config`);
      validateIds(errors, `${path}.durability.sources`, entry.durability.sources);
    }
    if (exactKeys(errors, `${path}.damageShape`, entry.damageShape, ["cadence", "deliveries", "patterns"])) {
      if (!ENUMS.cadence.includes(entry.damageShape.cadence)) errors.push(`${path}.damageShape.cadence: unsupported value ${entry.damageShape.cadence}`);
      validateIds(errors, `${path}.damageShape.deliveries`, entry.damageShape.deliveries); validateIds(errors, `${path}.damageShape.patterns`, entry.damageShape.patterns);
    }
    if (exactKeys(errors, `${path}.scaling`, entry.scaling, ["primary", "secondary"])) { validateIds(errors, `${path}.scaling.primary`, entry.scaling.primary); validateIds(errors, `${path}.scaling.secondary`, entry.scaling.secondary, true); }
    for (const dimension of ["safety", "control", "support"]) {
      const value = entry[dimension]; if (!exactKeys(errors, `${path}.${dimension}`, value, ["tier", "tools"])) continue;
      if (!ENUMS.tier.includes(value.tier)) errors.push(`${path}.${dimension}.tier: unsupported value ${value.tier}`);
      validateIds(errors, `${path}.${dimension}.tools`, value.tools, value.tier === "none");
      if (Array.isArray(value.tools) && value.tier === "none" && value.tools.length) errors.push(`${path}.${dimension}.tools: must be empty when tier is none`);
      if (Array.isArray(value.tools) && value.tier !== "none" && !value.tools.length) errors.push(`${path}.${dimension}.tools: required when tier is not none`);
    }
    if (exactKeys(errors, `${path}.objectiveValue`, entry.objectiveValue, ["tier", "contributions", "limits"])) {
      if (!ENUMS.tier.includes(entry.objectiveValue.tier)) errors.push(`${path}.objectiveValue.tier: unsupported value ${entry.objectiveValue.tier}`);
      validateIds(errors, `${path}.objectiveValue.contributions`, entry.objectiveValue.contributions); validateIds(errors, `${path}.objectiveValue.limits`, entry.objectiveValue.limits);
      if (Array.isArray(entry.objectiveValue.limits) && !entry.objectiveValue.limits.includes("no-direct-objective-modifier")) errors.push(`${path}.objectiveValue.limits: must state no-direct-objective-modifier`);
    }
    if (!Array.isArray(entry.failureModes) || entry.failureModes.length < 2) errors.push(`${path}.failureModes: at least two are required`);
    else {
      const seen = new Set();
      for (const [index, mode] of entry.failureModes.entries()) {
        const modePath = `${path}.failureModes.${index}`; if (!exactKeys(errors, modePath, mode, ["id", "condition", "consequence"])) continue;
        if (!/^[a-z][a-z0-9-]*$/.test(mode.id) || seen.has(mode.id)) errors.push(`${modePath}.id: invalid or duplicate id`); seen.add(mode.id);
        for (const key of ["condition", "consequence"]) if (typeof mode[key] !== "string" || !mode[key].trim()) errors.push(`${modePath}.${key}: required`);
      }
    }
    if (!Array.isArray(entry.breakpoints) || entry.breakpoints.length < 4) errors.push(`${path}.breakpoints: at least four are required`);
    else {
      const seen = new Set();
      for (const [index, bp] of entry.breakpoints.entries()) {
        const bpPath = `${path}.breakpoints.${index}`; if (!exactKeys(errors, bpPath, bp, ["id", "trigger", "effect", "source"])) continue;
        if (!/^[a-z][a-z0-9-]*$/.test(bp.id) || seen.has(bp.id)) errors.push(`${bpPath}.id: invalid or duplicate id`); seen.add(bp.id);
        if (!ENUMS.source.includes(bp.source)) errors.push(`${bpPath}.source: unsupported value ${bp.source}`);
        if (typeof bp.effect !== "string" || !bp.effect.trim()) errors.push(`${bpPath}.effect: required`);
        if (exactKeys(errors, `${bpPath}.trigger`, bp.trigger, ["kind", "value"])) {
          if (!ENUMS.trigger.includes(bp.trigger.kind)) errors.push(`${bpPath}.trigger.kind: unsupported value ${bp.trigger.kind}`);
          if (!(typeof bp.trigger.value === "string" && bp.trigger.value) && !Number.isFinite(bp.trigger.value)) errors.push(`${bpPath}.trigger.value: must be a non-empty string or finite number`);
        }
      }
      const byId = Object.fromEntries(entry.breakpoints.filter((value) => value && typeof value === "object").map((value) => [value.id, value]));
      if (byId["active-unlock"]?.trigger?.value !== 3 || !byId["active-unlock"]?.effect?.includes(`(${base.cooldownE}s`)) errors.push(`${path}.breakpoints.active-unlock: must match level and cooldown`);
      if (byId["ultimate-unlock"]?.trigger?.value !== 6 || !byId["ultimate-unlock"]?.effect?.includes(`(${base.cooldownR}s`)) errors.push(`${path}.breakpoints.ultimate-unlock: must match level and cooldown`);
      if (byId["signature-cap"]?.trigger?.value !== 5) errors.push(`${path}.breakpoints.signature-cap: must match max rank`);
      if (byId["signature-evolution"]?.trigger?.value !== SPECIALISTS[id].signature.passive) errors.push(`${path}.breakpoints.signature-evolution: must match catalog passive`);
    }
  }
  return errors;
}

export function getSpecialistIdentity(id, version = SPECIALIST_IDENTITY_VERSION) {
  if (version !== SPECIALIST_IDENTITY_VERSION) throw new RangeError(`Unknown specialist identity version: ${version}`);
  const errors = validateSpecialistIdentityContract();
  if (errors.length) throw new TypeError(`Invalid specialist identity contract: ${errors.join("; ")}`);
  const identity = SPECIALIST_IDENTITY_CONTRACT.specialists[id];
  if (!identity) throw new RangeError(`Unknown specialist: ${id}`);
  return identity;
}

export function getSpecialistIdentityManifest() {
  return Object.freeze({ identityVersion: SPECIALIST_IDENTITY_VERSION, balanceVersion: SPECIALIST_IDENTITY_CONTRACT.balanceVersion });
}
