import { SPECIALISTS, SPECIALIST_ORDER, PASSIVES, WEAPONS, MAPS, DIFFICULTIES, ENEMY_TYPES, WAVE_NAMES, BOONS, AUGMENTS, BASE_VITALITY, formatTime, clamp } from "./data.js?v=20260711.8";
import { Simulation, moveEntityWithCover, playerMovementSpeed } from "./engine.js?v=20260711.8";
import { Renderer } from "./render.js?v=20260711.8";
import { FixedStepClock, MovementPredictor } from "./feel.js?v=20260711.8";
import { MAP_ORDER, DIFFICULTY_ORDER, MAP_REQUIREMENTS, completeRun, emptyProgress, hasCompleted, isDifficultyUnlocked, isMapUnlocked, normalizeProgress } from "./progression.js?v=20260711.5";
import { getThemeAsset, getThemeMaterial } from "./themes/lastlight.js?v=20260711.8";
import { submitRunTelemetry } from "./telemetry.js?v=20260711.5";
import { bossHealthSegments, playerHealthSegments } from "./health-bars.js?v=20260711.5";
import { formatProjectileDisplay, getCombatMetadata, getCurrentStatExplanation, getPassiveAffectedSources } from "./combat-metadata.js?v=20260711.8";
import { BALANCE_HASH, BALANCE_VERSION } from "./balance-config.js?v=20260711.8";
import { RNG_ALGORITHM, createRandomSeed } from "./rng.js?v=20260711.5";
import { ReplayRecorder, dequantizeReplayInput, hashSimulationState, quantizeReplayInput, validateReplay } from "./replay.js?v=20260711.8";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract, loadRuntimeConfig, runtimeConfigEndpoint } from "./feature-config.js?v=20260711.5";
import { QUALITY_STORAGE_KEY, loadQualitySettings, saveQualitySettings, settingsForPreset } from "./quality-settings.js?v=20260711.5";
import { clearRunRecovery, createRunRecovery, loadRunRecovery, runtimeRecoveryIdentity, saveRunRecovery } from "./recovery.js?v=20260711.5";
import { GuestInputSequenceTracker, HostInputSequenceGate, createSnapshotMessage, sanitizeSnapshotMessage } from "./protocol.js?v=20260711.5";
import { createActivatedNetworkLab, resolveNetworkLabActivation } from "./network-lab.js?v=20260711.5";
import { getWeaponImpactGrammar, impactSummary, resolveEntityImpact } from "./impact-grammar.js?v=20260711.8";
import { advancePlayerMovement } from "./movement.js?v=20260711.8";
import { MATERIAL_CLASSES } from "./material-impacts.js?v=20260711.8";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home-screen"), lobby: $("lobby-screen"), game: $("game-screen"), result: $("result-screen") };
const query = new URLSearchParams(location.search);
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const RELAY_BASE = query.get("relay") || (localHost ? "ws://localhost:8787/room/" : "wss://lastlight-relay.bensonperry.workers.dev/room/");
const RUNTIME_CONFIG_ENDPOINT = runtimeConfigEndpoint(RELAY_BASE);
const FEEDBACK_URL = "https://biblioplex-api.bensonperry.com/feedback";
const BUILD = "2026.07.11.7";
const NETWORK_LAB_ACTIVATION = resolveNetworkLabActivation({ url: location.href });
const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
const initialQualitySettings = (() => {
  const settings = loadQualitySettings(localStorage, systemReducedMotion);
  try {
    if (!localStorage.getItem(QUALITY_STORAGE_KEY) && localStorage.getItem("lastlight:enemy-health-bars:v1") === "false") {
      return saveQualitySettings({ ...settings, preset: "custom", healthBars: "off" });
    }
  } catch { /* Storage is optional. */ }
  return settings;
})();
const renderer = new Renderer($("game-canvas"));
renderer.setQualitySettings(initialQualitySettings);
const fixedClock = new FixedStepClock();
const movementPredictor = new MovementPredictor();
const hostInputSequences = new HostInputSequenceGate();
const guestInputSequences = new GuestInputSequenceTracker();
const PROGRESS_KEY = "lastlight:campaign:v1";
const RUN_HISTORY_KEY = "lastlight:runs:v1";
const CLIENT_TOKEN_KEY = "lastlight:client-token:v1";
const DAMAGE_LEDGER_LAYOUT_KEY = "lastlight:damage-ledger-layout:v1";
const LAST_REPLAY_KEY = "lastlight:last-replay:v1";
const DAMAGE_LEDGER_DEFAULT = Object.freeze({ x: 22, y: 112, width: 250, height: 150, collapsed: false });
const DIFFICULTY_COPY = { story: "Story · Sharp hits · Lighter opening", hard: "Hard · 3× health · 2× damage", extreme: "Extreme · 7× health · 3× damage" };

function loadProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null")); }
  catch { return emptyProgress(); }
}

function loadRunHistory() {
  try {
    const runs = JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || "[]");
    return Array.isArray(runs) ? runs.slice(0, 24) : [];
  } catch { return []; }
}

function loadClientToken() {
  try {
    const stored = localStorage.getItem(CLIENT_TOKEN_KEY) || "";
    if (/^[a-f0-9]{24,32}$/.test(stored)) return stored;
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    localStorage.setItem(CLIENT_TOKEN_KEY, token); return token;
  } catch { return crypto.randomUUID().replace(/-/g, "").slice(0, 24); }
}

function loadDamageLedgerLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAMAGE_LEDGER_LAYOUT_KEY) || "null");
    return saved && typeof saved === "object" ? { ...DAMAGE_LEDGER_DEFAULT, ...saved } : { ...DAMAGE_LEDGER_DEFAULT };
  } catch { return { ...DAMAGE_LEDGER_DEFAULT }; }
}

function loadLastReplay() {
  try { return validateReplay(JSON.parse(sessionStorage.getItem(LAST_REPLAY_KEY) || "null")); }
  catch { return null; }
}

const state = {
  screen: "home", partyMode: "solo", selected: "zuri", clientId: "solo", isHost: true, room: "",
  lobby: new Map(), ws: null, connecting: false, connectResolve: null, connectReject: null,
  config: { map: "warehouse", difficulty: "story", duration: 240 }, sim: null,
  previousSnapshot: null, snapshot: null, snapshotAt: 0, snapshotInterval: 90,
  input: { keys: new Set(), aim: 0, autoAim: true, touchX: 0, touchY: 0 },
  animation: 0, lastFrame: 0, lastSend: 0, lastBroadcast: 0, lastLobbyBroadcast: 0,
  lastUpgradeKey: "", lastWeaponHUDKey: "", lastPassiveHUDKey: "", lastSquadHUDKey: "", lastBossHUDKey: "", lastEventSeq: 0, endShown: false, resultTimer: null,
  progress: loadProgress(), runHistory: loadRunHistory(), resultGame: null, resultSavedKey: "",
  audio: true, audioContext: null, toastTimer: null, lastVoiceAt: 0,
  soundState: { projectiles: 0, kills: 0, level: 1, damageTaken: 0, xpCollected: 0, lastShot: 0, lastXP: 0 },
  recentErrors: [], reportSubmitting: false, resumeAfterReport: false, telemetrySent: false,
  qualitySettings: initialQualitySettings, showEnemyHealthBars: initialQualitySettings.healthBars !== "off", inspectPointer: null, inspectActive: false,
  performanceMetrics: null, lastActiveBuffKey: "", lastDamageLedgerKey: "",
  damageLedgerLayout: loadDamageLedgerLayout(), damageLedgerResizeObserver: null,
  bannerTimer: null, bannerExitTimer: null,
  resumeToken: loadClientToken(),
  hostPreviousMotion: null, inputMotionStartedAt: 0, inputMotionStart: null, inputWasActive: false,
  replayRecorder: null, lastReplayCheckpointTick: -1, lastReplay: loadLastReplay(), resultReplay: null,
  runtimeConfig: { config: DEFAULT_RUNTIME_CONFIG, source: "built-in", status: "initializing" },
  recoveryOffer: null, lastRecoverySaveAt: 0,
  networkLab: null,
};

const runtimeConfigReady = loadRuntimeConfig({ endpoint: RUNTIME_CONFIG_ENDPOINT }).then((result) => {
  state.runtimeConfig = result;
  refreshRecoveryOffer();
  return result;
});

function replayRunConfig() {
  return { map: state.config.map, difficulty: state.config.difficulty, duration: Number(state.config.duration) };
}

function beginReplayCapture(players, seed) {
  if (!state.runtimeConfig.config.flags.deterministicReplay) {
    state.replayRecorder = null; state.resultReplay = null; return;
  }
  state.replayRecorder = new ReplayRecorder({
    build: BUILD, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH,
    featureConfigVersion: state.runtimeConfig.config.configVersion,
    gameplayVersion: state.runtimeConfig.config.gameplayVersion,
    objectiveEvents: state.runtimeConfig.config.flags.objectiveEvents,
    rng: RNG_ALGORITHM, seed, run: replayRunConfig(),
  });
  for (const player of players) state.replayRecorder.registerPlayer(player.id, player.specialist, { slot: player.replaySlot, initial: true });
  state.lastReplayCheckpointTick = -1;
  state.resultReplay = null;
  recordReplayCheckpoint(true);
}

function recordReplayCheckpoint(force = false) {
  if (!state.replayRecorder || !state.sim) return;
  const tick = state.sim.tick;
  if ((!force && tick % 300 !== 0) || tick === state.lastReplayCheckpointTick) return;
  state.replayRecorder.addCheckpoint(tick, hashSimulationState(state.sim));
  state.lastReplayCheckpointTick = tick;
}

function finalizeReplayCapture() {
  if (!state.replayRecorder || !state.sim) return null;
  const replay = state.replayRecorder.finalize(state.sim.tick, hashSimulationState(state.sim));
  state.replayRecorder = null;
  state.lastReplay = replay;
  state.resultReplay = replay;
  try { sessionStorage.setItem(LAST_REPLAY_KEY, JSON.stringify(replay)); } catch { /* Replay export remains available in memory. */ }
  return replay;
}

function recoveryExpected() {
  return { build: BUILD, runtime: runtimeRecoveryIdentity(state.runtimeConfig.config) };
}

function refreshRecoveryOffer() {
  state.recoveryOffer = loadRunRecovery(localStorage, recoveryExpected());
  const panel = $("recovery-offer");
  if (!panel) return;
  panel.classList.toggle("hidden", !state.recoveryOffer);
  if (!state.recoveryOffer) return;
  const recovery = state.recoveryOffer, header = recovery.simulation.header, progress = recovery.simulation.scalars;
  $("recovery-title").textContent = `${MAPS[header.map]?.name || header.map} · ${DIFFICULTIES[header.difficulty]?.name || header.difficulty}`;
  $("recovery-copy").textContent = `${recovery.source === "host" ? "Squad host" : "Solo"} · ${formatTime(progress.remaining)} remaining · saved ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(recovery.savedAt))}`;
}

function persistRecoveryCheckpoint(force = false) {
  if (!state.isHost || !state.sim || state.screen !== "game" || !["running", "boss"].includes(state.sim.stage)) return;
  const now = Date.now();
  if (!force && now - state.lastRecoverySaveAt < 5_000) return;
  const local = state.sim.players.find((player) => player.id === state.clientId) || state.sim.players[0];
  if (!local || !Number.isInteger(local.replaySlot)) return;
  try {
    const checkpoint = createRunRecovery({
      build: BUILD,
      runtime: runtimeRecoveryIdentity(state.runtimeConfig.config),
      source: state.partyMode === "solo" ? "solo" : "host",
      localSlot: local.replaySlot,
      simulation: state.sim.exportRecoveryState(),
      replay: state.replayRecorder?.exportDraft(state.sim.tick) || null,
      savedAt: now,
    });
    saveRunRecovery(localStorage, checkpoint);
    state.recoveryOffer = checkpoint;
    state.lastRecoverySaveAt = now;
  } catch (error) {
    captureClientError("recovery", error);
  }
}

function discardRecovery({ notify = true } = {}) {
  clearRunRecovery(localStorage);
  state.recoveryOffer = null;
  $("recovery-offer")?.classList.add("hidden");
  if (notify) toast("Interrupted operation discarded");
}

function resumeRecovery() {
  const checkpoint = loadRunRecovery(localStorage, recoveryExpected());
  if (!checkpoint) { refreshRecoveryOffer(); toast("That recovery checkpoint is no longer compatible"); return; }
  try {
    closeSocket();
    const sim = Simulation.fromRecoveryState(checkpoint.simulation);
    const localId = `slot-${checkpoint.localSlot}`;
    if (!sim.players.some((player) => player.id === localId)) throw new TypeError("Local recovery slot is missing");
    state.clientId = localId; state.isHost = true; state.room = ""; state.partyMode = checkpoint.source;
    state.config = {
      map: checkpoint.simulation.header.map, difficulty: checkpoint.simulation.header.difficulty, duration: checkpoint.simulation.header.duration,
      features: gameplayFeatureContract(state.runtimeConfig.config),
    };
    state.sim = sim;
    state.lobby = new Map(sim.players.map((player) => [player.id, { id: player.id, name: player.name, specialist: player.specialist, ready: true }]));
    state.replayRecorder = checkpoint.replay ? ReplayRecorder.fromDraft(checkpoint.replay, sim.players) : null;
    state.lastReplayCheckpointTick = checkpoint.replay?.checkpoints?.at(-1)?.[0] ?? -1;
    state.previousSnapshot = null; state.snapshot = null;
    sim.paused = true; sim.pauseReason = "manual";
    enterGame();
    state.lastRecoverySaveAt = 0;
    persistRecoveryCheckpoint(true);
    toast("Operation restored · paused for review");
  } catch (error) {
    captureClientError("recovery restore", error);
    discardRecovery({ notify: false });
    toast("Recovery data was invalid and has been discarded");
  }
}

function applyHostInput(playerId, input) {
  if (!state.sim) return input;
  const normalized = dequantizeReplayInput(quantizeReplayInput(input));
  state.replayRecorder?.recordInput(playerId, state.sim.tick, normalized);
  state.sim.setInput(playerId, normalized);
  return normalized;
}

function applyGuestNetworkInput(message) {
  const accepted = hostInputSequences.apply(message?._from, message);
  if (!accepted.accepted) return false;
  applyHostInput(message._from, accepted.input);
  return true;
}

function resetInputProtocol() {
  hostInputSequences.reset();
  guestInputSequences.reset();
}

function recordHostCast(playerId, slot) {
  if (!state.sim?.cast(playerId, slot)) return false;
  state.replayRecorder?.recordCast(playerId, state.sim.tick, slot);
  return true;
}

function recordHostChoice(playerId, choiceId) {
  const accepted = Boolean(state.sim?.pendingChoices?.[playerId]?.some((choice) => choice.id === choiceId) && !state.sim.choiceReady?.[playerId]);
  if (!accepted) return false;
  state.sim.choose(playerId, choiceId);
  state.replayRecorder?.recordUpgrade(playerId, state.sim.tick, choiceId);
  return true;
}

function nextReplaySlot() {
  const used = new Set((state.sim?.players || []).map((player) => player.replaySlot));
  return [0, 1, 2, 3].find((slot) => !used.has(slot));
}

function setScreen(name) {
  state.screen = name;
  for (const [key, screen] of Object.entries(screens)) screen.classList.toggle("hidden", key !== name);
  document.body.style.overflow = name === "game" ? "hidden" : "auto";
  if (name !== "game") { state.inspectActive = false; hideInspectPanel(); }
}

function callsign() {
  return ($("callsign-input").value.trim() || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16);
}

