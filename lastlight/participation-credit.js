export const PARTICIPATION_SCHEMA = "lastlight.participation.v1";
export const PARTICIPATION_STATE_SCHEMA = "lastlight.participation-state.v1";

const MAX_SLOT = 3;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TARGET_KINDS = Object.freeze(["normal", "elite", "miniboss", "apex", "event"]);
const OBJECTIVE_KINDS = Object.freeze(["zone", "relay-ball", "machine"]);
const STAT_FIELDS = Object.freeze([
  "effectiveHealing", "effectiveShielding", "shieldDamagePrevented", "mitigationPrevented",
  "damageAssists", "controlAssists", "revives", "reviveTicks", "objectivePresenceTicks",
  "objectiveMovement", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const INTEGER_STATS = new Set([
  "damageAssists", "controlAssists", "revives", "reviveTicks", "objectivePresenceTicks",
  "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const PARTICIPATION_REGISTRY = deepFreeze({
  schema: PARTICIPATION_SCHEMA,
  caps: {
    slots: 4, liveTargets: 320, reviveLedgers: 4, objectiveLedgers: 8,
    shieldPools: 4, shieldSourcesPerPool: 5,
  },
  damageAssist: { recencyTicks: 600, healthRatio: 0.05, minimumDamage: 1, maximumDamage: 20 },
  controlAssist: { recencyTicks: 600, minimumExtensionTicks: 30 },
  revive: { minimumTicks: 30, minimumShare: 0.1 },
  objective: { minimumTicks: 30, minimumShare: 0.1, relayMinimumMovement: 24, relayRouteRatio: 0.05 },
  targetKinds: TARGET_KINDS,
  objectiveKinds: OBJECTIVE_KINDS,
  stats: STAT_FIELDS,
});

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} has unexpected fields`);
}

function safeInteger(value, min, max, path) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${path} is invalid`);
  return value;
}

