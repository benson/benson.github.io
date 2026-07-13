import { DIFFICULTIES, MAPS, PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260713.17";
import { canonicalStringify, fnv1a64 } from "./replay.js?v=20260713.17";
import { RARE_DISCOVERY_IDS } from "./rare-discoveries.js?v=20260713.17";

export const SQUAD_RUN_REPORT_SCHEMA = "lastlight.squad-run-report.v4";
export const SQUAD_RUN_SHARE_SCHEMA = "lastlight.squad-run-share.v1";
export const RUN_ARCHIVE_STORAGE_VERSION = 6;
export const RUN_ARCHIVE_STORAGE_KEY = "lastlight:runs:v6";
export const RUN_ARCHIVE_FRAGMENT_KEY = "run";
export const MAX_RUN_ARCHIVE_ENTRIES = 24;
export const MAX_RUN_SHARE_BYTES = 24_576;
export const MAX_RUN_SHARE_CHARS = 32_768;

const SAFE_BUILD = /^[A-Za-z0-9._-]{1,32}$/;
const SAFE_SOURCE = /^[A-Za-z][A-Za-z0-9:_-]{0,47}$/;
const HASH = /^[0-9a-f]{16}$/;
const MAX_VALUE = 1_000_000_000;
const FORBIDDEN_FIELDS = /(?:room|token|resume|reconnect|relay|client|contact|email|position|input|network|diagnostic|timestamp|seed)$/i;
const PARTICIPATION_FIELDS = Object.freeze([
  "effectiveHealing", "effectiveShielding", "shieldDamagePrevented", "mitigationPrevented",
  "damageAssists", "controlAssists", "revives", "reviveTicks", "objectivePresenceTicks",
  "objectiveMovement", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const SYNERGY_FIELDS = Object.freeze(["triggers", "assists", "damage", "shielding", "mitigated", "formationTicks", "ultimateChains"]);
const PLAYER_FIELDS = Object.freeze([
  "slot", "callsign", "specialist", "masteryStart", "joinKind", "campaignEligible", "joinedAtSecond", "catchUpRanks",
  "damage", "kills", "xpCollected", "damageTaken", "revives", "distance", "weapons", "passives",
  "damageSources", "participation", "synergy",
]);
const REPORT_FIELDS = Object.freeze([
  "schema", "id", "fingerprint", "build", "runKey", "outcome", "map", "difficulty", "elapsed",
  "level", "squadKills", "gold", "mutations", "discoveries", "players", "totals",
]);
const MUTATION_FIELDS = Object.freeze(["packageId", "enabled", "objectiveCompletions", "encounters", "clears", "failures", "surgeWaves"]);
const MUTATION_PACKAGES = Object.freeze({ story: "base-line", hard: "contested-operations", extreme: "breach-cascade" });

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) { return structuredClone(value); }

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} has missing or unsupported fields`);
}

function finite(value, min, max, path, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new TypeError(`${path} is invalid`);
  const normalized = integer ? value : Math.round(value * 10) / 10;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function safeText(value, max, fallback = "") {
  return String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) || fallback;
}

function assertPrivacy(value, path = "report") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.test(key)) throw new TypeError(`${path}.${key} is private and cannot be archived`);
    assertPrivacy(child, `${path}.${key}`);
  }
}

function canonicalStats(value, fields, path) {
  const result = {};
  for (const field of fields) result[field] = finite(Number(value?.[field] || 0), 0, MAX_VALUE, `${path}.${field}`, ["damageAssists", "controlAssists", "revives", "reviveTicks", "objectivePresenceTicks", "objectiveCompletions", "eliteParticipations", "apexParticipations", "triggers", "assists", "formationTicks", "ultimateChains"].includes(field));
  return result;
}

function campaignEligible(player, durationSeconds) {
  if (player?.joinKind !== "fresh") return true;
  const preApexTicks = Math.max(0, Math.round(Number(player.preApexDeployedTicks || 0)));
  const required = Math.min(120 * 60, Math.ceil(Math.max(0, durationSeconds * 60) * .25));
  return preApexTicks >= required;
}

function canonicalWeapons(player) {
  const source = { ...(player?.weapons || {}) };
  if (!source.signature) source.signature = { level: 1, evolved: false };
  return Object.entries(source).map(([id, weapon]) => ({
    id,
    level: Math.max(1, Math.min(5, Math.round(Number(weapon?.level || 1)))),
    evolved: Boolean(weapon?.evolved),
  })).filter(({ id }) => id === "signature" || Boolean(WEAPONS[id])).sort((left, right) => left.id.localeCompare(right.id)).slice(0, 6);
}

function canonicalPassives(player) {
  return Object.entries(player?.passives || {}).map(([id, rank]) => ({
    id,
    rank: Math.max(1, Math.min(Number(PASSIVES[id]?.max || 5), Math.round(Number(rank || 0)))),
  })).filter(({ id }) => Boolean(PASSIVES[id])).sort((left, right) => left.id.localeCompare(right.id)).slice(0, 6);
}

function canonicalDamageSources(player) {
  return Object.entries(player?.damageBySource || {}).map(([id, damage]) => ({ id, damage: finite(Number(damage || 0), 0, MAX_VALUE, `damageSources.${id}`) }))
    .filter(({ id, damage }) => SAFE_SOURCE.test(id) && damage > 0)
    .sort((left, right) => right.damage - left.damage || left.id.localeCompare(right.id)).slice(0, 16);
}

function slotStats(values, slot) { return (values || []).find((entry) => Number(entry?.slot) === slot) || {}; }

function canonicalPlayer(player, index, game) {
  const slot = Number.isInteger(player?.replaySlot) ? player.replaySlot : index;
  const duration = finite(Number(game?.duration || game?.time || 0), 0, 3_600, "game.duration");
  const participation = slotStats(game?.participationState?.slots, slot);
  const synergy = slotStats(game?.synergyState?.stats, slot);
  return {
    slot,
    callsign: safeText(player?.name, 16, `Specialist ${slot + 1}`),
    specialist: SPECIALISTS[player?.specialist] ? player.specialist : "zuri",
    masteryStart: player?.masteryStart === "field-kit" ? "field-kit" : "baseline",
    joinKind: player?.joinKind === "fresh" ? "fresh" : "initial",
    campaignEligible: campaignEligible(player, duration),
    joinedAtSecond: finite(Math.max(0, Number(player?.joinedAtTick || 0) / 60), 0, 3_600, "player.joinedAtSecond"),
    catchUpRanks: finite(Math.round(Number(player?.catchUpRanks || 0)), 0, 100, "player.catchUpRanks", true),
    damage: finite(Number(player?.damage || 0), 0, MAX_VALUE, "player.damage"),
    kills: finite(Math.round(Number(player?.kills || 0)), 0, 10_000_000, "player.kills", true),
    xpCollected: finite(Number(player?.xpCollected || 0), 0, MAX_VALUE, "player.xpCollected"),
    damageTaken: finite(Number(player?.damageTaken || 0), 0, MAX_VALUE, "player.damageTaken"),
    revives: finite(Math.round(Number(player?.revives || 0)), 0, 10_000, "player.revives", true),
    distance: finite(Number(player?.traveled || 0), 0, MAX_VALUE, "player.distance"),
    weapons: canonicalWeapons(player), passives: canonicalPassives(player), damageSources: canonicalDamageSources(player),
    participation: canonicalStats(participation, PARTICIPATION_FIELDS, "player.participation"),
    synergy: canonicalStats(synergy, SYNERGY_FIELDS, "player.synergy"),
  };
}

function reportTotals(players) {
  return {
    damage: Math.round(players.reduce((sum, player) => sum + player.damage, 0) * 10) / 10,
    kills: players.reduce((sum, player) => sum + player.kills, 0),
    xpCollected: Math.round(players.reduce((sum, player) => sum + player.xpCollected, 0) * 10) / 10,
    damageTaken: Math.round(players.reduce((sum, player) => sum + player.damageTaken, 0) * 10) / 10,
    revives: players.reduce((sum, player) => sum + player.revives, 0),
    distance: Math.round(players.reduce((sum, player) => sum + player.distance, 0) * 10) / 10,
  };
}

function canonicalMutations(game, difficulty) {
  const telemetry = typeof game?.mutationTelemetry === "function" ? game.mutationTelemetry() : game?.mutationTelemetry;
  const state = game?.mutationState;
  const encounters = finite(Math.round(Number(telemetry?.encounters ?? state?.encounterSequence ?? 0)), 0, 100, "mutations.encounters", true);
  const clears = finite(Math.round(Number(telemetry?.clears ?? state?.resolvedEncounters ?? 0)), 0, encounters, "mutations.clears", true);
  const failures = finite(Math.round(Number(telemetry?.failures ?? Math.max(0, encounters - clears))), 0, encounters, "mutations.failures", true);
  if (clears + failures !== encounters) throw new TypeError("mutation totals do not reconcile");
  return {
    packageId: safeText(telemetry?.packageId || state?.packageId, 32, MUTATION_PACKAGES[difficulty]),
    enabled: Boolean(state?.enabled ?? telemetry?.enabled ?? false),
    objectiveCompletions: finite(Math.round(Number(telemetry?.objectiveCompletions ?? state?.objectiveCompletions ?? 0)), 0, 12, "mutations.objectiveCompletions", true),
    encounters, clears, failures,
    surgeWaves: finite(Math.round(Number(telemetry?.surgeWaves ?? state?.triggeredSurgeWaves?.length ?? 0)), 0, 3, "mutations.surgeWaves", true),
  };
}

function canonicalDiscoveries(value) {
  const known = new Set(RARE_DISCOVERY_IDS);
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => known.has(id)))].sort((left, right) => left.localeCompare(right));
}

function identityBody(report) {
  return {
    schema: report.schema, build: report.build, runKey: report.runKey, outcome: report.outcome, map: report.map,
    difficulty: report.difficulty, elapsed: report.elapsed, level: report.level, squadKills: report.squadKills,
    gold: report.gold, mutations: report.mutations, discoveries: report.discoveries, players: report.players.map((player) => ({ ...player, callsign: "" })), totals: report.totals,
  };
}

function signedReport(body) {
  const fingerprint = fnv1a64(canonicalStringify(identityBody(body)));
  return { ...body, id: `ll-${body.runKey.slice(0, 8)}-${fingerprint.slice(0, 8)}`, fingerprint };
}

function upgradeV1Report(value) {
  const legacyFields = REPORT_FIELDS.filter((field) => !["mutations", "discoveries"].includes(field));
  exactKeys(value, legacyFields, "legacy report");
  if (value.schema !== "lastlight.squad-run-report.v1" || !HASH.test(value.runKey) || !HASH.test(value.fingerprint)) throw new TypeError("legacy report identity is invalid");
  const legacyIdentity = {
    schema: value.schema, build: value.build, runKey: value.runKey, outcome: value.outcome, map: value.map,
    difficulty: value.difficulty, elapsed: value.elapsed, level: value.level, squadKills: value.squadKills,
    gold: value.gold, players: value.players.map((player) => ({ ...player, callsign: "" })), totals: value.totals,
  };
  if (fnv1a64(canonicalStringify(legacyIdentity)) !== value.fingerprint) throw new TypeError("legacy report integrity fingerprint mismatch");
  const body = { ...clone(value), schema: SQUAD_RUN_REPORT_SCHEMA, id: "", fingerprint: "", mutations: canonicalMutations(null, value.difficulty), discoveries: [], players: value.players.map((player) => ({ ...player, masteryStart: "baseline" })) };
  return validateSquadRunReport(signedReport(body));
}

function upgradeV2Report(value) {
  if (value?.schema !== "lastlight.squad-run-report.v2" || !HASH.test(value.runKey) || !HASH.test(value.fingerprint)) throw new TypeError("legacy v2 report identity is invalid");
  const legacyPlayerFields = PLAYER_FIELDS.filter((field) => field !== "masteryStart");
  exactKeys(value, REPORT_FIELDS.filter((field) => field !== "discoveries"), "legacy v2 report");
  for (const [index, player] of value.players.entries()) exactKeys(player, legacyPlayerFields, `legacy v2 report.players.${index}`);
  const identity = {
    schema: value.schema, build: value.build, runKey: value.runKey, outcome: value.outcome, map: value.map,
    difficulty: value.difficulty, elapsed: value.elapsed, level: value.level, squadKills: value.squadKills,
    gold: value.gold, mutations: value.mutations, players: value.players.map((player) => ({ ...player, callsign: "" })), totals: value.totals,
  };
  const fingerprint = fnv1a64(canonicalStringify(identity));
  if (fingerprint !== value.fingerprint || value.id !== `ll-${value.runKey.slice(0, 8)}-${fingerprint.slice(0, 8)}`) throw new TypeError("legacy v2 report integrity fingerprint mismatch");
  const body = { ...clone(value), schema: SQUAD_RUN_REPORT_SCHEMA, id: "", fingerprint: "", discoveries: [], players: value.players.map((player) => ({ ...player, masteryStart: "baseline" })) };
  return validateSquadRunReport(signedReport(body));
}

function upgradeV3Report(value) {
  const legacyFields = REPORT_FIELDS.filter((field) => field !== "discoveries");
  exactKeys(value, legacyFields, "legacy v3 report");
  if (value.schema !== "lastlight.squad-run-report.v3" || !HASH.test(value.runKey) || !HASH.test(value.fingerprint)) throw new TypeError("legacy v3 report identity is invalid");
  const identity = {
    schema: value.schema, build: value.build, runKey: value.runKey, outcome: value.outcome, map: value.map,
    difficulty: value.difficulty, elapsed: value.elapsed, level: value.level, squadKills: value.squadKills,
    gold: value.gold, mutations: value.mutations, players: value.players.map((player) => ({ ...player, callsign: "" })), totals: value.totals,
  };
  const fingerprint = fnv1a64(canonicalStringify(identity));
  if (fingerprint !== value.fingerprint || value.id !== `ll-${value.runKey.slice(0, 8)}-${fingerprint.slice(0, 8)}`) throw new TypeError("legacy v3 report integrity fingerprint mismatch");
  const body = { ...clone(value), schema: SQUAD_RUN_REPORT_SCHEMA, id: "", fingerprint: "", discoveries: [] };
  return validateSquadRunReport(signedReport(body));
}

export function createSquadRunReport(game, { build = "legacy", runKey = "" } = {}) {
  const map = typeof game?.map === "string" ? game.map : game?.map?.id;
  const difficulty = typeof game?.difficulty === "string" ? game.difficulty : game?.difficulty?.id;
  if (!MAPS[map] || !DIFFICULTIES[difficulty] || !["won", "lost"].includes(game?.stage)) throw new TypeError("A terminal supported run is required");
  if (!SAFE_BUILD.test(build)) throw new TypeError("build is invalid");
  if (!Array.isArray(game.players) || game.players.length < 1 || game.players.length > 4) throw new TypeError("run roster is invalid");
  const players = game.players.map((player, index) => canonicalPlayer(player, index, game)).sort((left, right) => left.slot - right.slot);
  if (players.some((player, index) => player.slot < 0 || player.slot > 3 || (index > 0 && player.slot === players[index - 1].slot))) throw new TypeError("run roster slots are invalid");
  const seedIdentity = runKey || fnv1a64(`${String(game.seed || game.determinism?.seed || "legacy")}:${map}:${difficulty}:${Math.round(Number(game.duration || 0))}`);
  if (!HASH.test(seedIdentity)) throw new TypeError("run identity is invalid");
  const body = {
    schema: SQUAD_RUN_REPORT_SCHEMA, id: "", fingerprint: "", build, runKey: seedIdentity,
    outcome: game.stage, map, difficulty,
    elapsed: finite(Number(game.time || 0) + Number(game.bossElapsed || 0), 0, 4_000, "run.elapsed"),
    level: finite(Math.round(Number(game.level || 0)), 0, 500, "run.level", true),
    squadKills: finite(Math.round(Number(game.kills || 0)), 0, 10_000_000, "run.squadKills", true),
    gold: finite(Number(game.gold || 0), 0, 10_000_000, "run.gold"), mutations: canonicalMutations(game, difficulty), discoveries: canonicalDiscoveries(game?.discoveryState?.enabled ? game.discoveryState.encountered : []), players, totals: reportTotals(players),
  };
  return deepFreeze(validateSquadRunReport(signedReport(body)));
}

function validateLoadout(player, path) {
  if (!Array.isArray(player.weapons) || player.weapons.length < 1 || player.weapons.length > 6) throw new TypeError(`${path}.weapons are invalid`);
  let previous = "";
  for (const [index, weapon] of player.weapons.entries()) {
    exactKeys(weapon, ["id", "level", "evolved"], `${path}.weapons.${index}`);
    if ((weapon.id !== "signature" && !WEAPONS[weapon.id]) || weapon.id <= previous || typeof weapon.evolved !== "boolean") throw new TypeError(`${path}.weapons are noncanonical`);
    finite(weapon.level, 1, 5, `${path}.weapons.${index}.level`, true); previous = weapon.id;
  }
  if (!Array.isArray(player.passives) || player.passives.length > 6) throw new TypeError(`${path}.passives are invalid`);
  previous = "";
  for (const [index, passive] of player.passives.entries()) {
    exactKeys(passive, ["id", "rank"], `${path}.passives.${index}`);
    if (!PASSIVES[passive.id] || passive.id <= previous) throw new TypeError(`${path}.passives are noncanonical`);
    finite(passive.rank, 1, PASSIVES[passive.id].max, `${path}.passives.${index}.rank`, true); previous = passive.id;
  }
}

export function validateSquadRunReport(value) {
  assertPrivacy(value);
  exactKeys(value, REPORT_FIELDS, "report");
  if (value.schema !== SQUAD_RUN_REPORT_SCHEMA || !/^ll-[0-9a-f]{8}-[0-9a-f]{8}$/.test(value.id) || !HASH.test(value.fingerprint) || !HASH.test(value.runKey)) throw new TypeError("report identity is invalid");
  if (!SAFE_BUILD.test(value.build) || !["won", "lost"].includes(value.outcome) || !MAPS[value.map] || !DIFFICULTIES[value.difficulty]) throw new TypeError("report metadata is invalid");
  finite(value.elapsed, 0, 4_000, "report.elapsed"); finite(value.level, 0, 500, "report.level", true);
  finite(value.squadKills, 0, 10_000_000, "report.squadKills", true); finite(value.gold, 0, 10_000_000, "report.gold");
  exactKeys(value.mutations, MUTATION_FIELDS, "report.mutations");
  if (value.mutations.packageId !== MUTATION_PACKAGES[value.difficulty] || typeof value.mutations.enabled !== "boolean") throw new TypeError("report mutation identity is invalid");
  for (const field of ["objectiveCompletions", "encounters", "clears", "failures", "surgeWaves"]) finite(value.mutations[field], 0, field === "objectiveCompletions" ? 12 : field === "surgeWaves" ? 3 : 100, `report.mutations.${field}`, true);
  if (value.mutations.clears + value.mutations.failures !== value.mutations.encounters) throw new TypeError("report mutation totals do not reconcile");
  if (!Array.isArray(value.discoveries) || value.discoveries.length > RARE_DISCOVERY_IDS.length || canonicalDiscoveries(value.discoveries).length !== value.discoveries.length || canonicalDiscoveries(value.discoveries).some((id, index) => id !== value.discoveries[index])) throw new TypeError("report discoveries are invalid");
  if (!Array.isArray(value.players) || value.players.length < 1 || value.players.length > 4) throw new TypeError("report roster is invalid");
  let priorSlot = -1;
  for (const [index, player] of value.players.entries()) {
    const path = `report.players.${index}`; exactKeys(player, PLAYER_FIELDS, path);
    finite(player.slot, 0, 3, `${path}.slot`, true); if (player.slot <= priorSlot) throw new TypeError("report roster must use canonical unique slots"); priorSlot = player.slot;
    if (safeText(player.callsign, 16) !== player.callsign || !SPECIALISTS[player.specialist] || !["baseline", "field-kit"].includes(player.masteryStart) || !["initial", "fresh"].includes(player.joinKind) || typeof player.campaignEligible !== "boolean") throw new TypeError(`${path} identity is invalid`);
    finite(player.joinedAtSecond, 0, 3_600, `${path}.joinedAtSecond`); finite(player.catchUpRanks, 0, 100, `${path}.catchUpRanks`, true);
    finite(player.damage, 0, MAX_VALUE, `${path}.damage`); finite(player.kills, 0, 10_000_000, `${path}.kills`, true);
    finite(player.xpCollected, 0, MAX_VALUE, `${path}.xpCollected`); finite(player.damageTaken, 0, MAX_VALUE, `${path}.damageTaken`);
    finite(player.revives, 0, 10_000, `${path}.revives`, true); finite(player.distance, 0, MAX_VALUE, `${path}.distance`);
    validateLoadout(player, path);
    if (!Array.isArray(player.damageSources) || player.damageSources.length > 16) throw new TypeError(`${path}.damageSources are invalid`);
    for (const [sourceIndex, source] of player.damageSources.entries()) {
      exactKeys(source, ["id", "damage"], `${path}.damageSources.${sourceIndex}`);
      if (!SAFE_SOURCE.test(source.id)) throw new TypeError(`${path}.damageSources.${sourceIndex}.id is invalid`);
      finite(source.damage, Number.EPSILON, MAX_VALUE, `${path}.damageSources.${sourceIndex}.damage`);
      const prior = player.damageSources[sourceIndex - 1]; if (prior && (prior.damage < source.damage || (prior.damage === source.damage && prior.id.localeCompare(source.id) >= 0))) throw new TypeError(`${path}.damageSources must be canonical`);
    }
    exactKeys(player.participation, PARTICIPATION_FIELDS, `${path}.participation`); canonicalStats(player.participation, PARTICIPATION_FIELDS, `${path}.participation`);
    exactKeys(player.synergy, SYNERGY_FIELDS, `${path}.synergy`); canonicalStats(player.synergy, SYNERGY_FIELDS, `${path}.synergy`);
  }
  exactKeys(value.totals, ["damage", "kills", "xpCollected", "damageTaken", "revives", "distance"], "report.totals");
  if (canonicalStringify(value.totals) !== canonicalStringify(reportTotals(value.players))) throw new TypeError("report totals do not reconcile");
  const expected = signedReport({ ...clone(value), id: "", fingerprint: "" });
  if (expected.id !== value.id || expected.fingerprint !== value.fingerprint) throw new TypeError("report integrity fingerprint mismatch");
  return value;
}

function legacyGame(value) {
  const players = Array.isArray(value?.players) && value.players.length ? value.players.slice(0, 4).map((player, slot) => ({
    ...player, id: `legacy-${slot}`, replaySlot: slot, name: safeText(player?.name, 16, `Specialist ${slot + 1}`),
    specialist: SPECIALISTS[player?.specialist] ? player.specialist : "zuri", weapons: { signature: { level: 1, evolved: false } }, passives: {},
  })) : [{ id: "legacy-0", replaySlot: 0, name: "Specialist 1", specialist: "zuri", weapons: { signature: { level: 1, evolved: false } }, passives: {} }];
  return {
    stage: value?.won ? "won" : "lost", map: MAPS[value?.map] ? value.map : "warehouse", difficulty: DIFFICULTIES[value?.difficulty] ? value.difficulty : "story",
    time: finite(Number(value?.elapsed || 0), 0, 4_000, "legacy.elapsed"), bossElapsed: 0, duration: Math.max(60, Math.min(3_600, Number(value?.elapsed || 240))),
    level: finite(Math.round(Number(value?.level || 0)), 0, 500, "legacy.level", true), kills: finite(Math.round(Number(value?.kills || 0)), 0, 10_000_000, "legacy.kills", true),
    gold: finite(Number(value?.gold || 0), 0, 10_000_000, "legacy.gold"), players, participationState: { slots: [] }, synergyState: { stats: [] },
  };
}

export function normalizeRunArchiveStorage(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const item of value) {
    try {
      let entry;
      if (Number(item?.schemaVersion) === RUN_ARCHIVE_STORAGE_VERSION) {
        exactKeys(item, ["schemaVersion", "savedAt", "report"], "archive entry");
        if (!Number.isFinite(Date.parse(item.savedAt))) throw new TypeError("archive savedAt is invalid");
        entry = { schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt: new Date(item.savedAt).toISOString(), report: validateSquadRunReport(item.report) };
      } else if (Number(item?.schemaVersion) === 5) {
        exactKeys(item, ["schemaVersion", "savedAt", "report"], "legacy archive entry");
        if (!Number.isFinite(Date.parse(item.savedAt))) throw new TypeError("archive savedAt is invalid");
        entry = { schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt: new Date(item.savedAt).toISOString(), report: upgradeV3Report(item.report) };
      } else if (Number(item?.schemaVersion) === 4) {
        exactKeys(item, ["schemaVersion", "savedAt", "report"], "legacy archive entry");
        if (!Number.isFinite(Date.parse(item.savedAt))) throw new TypeError("archive savedAt is invalid");
        entry = { schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt: new Date(item.savedAt).toISOString(), report: upgradeV2Report(item.report) };
      } else if (Number(item?.schemaVersion) === 3) {
        exactKeys(item, ["schemaVersion", "savedAt", "report"], "legacy archive entry");
        if (!Number.isFinite(Date.parse(item.savedAt))) throw new TypeError("archive savedAt is invalid");
        entry = { schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt: new Date(item.savedAt).toISOString(), report: upgradeV1Report(item.report) };
      } else {
        if (![1, 2].includes(Number(item?.schemaVersion)) || !Number.isFinite(Date.parse(item?.finishedAt)) || !Array.isArray(item?.players)) throw new TypeError("legacy archive entry is invalid");
        const savedAt = Number.isFinite(Date.parse(item?.finishedAt)) ? new Date(item.finishedAt).toISOString() : new Date(0).toISOString();
        const key = fnv1a64(`${String(item?.id || "legacy")}:${savedAt}`);
        entry = { schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt, report: createSquadRunReport(legacyGame(item), { build: "legacy", runKey: key }) };
      }
      if (!entries.some((candidate) => candidate.report.id === entry.report.id)) entries.push(deepFreeze(entry));
    } catch { /* Malformed archive entries are isolated instead of blocking the archive. */ }
    if (entries.length >= MAX_RUN_ARCHIVE_ENTRIES) break;
  }
  return entries;
}

export function upsertRunArchive(entries, report, savedAt = new Date().toISOString()) {
  validateSquadRunReport(report);
  if (!Number.isFinite(Date.parse(savedAt))) throw new TypeError("archive savedAt is invalid");
  const normalized = normalizeRunArchiveStorage(entries).filter((entry) => entry.report.id !== report.id);
  return deepFreeze([{ schemaVersion: RUN_ARCHIVE_STORAGE_VERSION, savedAt: new Date(savedAt).toISOString(), report: clone(report) }, ...normalized].slice(0, MAX_RUN_ARCHIVE_ENTRIES));
}

function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(text); if (bytes.byteLength > MAX_RUN_SHARE_BYTES) throw new RangeError("Shared run report is too large");
  let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToUtf8(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_RUN_SHARE_CHARS) throw new TypeError("Shared run payload is invalid");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary; try { binary = atob(padded); } catch { throw new TypeError("Shared run payload is invalid"); }
  if (binary.length > MAX_RUN_SHARE_BYTES) throw new RangeError("Shared run report is too large");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new TypeError("Shared run payload encoding is invalid"); }
}

export function encodeSquadRunShare(report, { includeCallsigns = false } = {}) {
  validateSquadRunReport(report);
  const mode = includeCallsigns ? "named" : "anonymous";
  const publicReport = clone(report);
  if (!includeCallsigns) for (const player of publicReport.players) player.callsign = `Specialist ${player.slot + 1}`;
  const body = { schema: SQUAD_RUN_SHARE_SCHEMA, mode, report: publicReport };
  const payload = { ...body, checksum: fnv1a64(canonicalStringify(body)) };
  const encoded = utf8ToBase64Url(canonicalStringify(payload));
  if (encoded.length > MAX_RUN_SHARE_CHARS) throw new RangeError("Shared run link is too large");
  return encoded;
}

export function decodeSquadRunShare(encoded) {
  let payload; try { payload = JSON.parse(base64UrlToUtf8(encoded)); } catch (error) { if (error instanceof RangeError) throw error; throw new TypeError("Shared run payload is invalid"); }
  exactKeys(payload, ["schema", "mode", "report", "checksum"], "shared run payload");
  if (payload.schema !== SQUAD_RUN_SHARE_SCHEMA || !["anonymous", "named"].includes(payload.mode) || !HASH.test(payload.checksum)) throw new TypeError("Shared run payload metadata is invalid");
  const body = { schema: payload.schema, mode: payload.mode, report: payload.report };
  if (fnv1a64(canonicalStringify(body)) !== payload.checksum) throw new TypeError("Shared run payload checksum mismatch");
  const report = validateSquadRunReport(payload.report);
  if (payload.mode === "anonymous" && report.players.some((player) => player.callsign !== `Specialist ${player.slot + 1}`)) throw new TypeError("Anonymous shared run exposes callsigns");
  return deepFreeze({ mode: payload.mode, report });
}

export function squadRunShareFragment(report, options = {}) {
  return `#${RUN_ARCHIVE_FRAGMENT_KEY}=${encodeSquadRunShare(report, options)}`;
}

export function decodeSquadRunFragment(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const value = params.get(RUN_ARCHIVE_FRAGMENT_KEY); return value ? decodeSquadRunShare(value) : null;
}