function requirementCopy(requirement) {
  return requirement ? `${MAPS[requirement.map].name} · ${DIFFICULTIES[requirement.difficulty].name}` : "Available";
}

function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress)); } catch { /* Storage is optional. */ }
}

function updateDifficultyOptions() {
  const map = $("map-select").value;
  for (const option of $("difficulty-select").options) {
    const unlocked = isDifficultyUnlocked(state.progress, map, option.value);
    option.disabled = !unlocked;
    const previous = DIFFICULTY_ORDER[DIFFICULTY_ORDER.indexOf(option.value) - 1];
    option.textContent = unlocked ? DIFFICULTY_COPY[option.value] : `Locked · Clear ${MAPS[map].name} · ${DIFFICULTIES[previous].name}`;
  }
  if (!isDifficultyUnlocked(state.progress, map, $("difficulty-select").value)) $("difficulty-select").value = "story";
}

function updateProgressionUI() {
  for (const option of $("map-select").options) {
    const unlocked = isMapUnlocked(state.progress, option.value);
    const requirement = MAP_REQUIREMENTS[option.value];
    option.disabled = !unlocked;
    option.textContent = unlocked ? MAPS[option.value].name : `Locked · ${MAPS[option.value].name} — Clear ${requirementCopy(requirement)}`;
  }
  if (!isMapUnlocked(state.progress, $("map-select").value)) $("map-select").value = MAP_ORDER.find((map) => isMapUnlocked(state.progress, map)) || "warehouse";
  updateDifficultyOptions();
  const clears = MAP_ORDER.reduce((total, map) => total + DIFFICULTY_ORDER.filter((difficulty) => hasCompleted(state.progress, map, difficulty)).length, 0);
  const nextMap = MAP_ORDER.find((map) => !isMapUnlocked(state.progress, map));
  $("progression-note").textContent = nextMap
    ? `Campaign ${clears}/12 clears · Next map: clear ${requirementCopy(MAP_REQUIREMENTS[nextMap])} to unlock ${MAPS[nextMap].name}.`
    : `Campaign ${clears}/12 clears · Every operation unlocked. Clear remaining threat tiers for full completion.`;
  if ($("guide-dialog").open) renderGuide();
}

function recordVictory(map, difficulty) {
  const result = completeRun(state.progress, map, difficulty);
  state.progress = result.progress; saveProgress(); updateProgressionUI();
  return result.unlocks.map((unlock) => unlock.type === "map"
    ? `${MAPS[unlock.map].name} unlocked`
    : `${MAPS[unlock.map].name} · ${DIFFICULTIES[unlock.difficulty].name} unlocked`);
}

function guideCard(glyph, name, meta, copy, extraClass = "", image = "", details = {}) {
  const visual = image ? `<img src="${escapeHTML(image)}" alt="">` : escapeHTML(glyph);
  const detailRows = Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const detailMarkup = detailRows.length ? `<dl class="guide-details">${detailRows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>` : "";
  return `<article class="guide-card ${extraClass} ${image ? "has-art" : ""}"><header><span class="guide-glyph">${visual}</span><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(meta)}</small></div></header><p>${escapeHTML(copy)}</p>${detailMarkup}</article>`;
}

function guidePlayer(specialist = "zuri") {
  const spec = SPECIALISTS[specialist] || SPECIALISTS.zuri;
  return { specialist: spec.id, hp: spec.health, maxHp: spec.health, armor: spec.armor, passives: {}, weapons: { signature: { level: 1, evolved: false } }, hotTime: 0, hasteBuff: 0, frenzy: 0 };
}

function guideWeaponDetails(weaponId, specialist = "zuri") {
  const player = guidePlayer(specialist), telemetry = weaponTelemetry(weaponId, { level: 1, evolved: false }, player);
  const impact = getWeaponImpactGrammar(weaponId, { specialistId: specialist, evolved: false });
  return { Damage: telemetry.damage, Cooldown: telemetry.interval, Projectiles: telemetry.projectiles, Range: weaponId === "signature" ? SPECIALISTS[specialist].range : telemetry.note, Impact: impact?.impact.replaceAll("-", " ") || "Authored effect", Audio: impact?.soundFamily.replaceAll("-", " ") || "Combat" };
}

const SIGNATURE_BEHAVIORS = {
  zuri: "Fires a sustained burst of long-range rounds toward the nearest threat.",
  echo: "Launches resonant waves that spread across multiple nearby threats.",
  sola: "Projects a forward shield beam whose damage grows with Sola's armor.",
  bront: "Crashes a heavy tidal hammer into the closest threat for a wide impact.",
  fang: "Rends targets at close range; the strike grows stronger with Fang's maximum health.",
  gale: "Cuts rapidly through targets in a flowing mid-range current.",
  rift: "Slams a kinetic shock into nearby threats while fighting at close range.",
  nova: "Sends guiding hexes toward distant threats, building toward spirit detonations.",
  vesper: "Throws winged daggers that fan outward and return through the fight.",
};

function renderStartingWeaponDetails(spec) {
  const player = guidePlayer(spec.id);
  const telemetry = weaponTelemetry("signature", { level: 1, evolved: false }, player);
  const passive = PASSIVES[spec.signature.passive];
  $("detail-weapon-tooltip-name").textContent = spec.signature.name;
  $("detail-weapon-behavior").textContent = SIGNATURE_BEHAVIORS[spec.id] || "Automatically attacks nearby threats.";
  $("detail-weapon-stats").innerHTML = Object.entries({ Damage: telemetry.damage, Cooldown: telemetry.interval, Projectiles: telemetry.projectiles, Range: spec.range })
    .map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");
  const impact = getWeaponImpactGrammar("signature", { specialistId: spec.id, evolved: false });
  $("detail-weapon-evolution").textContent = `Evolves into ${spec.signature.evolve} with ${passive?.name || spec.signature.passive} + an elite access card. ${impact?.evolvedDifference || ""}`.trim();
  $("starting-weapon-trigger").setAttribute("aria-label", `Inspect ${spec.signature.name} starting weapon`);
}

function renderGuide() {
  const campaign = MAP_ORDER.map((map, index) => {
    const unlocked = isMapUnlocked(state.progress, map);
    const cleared = DIFFICULTY_ORDER.filter((difficulty) => hasCompleted(state.progress, map, difficulty)).map((difficulty) => DIFFICULTIES[difficulty].name);
    const requirement = MAP_REQUIREMENTS[map];
    return `<article class="campaign-node ${unlocked ? "unlocked" : "locked"}"><img src="${MAPS[map].texture}" alt=""><div><b>${String(index + 1).padStart(2, "0")}</b><span>${MAPS[map].name}</span><small>${unlocked ? `${cleared.length}/3 cleared${cleared.length ? ` · ${cleared.join(", ")}` : ""}` : `Locked · clear ${requirementCopy(requirement)}`}</small></div></article>`;
  }).join("");
  const signatures = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id], passive = PASSIVES[spec.signature.passive];
    return guideCard(spec.signature.glyph, `${spec.name} · ${spec.signature.name}`, `Evolves to ${spec.signature.evolve}`, `Reach weapon level 5 and own ${passive?.name || spec.signature.passive}, then collect an elite access card.`, "", spec.signature.icon, guideWeaponDetails("signature", id));
  }).join("");
  const weapons = Object.values(WEAPONS).map((weapon) => guideCard(weapon.glyph, weapon.name, `Evolves to ${weapon.evolve}`, `${weapon.copy} Evolution requires level 5 + ${PASSIVES[weapon.passive]?.name || weapon.passive}.`, "", weapon.icon, guideWeaponDetails(weapon.id))).join("");
  const materials = MATERIAL_CLASSES.map((id) => {
    const material = getThemeMaterial(id);
    return guideCard(id.slice(0, 3).toUpperCase(), material.label, material.examples, `Weapon endpoints adapt with ${material.particles.shape.replaceAll("-", " ")}, a ${material.decal.shape.replaceAll("-", " ")} decal, and an accessibility-safe ${material.fallback.pattern.replaceAll("-", " ")} cue.`, "", "", { Particles: `${material.particles.count} max`, Decal: `${material.decal.lifetimeMs}ms`, Audio: material.sound.family, Fallback: material.fallback.label });
  }).join("");
  const passives = Object.values(PASSIVES).map((passive) => guideCard(passive.glyph, passive.name, `${passive.amount} · max ${passive.max}`, passive.id === "projectiles" ? "Adds a projectile to compatible attacks; single-instance fields and utility effects do not multiply." : "Passive stats also unlock matching weapon evolutions.", "", passive.icon, { "Each rank": passive.amount, "Maximum": `${passive.max} ranks` })).join("");
  const fieldObjects = [
    ...Object.values(ENEMY_TYPES).map((enemy) => {
      const storyDamage = enemy.damage * DIFFICULTIES.story.attack * (enemy.ranged ? DIFFICULTIES.story.spell : 1);
      return guideCard("EN", enemy.name, enemy.ranged ? "Ranged threat" : enemy.miniboss ? "Miniboss" : enemy.bomber ? "Explosive contact" : "Contact threat", enemy.ranged ? "Keeps its distance and fires orange hostile projectiles." : "Closes distance and deals contact damage.", "", enemy.icon, { Health: enemy.health, "Story hit": `${storyDamage.toFixed(1)} HP`, "Hits vs 10 HP": Math.ceil(BASE_VITALITY / storyDamage), Speed: enemy.speed, XP: enemy.xp });
    }),
    guideCard("XP", "Combat data", "Cyan crystal pickup", "Collect data motes to advance the squad's next upgrade choice.", "", getThemeAsset("guide.field.combatData"), { Effect: "Squad XP", Attraction: "Pickup radius" }),
    guideCard("BREAK", "Supply cache", "Destructible field object", "Damage the orange cache with projectiles or area attacks to reveal a random pickup.", "", getThemeAsset("guide.field.supplyCache"), { Integrity: 100, Collision: "None", Drops: "Repair / vacuum / mine / gold" }),
    guideCard("!", "Hostile projectile", "Orange-red enemy fire", "Evade hostile bolts. Apex arrows remove at least 36% of maximum health before shields.", "", getThemeAsset("guide.field.hostileProjectile"), { Threat: "Damage", Apex: "36%+ max HP" }),
    guideCard("+", "Repair kit", "Green squad pickup", "Restores 20% health to every surviving specialist.", "", getThemeAsset("guide.field.repairKit"), { Healing: "20% max HP", Target: "Whole squad" }),
    guideCard("ORB", "Relay ball", "Push objective", "Make contact to drive the relay core into its destination ring.", "", getThemeAsset("guide.field.relayBall"), { Time: "62 seconds", Reward: "Gold + data + access card" }),
    guideCard("FIELD", "Operation device", "Map-specific objective", "Stand close to charge the central device. Its effect changes with the operation.", "", getThemeAsset("guide.field.fieldDevice"), { Charge: "2.4 seconds", Effect: "Map-specific" }),
  ].join("");
  const rare = [
    guideCard("KEY", "Elite access card", "Rare evolution drop", "Elites and minibosses drop access cards. A card evolves one eligible level-five weapon whose matching passive is owned.", "", getThemeAsset("archive.events.eliteAccessCard")),
    guideCard("$", "Treasure runner", "Timed chase event", "Catch the fleeing gold target before it escapes to earn bonus gold, data, and access cards.", "", getThemeAsset("archive.events.treasureRunner")),
    guideCard("ORB", "Relay ball", "Push objective", "Make contact to drive the relay ball into its marked destination ring for a squad reward.", "", getThemeAsset("archive.events.relayBall")),
    ...BOONS.map((boon) => guideCard("★", boon.name, "Rare squad boon", boon.copy, "", boon.icon)),
    ...AUGMENTS.map((augment) => guideCard("AUG", augment.name, "Rare augment", augment.copy, "", augment.icon)),
  ].join("");
  $("guide-content").innerHTML = `<section id="guide-campaign" class="guide-section"><h3>Campaign route</h3><p>Clear threat tiers to unlock harder operations. Progress is saved in this browser.</p><div class="campaign-route">${campaign}</div></section><section id="guide-field" class="guide-section"><h3>Field objects</h3><p>Hold Shift and point at a live field object for its current stats.</p><div class="guide-grid">${fieldObjects}</div></section><section id="guide-signatures" class="guide-section"><h3>Signature evolutions</h3><div class="guide-grid">${signatures}</div></section><section id="guide-weapons" class="guide-section"><h3>Universal weapons</h3><div class="guide-grid">${weapons}</div></section><section id="guide-materials" class="guide-section"><h3>Impact materials</h3><p>Every weapon keeps its silhouette while contact particles, decals, flash, and sound adapt to the target. Shape and pattern remain available when color or motion is reduced.</p><div class="guide-grid">${materials}</div></section><section id="guide-passives" class="guide-section"><h3>Passive upgrades</h3><div class="guide-grid">${passives}</div></section><section id="guide-rare" class="guide-section"><h3>Rare finds & events</h3><div class="guide-grid">${rare}</div></section>`;
}

function renderSpecialistGrid() {
  $("specialist-grid").innerHTML = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id];
    return `<button class="specialist-card" type="button" role="option" data-specialist="${id}" aria-selected="${id === state.selected}"><small>${spec.number}</small><img class="specialist-art" src="${spec.sprite}" alt=""><span class="specialist-name">${spec.name.toUpperCase()}</span><span class="specialist-weapon"><img src="${spec.signature.icon}" alt=""><em>${escapeHTML(spec.signature.name)}</em></span></button>`;
  }).join("");
  $("specialist-grid").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectSpecialist(button.dataset.specialist)));
}

function selectSpecialist(id) {
  if (!SPECIALISTS[id]) return;
  state.selected = id;
  const spec = SPECIALISTS[id];
  $("specialist-grid").querySelectorAll("button").forEach((button) => button.setAttribute("aria-selected", button.dataset.specialist === id));
  $("detail-number").textContent = spec.number; $("detail-art").src = spec.sprite; $("detail-art").alt = spec.name;
  $("detail-role").textContent = spec.role; $("detail-name").textContent = spec.name.toUpperCase(); $("detail-tagline").textContent = spec.tagline;
  $("detail-health").textContent = spec.health; $("detail-armor").textContent = spec.armor; $("detail-range").textContent = spec.range;
  $("detail-weapon-icon").src = spec.signature.icon; $("detail-weapon-icon").alt = ""; $("detail-weapon-name").textContent = spec.signature.name;
  renderStartingWeaponDetails(spec);
  $("passive-name").textContent = spec.passive[0]; $("passive-copy").textContent = spec.passive[1];
  $("active-name").textContent = spec.active[0]; $("active-copy").textContent = spec.active[1];
  $("ultimate-name").textContent = spec.ultimate[0]; $("ultimate-copy").textContent = spec.ultimate[1];
  if (state.screen === "lobby") updateLocalProfile({ specialist: id });
}

function setPartyMode(mode) {
  state.partyMode = mode;
  document.querySelectorAll(".mode-tab").forEach((button) => {
    const active = button.dataset.partyMode === mode; button.classList.toggle("active", active); button.setAttribute("aria-selected", active);
  });
  $("join-fields").classList.toggle("hidden", mode !== "join");
  $("host-options").classList.toggle("hidden", mode === "join");
  $("progression-note").classList.toggle("hidden", mode === "join");
  $("deploy-button").querySelector("span").textContent = mode === "solo" ? "Deploy solo" : mode === "host" ? "Create squad" : "Join squad";
}