function finite(value, min, max, path) {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${path} is invalid`);
  return value;
}

function slot(value, path = "slot") { return safeInteger(value, 0, MAX_SLOT, path); }
function safeId(value, path) { if (typeof value !== "string" || !SAFE_ID.test(value)) throw new TypeError(`${path} is invalid`); return value; }
function clone(state) { return structuredClone(state); }
function sourceOrder(value) { return value === null ? 4 : value; }
function emptyStats(value) { return Object.fromEntries([["slot", value], ...STAT_FIELDS.map((field) => [field, 0])]); }
function canonicalSlots(values) { return [...new Set(values.map((value) => slot(value)))].sort((a, b) => a - b); }
function statsFor(state, replaySlot) {
  let stats = state.slots.find((entry) => entry.slot === replaySlot);
  if (!stats) { stats = emptyStats(replaySlot); state.slots.push(stats); state.slots.sort((a, b) => a.slot - b.slot); }
  return stats;
}
function addStat(state, replaySlot, field, amount) {
  slot(replaySlot); finite(amount, 0, Number.MAX_SAFE_INTEGER, field);
  if (!STAT_FIELDS.includes(field)) throw new TypeError(`Unsupported participation stat ${field}`);
  if (INTEGER_STATS.has(field) && !Number.isSafeInteger(amount)) throw new TypeError(`${field} must be an integer`);
  const stats = statsFor(state, replaySlot), next = stats[field] + amount;
  finite(next, 0, Number.MAX_SAFE_INTEGER, field);
  if (INTEGER_STATS.has(field) && !Number.isSafeInteger(next)) throw new TypeError(`${field} exceeds safe integer bounds`);
  stats[field] = next;
}

export function validateParticipationRegistry(value = PARTICIPATION_REGISTRY) {
  exactKeys(value, ["schema", "caps", "damageAssist", "controlAssist", "revive", "objective", "targetKinds", "objectiveKinds", "stats"], "registry");
  if (value.schema !== PARTICIPATION_SCHEMA) throw new TypeError("Unsupported participation registry");
  exactKeys(value.caps, ["slots", "liveTargets", "reviveLedgers", "objectiveLedgers", "shieldPools", "shieldSourcesPerPool"], "registry.caps");
  exactKeys(value.damageAssist, ["recencyTicks", "healthRatio", "minimumDamage", "maximumDamage"], "registry.damageAssist");
  exactKeys(value.controlAssist, ["recencyTicks", "minimumExtensionTicks"], "registry.controlAssist");
  exactKeys(value.revive, ["minimumTicks", "minimumShare"], "registry.revive");
  exactKeys(value.objective, ["minimumTicks", "minimumShare", "relayMinimumMovement", "relayRouteRatio"], "registry.objective");
  if (JSON.stringify(value.caps) !== JSON.stringify(PARTICIPATION_REGISTRY.caps)
    || JSON.stringify(value.damageAssist) !== JSON.stringify(PARTICIPATION_REGISTRY.damageAssist)
    || JSON.stringify(value.controlAssist) !== JSON.stringify(PARTICIPATION_REGISTRY.controlAssist)
    || JSON.stringify(value.revive) !== JSON.stringify(PARTICIPATION_REGISTRY.revive)
    || JSON.stringify(value.objective) !== JSON.stringify(PARTICIPATION_REGISTRY.objective)
    || JSON.stringify(value.targetKinds) !== JSON.stringify(TARGET_KINDS)
    || JSON.stringify(value.objectiveKinds) !== JSON.stringify(OBJECTIVE_KINDS)
    || JSON.stringify(value.stats) !== JSON.stringify(STAT_FIELDS)) throw new TypeError("Participation registry contract mismatch");
  return value;
}

export function createParticipationState({ enabled = true, slots = [] } = {}) {
  return validateParticipationState({
    schema: PARTICIPATION_STATE_SCHEMA, registryVersion: PARTICIPATION_SCHEMA, enabled: Boolean(enabled), sequence: 0,
    slots: canonicalSlots(slots).map(emptyStats), targetCredits: [], reviveCredits: [], objectiveCredits: [], shieldPools: [],
  });
}

function validateParticipant(entry, path) {
  exactKeys(entry, ["slot", "damage", "lastDamageTick", "effectiveControlTicks", "lastControlTick", "supportMarked"], path);
  slot(entry.slot, `${path}.slot`); finite(entry.damage, 0, Number.MAX_SAFE_INTEGER, `${path}.damage`);
  safeInteger(entry.lastDamageTick, 0, Number.MAX_SAFE_INTEGER, `${path}.lastDamageTick`);
  safeInteger(entry.effectiveControlTicks, 0, Number.MAX_SAFE_INTEGER, `${path}.effectiveControlTicks`);
  safeInteger(entry.lastControlTick, 0, Number.MAX_SAFE_INTEGER, `${path}.lastControlTick`);
  if (typeof entry.supportMarked !== "boolean") throw new TypeError(`${path}.supportMarked is invalid`);
}

export function validateParticipationState(value) {
  exactKeys(value, ["schema", "registryVersion", "enabled", "sequence", "slots", "targetCredits", "reviveCredits", "objectiveCredits", "shieldPools"], "state");
  if (value.schema !== PARTICIPATION_STATE_SCHEMA || value.registryVersion !== PARTICIPATION_SCHEMA || typeof value.enabled !== "boolean") throw new TypeError("Invalid participation state header");
  safeInteger(value.sequence, 0, Number.MAX_SAFE_INTEGER, "state.sequence");
  if (!Array.isArray(value.slots) || value.slots.length > 4) throw new TypeError("state.slots exceeds bounds");
  let priorSlot = -1;
  for (const [index, entry] of value.slots.entries()) {
    exactKeys(entry, ["slot", ...STAT_FIELDS], `state.slots.${index}`); slot(entry.slot, `state.slots.${index}.slot`);
    if (entry.slot <= priorSlot) throw new TypeError("state.slots must be canonical"); priorSlot = entry.slot;
    for (const field of STAT_FIELDS) {
      finite(entry[field], 0, Number.MAX_SAFE_INTEGER, `state.slots.${index}.${field}`);
      if (INTEGER_STATS.has(field) && !Number.isSafeInteger(entry[field])) throw new TypeError(`state.slots.${index}.${field} must be an integer`);
    }
  }
  if (!Array.isArray(value.targetCredits) || value.targetCredits.length > 320) throw new TypeError("state.targetCredits exceeds bounds");
  let priorId = "";
  for (const [index, target] of value.targetCredits.entries()) {
    const path = `state.targetCredits.${index}`; exactKeys(target, ["enemyId", "kind", "maxHp", "participants"], path);
    safeId(target.enemyId, `${path}.enemyId`); if (priorId && target.enemyId.localeCompare(priorId) <= 0) throw new TypeError("state.targetCredits must be canonical"); priorId = target.enemyId;
    if (!TARGET_KINDS.includes(target.kind)) throw new TypeError(`${path}.kind is invalid`); finite(target.maxHp, Number.EPSILON, Number.MAX_SAFE_INTEGER, `${path}.maxHp`);
    if (!Array.isArray(target.participants) || target.participants.length > 4) throw new TypeError(`${path}.participants exceeds bounds`);
    let prior = -1; for (const [participantIndex, participant] of target.participants.entries()) { validateParticipant(participant, `${path}.participants.${participantIndex}`); if (participant.slot <= prior) throw new TypeError(`${path}.participants must be canonical`); prior = participant.slot; }
  }
  if (!Array.isArray(value.reviveCredits) || value.reviveCredits.length > 4) throw new TypeError("state.reviveCredits exceeds bounds");
  priorSlot = -1;
  for (const [index, revive] of value.reviveCredits.entries()) {
    const path = `state.reviveCredits.${index}`; exactKeys(revive, ["downedSlot", "beganTick", "contributors"], path); slot(revive.downedSlot, `${path}.downedSlot`);
    if (revive.downedSlot <= priorSlot) throw new TypeError("state.reviveCredits must be canonical"); priorSlot = revive.downedSlot;
    safeInteger(revive.beganTick, 0, Number.MAX_SAFE_INTEGER, `${path}.beganTick`);
    if (!Array.isArray(revive.contributors) || revive.contributors.length > 4) throw new TypeError(`${path}.contributors exceeds bounds`);
    let prior = -1; for (const [j, contributor] of revive.contributors.entries()) { exactKeys(contributor, ["slot", "ticks"], `${path}.contributors.${j}`); slot(contributor.slot); safeInteger(contributor.ticks, 0, Number.MAX_SAFE_INTEGER, `${path}.contributors.${j}.ticks`); if (contributor.slot === revive.downedSlot || contributor.slot <= prior) throw new TypeError(`${path}.contributors must be canonical and exclude target`); prior = contributor.slot; }
  }
  if (!Array.isArray(value.objectiveCredits) || value.objectiveCredits.length > 8) throw new TypeError("state.objectiveCredits exceeds bounds");
  priorId = "";
  for (const [index, objective] of value.objectiveCredits.entries()) {
    const path = `state.objectiveCredits.${index}`; exactKeys(objective, ["objectiveId", "kind", "beganTick", "routeDistance", "participants"], path);
    safeId(objective.objectiveId, `${path}.objectiveId`); if (priorId && objective.objectiveId.localeCompare(priorId) <= 0) throw new TypeError("state.objectiveCredits must be canonical"); priorId = objective.objectiveId;
    if (!OBJECTIVE_KINDS.includes(objective.kind)) throw new TypeError(`${path}.kind is invalid`); safeInteger(objective.beganTick, 0, Number.MAX_SAFE_INTEGER, `${path}.beganTick`); finite(objective.routeDistance, 0, Number.MAX_SAFE_INTEGER, `${path}.routeDistance`);
    if (!Array.isArray(objective.participants) || objective.participants.length > 4) throw new TypeError(`${path}.participants exceeds bounds`);
    let prior = -1; for (const [j, participant] of objective.participants.entries()) { const pp = `${path}.participants.${j}`; exactKeys(participant, ["slot", "presenceTicks", "movement", "activationTicks"], pp); slot(participant.slot); safeInteger(participant.presenceTicks, 0, Number.MAX_SAFE_INTEGER, `${pp}.presenceTicks`); finite(participant.movement, 0, Number.MAX_SAFE_INTEGER, `${pp}.movement`); safeInteger(participant.activationTicks, 0, Number.MAX_SAFE_INTEGER, `${pp}.activationTicks`); if (participant.slot <= prior) throw new TypeError(`${path}.participants must be canonical`); prior = participant.slot; }
  }
  if (!Array.isArray(value.shieldPools) || value.shieldPools.length > 4) throw new TypeError("state.shieldPools exceeds bounds");
  priorSlot = -1;
  for (const [index, pool] of value.shieldPools.entries()) {
    const path = `state.shieldPools.${index}`; exactKeys(pool, ["targetSlot", "sources"], path); slot(pool.targetSlot, `${path}.targetSlot`);
    if (pool.targetSlot <= priorSlot) throw new TypeError("state.shieldPools must be canonical"); priorSlot = pool.targetSlot;
    if (!Array.isArray(pool.sources) || pool.sources.length > 5) throw new TypeError(`${path}.sources exceeds bounds`);
    let prior = -1; for (const [j, source] of pool.sources.entries()) { exactKeys(source, ["sourceSlot", "amount"], `${path}.sources.${j}`); if (source.sourceSlot !== null) slot(source.sourceSlot); const order = sourceOrder(source.sourceSlot); if (order <= prior) throw new TypeError(`${path}.sources must be canonical`); prior = order; finite(source.amount, Number.EPSILON, Number.MAX_SAFE_INTEGER, `${path}.sources.${j}.amount`); }
  }
  return value;
}

function finish(next) { next.sequence++; return validateParticipationState(next); }
function participantFor(target, replaySlot) {
  let participant = target.participants.find((entry) => entry.slot === replaySlot);
  if (!participant) { participant = { slot: replaySlot, damage: 0, lastDamageTick: 0, effectiveControlTicks: 0, lastControlTick: 0, supportMarked: false }; target.participants.push(participant); target.participants.sort((a, b) => a.slot - b.slot); }
  return participant;
}
function targetFor(next, { enemyId, kind, maxHp }) {
  safeId(enemyId, "enemyId"); if (!TARGET_KINDS.includes(kind)) throw new TypeError("target kind is invalid"); finite(maxHp, Number.EPSILON, Number.MAX_SAFE_INTEGER, "maxHp");
  let target = next.targetCredits.find((entry) => entry.enemyId === enemyId);
  if (target && (target.kind !== kind || target.maxHp !== maxHp)) throw new TypeError("target identity mismatch");
  if (!target) { if (next.targetCredits.length >= 320) throw new RangeError("Participation target cap reached"); target = { enemyId, kind, maxHp, participants: [] }; next.targetCredits.push(target); next.targetCredits.sort((a, b) => a.enemyId.localeCompare(b.enemyId)); }
  return target;
}

export function addEffectiveHealing(state, { sourceSlot, amount }) {
  validateParticipationState(state); slot(sourceSlot, "sourceSlot"); finite(amount, 0, Number.MAX_SAFE_INTEGER, "amount"); if (!state.enabled || amount === 0) return state;
  const next = clone(state); addStat(next, sourceSlot, "effectiveHealing", amount); return finish(next);
}

export function addMitigationPrevented(state, { providers, amount }) {
  validateParticipationState(state); const slots = canonicalSlots(providers || []); finite(amount, 0, Number.MAX_SAFE_INTEGER, "amount"); if (!state.enabled || amount === 0 || !slots.length) return state;
  const next = clone(state); let assigned = 0;
  slots.forEach((replaySlot, index) => { const share = index === slots.length - 1 ? amount - assigned : amount / slots.length; assigned += share; addStat(next, replaySlot, "mitigationPrevented", share); });
  return finish(next);
}

export function grantAttributedShield(state, { sourceSlot = null, targetSlot, amount }) {
  validateParticipationState(state); if (sourceSlot !== null) slot(sourceSlot, "sourceSlot"); slot(targetSlot, "targetSlot"); finite(amount, 0, Number.MAX_SAFE_INTEGER, "amount"); if (!state.enabled || amount === 0) return state;
  const next = clone(state); let pool = next.shieldPools.find((entry) => entry.targetSlot === targetSlot);
  if (!pool) { pool = { targetSlot, sources: [] }; next.shieldPools.push(pool); next.shieldPools.sort((a, b) => a.targetSlot - b.targetSlot); }
  let source = pool.sources.find((entry) => entry.sourceSlot === sourceSlot);
  if (!source) { source = { sourceSlot, amount: 0 }; pool.sources.push(source); pool.sources.sort((a, b) => sourceOrder(a.sourceSlot) - sourceOrder(b.sourceSlot)); }
  source.amount += amount; if (sourceSlot !== null) addStat(next, sourceSlot, "effectiveShielding", amount); return finish(next);
}

export function reduceAttributedShield(state, { targetSlot, amount, prevented = true }) {
  validateParticipationState(state); slot(targetSlot, "targetSlot"); finite(amount, 0, Number.MAX_SAFE_INTEGER, "amount"); if (typeof prevented !== "boolean") throw new TypeError("prevented must be a boolean");
  const pool = state.shieldPools.find((entry) => entry.targetSlot === targetSlot), total = pool?.sources.reduce((sum, source) => sum + source.amount, 0) || 0;
  const consumed = Math.min(amount, total); if (!state.enabled || consumed === 0) return { state, consumed: 0, allocations: [] };
  const next = clone(state), nextPool = next.shieldPools.find((entry) => entry.targetSlot === targetSlot), allocations = []; let assigned = 0;
  for (let index = 0; index < nextPool.sources.length; index++) {
    const source = nextPool.sources[index], allocation = index === nextPool.sources.length - 1 ? consumed - assigned : consumed * source.amount / total;
    const safeAllocation = Math.min(source.amount, Math.max(0, allocation)); assigned += safeAllocation; source.amount -= safeAllocation;
    allocations.push({ sourceSlot: source.sourceSlot, amount: safeAllocation }); if (prevented && source.sourceSlot !== null) addStat(next, source.sourceSlot, "shieldDamagePrevented", safeAllocation);
  }
  const remainder = consumed - assigned;
  if (remainder > Number.EPSILON) {
    const source = nextPool.sources.find((entry) => entry.amount >= remainder);
    if (!source) throw new RangeError("Shield allocation failed conservation"); source.amount -= remainder; const allocation = allocations.find((entry) => entry.sourceSlot === source.sourceSlot); allocation.amount += remainder; if (prevented && source.sourceSlot !== null) addStat(next, source.sourceSlot, "shieldDamagePrevented", remainder);
  }
  nextPool.sources = nextPool.sources.filter((source) => source.amount > Number.EPSILON);
  if (!nextPool.sources.length) next.shieldPools = next.shieldPools.filter((entry) => entry.targetSlot !== targetSlot);
  return { state: finish(next), consumed, allocations };
}

export function recordTargetDamage(state, { enemyId, kind, maxHp, slot: replaySlot, damage, tick }) {
  validateParticipationState(state); slot(replaySlot); finite(damage, 0, Number.MAX_SAFE_INTEGER, "damage"); safeInteger(tick, 0, Number.MAX_SAFE_INTEGER, "tick"); if (!state.enabled || damage === 0) return state;
  const next = clone(state), participant = participantFor(targetFor(next, { enemyId, kind, maxHp }), replaySlot); participant.damage += damage; participant.lastDamageTick = tick; return finish(next);
}

export function recordTargetControl(state, { enemyId, kind, maxHp, slot: replaySlot, extensionTicks, tick }) {
  validateParticipationState(state); slot(replaySlot); safeInteger(extensionTicks, 0, Number.MAX_SAFE_INTEGER, "extensionTicks"); safeInteger(tick, 0, Number.MAX_SAFE_INTEGER, "tick"); if (!state.enabled || extensionTicks === 0) return state;
  const next = clone(state), participant = participantFor(targetFor(next, { enemyId, kind, maxHp }), replaySlot); participant.effectiveControlTicks += extensionTicks; participant.lastControlTick = tick; return finish(next);
}

export function markTargetSupport(state, { enemyId, kind, maxHp, slot: replaySlot }) {
  validateParticipationState(state); slot(replaySlot); if (!state.enabled) return state;
  const next = clone(state), participant = participantFor(targetFor(next, { enemyId, kind, maxHp }), replaySlot); if (participant.supportMarked) return state; participant.supportMarked = true; return finish(next);
}

export function settleTargetCredit(state, { enemyId, killerSlot = null, tick }) {
  validateParticipationState(state); safeId(enemyId, "enemyId"); if (killerSlot !== null) slot(killerSlot, "killerSlot"); safeInteger(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
  const target = state.targetCredits.find((entry) => entry.enemyId === enemyId); if (!target) return { state, awards: [] };
  const next = clone(state), threshold = Math.max(1, Math.min(20, target.maxHp * 0.05)), awards = [];
  for (const participant of target.participants) {
    const damageAssist = participant.slot !== killerSlot && participant.damage >= threshold && tick - participant.lastDamageTick <= 600;
    const controlAssist = participant.slot !== killerSlot && participant.effectiveControlTicks >= 30 && tick - participant.lastControlTick <= 600;
    const priorityParticipation = participant.damage >= threshold || participant.effectiveControlTicks >= 30 || participant.supportMarked;
    if (damageAssist) addStat(next, participant.slot, "damageAssists", 1);
    if (controlAssist) addStat(next, participant.slot, "controlAssists", 1);
    if (priorityParticipation && ["elite", "miniboss"].includes(target.kind)) addStat(next, participant.slot, "eliteParticipations", 1);
    if (priorityParticipation && target.kind === "apex") addStat(next, participant.slot, "apexParticipations", 1);
    if (damageAssist || controlAssist || priorityParticipation && target.kind !== "normal") awards.push({ slot: participant.slot, damageAssist, controlAssist, participation: priorityParticipation });
  }
  next.targetCredits = next.targetCredits.filter((entry) => entry.enemyId !== enemyId); return { state: finish(next), awards };
}

export function removeTargetCredit(state, enemyId) {
  validateParticipationState(state); safeId(enemyId, "enemyId"); if (!state.targetCredits.some((entry) => entry.enemyId === enemyId)) return state;
  const next = clone(state); next.targetCredits = next.targetCredits.filter((entry) => entry.enemyId !== enemyId); return finish(next);
}

export function recordReviveWork(state, { downedSlot, contributorSlot, beganTick, ticks }) {
  validateParticipationState(state); slot(downedSlot, "downedSlot"); slot(contributorSlot, "contributorSlot"); if (downedSlot === contributorSlot) throw new TypeError("A slot cannot revive itself"); safeInteger(beganTick, 0, Number.MAX_SAFE_INTEGER, "beganTick"); safeInteger(ticks, 0, Number.MAX_SAFE_INTEGER, "ticks"); if (!state.enabled || ticks === 0) return state;
  const next = clone(state); let revive = next.reviveCredits.find((entry) => entry.downedSlot === downedSlot);
  if (revive && revive.beganTick !== beganTick) throw new TypeError("revive identity mismatch");
  if (!revive) { if (next.reviveCredits.length >= 4) throw new RangeError("Participation revive cap reached"); revive = { downedSlot, beganTick, contributors: [] }; next.reviveCredits.push(revive); next.reviveCredits.sort((a, b) => a.downedSlot - b.downedSlot); }
  let contributor = revive.contributors.find((entry) => entry.slot === contributorSlot); if (!contributor) { contributor = { slot: contributorSlot, ticks: 0 }; revive.contributors.push(contributor); revive.contributors.sort((a, b) => a.slot - b.slot); }
  contributor.ticks += ticks; addStat(next, contributorSlot, "reviveTicks", ticks); return finish(next);
}

export function settleReviveCredit(state, downedSlot) {
  validateParticipationState(state); slot(downedSlot, "downedSlot"); const revive = state.reviveCredits.find((entry) => entry.downedSlot === downedSlot); if (!revive) return { state, creditedSlots: [] };
  const next = clone(state), total = revive.contributors.reduce((sum, entry) => sum + entry.ticks, 0), creditedSlots = revive.contributors.filter((entry) => entry.ticks >= 30 && entry.ticks / total >= 0.1).map((entry) => entry.slot);
  for (const replaySlot of creditedSlots) addStat(next, replaySlot, "revives", 1); next.reviveCredits = next.reviveCredits.filter((entry) => entry.downedSlot !== downedSlot); return { state: finish(next), creditedSlots };
}

export function removeReviveCredit(state, downedSlot) {
  validateParticipationState(state); slot(downedSlot, "downedSlot"); if (!state.reviveCredits.some((entry) => entry.downedSlot === downedSlot)) return state;
  const next = clone(state); next.reviveCredits = next.reviveCredits.filter((entry) => entry.downedSlot !== downedSlot); return finish(next);
}

function objectiveFor(next, { objectiveId, kind, beganTick, routeDistance = 0 }) {
  safeId(objectiveId, "objectiveId"); if (!OBJECTIVE_KINDS.includes(kind)) throw new TypeError("objective kind is invalid"); safeInteger(beganTick, 0, Number.MAX_SAFE_INTEGER, "beganTick"); finite(routeDistance, 0, Number.MAX_SAFE_INTEGER, "routeDistance");
  let objective = next.objectiveCredits.find((entry) => entry.objectiveId === objectiveId);
  if (objective && (objective.kind !== kind || objective.beganTick !== beganTick || objective.routeDistance !== routeDistance)) throw new TypeError("objective identity mismatch");
  if (!objective) { if (next.objectiveCredits.length >= 8) throw new RangeError("Participation objective cap reached"); objective = { objectiveId, kind, beganTick, routeDistance, participants: [] }; next.objectiveCredits.push(objective); next.objectiveCredits.sort((a, b) => a.objectiveId.localeCompare(b.objectiveId)); }
  return objective;
}
function objectiveParticipant(objective, replaySlot) { let participant = objective.participants.find((entry) => entry.slot === replaySlot); if (!participant) { participant = { slot: replaySlot, presenceTicks: 0, movement: 0, activationTicks: 0 }; objective.participants.push(participant); objective.participants.sort((a, b) => a.slot - b.slot); } return participant; }

export function recordObjectiveWork(state, { objectiveId, kind, beganTick, routeDistance = 0, slot: replaySlot, presenceTicks = 0, movement = 0, activationTicks = 0 }) {
  validateParticipationState(state); slot(replaySlot); safeInteger(presenceTicks, 0, Number.MAX_SAFE_INTEGER, "presenceTicks"); finite(movement, 0, Number.MAX_SAFE_INTEGER, "movement"); safeInteger(activationTicks, 0, Number.MAX_SAFE_INTEGER, "activationTicks"); if (!state.enabled || presenceTicks + movement + activationTicks === 0) return state;
  const next = clone(state), participant = objectiveParticipant(objectiveFor(next, { objectiveId, kind, beganTick, routeDistance }), replaySlot);
  participant.presenceTicks += presenceTicks; participant.movement += movement; participant.activationTicks += activationTicks; addStat(next, replaySlot, "objectivePresenceTicks", presenceTicks); addStat(next, replaySlot, "objectiveMovement", movement); return finish(next);
}

export function settleObjectiveCredit(state, objectiveId) {
  validateParticipationState(state); safeId(objectiveId, "objectiveId"); const objective = state.objectiveCredits.find((entry) => entry.objectiveId === objectiveId); if (!objective) return { state, creditedSlots: [] };
  const next = clone(state), totalWork = objective.participants.reduce((sum, entry) => sum + entry.presenceTicks + entry.activationTicks, 0), relayThreshold = Math.max(24, objective.routeDistance * 0.05);
  const creditedSlots = objective.participants.filter((entry) => objective.kind === "relay-ball"
    ? entry.movement >= relayThreshold
    : entry.presenceTicks + entry.activationTicks >= 30 && (entry.presenceTicks + entry.activationTicks) / totalWork >= 0.1).map((entry) => entry.slot);
  for (const replaySlot of creditedSlots) addStat(next, replaySlot, "objectiveCompletions", 1); next.objectiveCredits = next.objectiveCredits.filter((entry) => entry.objectiveId !== objectiveId); return { state: finish(next), creditedSlots };
}

export function removeObjectiveCredit(state, objectiveId) {
  validateParticipationState(state); safeId(objectiveId, "objectiveId"); if (!state.objectiveCredits.some((entry) => entry.objectiveId === objectiveId)) return state;
  const next = clone(state); next.objectiveCredits = next.objectiveCredits.filter((entry) => entry.objectiveId !== objectiveId); return finish(next);
}