async function deploy() {
  if (state.connecting) return;
  state.connecting = true; $("deploy-button").disabled = true;
  await runtimeConfigReady;
  state.connecting = false; $("deploy-button").disabled = false;
  state.config = { map: $("map-select").value, difficulty: $("difficulty-select").value, duration: Number($("duration-select").value) };
  if (state.partyMode !== "join" && (!isMapUnlocked(state.progress, state.config.map) || !isDifficultyUnlocked(state.progress, state.config.map, state.config.difficulty))) {
    toast("Complete the previous campaign requirement first"); updateProgressionUI(); return;
  }
  sfx("deploy");
  if (state.partyMode === "solo") { enterLobbySoloPreview(); return; }
  const code = state.partyMode === "host" ? randomRoomCode() : $("room-input").value.trim().toUpperCase();
  if (code.length < 4) { toast("Enter a valid squad code"); return; }
  try {
    state.connecting = true; $("deploy-button").disabled = true; $("deploy-button").querySelector("span").textContent = "Connecting…";
    await connectRoom(code);
    enterLobby();
  } catch (error) {
    toast("The squad relay is unavailable — solo still works");
    console.error(error);
  } finally {
    state.connecting = false; $("deploy-button").disabled = false; setPartyMode(state.partyMode);
  }
}

function enterLobbySoloPreview() {
  closeSocket(); state.clientId = "solo"; state.isHost = true; state.room = ""; state.partyMode = "solo";
  state.lobby = new Map([["solo", { id: "solo", name: callsign(), specialist: state.selected, ready: true }]]);
  enterLobby();
}

function enterLobby() {
  setScreen("lobby");
  $("room-card").classList.toggle("hidden", !state.room); $("room-code").textContent = state.room || "—";
  renderLobby();
}

function renderLobby() {
  const map = MAPS[state.config.map], difficulty = DIFFICULTIES[state.config.difficulty];
  $("lobby-mission").textContent = `${map.name} · ${difficulty.name} · ${state.config.duration === 900 ? "15:00" : "04:00"}`;
  renderParty();
  const button = $("ready-button"), members = [...state.lobby.values()];
  if (state.partyMode === "solo") { button.disabled = false; button.innerHTML = `<span>Start operation</span><span>Solo</span>`; }
  else if (state.isHost) {
    const waiting = members.filter((member) => member.id !== state.clientId && !member.ready).length;
    button.disabled = waiting > 0; button.innerHTML = `<span>${waiting ? "Waiting for squad" : "Start operation"}</span><span>${members.length} / 04</span>`;
  } else {
    const me = state.lobby.get(state.clientId); button.disabled = false; button.innerHTML = `<span>${me?.ready ? "Cancel ready" : "Ready up"}</span><span>${members.filter((m) => m.ready).length} / ${members.length}</span>`;
  }
}

function renderParty() {
  const members = [...state.lobby.values()];
  $("party-list").innerHTML = members.map((member) => {
    const spec = SPECIALISTS[member.specialist] || SPECIALISTS.zuri;
    return `<div class="party-member ${member.ready || member.id === state.clientId && state.isHost ? "ready" : ""}"><img src="${spec.sprite}" alt=""><div><strong>${escapeHTML(member.name || "Connecting…")}</strong><small>${member.id === state.clientId ? "YOU" : member.ready ? "READY" : "CHOOSING"} · ${spec.name}</small></div></div>`;
  }).join("");
}

function updateLocalProfile(patch = {}) {
  const current = state.lobby.get(state.clientId) || { id: state.clientId, name: callsign(), specialist: state.selected, ready: state.isHost };
  const profile = { ...current, ...patch, id: state.clientId, name: callsign(), resumeToken: current.resumeToken || state.resumeToken };
  state.lobby.set(state.clientId, profile);
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "profile", profile });
  if (state.isHost) broadcastLobby();
  renderLobby();
}

function handleReady() {
  if (state.partyMode === "solo") { startHostedGame(); return; }
  if (state.isHost) { startHostedGame(); return; }
  const me = state.lobby.get(state.clientId); updateLocalProfile({ ready: !me?.ready });
}

function startHostedGame() {
  if (!state.isHost) return;
  const players = [...state.lobby.values()].map((p, replaySlot) => ({ id: p.id, name: p.name, specialist: p.specialist, resumeToken: p.resumeToken || "", replaySlot }));
  if (!players.length) return;
  const seed = createRandomSeed();
  const features = gameplayFeatureContract(state.runtimeConfig.config);
  state.config = { ...state.config, features };
  state.sim = new Simulation({ ...state.config, players }, { seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  beginReplayCapture(players, seed);
  discardRecovery({ notify: false });
  state.previousSnapshot = null; state.snapshot = null;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "start", config: state.config, players: publicLobbyPlayers() });
  enterGame();
  persistRecoveryCheckpoint(true);
}

function startRemoteGame(message) {
  state.config = message.config; state.sim = null; state.previousSnapshot = null; state.snapshot = null; movementPredictor.reset(); enterGame();
}

function enterGame() {
  setScreen("game"); renderer.resize(); state.endShown = false; state.telemetrySent = false; state.resultSavedKey = ""; state.lastEventSeq = 0; state.lastUpgradeKey = ""; state.lastWeaponHUDKey = ""; state.lastPassiveHUDKey = ""; state.lastSquadHUDKey = ""; state.lastFrame = performance.now();
  state.performanceMetrics = { samples: [], frames: 0, longFrames: 0, maxEntities: {}, inputLatencies: [], predictionCorrections: [] };
  state.soundState = { projectiles: 0, effects: 0, kills: 0, level: 1, damageTaken: 0, xpCollected: 0, lastShot: 0, lastMaterial: 0, lastXP: 0 };
  state.lastActiveBuffKey = ""; state.lastDamageLedgerKey = "";
  state.lastSend = 0; state.lastBroadcast = 0; state.hostPreviousMotion = null; state.inputMotionStartedAt = 0; state.inputMotionStart = null; state.inputWasActive = false;
  fixedClock.reset(); movementPredictor.reset(); resetInputProtocol(); renderer.resetCamera(); $("game-canvas").focus();
  if (!state.animation) state.animation = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (state.screen !== "game") { state.animation = 0; return; }
  const dt = Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000)); state.lastFrame = now;
  const frameStarted = performance.now(); let simulationMs = 0;
  const input = currentInput();
  let interpolation = 1, renderPrevious = null, renderState = null;
  if (state.isHost && state.sim) {
    const simulationStarted = performance.now(); const hostInput = applyHostInput(state.clientId, input);
    const timing = fixedClock.advance(dt, (stepSeconds) => {
      state.hostPreviousMotion = captureMotionState(state.sim);
      state.sim.update(stepSeconds);
      recordReplayCheckpoint();
    });
    persistRecoveryCheckpoint();
    simulationMs = performance.now() - simulationStarted; interpolation = timing.alpha; renderPrevious = state.hostPreviousMotion;
    renderState = withLocalMovementPreview(state.sim, hostInput, fixedClock.accumulator);
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastBroadcast > 83) {
      state.lastBroadcast = now;
      send(createSnapshotMessage(state.sim.snapshot(), hostInputSequences.acknowledgements()));
    }
  } else {
    const authoritative = state.snapshot?.players?.find((player) => player.id === state.clientId);
    if (authoritative && !movementPredictor.player) movementPredictor.sync(authoritative);
    if (movementPredictor.player) movementPredictor.advance(input, dt, playerMovementSpeed(movementPredictor.player), moveEntityWithCover);
    renderState = withPredictedPlayer(state.snapshot, movementPredictor.player); renderPrevious = state.previousSnapshot;
    interpolation = clamp((now - state.snapshotAt) / state.snapshotInterval, 0, 1);
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastSend > 35) {
      state.lastSend = now;
      send(guestInputSequences.create(input, now));
    }
  }
  const current = state.isHost ? state.sim : state.snapshot;
  if (current) {
    const renderStarted = performance.now(); renderer.draw(renderState || current, state.clientId, renderPrevious, interpolation, dt); const renderMs = performance.now() - renderStarted;
    const materialCue = renderer.drainMaterialAudioCues(1)[0];
    if (materialCue && now - state.soundState.lastMaterial > 72) { state.soundState.lastMaterial = now; sfx(`material:${materialCue.family}`, materialCue); }
    const hudStarted = performance.now(); updateHUD(current); updateUpgrade(current); processEvents(current.events || []); const hudMs = performance.now() - hudStarted;
    if (state.inspectActive && state.inspectPointer) inspectCanvasAt({ ...state.inspectPointer, shiftKey: true });
    trackInputLatency(renderState || current, input, now);
    trackPerformance(current, dt * 1000, performance.now() - frameStarted, simulationMs, renderMs, hudMs);
    if ((current.stage === "won" || current.stage === "lost") && !state.endShown) scheduleResult(current);
  }
  state.animation = requestAnimationFrame(gameLoop);
}

function captureMotionState(game) {
  const capture = (list) => (list || []).map(({ id, x, y }) => ({ id, x, y }));
  return { players: capture(game.players), enemies: capture(game.enemies), drones: capture(game.drones), effects: capture(game.effects) };
}

function withLocalMovementPreview(game, input, remainingSeconds) {
  const player = game?.players?.find((entry) => entry.id === state.clientId);
  if (!player || remainingSeconds <= 0) return game;
  const preview = { ...player, predicted: true };
  advancePlayerMovement(preview, input, remainingSeconds, playerMovementSpeed(player), moveEntityWithCover);
  return { ...game, players: game.players.map((entry) => entry.id === preview.id ? preview : entry) };
}

function withPredictedPlayer(game, predicted) {
  if (!game || !predicted) return game;
  return { ...game, players: game.players.map((entry) => entry.id === predicted.id ? { ...entry, ...predicted, predicted: true } : entry) };
}

function trackInputLatency(game, input, now) {
  const player = game?.players?.find((entry) => entry.id === state.clientId); if (!player) return;
  const active = Math.hypot(input.x, input.y) > .01;
  if (active && !state.inputWasActive) {
    state.inputMotionStartedAt = now; state.inputMotionStart = { x: player.x, y: player.y };
  }
  if (state.inputMotionStartedAt && Math.hypot(player.x - state.inputMotionStart.x, player.y - state.inputMotionStart.y) > .05) {
    state.performanceMetrics?.inputLatencies.push(now - state.inputMotionStartedAt);
    state.inputMotionStartedAt = 0; state.inputMotionStart = null;
  }
  if (!active && state.inputMotionStartedAt) { state.inputMotionStartedAt = 0; state.inputMotionStart = null; }
  state.inputWasActive = active;
}

function trackPerformance(game, frameGapMs, workMs, simulationMs, renderMs, hudMs) {
  const metrics = state.performanceMetrics; if (!metrics) return;
  metrics.frames++; if (frameGapMs > 33.34) metrics.longFrames++;
  metrics.samples.push({ frameGapMs, workMs, simulationMs, renderMs, hudMs });
  if (metrics.samples.length > 600) metrics.samples.splice(0, 60);
  const counts = {
    enemies: game.enemies?.length || 0, friendlyProjectiles: game.projectiles?.length || 0,
    hostileProjectiles: game.hostile?.length || 0, dataMotes: game.orbs?.length || 0,
    effects: game.effects?.length || 0, feathers: game.feathers?.length || 0,
  };
  for (const [key, value] of Object.entries(counts)) metrics.maxEntities[key] = Math.max(metrics.maxEntities[key] || 0, value);
}

function performanceSummary() {
  const metrics = state.performanceMetrics; if (!metrics?.samples.length) return null;
  const percentile = (field, amount) => {
    const values = metrics.samples.map((sample) => sample[field]).sort((a, b) => a - b);
    return Math.round(values[Math.min(values.length - 1, Math.floor(values.length * amount))] * 10) / 10;
  };
  return {
    rollingFrames: metrics.samples.length, totalFrames: metrics.frames,
    longFrameRate: Math.round(metrics.longFrames / Math.max(1, metrics.frames) * 1000) / 10,
    p95Ms: { frameGap: percentile("frameGapMs", .95), work: percentile("workMs", .95), simulation: percentile("simulationMs", .95), render: percentile("renderMs", .95), hud: percentile("hudMs", .95) },
    p99Ms: { frameGap: percentile("frameGapMs", .99), work: percentile("workMs", .99), simulation: percentile("simulationMs", .99), render: percentile("renderMs", .99), hud: percentile("hudMs", .99) },
    feel: {
      inputLatencyP95: percentileFrom(metrics.inputLatencies, .95),
      correctionP95: percentileFrom(metrics.predictionCorrections, .95),
      maxCorrection: Math.max(0, ...metrics.predictionCorrections),
    },
    multiplayerInput: inputProtocolDiagnostics(),
    materialImpacts: renderer.materialImpactDiagnostics(),
    maxEntities: metrics.maxEntities,
  };
}

function inputProtocolDiagnostics() {
  return state.isHost ? hostInputSequences.diagnostics() : guestInputSequences.diagnostics(performance.now());
}

function percentileFrom(values = [], amount = .95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * amount))] * 10) / 10;
}

function currentInput() {
  const keys = state.input.keys;
  let x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + state.input.touchX;
  let y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0) + state.input.touchY;
  const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
  return { x, y, aim: state.input.aim, autoAim: state.input.autoAim };
}

function cast(slot) {
  if (state.screen !== "game") return;
  if (state.isHost) {
    if (recordHostCast(state.clientId, slot)) {
      sfx(slot === "r" ? "ultimate" : "ability");
      if (slot === "r") comicVoice("pew pew pew");
    }
  } else {
    if (movementPredictor.player) {
      movementPredictor.player.animState = slot === "r" ? "castR" : "castE";
      movementPredictor.player.animTime = slot === "r" ? .42 : .28;
      movementPredictor.player.aimFacing = state.input.aim;
    }
    send({ type: "cast", slot }); sfx(slot === "r" ? "ultimate" : "ability");
  }
}

function weaponTelemetry(weaponId, weapon, player) {
  const level = weapon.level || 1, evolved = Boolean(weapon.evolved), extra = Math.floor(Number(player.passives?.projectiles || 0));
  const haste = Number(player.passives?.haste || 0) * 10 + (player.hotTime > 0 ? 150 : 0) + (player.hasteBuff > 0 ? 150 : 0) + (player.frenzy > 0 ? 250 : 0);
  let damageMultiplier = 1 + Number(player.passives?.damage || 0) * .1;
  if (player.specialist === "fang") damageMultiplier *= 1 + (1 - player.hp / player.maxHp) * .6;
  if (player.specialist === "rift") damageMultiplier *= 1.1;
  if (player.hotTime > 0) damageMultiplier *= 1.18;
  const cd = (base) => Math.max(.01, base * 100 / (100 + haste));
  const rounded = (value) => Math.round(value * damageMultiplier);
  if (weaponId === "signature") {
    let interval = { zuri: 2.5, echo: 3, sola: 2.75, bront: 4.8, fang: 2, gale: .25, rift: .3, nova: 3, vesper: 2.5 }[player.specialist];
    if (["echo", "sola"].includes(player.specialist)) interval -= (level - 1) * .25;
    if (player.specialist === "bront") interval -= (level - 1) * .2;
    if (player.specialist === "fang") interval -= (level - 1) * .1;
    if (player.specialist === "vesper") interval -= (level - 1) * .125;
    if (evolved) interval *= player.specialist === "zuri" ? .5 : player.specialist === "sola" ? 1.5 / interval : .68;
    const damage = { zuri: 31 + level * 11, echo: 48 + level * 14, sola: 26 + level * 11 + player.armor * 1.2, bront: 70 + level * 24, fang: 36 + level * 19 + player.maxHp * 1.5, gale: 65 + level * 21, rift: 30 + level * 13, nova: 53 + level * 14, vesper: 51 + level * 14 }[player.specialist];
    const projectiles = { zuri: 2 + level + extra, echo: Math.min(6, level + extra), sola: 3 + Math.floor(level / 2) + extra, bront: 1, fang: 1, gale: Math.min(7, 1 + Math.floor(level / 2) + extra), rift: 1, nova: Math.min(8, 1 + Math.ceil(level / 2) + extra), vesper: 1 + Math.floor(level / 3) + extra }[player.specialist];
    return { damage: `${rounded(damage)} / hit`, interval: `${cd(interval).toFixed(2)}s`, cooldownSeconds: cd(interval), projectiles: formatProjectileDisplay(getCombatMetadata("signature", player.specialist), projectiles), note: SPECIALISTS[player.specialist].signature.evolve };
  }
  const table = {
    uwu: [28 + level * 10, evolved ? .35 : .75 - level * .07, 1 + Math.floor(level / 3) + extra, "Nearest-target needles"],
    slicers: [24 + level * 9, .24, 2 + level + extra, "Orbiting contact blades"],
    aura: [16 + level * 8 + player.maxHp * .8, .34, 1, "Continuous radial field"],
    mines: [60 + level * 25, 6.8 - level * .45, 2 + level + extra, "Delayed area mines"],
    crossbow: [48 + level * 17, 4.2 - level * .25, 2 + level + extra, "Piercing random-direction fan"],
    boomerang: [65 + level * 21, 3.8 - level * .2, 1 + Math.floor(level / 2) + extra, "Returning seeking blades"],
    rail: [45 + level * 18, 3.7 - level * .22, (1 + Math.floor(level / 2) + extra) * 2, "Paired horizontal rails"],
    glove: [31 + level * 13, 2.7, (2 + level + extra) * (evolved ? 2 : 1), "Rotating orb streams"],
    transit: [135 + level * 55, 14 - level * .8, 1, "Full-lane train strike"],
    ice: [0, evolved ? 9 : 13 - level * .6, 1, "Blocks one hit, then freezes"],
    annihilator: [450 + level * 175, evolved ? 21 : 30 - level * 1.4, 1, "Massive delayed blast"],
    drone: [40 + level * 15, 1.6 - level * .1, 1 + Math.floor((level - 1) / 2), "Autonomous target seeker"],
  }[weaponId];
  if (!table) return { damage: "—", interval: "—", cooldownSeconds: 0, projectiles: "—", note: "" };
  return { damage: table[0] ? `${rounded(table[0])} / hit` : "Utility", interval: `${cd(table[1]).toFixed(2)}s`, cooldownSeconds: cd(table[1]), projectiles: formatProjectileDisplay(getCombatMetadata(weaponId, player.specialist), table[2]), note: table[3] };
}

function elapsedRunSeconds(game) { return Math.max(1, Number(game?.time || 0) + Number(game?.bossElapsed || 0)); }

function sourceName(sourceId, player) {
  if (sourceId === "signature") return SPECIALISTS[player.specialist]?.signature.name || "Signature weapon";
  if (WEAPONS[sourceId]) return WEAPONS[sourceId].name;
  const names = { "ability:e": "Active ability", "ability:r": "Ultimate", "boon:firedUp": "Fired Up", pickup: "Magnetic Talons", seaMine: "Sea Mine", environment: "Field device", blast: "Kinetic effects", other: "Other damage" };
  return names[sourceId] || String(sourceId || "Other damage").replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function weaponSlotMarkup(weaponId, weapon, player, spec, game) {
  const data = weaponId === "signature" ? spec.signature : WEAPONS[weaponId], telemetry = weaponTelemetry(weaponId, weapon, player);
  const impact = getWeaponImpactGrammar(weaponId, { specialistId: player.specialist, evolved: Boolean(weapon.evolved) });
  const icon = data.icon;
  const passive = weaponId === "signature" ? spec.signature.passive : data.passive;
  const damage = Number(player.damageBySource?.[weaponId] || 0), dps = damage / elapsedRunSeconds(game);
  return `<div class="weapon-slot ${weapon.evolved ? "evolved" : ""}" data-weapon-id="${weaponId}" data-cooldown-max="${telemetry.cooldownSeconds}" tabindex="0" aria-label="${escapeHTML(weapon.evolved ? data.evolve : data.name)} weapon details"><img src="${icon}" alt=""><i class="weapon-cooldown-sweep" aria-hidden="true"></i><b class="weapon-cooldown-seconds" aria-hidden="true"></b><small>${weapon.evolved ? "E" : weapon.level}</small><div class="weapon-tooltip"><span>${weapon.evolved ? "Evolved weapon" : `Level ${weapon.level}`}</span><strong>${escapeHTML(weapon.evolved ? data.evolve : data.name)}</strong><p>${escapeHTML(data.copy || spec.tagline)}</p><dl><div><dt>Damage</dt><dd>${telemetry.damage}</dd></div><div><dt>Cooldown</dt><dd>${telemetry.interval}</dd></div><div><dt>Projectiles</dt><dd>${telemetry.projectiles}</dd></div><div><dt>Impact</dt><dd>${escapeHTML(impactSummary(impact))}</dd></div><div><dt>Run damage</dt><dd>${statNumber(damage)}</dd></div><div><dt>DPS</dt><dd>${dps.toFixed(1)}</dd></div></dl><em>${escapeHTML(weapon.evolved ? impact?.behavior || telemetry.note : impact?.evolvedDifference || telemetry.note)}</em><small>Evolution: level 5 + ${escapeHTML(PASSIVES[passive]?.name || passive)}</small></div></div>`;
}

function currentAffectedSources(passiveId, player) {
  return getPassiveAffectedSources(passiveId, { specialistId: player?.specialist, weapons: player?.weapons || {} }).filter((source) => {
    if (source.id === "ability:e") return Number(player?.level || 0) >= 3;
    if (source.id === "ability:r") return Number(player?.level || 0) >= 6;
    return true;
  });
}

function passiveSlotMarkup(passiveId, rank, player) {
  const passive = PASSIVES[passiveId];
  if (!passive) return "";
  const level = Math.max(1, Math.floor(Number(rank) || 1));
  const affected = currentAffectedSources(passiveId, player);
  const impact = affected.length ? `Affects now: ${affected.map((source) => source.name).join(", ")}.` : passiveId === "projectiles" ? "No equipped attacks can gain another projectile yet." : "Improves a core specialist system rather than a specific attack.";
  return `<div class="passive-slot" style="--passive-color:${escapeHTML(passive.color)}" tabindex="0" aria-label="${escapeHTML(passive.name)}, passive rank ${level} of ${passive.max}"><span><img src="${passive.icon}" alt=""></span><small>${level}</small><div class="weapon-tooltip"><span>Passive upgrade</span><strong>${escapeHTML(passive.name)}</strong><p>${escapeHTML(passive.amount)} per rank. ${passive.id === "projectiles" ? "Applies only to attacks marked as multishot-compatible." : "Compatibility comes from the authoritative combat model."}</p><dl><div><dt>Current rank</dt><dd>${level} / ${passive.max}</dd></div><div><dt>Each rank</dt><dd>${escapeHTML(passive.amount)}</dd></div></dl><em>${escapeHTML(impact)}</em></div></div>`;
}

function updateCooldownSlot(slot, remaining, maximum, unlocked, unlockLevel) {
  const node = $(`${slot}-slot`), sweep = $(`${slot}-cooldown`), seconds = $(`${slot}-cooldown-seconds`);
  const cooldown = Math.max(0, Number(remaining) || 0);
  node.classList.toggle("locked", !unlocked);
  sweep.style.setProperty("--cooldown-sweep", `${unlocked ? clamp(cooldown / Math.max(.01, maximum) * 100, 0, 100) : 100}%`);
  seconds.textContent = unlocked && cooldown > .04 ? `${cooldown < 10 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s` : "";
  node.setAttribute("aria-label", !unlocked ? `Unlocks at level ${unlockLevel}` : cooldown > .04 ? `${cooldown.toFixed(1)} seconds remaining` : "Ready");
}

function setEnemyHealthBars(visible, persist = true) {
  state.showEnemyHealthBars = Boolean(visible);
  state.qualitySettings = { ...state.qualitySettings, preset: "custom", healthBars: state.showEnemyHealthBars ? "all" : "off" };
  renderer.setQualitySettings(state.qualitySettings);
  $("game-canvas").dataset.enemyHealthBars = state.showEnemyHealthBars ? "visible" : "hidden";
  $("enemy-health-bars-toggle").checked = state.showEnemyHealthBars;
  if (persist) state.qualitySettings = saveQualitySettings(state.qualitySettings);
  renderQualityControls();
}

const QUALITY_FIELDS = Object.freeze({
  effectsDensity: "quality-effects", shake: "quality-shake", hitFlashes: "quality-hit-flashes",
  healthBars: "quality-health-bars", flashIntensity: "quality-flash",
});

function renderQualityControls() {
  if (!$("quality-preset")) return;
  $("quality-preset").value = state.qualitySettings.preset;
  for (const [key, id] of Object.entries(QUALITY_FIELDS)) $(id).value = state.qualitySettings[key];
  $("quality-reduced-motion").checked = state.qualitySettings.reducedMotion;
  const status = renderer.getQualityStatus();
  $("quality-status").textContent = state.qualitySettings.preset === "auto"
    ? `Auto is rendering at ${status.tier} · ${status.frameMilliseconds.toFixed(1)} ms frame average.`
    : `${state.qualitySettings.preset === "custom" ? "Tuned" : state.qualitySettings.preset} profile · ${status.tier} renderer.`;
  document.documentElement.dataset.quality = status.tier;
  document.documentElement.dataset.reducedMotion = state.qualitySettings.reducedMotion ? "true" : "false";
}

function applyQualitySettings(settings, persist = true) {
  state.qualitySettings = persist ? saveQualitySettings(settings) : settings;
  renderer.setQualitySettings(state.qualitySettings);
  state.showEnemyHealthBars = state.qualitySettings.healthBars !== "off";
  $("enemy-health-bars-toggle").checked = state.showEnemyHealthBars;
  $("game-canvas").dataset.enemyHealthBars = state.showEnemyHealthBars ? "visible" : "hidden";
  renderQualityControls();
}

function openQualitySettings() {
  renderQualityControls();
  $("quality-dialog").showModal();
  requestAnimationFrame(() => $("quality-preset").focus());
}

function updateSoundState(game) {
  const now = performance.now(), projectiles = game.projectiles?.length || 0, effects = game.effects?.length || 0;
  const local = game.players?.find((player) => player.id === state.clientId) || game.players?.[0];
  if (projectiles > state.soundState.projectiles && now - state.soundState.lastShot > 85) {
    const grammar = resolveEntityImpact(game.projectiles.at(-1), game);
    state.soundState.lastShot = now; sfx(grammar ? `weapon:${grammar.soundFamily}` : "shot");
  } else if (effects > state.soundState.effects && now - state.soundState.lastShot > 120) {
    const effect = [...(game.effects || [])].reverse().find((candidate) => resolveEntityImpact(candidate, game));
    const grammar = resolveEntityImpact(effect, game);
    if (grammar) { state.soundState.lastShot = now; sfx(`weapon:${grammar.soundFamily}`); }
  }
  if (game.kills > state.soundState.kills) sfx("kill");
  if (game.level > state.soundState.level) sfx("level");
  if ((local?.damageTaken || 0) > state.soundState.damageTaken) sfx("hurt");
  if ((local?.xpCollected || 0) > state.soundState.xpCollected && now - state.soundState.lastXP > 42) { state.soundState.lastXP = now; sfx("xp"); }
  state.soundState.projectiles = projectiles;
  state.soundState.effects = effects;
  state.soundState.kills = game.kills || 0;
  state.soundState.level = game.level || 1;
  state.soundState.damageTaken = local?.damageTaken || 0;
  state.soundState.xpCollected = local?.xpCollected || 0;
}

function updateWeaponCooldowns(player) {
  for (const slot of $("weapon-hud").querySelectorAll(".weapon-slot")) {
    const weaponId = slot.dataset.weaponId, remaining = Math.max(0, Number(player.weaponTimers?.[weaponId] || 0));
    const maximum = Math.max(.01, Number(slot.dataset.cooldownMax || 0));
    slot.querySelector(".weapon-cooldown-sweep")?.style.setProperty("--weapon-cooldown", `${clamp(remaining / maximum * 100, 0, 100)}%`);
    const seconds = slot.querySelector(".weapon-cooldown-seconds");
    if (seconds) seconds.textContent = remaining > .08 ? `${remaining < 10 ? remaining.toFixed(1) : Math.ceil(remaining)}s` : "";
  }
}

function updateAbilityDetails(player, spec, game) {
  const haste = Number(player.passives?.haste || 0) * 10 + (player.hasteBuff > 0 ? 150 : 0) + (player.frenzy > 0 ? 250 : 0);
  const effective = (base) => base * 100 / (100 + haste);
  const set = (slot, ability, base, unlock) => {
    $(`${slot}-detail-copy`).textContent = ability[1];
    $(`${slot}-detail-cooldown`).textContent = game.level >= unlock ? `${effective(base).toFixed(1)}s` : `Unlocks Lv ${unlock}`;
    $(`${slot}-detail-status`).textContent = game.level < unlock ? "Locked" : Number(player[`${slot}Cd`] || 0) > .04 ? `${Number(player[`${slot}Cd`]).toFixed(1)}s remaining` : "Ready";
  };
  set("e", spec.active, spec.cooldownE, 3); set("r", spec.ultimate, spec.cooldownR, 6);
}

function updateActiveBuffs(player) {
  const definitions = [
    ["speedBuff", "Speed surge", getThemeAsset("archive.boons.cruiseControl"), 15],
    ["hasteBuff", "Rapid fire", getThemeAsset("archive.boons.ultraRapidFire"), 15],
    ["firedUpBuff", "Fired Up", getThemeAsset("archive.boons.firedUp"), 15],
    ["healthbackBuff", "Healthback", getThemeAsset("archive.boons.healthback"), 15],
    ["stopwavesBuff", "Stopwaves", getThemeAsset("archive.boons.stopwaves"), 15],
    ["frenzy", "Frenzy", SPECIALISTS.fang.signature.icon, 6],
    ["hotTime", "Hot streak", SPECIALISTS.zuri.signature.icon, 8],
  ];
  const active = definitions.map(([field, name, icon, max]) => ({ field, name, icon, max, remaining: Number(player[field] || 0) })).filter((buff) => buff.remaining > .04);
  const key = JSON.stringify(active.map((buff) => [buff.field, Math.ceil(buff.remaining * 10)]));
  if (key === state.lastActiveBuffKey) return; state.lastActiveBuffKey = key;
  $("active-buffs-hud").innerHTML = active.map((buff) => `<div class="active-buff" title="${escapeHTML(buff.name)} · ${buff.remaining.toFixed(1)}s"><img src="${buff.icon}" alt=""><i style="--buff-progress:${clamp(buff.remaining / buff.max * 100, 0, 100)}%"></i><b>${buff.remaining < 10 ? buff.remaining.toFixed(1) : Math.ceil(buff.remaining)}</b><span>${escapeHTML(buff.name)}</span></div>`).join("");
}

function updateDamageLedger(player, game) {
  const sources = Object.entries(player.damageBySource || {}).filter(([, damage]) => damage > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const key = JSON.stringify(sources.map(([id, damage]) => [id, Math.round(damage)]));
  if (key === state.lastDamageLedgerKey) return; state.lastDamageLedgerKey = key;
  const seconds = elapsedRunSeconds(game), panel = $("damage-ledger"), content = $("damage-ledger-content");
  panel.classList.toggle("no-data", sources.length === 0);
  content.innerHTML = sources.map(([id, damage], index) => `<div class="${index === 0 ? "leader" : ""}"><span>${escapeHTML(sourceName(id, player))}</span><b>${statNumber(damage)}</b><small>${(damage / seconds).toFixed(1)} DPS</small></div>`).join("");
}

function healthDividerMarkup(layout) {
  return layout.dividers.map((divider) => `<i class="health-divider${divider.major ? " major" : ""}" style="left:${(divider.position * 100).toFixed(4)}%"></i>`).join("");
}

function saveDamageLedgerLayout() {
  try { localStorage.setItem(DAMAGE_LEDGER_LAYOUT_KEY, JSON.stringify(state.damageLedgerLayout)); } catch { /* Storage is optional. */ }
}

function damageLedgerIsMobile() { return matchMedia("(max-width: 650px)").matches; }

function clampDamageLedgerLayout() {
  const panel = $("damage-ledger"), bounds = panel.parentElement.getBoundingClientRect(), layout = state.damageLedgerLayout;
  const maxWidth = Math.max(210, Math.min(440, bounds.width - 16));
  const maxHeight = Math.max(110, bounds.height - 96);
  layout.width = clamp(Number(layout.width) || DAMAGE_LEDGER_DEFAULT.width, 210, maxWidth);
  layout.height = clamp(Number(layout.height) || DAMAGE_LEDGER_DEFAULT.height, 110, maxHeight);
  layout.x = clamp(Number(layout.x) || 0, 8, Math.max(8, bounds.width - layout.width - 8));
  layout.y = clamp(Number(layout.y) || 0, 72, Math.max(72, bounds.height - (layout.collapsed ? 40 : layout.height) - 24));
}

function applyDamageLedgerLayout({ persist = false } = {}) {
  const panel = $("damage-ledger"), layout = state.damageLedgerLayout, mobile = damageLedgerIsMobile();
  panel.classList.toggle("mobile-pinned", mobile);
  panel.classList.toggle("collapsed", Boolean(layout.collapsed));
  const collapseButton = $("damage-ledger-collapse"), action = layout.collapsed ? "Expand" : "Collapse";
  collapseButton.setAttribute("aria-expanded", String(!layout.collapsed));
  collapseButton.setAttribute("aria-label", `${action} Damage Sources`); collapseButton.title = `${action} Damage Sources`;
  collapseButton.querySelector("span").textContent = layout.collapsed ? "+" : "−";
  if (mobile) {
    panel.style.left = ""; panel.style.top = ""; panel.style.width = ""; panel.style.height = "";
  } else {
    clampDamageLedgerLayout();
    panel.style.left = `${layout.x}px`; panel.style.top = `${layout.y}px`; panel.style.width = `${layout.width}px`;
    panel.style.height = layout.collapsed ? "" : `${layout.height}px`;
  }
  if (persist) saveDamageLedgerLayout();
}

function setupDamageLedger() {
  const panel = $("damage-ledger"), handle = $("damage-ledger-handle"), collapseButton = $("damage-ledger-collapse");
  let drag = null, applying = false;
  const finishDrag = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    drag = null; handle.classList.remove("dragging"); saveDamageLedgerLayout();
  };
  handle.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (damageLedgerIsMobile() || event.button !== 0 || event.target.closest("button")) return;
    drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: state.damageLedgerLayout.x, y: state.damageLedgerLayout.y };
    handle.setPointerCapture(event.pointerId); handle.classList.add("dragging"); event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    state.damageLedgerLayout.x = drag.x + event.clientX - drag.clientX;
    state.damageLedgerLayout.y = drag.y + event.clientY - drag.clientY;
    applyDamageLedgerLayout();
  });
  handle.addEventListener("pointerup", finishDrag); handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("keydown", (event) => {
    if (!event.key.startsWith("Arrow") || damageLedgerIsMobile()) return;
    const amount = event.shiftKey ? 1 : 10, layout = state.damageLedgerLayout, resize = event.ctrlKey || event.metaKey;
    if (resize) {
      if (event.key === "ArrowLeft") layout.width -= amount;
      if (event.key === "ArrowRight") layout.width += amount;
      if (event.key === "ArrowUp") layout.height -= amount;
      if (event.key === "ArrowDown") layout.height += amount;
    } else {
      if (event.key === "ArrowLeft") layout.x -= amount;
      if (event.key === "ArrowRight") layout.x += amount;
      if (event.key === "ArrowUp") layout.y -= amount;
      if (event.key === "ArrowDown") layout.y += amount;
    }
    event.preventDefault(); event.stopPropagation(); applyDamageLedgerLayout({ persist: true });
  });
  panel.addEventListener("keydown", (event) => event.stopPropagation());
  panel.addEventListener("keyup", (event) => event.stopPropagation());
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  collapseButton.addEventListener("click", () => { state.damageLedgerLayout.collapsed = !state.damageLedgerLayout.collapsed; applyDamageLedgerLayout({ persist: true }); });
  $("damage-ledger-reset").addEventListener("click", () => { state.damageLedgerLayout = { ...DAMAGE_LEDGER_DEFAULT, collapsed: state.damageLedgerLayout.collapsed }; applyDamageLedgerLayout({ persist: true }); handle.focus(); });
  state.damageLedgerResizeObserver = new ResizeObserver(() => {
    if (applying || damageLedgerIsMobile() || state.damageLedgerLayout.collapsed) return;
    const rect = panel.getBoundingClientRect();
    if (Math.abs(rect.width - state.damageLedgerLayout.width) < 1 && Math.abs(rect.height - state.damageLedgerLayout.height) < 1) return;
    state.damageLedgerLayout.width = rect.width; state.damageLedgerLayout.height = rect.height;
    applying = true; applyDamageLedgerLayout({ persist: true }); applying = false;
  });
  state.damageLedgerResizeObserver.observe(panel);
  window.addEventListener("resize", () => applyDamageLedgerLayout({ persist: true }));
  applyDamageLedgerLayout();
}

function togglePause(force) {
  if (!state.isHost || !state.sim) { toast("Only the squad leader can pause"); return; }
  if (state.sim.pauseReason === "upgrade") return;
  const next = force ?? !state.sim.paused; state.sim.paused = next; state.sim.pauseReason = next ? "manual" : "";
  $("pause-overlay").classList.toggle("hidden", !next);
}

function abandon() {
  if (state.isHost && state.sim) { state.replayRecorder?.recordAbandon(state.sim.tick); state.sim.lose("The squad withdrew from the breach."); }
  $("pause-overlay").classList.add("hidden");
}

function updateHUD(game) {
  const player = game.players.find((p) => p.id === state.clientId) || game.players[0]; if (!player) return;
  updateSoundState(game);
  const spec = SPECIALISTS[player.specialist];
  $("game-timer").textContent = game.stage === "boss" ? "APEX" : formatTime(game.remaining);
  $("wave-label").textContent = game.stage === "boss" ? `${(typeof game.map === "string" ? MAPS[game.map] : game.map).boss} · ENRAGE ${formatTime(300 - (game.bossElapsed || 0))}` : `Wave ${String((game.wave || 0) + 1).padStart(2, "0")} · ${WAVE_NAMES[game.wave || 0]}`;
  $("timer-progress").style.width = `${game.stage === "boss" ? 100 : clamp(game.time / game.duration * 100, 0, 100)}%`;
  $("kill-count").textContent = Number(game.kills || 0).toLocaleString(); $("gold-count").textContent = Math.round(game.gold || 0).toLocaleString();
  $("level-label").textContent = `LV ${game.level}`; $("xp-progress").style.width = `${clamp(game.teamXP / game.xpNeed * 100, 0, 100)}%`;
  $("e-name").textContent = game.level < 3 ? "Unlocks Lv 3" : spec.active[0]; $("r-name").textContent = game.level < 6 ? "Unlocks Lv 6" : spec.ultimate[0];
  updateCooldownSlot("e", player.eCd, player.eCdMax || spec.cooldownE, game.level >= 3, 3); updateCooldownSlot("r", player.rCd, player.rCdMax || spec.cooldownR, game.level >= 6, 6);
  updateAbilityDetails(player, spec, game);
  $("pause-overlay").classList.toggle("hidden", !(game.paused && game.pauseReason === "manual"));
  const boss = game.enemies?.find((enemy) => enemy.boss);
  $("boss-hud").classList.toggle("hidden", !boss);
  if (boss) {
    $("boss-name").textContent = (typeof game.map === "string" ? MAPS[game.map] : game.map).boss;
    $("boss-health").style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`;
    const bossHUDKey = `${boss.id}:${boss.maxHp}`;
    if (bossHUDKey !== state.lastBossHUDKey) {
      state.lastBossHUDKey = bossHUDKey;
      $("boss-health-segments").innerHTML = healthDividerMarkup(bossHealthSegments(boss.maxHp));
    }
  } else state.lastBossHUDKey = "";
  const squadHUDKey = JSON.stringify(game.players.map((p) => [p.id, p.name, p.specialist, p.maxHp]));
  if (squadHUDKey !== state.lastSquadHUDKey) {
    state.lastSquadHUDKey = squadHUDKey;
    $("squad-hud").innerHTML = game.players.map((p) => `<div class="squad-pill"><img src="${SPECIALISTS[p.specialist].sprite}" alt=""><div><span>${escapeHTML(p.name)}</span><div class="mini-health"><i class="mini-health-fill"></i><b class="mini-shield-fill"></b><em class="health-dividers" aria-hidden="true">${healthDividerMarkup(playerHealthSegments(p.maxHp))}</em></div></div></div>`).join("");
  }
  [...$("squad-hud").children].forEach((pill, index) => {
    const p = game.players[index], maximum = Math.max(1, p.maxHp || 1);
    pill.querySelector(".mini-health-fill").style.width = `${clamp(p.hp / maximum * 100, 0, 100)}%`;
    pill.querySelector(".mini-shield-fill").style.width = `${clamp((p.shield || 0) / maximum * 100, 0, 100)}%`;
  });
  const weaponEntries = Object.entries(player.weapons || {});
  const weaponHUDKey = JSON.stringify({ weapons: player.weapons, passives: player.passives, maxHp: Math.round(player.maxHp), armor: Math.round(player.armor), specialist: player.specialist, damage: Object.fromEntries(Object.entries(player.damageBySource || {}).map(([id, value]) => [id, Math.floor(value / 25)])) });
  if (weaponHUDKey !== state.lastWeaponHUDKey) {
    state.lastWeaponHUDKey = weaponHUDKey;
    $("weapon-hud").innerHTML = weaponEntries.map(([weaponId, weapon]) => weaponSlotMarkup(weaponId, weapon, player, spec, game)).join("");
  }
  updateWeaponCooldowns(player);
  const passiveHUDKey = JSON.stringify(player.passives || {});
  if (passiveHUDKey !== state.lastPassiveHUDKey) {
    state.lastPassiveHUDKey = passiveHUDKey;
    $("passive-hud").innerHTML = Object.entries(player.passives || {}).filter(([, rank]) => Number(rank) > 0).map(([passiveId, rank]) => passiveSlotMarkup(passiveId, rank, player)).join("");
  }
  updateActiveBuffs(player); updateDamageLedger(player, game);
}

function upgradeChoiceVisual(choice) {
  const icon = typeof choice.icon === "string" && choice.icon.trim() ? choice.icon : "";
  return { className: icon ? "has-image" : "", markup: icon ? `<img src="${escapeHTML(icon)}" alt="">` : escapeHTML(choice.glyph || "?") };
}

function upgradeChoiceDetails(choice, player) {
  const [kind, target] = String(choice.id).split(":");
  if (kind === "weapon") {
    const weaponId = target === "signature" ? "signature" : target;
    const telemetry = weaponTelemetry(weaponId, { level: choice.level, evolved: false }, player);
    return { Damage: telemetry.damage, Cooldown: telemetry.interval, Projectiles: telemetry.projectiles };
  }
  if (kind === "passive") {
    const passive = PASSIVES[target], current = Math.max(0, Number(player.passives?.[target] || 0));
    return { Current: current ? `Rank ${Math.floor(current)}` : "Not owned", After: `Rank ${choice.level}`, "Per rank": passive?.amount || choice.copy };
  }
  return { Healing: "25% max HP", Timing: "Immediate" };
}

function evolutionPair(choice, player) {
  if (!choice || !player) return null;
  const [kind, target] = String(choice.id).split(":");
  if (kind === "weapon") {
    const requirement = target === "signature" ? SPECIALISTS[player.specialist]?.signature.passive : WEAPONS[target]?.passive;
    if (requirement && Number(player.passives?.[requirement] || 0) > 0) {
      return { label: "Evolution pair", copy: `${PASSIVES[requirement]?.name || requirement} already owned` };
    }
  }
  if (kind === "passive") {
    const matchingWeapon = Object.keys(player.weapons || {}).find((weaponId) => {
      const requirement = weaponId === "signature" ? SPECIALISTS[player.specialist]?.signature.passive : WEAPONS[weaponId]?.passive;
      return requirement === target;
    });
    if (matchingWeapon) {
      const name = matchingWeapon === "signature" ? SPECIALISTS[player.specialist].signature.name : WEAPONS[matchingWeapon]?.name;
      return { label: "Evolution pair", copy: `${name || matchingWeapon} already owned` };
    }
  }
  return null;
}

function evolutionPairMarkup(pair) {
  return pair ? `<div class="evolution-pair"><span>${escapeHTML(pair.label)}</span><b>${escapeHTML(pair.copy)}</b></div>` : "";
}

function affectedLoadoutMarkup(choice, player) {
  const [kind, passiveId] = String(choice?.id || "").split(":");
  if (kind !== "passive" || !player) return "";
  const affected = currentAffectedSources(passiveId, player);
  if (!affected.length) {
    const message = passiveId === "projectiles" ? "No equipped attacks are multishot-compatible yet." : "Improves a core specialist system; no equipped attack uses it directly.";
    return `<div class="affected-loadout empty"><span>Affects now</span><p>${escapeHTML(message)}</p></div>`;
  }
  return `<div class="affected-loadout"><span>Affects now</span><div>${affected.map((source) => `<b data-source-kind="${escapeHTML(source.kind)}">${escapeHTML(source.name)}</b>`).join("")}</div></div>`;
}

function renderUpgradeStats(player) {
  const damage = (1 + Number(player.passives?.damage || 0) * .1) * (player.specialist === "rift" ? 1.1 : 1);
  const haste = Number(player.passives?.haste || 0) * 10 + (player.hasteBuff > 0 ? 150 : 0);
  const projectiles = Math.floor(Number(player.passives?.projectiles || 0));
  const crit = Number(player.passives?.crit || 0) * .08 + (player.specialist === "gale" ? .15 : 0);
  const area = 1 + Number(player.passives?.area || 0) * .11;
  const move = player.baseSpeed * (1 + Number(player.passives?.move || 0) * .09);
  const armor = Number(player.armor || 0);
  const pickup = 85 * (1 + Number(player.passives?.pickup || 0) * .35);
  const regen = Number(player.passives?.regen || 0) * .04;
  const stats = [
    ["damage", "Damage", `+${Math.round((damage - 1) * 100)}%`, damage],
    ["haste", "Ability haste", `${Math.round(haste)}`, haste],
    ["projectiles", "Extra projectiles", `+${projectiles}`, projectiles],
    ["crit", "Critical chance", `${Math.round(crit * 100)}%`, crit],
    ["area", "Area size", `+${Math.round((area - 1) * 100)}%`, area],
    ["move", "Move speed", `${Math.round(move)}`, move],
    ["armor", "Armor", `${Math.round(armor)}`, armor],
    ["pickup", "Pickup radius", `${Math.round(pickup)}`, pickup],
    ["regen", "Repair / sec", `${regen.toFixed(2)}`, regen],
  ];
  $("upgrade-current-stats").innerHTML = `<strong>Current build</strong>${stats.map(([id, label, value, raw]) => {
    const explanation = getCurrentStatExplanation(id, raw);
    const tooltipId = `stat-help-${id}`;
    return `<div class="upgrade-stat" tabindex="0" aria-describedby="${tooltipId}"><span>${escapeHTML(label)}</span><b>${escapeHTML(value)}</b><aside id="${tooltipId}" class="upgrade-stat-tooltip" role="tooltip"><strong>${escapeHTML(explanation?.name || label)}</strong><em>${escapeHTML(explanation?.value || value)}</em><p>${escapeHTML(explanation?.definition || "Current specialist statistic.")}</p></aside></div>`;
  }).join("")}<p>Focus or point at a current stat for its formula. Upgrade cards list every equipped weapon or ability affected right now.</p>`;
}

function updateUpgrade(game) {
  const pending = game.pendingChoices?.[state.clientId];
  if (!pending) { $("upgrade-overlay").classList.add("hidden"); state.lastUpgradeKey = ""; return; }
  $("upgrade-overlay").classList.remove("hidden");
  const ready = Boolean(game.choiceReady?.[state.clientId]);
  const selectedId = game.selectedChoices?.[state.clientId] || "";
  const key = `${game.level}:${JSON.stringify(game.choiceReady)}:${JSON.stringify(game.selectedChoices)}:${Object.entries(game.pendingChoices || {}).map(([id, choices]) => `${id}:${choices.map((choice) => choice.id).join(",")}`).join("|")}`;
  if (key === state.lastUpgradeKey) return; state.lastUpgradeKey = key;
  const localPlayer = game.players.find((player) => player.id === state.clientId);
  renderUpgradeStats(localPlayer);
  $("upgrade-local-name").textContent = localPlayer?.name || callsign();
  $("upgrade-local-status").textContent = ready ? "Locked" : "Choosing";
  $("upgrade-cards").innerHTML = pending.map((choice, index) => {
    const selected = selectedId === choice.id, passed = ready && !selected;
    const visual = upgradeChoiceVisual(choice);
    const details = upgradeChoiceDetails(choice, localPlayer);
    const pair = evolutionPair(choice, localPlayer);
    return `<button class="upgrade-card ${pair ? "evolution-ready" : ""} ${selected ? "selected" : ""} ${passed ? "passed" : ""}" type="button" data-choice="${escapeHTML(choice.id)}" ${ready ? "disabled" : ""}><span class="card-type">${selected ? "Locked choice" : escapeHTML(choice.kind)}</span><kbd class="choice-key">${index + 1}</kbd><div class="card-icon ${visual.className}">${visual.markup}</div><h3>${escapeHTML(choice.name)}</h3><p>${escapeHTML(choice.copy)}</p>${evolutionPairMarkup(pair)}<dl class="card-stats">${Object.entries(details).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>${affectedLoadoutMarkup(choice, localPlayer)}<div class="level-pips">${Array.from({ length: choice.max }, (_, i) => `<i class="${i < choice.level ? "on" : ""}"></i>`).join("")}</div></button>`;
  }).join("");
  if (!ready) $("upgrade-cards").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseUpgrade(button.dataset.choice)));

  const teammates = game.players.filter((player) => player.id !== state.clientId);
  $("teammate-upgrades").classList.toggle("hidden", teammates.length === 0);
  $("teammate-upgrades").parentElement.classList.toggle("solo", teammates.length === 0);
  $("teammate-upgrades").innerHTML = teammates.map((player) => {
    const choices = game.pendingChoices?.[player.id] || [];
    const teammateReady = Boolean(game.choiceReady?.[player.id]);
    const teammateSelection = game.selectedChoices?.[player.id] || "";
    return `<section class="teammate-draft ${teammateReady ? "ready" : ""}"><header><img src="${SPECIALISTS[player.specialist].sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><span>${teammateReady ? "Choice locked" : "Choosing…"}</span></div></header><div class="teammate-choice-grid">${choices.map((choice) => {
      const visual = upgradeChoiceVisual(choice), details = upgradeChoiceDetails(choice, player), pair = evolutionPair(choice, player);
      return `<div class="teammate-choice ${pair ? "evolution-ready" : ""} ${choice.id === teammateSelection ? "selected" : ""} ${teammateReady && choice.id !== teammateSelection ? "passed" : ""}" tabindex="0"><i class="${visual.className}">${visual.markup}</i><b>${escapeHTML(choice.name)}</b><small>${escapeHTML(choice.kind)} · ${choice.level}/${choice.max}</small><div class="teammate-choice-tooltip"><span>${escapeHTML(choice.kind)} · level ${choice.level}/${choice.max}</span><strong>${escapeHTML(choice.name)}</strong><p>${escapeHTML(choice.copy)}</p>${evolutionPairMarkup(pair)}<dl>${Object.entries(details).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl></div></div>`;
    }).join("")}</div></section>`;
  }).join("");

  const waiting = game.players.filter((player) => !game.choiceReady?.[player.id]).map((player) => player.id === state.clientId ? "you" : player.name);
  const picked = pending.find((choice) => choice.id === selectedId);
  $("upgrade-wait").textContent = ready ? `${picked?.name || "Upgrade"} locked. Waiting on ${waiting.join(", ") || "the squad"}.` : "Press 1, 2, or 3 to pick. Teammate options stay visible so the squad can coordinate.";
}

function showInspectPanel(detail = {}) {
  const title = detail.title || detail.name, details = detail.details || Object.entries(detail.stats || {});
  if (state.screen !== "game" || !title) return;
  $("inspect-kind").textContent = detail.kind || detail.type || "Field object";
  $("inspect-title").textContent = title;
  $("inspect-copy").textContent = detail.copy || detail.description || "";
  $("inspect-details").innerHTML = details.slice(0, 4).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");
  const panel = $("inspect-panel"); panel.classList.remove("hidden");
  const width = panel.offsetWidth || 260, height = panel.offsetHeight || 150;
  let left = Number(detail.x) + 18, top = Number(detail.y) + 18;
  if (left + width > innerWidth - 10) left = Number(detail.x) - width - 18;
  if (top + height > innerHeight - 18) top = Number(detail.y) - height - 18;
  panel.style.left = `${clamp(left, 10, Math.max(10, innerWidth - width - 10))}px`;
  panel.style.top = `${clamp(top, 10, Math.max(10, innerHeight - height - 18))}px`;
}

function hideInspectPanel() { renderer.clearInspection(); $("inspect-panel").classList.add("hidden"); }

function inspectCanvasAt(pointer) {
  if (state.screen !== "game" || !pointer?.shiftKey) { hideInspectPanel(); return; }
  const game = state.isHost ? state.sim : state.snapshot; if (!game) { hideInspectPanel(); return; }
  const detail = renderer.inspectAt(pointer.clientX, pointer.clientY, game);
  if (!detail) { hideInspectPanel(); return; }
  showInspectPanel({ ...detail, x: pointer.clientX, y: pointer.clientY });
}

window.LastlightInspect = Object.freeze({ show: showInspectPanel, hide: hideInspectPanel });

function chooseUpgrade(choiceId) {
  sfx("select");
  if (state.isHost) recordHostChoice(state.clientId, choiceId); else send({ type: "choice", choiceId });
}

function processEvents(events) {
  for (const event of events) {
    if (event.seq <= state.lastEventSeq) continue; state.lastEventSeq = event.seq;
    if (event.type === "cast") { if (!state.isHost) sfx("shot"); continue; }
    if (event.type === "danger") sfx("danger");
    else if (event.type === "victory") sfx("victory");
    else if (event.type === "upgrade" || event.type === "boon") sfx("reward");
    else sfx("objective");
    showBanner(event.title, event.copy, event.type);
  }
}

function showBanner(title, copy, type) {
  const banner = $("objective-banner"); banner.querySelector("span").textContent = type === "danger" ? "THREAT DETECTED" : type === "boon" ? "SQUAD BOOST" : type === "upgrade" ? "SYSTEM UPGRADE" : "NEW DIRECTIVE";
  banner.querySelector("strong").textContent = `${title}${copy ? ` · ${copy}` : ""}`;
  clearTimeout(state.bannerTimer); clearTimeout(state.bannerExitTimer);
  banner.classList.remove("hidden", "is-visible", "is-exiting");
  void banner.offsetWidth;
  banner.classList.add("is-visible");
  state.bannerTimer = setTimeout(() => {
    banner.classList.remove("is-visible"); banner.classList.add("is-exiting");
    const exitDuration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    state.bannerExitTimer = setTimeout(() => { banner.classList.add("hidden"); banner.classList.remove("is-exiting"); }, exitDuration);
  }, type === "danger" ? 4500 : 3800);
}

function scheduleResult(game) {
  state.endShown = true; clearTimeout(state.resultTimer);
  state.resultTimer = setTimeout(() => showResult(game), 900);
}

function statNumber(value) { return Math.round(Number(value) || 0).toLocaleString(); }

function renderScoreboard(game) {
  const seconds = elapsedRunSeconds(game);
  $("result-scoreboard-body").innerHTML = game.players.map((player) => {
    const spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
    return `<tr><td><div class="result-scoreboard-player"><img src="${spec.sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><small>${spec.name}</small></div></div></td><td>${statNumber(player.damage)}</td><td>${(Number(player.damage || 0) / seconds).toFixed(1)}</td><td>${statNumber(player.kills)}</td><td>${statNumber(player.xpCollected)}</td><td>${statNumber(player.damageTaken)}</td><td>${statNumber(player.revives)}</td><td>${statNumber(player.traveled)}</td><td><button class="copy-scorecard" type="button" data-player-id="${player.id}">Copy card</button></td></tr>`;
  }).join("");
  $("result-scoreboard-body").querySelectorAll(".copy-scorecard").forEach((button) => button.addEventListener("click", () => copyPlayerScorecard(button.dataset.playerId)));
  $("result-damage-breakdown").innerHTML = game.players.map((player) => {
    const sources = Object.entries(player.damageBySource || {}).filter(([, damage]) => damage > 0).sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, Number(player.damage || 0));
    return `<article><header><strong>${escapeHTML(player.name)} · damage by source</strong><span>${statNumber(player.damage)} total</span></header>${sources.length ? sources.map(([id, damage], index) => `<div class="${index === 0 ? "leader" : ""}"><span>${escapeHTML(sourceName(id, player))}</span><i><b style="width:${clamp(damage / total * 100, 0, 100)}%"></b></i><em>${statNumber(damage)} · ${(damage / seconds).toFixed(1)} DPS · ${Math.round(damage / total * 100)}%</em></div>`).join("") : `<p>No source data recorded.</p>`}</article>`;
  }).join("");
}

function saveCompletedRun(game) {
  const key = `${game.stage}:${Math.round(Number(game.time || 0) * 10)}:${game.players.map((player) => player.id).join(",")}`;
  if (state.resultSavedKey === key) return;
  state.resultSavedKey = key;
  const run = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, finishedAt: new Date().toISOString(), won: game.stage === "won",
    map: typeof game.map === "string" ? game.map : game.map.id, difficulty: typeof game.difficulty === "string" ? game.difficulty : game.difficulty.id,
    elapsed: elapsedRunSeconds(game), level: Number(game.level || 0), kills: Number(game.kills || 0), gold: Number(game.gold || 0),
    players: game.players.map((player) => ({ name: player.name, specialist: player.specialist, damage: player.damage, kills: player.kills, xpCollected: player.xpCollected, damageTaken: player.damageTaken, revives: player.revives, traveled: player.traveled, damageBySource: player.damageBySource || {} })),
  };
  state.runHistory = [run, ...state.runHistory].slice(0, 24);
  try { localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(state.runHistory)); } catch { /* Run history is optional. */ }
}

function renderRunHistory() {
  $("run-history-list").innerHTML = state.runHistory.length ? state.runHistory.map((run) => {
    const totalDamage = (run.players || []).reduce((sum, player) => sum + Number(player.damage || 0), 0);
    return `<article class="run-history-entry ${run.won ? "won" : "lost"}"><header><div><span>${run.won ? "Victory" : "Defeat"}</span><strong>${escapeHTML(MAPS[run.map]?.name || run.map)} · ${escapeHTML(DIFFICULTIES[run.difficulty]?.name || run.difficulty)}</strong></div><time datetime="${escapeHTML(run.finishedAt)}">${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(run.finishedAt))}</time></header><dl><div><dt>Time</dt><dd>${formatTime(run.elapsed)}</dd></div><div><dt>Level</dt><dd>${run.level}</dd></div><div><dt>Kills</dt><dd>${statNumber(run.kills)}</dd></div><div><dt>Damage</dt><dd>${statNumber(totalDamage)}</dd></div><div><dt>DPS</dt><dd>${(totalDamage / Math.max(1, run.elapsed)).toFixed(1)}</dd></div></dl><p>${(run.players || []).map((player) => `${escapeHTML(player.name)} / ${escapeHTML(SPECIALISTS[player.specialist]?.name || player.specialist)}`).join(" · ")}</p></article>`;
  }).join("") : `<div class="run-history-empty"><strong>No operations recorded yet.</strong><p>Completed and failed runs will be saved in this browser.</p></div>`;
}

function openRunHistory() { renderRunHistory(); $("run-history-dialog").showModal(); }

async function scorecardBlob(player, game) {
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d"), spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
  const mapId = typeof game.map === "string" ? game.map : game.map.id;
  const difficultyId = typeof game.difficulty === "string" ? game.difficulty : game.difficulty.id;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630); gradient.addColorStop(0, "#07111d"); gradient.addColorStop(1, "#102839");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "rgba(99,242,223,.12)"; ctx.lineWidth = 1;
  for (let x = 0; x < 1200; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke(); }
  for (let y = 0; y < 630; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke(); }
  ctx.fillStyle = "#63f2df"; ctx.font = "700 18px Inter"; ctx.fillText("LASTLIGHT // OPERATION REPORT", 58, 58);
  ctx.fillStyle = "#eff5f2"; ctx.font = "800 72px 'Barlow Condensed'"; ctx.fillText(player.name.toUpperCase(), 58, 142);
  ctx.fillStyle = spec.color; ctx.font = "800 28px 'Barlow Condensed'"; ctx.fillText(`${spec.name.toUpperCase()} · ${MAPS[mapId].name.toUpperCase()} · ${DIFFICULTIES[difficultyId].name.toUpperCase()}`, 60, 182);
  const stats = [["DAMAGE", player.damage], ["DPS", Number(player.damage || 0) / elapsedRunSeconds(game)], ["KILLS", player.kills], ["XP PICKED", player.xpCollected], ["DAMAGE TAKEN", player.damageTaken], ["REVIVES", player.revives], ["DISTANCE", player.traveled]];
  stats.forEach(([label, value], index) => {
    const col = index % 4, row = Math.floor(index / 4), x = 60 + col * 170, y = 272 + row * 132;
    ctx.fillStyle = "#78909a"; ctx.font = "700 14px Inter"; ctx.fillText(label, x, y);
    ctx.fillStyle = "#eff5f2"; ctx.font = "800 42px 'Barlow Condensed'"; ctx.fillText(statNumber(value), x, y + 46);
  });
  const image = new Image(); image.src = spec.sprite;
  try { await image.decode(); ctx.drawImage(image, 760, 70, 390, 390); } catch { /* Stats remain shareable without art. */ }
  const topSource = Object.entries(player.damageBySource || {}).sort((a, b) => b[1] - a[1])[0];
  if (topSource) { ctx.fillStyle = "#63f2df"; ctx.font = "700 15px Inter"; ctx.fillText(`TOP SOURCE · ${sourceName(topSource[0], player).toUpperCase()} · ${statNumber(topSource[1])} DAMAGE`, 60, 528); }
  ctx.fillStyle = "rgba(239,245,242,.55)"; ctx.font = "600 14px Inter"; ctx.fillText(`BUILD ${BUILD} · ${game.stage === "won" ? "APEX NEUTRALIZED" : "THE LINE BROKE"}`, 60, 592);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to render scorecard")), "image/png"));
}

async function copyPlayerScorecard(playerId) {
  const player = state.resultGame?.players?.find((candidate) => candidate.id === playerId);
  if (!player || !window.ClipboardItem || !navigator.clipboard?.write) { toast("Image clipboard is not supported here"); return; }
  try {
    const blob = await scorecardBlob(player, state.resultGame);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(`${player.name} scorecard copied`);
  } catch (error) { console.error(error); toast("Could not copy the scorecard"); }
}

function showResult(game) {
  discardRecovery({ notify: false });
  const won = game.stage === "won"; $("result-eyebrow").textContent = won ? "Operation complete" : "Signal lost";
  $("result-title").textContent = won ? "APEX NEUTRALIZED" : "THE LINE BROKE"; $("result-title").style.color = won ? "var(--cyan)" : "var(--danger)";
  $("result-copy").textContent = won ? "The line held. Final City gets another sunrise." : "Recalibrate the loadout, regroup, and breach again.";
  $("result-time").textContent = formatTime(game.time + (game.bossElapsed || 0)); $("result-kills").textContent = Number(game.kills || 0).toLocaleString(); $("result-level").textContent = game.level; $("result-gold").textContent = Math.round(game.gold || 0);
  const mapId = typeof game.map === "string" ? game.map : game.map.id;
  const difficultyId = typeof game.difficulty === "string" ? game.difficulty : game.difficulty.id;
  const unlocks = won ? recordVictory(mapId, difficultyId) : [];
  $("result-unlock").classList.toggle("hidden", !unlocks.length);
  $("result-unlock").textContent = unlocks.length ? `Campaign updated · ${unlocks.join(" · ")}` : "";
  if (state.isHost && game === state.sim) finalizeReplayCapture();
  $("copy-replay").classList.toggle("hidden", !state.resultReplay);
  state.resultGame = game; renderScoreboard(game);
  saveCompletedRun(game);
  setScreen("result");
  if (state.isHost && !state.telemetrySent && state.runtimeConfig.config.flags.runTelemetry) {
    state.telemetrySent = true;
    submitRunTelemetry(game, BUILD).catch((error) => console.warn("Run telemetry unavailable", error));
  }
}

async function copyReplay() {
  if (!state.resultReplay) return;
  try { await navigator.clipboard.writeText(JSON.stringify(state.resultReplay)); toast("Deterministic replay copied"); }
  catch (error) { captureClientError("replay", error); toast("Could not copy the replay"); }
}

function returnToLobby() {
  discardRecovery({ notify: false });
  resetInputProtocol();
  state.sim = null; state.snapshot = null; state.previousSnapshot = null; state.replayRecorder = null; state.endShown = false; clearTimeout(state.resultTimer);
  for (const member of state.lobby.values()) member.ready = member.id === state.clientId && state.isHost;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "return_lobby" });
  enterLobby(); if (state.isHost) broadcastLobby(); else updateLocalProfile({ ready: false });
}

function leaveToHome() { closeSocket(); state.sim = null; state.snapshot = null; state.replayRecorder = null; state.resultGame = null; state.lobby.clear(); setScreen("home"); updateProgressionUI(); }

function connectRoom(code) {
  closeSocket(); state.room = code; state.connecting = true;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error("Relay connection timed out")); closeSocket(); }, 7000);
    state.connectResolve = (message) => { clearTimeout(timeout); resolve(message); };
    state.connectReject = (error) => { clearTimeout(timeout); reject(error); };
    const url = new URL(`${RELAY_BASE}${encodeURIComponent(code)}`);
    const ws = new WebSocket(url); state.ws = ws;
    state.networkLab = createActivatedNetworkLab(NETWORK_LAB_ACTIVATION, {
      onForcedDisconnect: () => { if (state.ws === ws) ws.close(4100, "Network lab reconnect"); },
      onError: (error) => captureClientError("network lab", error),
    });
    ws.addEventListener("open", () => send({ type: "hello", profile: { name: callsign(), specialist: state.selected, resumeToken: state.resumeToken } }));
    ws.addEventListener("message", (event) => {
      if (state.networkLab) state.networkLab.downstream(event.data, (payload) => handleNetworkMessage(payload));
      else handleNetworkMessage(event.data);
    });
    ws.addEventListener("error", () => state.connectReject?.(new Error("Relay connection failed")));
    ws.addEventListener("close", () => { if (state.screen === "game" && !state.isHost) { toast("Squad connection lost"); captureClientError("network", "Squad relay connection closed during a run"); } });
  });
}

function handleNetworkMessage(raw) {
  let message; try { message = JSON.parse(raw); } catch { return; }
  if (message.type === "welcome") {
    state.clientId = message.id; state.isHost = message.role === "host"; state.lobby = new Map();
    for (const peer of message.peers || []) state.lobby.set(peer.id, { id: peer.id, name: peer.name || "Connecting…", specialist: peer.specialist || "zuri", ready: false });
    state.lobby.set(state.clientId, { id: state.clientId, name: callsign(), specialist: state.selected, ready: state.isHost, resumeToken: state.resumeToken });
    send({ type: "profile", profile: state.lobby.get(state.clientId) }); state.connectResolve?.(message); state.connectResolve = null; return;
  }
  if (message.type === "peer_joined") {
    if (state.isHost) { state.lobby.set(message.peer.id, { id: message.peer.id, name: message.peer.name || "Connecting…", specialist: message.peer.specialist || "zuri", ready: false }); broadcastLobby(); }
  } else if (message.type === "peer_left") {
    const departed = state.lobby.get(message.id);
    if (state.isHost && state.sim && state.replayRecorder) {
      try { state.replayRecorder.recordLeave(message.id, state.sim.tick); } catch { /* A pre-run peer has no replay slot. */ }
    }
    hostInputSequences.remove(message.id); state.lobby.delete(message.id); state.sim?.removePlayer(message.id);
    if (state.isHost && state.sim && state.screen === "game") state.sim.pushEvent("danger", `${departed?.name || "A specialist"} disconnected`, "Their callsign is reserved for three minutes");
    if (state.screen === "lobby") renderLobby(); if (state.isHost) broadcastLobby();
  } else if (message.type === "host_changed") {
    state.isHost = message.id === state.clientId; if (state.isHost && state.screen === "lobby") { const me = state.lobby.get(state.clientId); if (me) me.ready = true; broadcastLobby(); renderLobby(); }
    else if (state.isHost && state.screen === "game" && !state.sim) toast("The host left — this run cannot migrate yet");
  } else if (message.type === "profile" && state.isHost) {
    state.lobby.set(message._from, { ...message.profile, id: message._from });
    if (state.sim && state.screen === "game") {
      const availableReplaySlot = nextReplaySlot();
      const player = state.sim.addPlayer({ ...message.profile, id: message._from, replaySlot: availableReplaySlot });
      const resumed = Boolean(player?.reconnected); if (player) delete player.reconnected;
      if (player && state.sim.players.some((entry) => entry !== player && entry.replaySlot === player.replaySlot)) player.replaySlot = availableReplaySlot;
      if (player && state.replayRecorder) state.replayRecorder.registerPlayer(message._from, player.specialist, { slot: player.replaySlot, tick: state.sim.tick, reconnect: resumed });
      if (player && !resumed) {
        const anchor = state.sim.players.find((entry) => entry.id !== player.id && !entry.dead && !entry.downed);
        if (anchor) { player.x = anchor.x + 45; player.y = anchor.y + 25; }
        player.invuln = 5;
      }
      state.sim.pushEvent("boon", `${player?.name || message.profile.name} ${resumed ? "reconnected" : "joined the run"}`, resumed ? "Loadout and progress restored" : "Deployed at the squad position");
      send({ type: "sync_game", config: state.config, players: publicLobbyPlayers(), state: state.sim.snapshot() }, message._from);
      toast(`${player?.name || message.profile.name} ${resumed ? "reconnected" : "joined"}`);
    }
    broadcastLobby(); if (state.screen === "lobby") renderLobby();
  } else if (message.type === "lobby_state" && !state.isHost) {
    state.config = message.config; state.lobby = new Map(message.players.map((p) => [p.id, p])); if (state.screen === "lobby") renderLobby();
  } else if (message.type === "start" && !state.isHost) startRemoteGame(message);
  else if (message.type === "sync_game" && !state.isHost) {
    state.lobby = new Map((message.players || []).map((player) => [player.id, player]));
    startRemoteGame(message); state.snapshot = message.state; state.snapshotAt = performance.now();
    movementPredictor.sync(state.snapshot?.players?.find((player) => player.id === state.clientId));
    toast("Joined operation in progress");
  }
  else if (message.type === "return_lobby" && !state.isHost) returnToLobby();
  else if (message.type === "input" && state.isHost) applyGuestNetworkInput(message);
  else if (message.type === "cast" && state.isHost) recordHostCast(message._from, message.slot);
  else if (message.type === "choice" && state.isHost) recordHostChoice(message._from, message.choiceId);
  else if (message.type === "snapshot" && !state.isHost) {
    let snapshotMessage; try { snapshotMessage = sanitizeSnapshotMessage(message, { transport: true }); } catch { return; }
    const now = performance.now(); if (state.snapshotAt) state.snapshotInterval = clamp(now - state.snapshotAt, 60, 180);
    if (snapshotMessage.protocolVersion) guestInputSequences.acknowledge(snapshotMessage.ack[state.clientId], now);
    else guestInputSequences.observeLegacySnapshot(now);
    state.previousSnapshot = state.snapshot; state.snapshot = snapshotMessage.state; state.snapshotAt = now;
    const predicted = movementPredictor.sync(state.snapshot?.players?.find((player) => player.id === state.clientId));
    if (predicted && movementPredictor.lastCorrectionDistance > 0) {
      const corrections = state.performanceMetrics?.predictionCorrections;
      if (corrections) { corrections.push(movementPredictor.lastCorrectionDistance); if (corrections.length > 600) corrections.splice(0, 60); }
    }
  }
}

function broadcastLobby() {
  if (!state.isHost || state.ws?.readyState !== WebSocket.OPEN) return;
  send({ type: "lobby_state", config: state.config, players: publicLobbyPlayers() });
}

function publicLobbyPlayers() {
  return [...state.lobby.values()].map(({ id, name, specialist, ready }) => ({ id, name, specialist, ready: Boolean(ready) }));
}

function send(message, targetId = "") {
  if (state.ws?.readyState !== WebSocket.OPEN) return;
  const socket = state.ws, payload = JSON.stringify(targetId ? { ...message, _to: targetId } : message);
  const deliver = (delayed) => { if (state.ws === socket && socket.readyState === WebSocket.OPEN) socket.send(delayed); };
  if (state.networkLab) state.networkLab.upstream(payload, deliver); else deliver(payload);
}
function closeSocket() { state.networkLab?.teardown(); state.networkLab = null; if (state.ws) { state.ws.onclose = null; state.ws.close(); } state.ws = null; state.connectResolve = null; state.connectReject = null; resetInputProtocol(); }
function randomRoomCode() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); }

async function copyInvite() {
  const url = new URL(location.href); url.search = ""; url.searchParams.set("room", state.room);
  try { await navigator.clipboard.writeText(url.toString()); toast("Invite link copied"); } catch { toast(state.room); }
}

function toast(message) { const node = $("toast"); node.textContent = message; node.classList.add("show"); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove("show"), 2600); }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

function gameDiagnostics() {
  const game = state.isHost ? state.sim : state.snapshot;
  const map = game ? (typeof game.map === "string" ? game.map : game.map?.id) : state.config?.map;
  const difficulty = game ? (typeof game.difficulty === "string" ? game.difficulty : game.difficulty?.id) : state.config?.difficulty;
  return {
    build: BUILD,
    screen: state.screen,
    specialist: state.selected,
    map: map || null,
    difficulty: difficulty || null,
    duration: game?.duration || state.config?.duration || null,
    stage: game?.stage || null,
    elapsedSeconds: Math.round(Number(game?.time || 0)),
    level: Number(game?.level || 0),
    teamSize: Number(game?.players?.length || state.lobby.size || 1),
    multiplayerRole: state.partyMode === "solo" ? "solo" : state.isHost ? "host" : "guest",
    multiplayerInput: inputProtocolDiagnostics(),
    networkLab: state.networkLab ? (() => { const { seed, ...diagnostics } = state.networkLab.diagnostics(); return diagnostics; })() : { active: false, reason: NETWORK_LAB_ACTIVATION.reason },
    runtimeConfig: {
      version: state.runtimeConfig.config.configVersion,
      gameplayVersion: state.config?.features?.gameplayVersion || state.runtimeConfig.config.gameplayVersion,
      source: state.runtimeConfig.source,
      status: state.runtimeConfig.status,
      flags: { ...state.runtimeConfig.config.flags },
    },
    enemyHealthBars: state.showEnemyHealthBars,
    displayQuality: renderer.getQualityStatus(),
    entities: game ? {
      enemies: game.enemies?.length || 0, friendlyProjectiles: game.projectiles?.length || 0,
      hostileProjectiles: game.hostile?.length || 0, dataMotes: game.orbs?.length || 0,
      effects: game.effects?.length || 0, feathers: game.feathers?.length || 0,
    } : null,
    performance: state.screen === "game" ? performanceSummary() : null,
  };
}

function diagnosticText() {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    url: location.href,
    game: gameDiagnostics(),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    userAgent: navigator.userAgent,
    recentErrors: state.recentErrors,
  }, null, 2);
}

function captureClientError(type, value) {
  const error = value instanceof Error ? value : new Error(String(value?.message || value || "Unknown client error"));
  state.recentErrors.push({ type: String(type).slice(0, 40), summary: `${error.message}${error.stack ? `\n${error.stack}` : ""}`.slice(0, 1200) });
  state.recentErrors = state.recentErrors.slice(-6);
  $("report-alert")?.classList.remove("hidden");
  if (state.recentErrors.length === 1) toast("Something went wrong · report details are ready");
}

function clearReportNote() { $("report-note").value = ""; }

function openReport() {
  const game = gameDiagnostics();
  clearReportNote();
  state.resumeAfterReport = false;
  if (state.screen === "game" && state.isHost && state.sim && !state.sim.paused) { togglePause(true); state.resumeAfterReport = true; }
  $("report-context").textContent = `BUILD ${BUILD} · ${game.screen.toUpperCase()} · ${game.map || "NO MAP"} / ${game.difficulty || "NO TIER"} · ${game.multiplayerRole.toUpperCase()} · ${state.recentErrors.length} RECENT ERROR${state.recentErrors.length === 1 ? "" : "S"}`;
  $("report-status").textContent = ""; $("report-status").className = "report-status";
  $("report-screenshot").disabled = state.screen !== "game";
  $("report-dialog").showModal();
  setTimeout(() => $("report-note").focus(), 50);
}

function handleReportClosed() {
  clearReportNote();
  if (state.resumeAfterReport && state.screen === "game" && state.isHost && state.sim?.paused && state.sim.pauseReason === "manual") togglePause(false);
  state.resumeAfterReport = false;
}

async function submitReport(event) {
  event.preventDefault();
  if (state.reportSubmitting) return;
  const note = $("report-note").value.trim();
  if (note.length < 8) { $("report-status").textContent = "Please include a little more detail."; $("report-status").className = "report-status error"; return; }
  state.reportSubmitting = true; $("report-submit").disabled = true;
  $("report-status").textContent = "Sending diagnostics to command…"; $("report-status").className = "report-status";
  let dataUrl = "", mimeType = "";
  if ($("report-screenshot").checked && state.screen === "game") {
    try { mimeType = "image/jpeg"; dataUrl = $("game-canvas").toDataURL(mimeType, .76); } catch { /* A report is still useful without a screenshot. */ }
  }
  const game = gameDiagnostics(), contact = $("report-contact").value.trim();
  const payload = {
    kind: "vellum.feedback", version: 1, project: "lastlight", capturedAt: new Date().toISOString(),
    note: `[${$("report-category").value}] ${note}`,
    reporter: { flow: "public-user", signedIn: false, userLabel: (contact || callsign()).slice(0, 180) },
    url: location.href,
    diagnostics: {
      app: "lastlight", build: BUILD, game,
      route: { viewMode: state.screen, path: location.pathname, search: location.search, activeLocation: game.map || state.screen },
      browser: { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, userAgent: navigator.userAgent },
    },
    recentHistory: [
      { type: "session", summary: `Build ${BUILD}; ${game.screen}; ${game.specialist}; ${game.map || "no map"}/${game.difficulty || "no tier"}; level ${game.level}; ${game.elapsedSeconds}s; ${game.multiplayerRole}` },
      ...state.recentErrors,
    ].slice(-8),
    screenshot: { captured: Boolean(dataUrl), mimeType, dataUrl },
  };
  try {
    const response = await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Report service returned ${response.status}`);
    $("report-status").textContent = `Report sent${result.issue?.identifier ? ` as ${result.issue.identifier}` : ""}. Thank you.`;
    $("report-status").className = "report-status success"; $("report-alert").classList.add("hidden"); clearReportNote(); sfx("reward");
  } catch (error) {
    console.error(error); $("report-status").textContent = "Could not send automatically. Use “Copy diagnostic details” and share them directly.";
    $("report-status").className = "report-status error"; sfx("danger");
  } finally { state.reportSubmitting = false; $("report-submit").disabled = false; }
}

async function copyDiagnostics() {
  try { await navigator.clipboard.writeText(`${$("report-note").value.trim()}\n\n${diagnosticText()}`); toast("Diagnostic details copied"); }
  catch { toast("Clipboard unavailable"); }
}

function ensureAudio() { if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)(); return state.audioContext; }
function audioTone(audio, frequency, offset = 0, duration = .08, type = "sine", volume = .025, endFrequency = frequency) {
  const start = audio.currentTime + offset, oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(start); oscillator.stop(start + duration + .01);
}

function sfx(name, details = {}) {
  if (!state.audio) return;
  const audio = ensureAudio(); if (audio.state === "suspended") audio.resume();
  const note = (frequency, offset, duration, type, volume, end) => audioTone(audio, frequency, offset, duration, type, volume, end);
  if (name.startsWith("material:")) {
    const family = name.slice(9), pitch = clamp(Number(details.pitch) || 1, .5, 1.5), mix = clamp(Number(details.volume) || .6, 0, .8);
    const profiles = {
      metal: [1180, 430, "triangle", .045], concrete: [170, 68, "sawtooth", .085], liquid: [760, 1280, "sine", .11],
      organic: [220, 92, "triangle", .075], energy: [680, 1120, "square", .08], void: [105, 44, "sawtooth", .15],
    };
    const [frequency, end, type, duration] = profiles[family] || profiles.concrete;
    note(frequency * pitch, 0, duration, type, .014 * mix, end * pitch);
  }
  else if (name.startsWith("weapon:")) {
    const family = name.slice(7);
    const profiles = {
      pulse: [880, 240, "square", .007, .05], resonance: [520, 760, "sine", .009, .09], solar: [690, 390, "triangle", .01, .1],
      heavy: [115, 58, "sawtooth", .018, .13], blade: [1250, 480, "triangle", .007, .045], wind: [760, 1180, "sine", .006, .11],
      kinetic: [210, 620, "square", .012, .075], arcane: [470, 940, "sine", .009, .12], tech: [960, 420, "square", .006, .045],
      ballistic: [640, 170, "square", .009, .055], industrial: [92, 42, "sawtooth", .018, .16], crystal: [1320, 760, "sine", .008, .13], void: [82, 260, "sawtooth", .014, .2],
    };
    const [frequency, end, type, volume, duration] = profiles[family] || profiles.pulse;
    note(frequency, 0, duration, type, volume, end);
  }
  else if (name === "shot") note(820, 0, .055, "square", .008, 210);
  else if (name === "hurt") { note(145, 0, .11, "sawtooth", .024, 65); note(72, .025, .16, "square", .014, 48); }
  else if (name === "kill") { note(150, 0, .07, "triangle", .016, 80); note(440, .025, .06, "square", .008, 260); }
  else if (name === "select") { note(520, 0, .08, "triangle", .025, 650); note(780, .06, .1, "sine", .018, 900); }
  else if (name === "deploy") { note(170, 0, .18, "sawtooth", .025, 420); note(520, .1, .16, "triangle", .02, 760); }
  else if (name === "ability") { note(280, 0, .14, "sawtooth", .025, 680); note(920, .04, .09, "sine", .012, 460); }
  else if (name === "ultimate") { note(92, 0, .45, "sawtooth", .032, 180); note(230, .08, .35, "square", .018, 860); note(980, .2, .22, "sine", .02, 420); }
  else if (name === "danger") { note(108, 0, .22, "sawtooth", .026, 82); note(108, .25, .22, "sawtooth", .023, 82); }
  else if (name === "objective") { note(320, 0, .09, "triangle", .018, 420); note(510, .08, .12, "sine", .018, 620); }
  else if (name === "reward") { note(440, 0, .12, "triangle", .022, 520); note(660, .09, .14, "triangle", .021, 760); note(920, .19, .2, "sine", .018, 1040); }
  else if (name === "level") { note(392, 0, .1, "triangle", .018, 440); note(587, .07, .12, "triangle", .02, 660); note(880, .16, .18, "sine", .018, 980); }
  else if (name === "xp") { note(980, 0, .045, "sine", .006, 1320); note(1480, .018, .035, "triangle", .004, 1120); }
  else if (name === "victory") { [392, 523, 659, 784, 1046].forEach((frequency, index) => note(frequency, index * .09, .28, "triangle", .022, frequency * 1.05)); }
  else note(440, 0, .08, "sine", .018, 560);
}

function comicVoice(words) {
  const now = performance.now();
  if (!state.audio || !window.speechSynthesis || now - state.lastVoiceAt < 8000) return;
  state.lastVoiceAt = now;
  const utterance = new SpeechSynthesisUtterance(words); utterance.rate = 1.65; utterance.pitch = 1.35; utterance.volume = .32;
  window.speechSynthesis.speak(utterance);
}

function toggleAudio() {
  state.audio = !state.audio;
  for (const id of ["audio-button", "lobby-audio"]) { $(id).textContent = state.audio ? "Sound on" : "Sound off"; $(id).setAttribute("aria-pressed", String(!state.audio)); }
  if (state.audio) sfx("ui"); else window.speechSynthesis?.cancel();
}

function setStartingWeaponDetailsOpen(open, suppressFocus = false) {
  const trigger = $("starting-weapon-trigger");
  trigger.setAttribute("aria-expanded", String(open));
  const detail = $("starting-weapon-tooltip").parentElement;
  detail.classList.toggle("is-open", open);
  detail.classList.toggle("is-suppressed", suppressFocus);
}

function setupTouch() {
  const stick = $("move-stick"), knob = stick.querySelector("i"); let pointer = null;
  const update = (event) => { const rect = stick.getBoundingClientRect(), x = event.clientX - (rect.left + rect.width/2), y = event.clientY - (rect.top + rect.height/2), length = Math.hypot(x,y) || 1, max = rect.width*.34, scale = Math.min(1,max/length); knob.style.transform=`translate(${x*scale}px,${y*scale}px)`; state.input.touchX=clamp(x/max,-1,1);state.input.touchY=clamp(y/max,-1,1); };
  stick.addEventListener("pointerdown", (event) => { pointer=event.pointerId;stick.setPointerCapture(pointer);update(event); });
  stick.addEventListener("pointermove", (event) => { if(event.pointerId===pointer)update(event); });
  const end = (event) => { if(event.pointerId!==pointer)return;pointer=null;state.input.touchX=0;state.input.touchY=0;knob.style.transform=""; };
  stick.addEventListener("pointerup",end);stick.addEventListener("pointercancel",end);
  $("touch-e").addEventListener("pointerdown",()=>cast("e"));$("touch-r").addEventListener("pointerdown",()=>cast("r"));
}

function bindEvents() {
  setupDamageLedger();
  $("starting-weapon-trigger").addEventListener("click", () => {
    const open = $("starting-weapon-trigger").getAttribute("aria-expanded") !== "true";
    setStartingWeaponDetailsOpen(open, !open);
  });
  $("starting-weapon-trigger").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setStartingWeaponDetailsOpen(false, true);
  });
  $("starting-weapon-tooltip").parentElement.addEventListener("focusout", (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setStartingWeaponDetailsOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".starting-weapon-detail")) setStartingWeaponDetailsOpen(false);
  });
  document.querySelectorAll(".mode-tab").forEach((button) => button.addEventListener("click", () => setPartyMode(button.dataset.partyMode)));
  $("map-select").addEventListener("change", updateDifficultyOptions);
  $("deploy-button").addEventListener("click", deploy); $("room-input").addEventListener("keydown", (event) => { if (event.key === "Enter") deploy(); });
  $("recovery-resume").addEventListener("click", resumeRecovery); $("recovery-discard").addEventListener("click", () => discardRecovery());
  $("room-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
  $("lobby-back").addEventListener("click", leaveToHome); $("ready-button").addEventListener("click", handleReady); $("copy-link").addEventListener("click", copyInvite);
  $("pause-button").addEventListener("click", () => togglePause()); $("resume-button").addEventListener("click", () => togglePause(false)); $("abandon-button").addEventListener("click", abandon);
  $("enemy-health-bars-toggle").addEventListener("change", (event) => setEnemyHealthBars(event.target.checked));
  $("again-button").addEventListener("click", returnToLobby); $("result-home").addEventListener("click", leaveToHome);
  $("copy-replay").addEventListener("click", copyReplay);
  for (const id of ["run-history-button", "lobby-run-history", "result-run-history"]) $(id).addEventListener("click", openRunHistory);
  $("run-history-close").addEventListener("click", () => $("run-history-dialog").close());
  $("run-history-dialog").addEventListener("click", (event) => { if (event.target === $("run-history-dialog")) $("run-history-dialog").close(); });
  for (const id of ["audio-button", "lobby-audio"]) $(id).addEventListener("click", toggleAudio);
  for (const id of ["quality-button", "lobby-quality", "pause-quality"]) $(id).addEventListener("click", openQualitySettings);
  $("quality-dialog").addEventListener("click", (event) => { if (event.target === $("quality-dialog")) $("quality-dialog").close(); });
  $("quality-preset").addEventListener("change", (event) => applyQualitySettings(settingsForPreset(event.target.value, systemReducedMotion)));
  for (const [key, id] of Object.entries(QUALITY_FIELDS)) $(id).addEventListener("change", (event) => applyQualitySettings({ ...state.qualitySettings, preset: "custom", [key]: event.target.value }));
  $("quality-reduced-motion").addEventListener("change", (event) => applyQualitySettings({ ...state.qualitySettings, preset: "custom", reducedMotion: event.target.checked }));
  $("how-button").addEventListener("click", () => $("manual-dialog").showModal()); $("manual-close").addEventListener("click", () => $("manual-dialog").close());
  $("manual-dialog").addEventListener("click", (event) => { if (event.target === $("manual-dialog")) $("manual-dialog").close(); });
  for (const id of ["guide-button", "lobby-guide", "upgrade-guide-button", "pause-guide-button"]) $(id).addEventListener("click", () => { renderGuide(); $("guide-dialog").showModal(); });
  $("guide-close").addEventListener("click", () => $("guide-dialog").close());
  $("guide-dialog").addEventListener("click", (event) => { if (event.target === $("guide-dialog")) $("guide-dialog").close(); });
  $("report-button").addEventListener("click", openReport); $("report-close").addEventListener("click", () => $("report-dialog").close());
  $("report-dialog").addEventListener("click", (event) => { if (event.target === $("report-dialog")) $("report-dialog").close(); });
  $("report-dialog").addEventListener("close", handleReportClosed);
  $("report-form").addEventListener("submit", submitReport); $("report-copy").addEventListener("click", copyDiagnostics);
  window.addEventListener("lastlight:inspect", (event) => showInspectPanel(event.detail || {}));
  window.addEventListener("lastlight:inspect-clear", hideInspectPanel);
  window.addEventListener("error", (event) => captureClientError("error", event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => captureClientError("unhandled promise", event.reason));
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    if (isTyping || document.querySelector("dialog[open]") || state.screen !== "game") return;
    const key = event.key.toLowerCase();
    if (key === "shift") { state.inspectActive = true; inspectCanvasAt(state.inspectPointer ? { ...state.inspectPointer, shiftKey: true } : null); return; }
    const upgradeChoice = ["1", "2", "3"].includes(key) && !$("upgrade-overlay").classList.contains("hidden");
    if (upgradeChoice) {
      event.preventDefault();
      if (!event.repeat) $("upgrade-cards").querySelectorAll("button")[Number(key) - 1]?.click();
      return;
    }
    const reportKey = event.code === "Backquote" || key === "`" || key === "~";
    if (reportKey) {
      event.preventDefault();
      if (!event.repeat) openReport();
      return;
    }
    if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e","r","c","escape"].includes(key)) event.preventDefault();
    if (key === "e" && !event.repeat) cast("e"); else if (key === "r" && !event.repeat) cast("r");
    else if (key === "c" && !event.repeat) { state.input.autoAim = !state.input.autoAim; toast(state.input.autoAim ? "Auto-aim on" : "Manual aim on"); }
    else if (key === "escape" && !event.repeat && state.screen === "game") togglePause();
    state.input.keys.add(key);
  });
  window.addEventListener("keyup", (event) => { const key = event.key.toLowerCase(); state.input.keys.delete(key); if (key === "shift") { state.inspectActive = false; hideInspectPanel(); } });
  window.addEventListener("blur", () => { state.input.keys.clear(); state.inspectActive = false; hideInspectPanel(); });
  $("game-canvas").addEventListener("pointermove", (event) => {
    const rect = $("game-canvas").getBoundingClientRect();
    state.input.aim = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
    state.inspectPointer = { clientX: event.clientX, clientY: event.clientY };
    state.inspectActive = event.shiftKey;
    inspectCanvasAt({ ...state.inspectPointer, shiftKey: event.shiftKey });
  });
  $("game-canvas").addEventListener("pointerleave", () => { state.inspectPointer = null; state.inspectActive = false; hideInspectPanel(); });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  setupTouch();
}

renderSpecialistGrid(); selectSpecialist("zuri"); bindEvents(); applyQualitySettings(state.qualitySettings, false); updateProgressionUI(); setPartyMode("solo");
if (query.get("room")) { setPartyMode("join"); $("room-input").value = query.get("room").toUpperCase().slice(0,6); setTimeout(() => $("callsign-input").focus(), 50); }
