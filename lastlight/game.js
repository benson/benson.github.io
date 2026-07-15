import { SPECIALISTS, SPECIALIST_ORDER, PASSIVES, WEAPONS, MAPS, DIFFICULTIES, ENEMY_TYPES, WAVE_NAMES, BOONS, AUGMENTS, BASE_VITALITY, formatTime, clamp } from "./data.js?v=20260715.2";
import { Simulation, WORLD, moveEntityWithCover, playerMovementSpeed } from "./engine.js?v=20260715.2";
import { Renderer } from "./render.js?v=20260715.2";
import { FixedStepClock, MovementPredictor } from "./feel.js?v=20260713.2";
import { MAP_ORDER, DIFFICULTY_ORDER, MAP_REQUIREMENTS, completeRun, emptyProgress, hasCompleted, isDifficultyUnlocked, isMapUnlocked, normalizeProgress } from "./progression.js?v=20260711.5";
import { getThemeAsset, getThemeEnvironmentChunks, getThemeMaterial } from "./themes/lastlight.js?v=20260715.2";
import { submitRunTelemetry } from "./telemetry.js?v=20260715.2";
import { bossHealthSegments, playerHealthSegments } from "./health-bars.js?v=20260711.5";
import { getCurrentStatExplanation, getPassiveAffectedSources } from "./combat-metadata.js?v=20260715.2";
import { BALANCE_HASH, BALANCE_VERSION, getBalanceConfig } from "./balance-config.js?v=20260715.2";
import { RNG_ALGORITHM, createRandomSeed } from "./rng.js?v=20260711.5";
import { ReplayRecorder, dequantizeReplayInput, hashSimulationState, quantizeReplayInput, validateReplay } from "./replay.js?v=20260715.2";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract, loadRuntimeConfig, runtimeConfigEndpoint } from "./feature-config.js?v=20260715.2";
import { QUALITY_STORAGE_KEY, loadQualitySettings, saveQualitySettings, settingsForPreset } from "./quality-settings.js?v=20260711.5";
import {
  ACCESSIBILITY_ACTIONS, GAMEPAD_ACTIONS, bindingLabel, defaultAccessibilitySettings,
  keyboardActionForEvent, loadAccessibilitySettings, readStandardGamepad, saveAccessibilitySettings,
} from "./accessibility-settings.js?v=20260715.2";
import { RECOVERY_SIMULATION_VERSION, clearRunRecovery, createRunRecovery, loadRunRecovery, runtimeRecoveryIdentity, saveRunRecovery } from "./recovery.js?v=20260715.2";
import { GuestInputSequenceTracker, HostInputSequenceGate, createDraftActionMessage, createSnapshotMessage, sanitizeDraftActionMessage, sanitizeSnapshotMessage } from "./protocol.js?v=20260713.2";
import { createActivatedNetworkLab, resolveNetworkLabActivation } from "./network-lab.js?v=20260713.2";
import { getWeaponImpactGrammar, impactSummary, resolveEntityImpact } from "./impact-grammar.js?v=20260715.2";
import { advancePlayerMovement } from "./movement.js?v=20260715.2";
import { MATERIAL_CLASSES } from "./material-impacts.js?v=20260711.8";
import { DynamicAudioMixer } from "./audio-mix.js?v=20260713.1";
import { LASTLIGHT_AUDIO_CUES, audioCueEnvelopeDuration, resolveAudioCue } from "./audio-cues.js?v=20260713.1";
import { enemyAudioCueName, newEntities, spatialAudioPan, weaponAudioCueName, weaponTimerActivations } from "./audio-events.js?v=20260713.1";
import { FUNNY_VOICE_MIN_INTERVAL_MS, audioOutputState, audioPercent, loadAudioSettings, saveAudioSettings, settleAudioResume } from "./audio-settings.js?v=20260713.1";
import { playFeedbackHaptics } from "./feedback-haptics.js?v=20260715.2";
import { buildUpgradeComparison, forecastDraftChoice, playerBuildStats, signatureEvolutionTelemetry, weaponTelemetry } from "./upgrade-preview.js?v=20260715.2";
import { passiveBuildcraft, sourceBuildcraft } from "./synergy-tags.js?v=20260715.2";
import { getWeaponEvolution } from "./weapon-evolution.js?v=20260713.1";
import { isReportShortcut, shouldOpenReportShortcut } from "./hotkeys.js?v=20260712.1";
import { VerifiedReplayTimeline } from "./replay-timeline.js?v=20260715.2";
import { createGameReplayAdapters } from "./replay-game-adapters.js?v=20260715.2";
import { SPECIALIST_IDENTITY_VERSION, getSpecialistIdentity } from "./specialist-identity.js?v=20260715.2";
import { reconcileActiveBuffs } from "./active-buffs.js?v=20260713.1";
import { ELITE_AFFIXES, ENEMY_ARCHETYPES, eliteAffixEligibility } from "./enemy-archetypes.js?v=20260713.1";
import { APEX_CONTRACTS } from "./apex-encounters.js?v=20260713.1";
import { mapMechanicDefinition } from "./map-mechanics.js?v=20260715.2";
import { CAMPAIGN_MUTATIONS, campaignMutationDefinition } from "./campaign-mutations.js?v=20260715.2";
import {
  AuthoritySnapshotGate, HOST_MIGRATION_PROTOCOL_VERSION, MIGRATION_CHECKPOINT_INTERVAL_TICKS,
  createMigrationCapabilities, createMigrationCheckpoint, createMigrationReady,
  migrationCompatibilityMatches, validateMigrationCheckpoint,
} from "./host-migration.js?v=20260715.2";
import { RECONNECT_DELAYS_MS, SquadPresenceTracker, authorityStateCopy } from "./reconnect-state.js?v=20260713.3";
import {
  HostPingGate, PING_INTENTS, PING_LIFETIME_TICKS, PING_WHEEL_ORDER, PingSequenceTracker,
  pingIntentFromDelta, sanitizePingBroadcast, sanitizePingRequest,
} from "./ping-contract.js?v=20260713.4";
import { resolveContextualPing } from "./ping-context.js?v=20260713.4";
import {
  DRAFT_RECOMMENDATION_PROTOCOL_VERSION, DraftRecommendationSequenceTracker, HostDraftRecommendationGate,
  createDraftRecommendationSync, sanitizeDraftRecommendationRequest,
  sanitizeDraftRecommendationState, sanitizeDraftRecommendationSync,
} from "./draft-recommendation-contract.js?v=20260713.5";
import { DraftRecommendationStore, recommendationMarkerModel } from "./draft-recommendations.js?v=20260713.5";
import { SQUAD_SYNERGY_REGISTRY } from "./squad-synergies.js?v=20260713.6";
import { reconcileActiveSynergies } from "./active-synergies.js?v=20260713.6";
import { PARTICIPATION_REGISTRY } from "./participation-credit.js?v=20260713.7";
import { campaignJoinEligibility } from "./join-in-progress.js?v=20260715.2";
import {
  RUN_ARCHIVE_STORAGE_KEY, createSquadRunReport, decodeSquadRunFragment, normalizeRunArchiveStorage,
  squadRunShareFragment, upsertRunArchive,
} from "./run-archive.js?v=20260715.2";
import {
  SPECIALIST_MASTERY, SPECIALIST_MASTERY_LEVELS, awardSpecialistMastery, loadSpecialistMasteryState,
  masteryStartDefinition, saveSpecialistMasteryState, selectMasteryStart,
} from "./specialist-mastery.js?v=20260715.2";
import {
  RARE_DISCOVERY_REGISTRY, awardRareDiscoveries, loadRareDiscoveryCollection,
  rareDiscoveryDefinition, rareDiscoveryTelemetry, saveRareDiscoveryCollection,
} from "./rare-discoveries.js?v=20260715.2";
import {
  CHALLENGE_ACHIEVEMENT_REGISTRY, awardChallengeAchievements, challengeAchievementDefinition,
  challengeAchievementTelemetry, evaluateChallengeAchievements, loadChallengeAchievementState,
  saveChallengeAchievementState,
} from "./challenge-achievements.js?v=20260715.2";
import {
  loadSeededOperationRecords, recordSeededOperationResult, saveSeededOperationRecords,
  seededOperationFor, seededOperationFromId, seededOperationTelemetry,
} from "./seeded-operations.js?v=20260715.2";
import {
  PRACTICE_MAX_PASSIVES, PRACTICE_MAX_WEAPONS, defaultPracticeLaboratoryConfig,
  measurePracticeLaboratory, normalizePracticeLaboratoryConfig,
} from "./practice-laboratory.js?v=20260715.2";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home-screen"), lobby: $("lobby-screen"), game: $("game-screen"), result: $("result-screen") };
const query = new URLSearchParams(location.search);
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const RELAY_BASE = query.get("relay") || (localHost ? "ws://localhost:8787/room/" : "wss://lastlight-relay.bensonperry.workers.dev/room/");
const RUNTIME_CONFIG_ENDPOINT = runtimeConfigEndpoint(RELAY_BASE);
const FEEDBACK_URL = "https://biblioplex-api.bensonperry.com/feedback";
const BUILD = "2026.07.15.2";
const AUTHORITY_WATCHDOG_MS = Object.freeze({ synchronizing: 10_000, migrating: 25_000 });
const BALANCE = getBalanceConfig();
const NETWORK_LAB_ACTIVATION = resolveNetworkLabActivation({ url: location.href });
const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
const initialQualitySettings = (() => {
  const settings = loadQualitySettings(localStorage, systemReducedMotion);
  try {
    const legacyHealthBars = localStorage.getItem("lastlight:enemy-health-bars:v1");
    if (!localStorage.getItem(QUALITY_STORAGE_KEY) && ["true", "false"].includes(legacyHealthBars)) {
      return saveQualitySettings({ ...settings, preset: "custom", healthBars: legacyHealthBars === "true" ? "all" : "off" });
    }
  } catch { /* Storage is optional. */ }
  return settings;
})();
const initialAudioSettings = loadAudioSettings(localStorage);
const initialAccessibilitySettings = loadAccessibilitySettings(localStorage, systemReducedMotion);
const initialMasteryState = loadSpecialistMasteryState(localStorage);
const initialRareDiscoveries = loadRareDiscoveryCollection(localStorage);
const initialChallengeAchievements = loadChallengeAchievementState(localStorage);
const initialSeededOperationRecords = loadSeededOperationRecords(localStorage);
const audioSupported = Boolean(window.AudioContext || window.webkitAudioContext);
const renderer = new Renderer($("game-canvas"));
renderer.setQualitySettings(initialQualitySettings);
const replayRenderer = new Renderer($("replay-canvas"));
replayRenderer.setQualitySettings(initialQualitySettings);
const fixedClock = new FixedStepClock();
const movementPredictor = new MovementPredictor();
const hostInputSequences = new HostInputSequenceGate();
const guestInputSequences = new GuestInputSequenceTracker();
const authoritySnapshotGate = new AuthoritySnapshotGate();
const pingSequences = new PingSequenceTracker();
const hostPingGate = new HostPingGate();
const draftRecommendationSequences = new DraftRecommendationSequenceTracker();
const hostDraftRecommendationGate = new HostDraftRecommendationGate();
const PROGRESS_KEY = "lastlight:campaign:v1";
const LEGACY_RUN_HISTORY_KEYS = Object.freeze(["lastlight:runs:v6", "lastlight:runs:v5", "lastlight:runs:v4", "lastlight:runs:v3", "lastlight:runs:v2", "lastlight:runs:v1"]);
const CLIENT_TOKEN_KEY = "lastlight:session-token:v1";
const DAMAGE_LEDGER_LAYOUT_KEY = "lastlight:damage-ledger-layout:v1";
const LAST_REPLAY_KEY = "lastlight:last-replay:v1";
const DAMAGE_LEDGER_DEFAULT = Object.freeze({ x: 22, y: 232, width: 250, height: 150, collapsed: true, userSized: false });
const emptySoundState = () => ({
  projectileIds: new Set(), effectIds: new Set(), hostileIds: new Set(), attackingIds: new Set(), weaponTimers: new Map(),
  kills: 0, level: 1, damageTaken: 0, xpCollected: 0,
  lastShot: 0, lastEnemy: 0, lastKill: 0, lastMaterial: 0, lastXP: 0,
});
const DIFFICULTY_COPY = { story: "Story · Sharp hits · Lighter opening", hard: "Hard · 2.5× health · 1.8× damage", extreme: "Extreme · 4.5× health · 2.4× damage" };

function loadProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null")); }
  catch { return emptyProgress(); }
}

function loadRunHistory() {
  try {
    const current = JSON.parse(localStorage.getItem(RUN_ARCHIVE_STORAGE_KEY) || "null");
    if (current !== null) return normalizeRunArchiveStorage(current);
    for (const key of LEGACY_RUN_HISTORY_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(key) || "null");
      if (legacy !== null) return normalizeRunArchiveStorage(legacy);
    }
    return [];
  } catch { return []; }
}

const initialSharedRun = (() => {
  try { return { value: decodeSquadRunFragment(location.hash), error: "" }; }
  catch (error) { return { value: null, error: String(error?.message || "Shared report link is invalid") }; }
})();

function loadClientToken() {
  try {
    const stored = sessionStorage.getItem(CLIENT_TOKEN_KEY) || "";
    if (/^[a-f0-9]{24,32}$/.test(stored)) return stored;
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    sessionStorage.setItem(CLIENT_TOKEN_KEY, token); return token;
  } catch { return crypto.randomUUID().replace(/-/g, "").slice(0, 24); }
}

function loadDamageLedgerLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAMAGE_LEDGER_LAYOUT_KEY) || "null");
    if (!saved || typeof saved !== "object") return { ...DAMAGE_LEDGER_DEFAULT };
    return { ...DAMAGE_LEDGER_DEFAULT, ...saved, y: Number(saved.y) === 112 ? DAMAGE_LEDGER_DEFAULT.y : saved.y, userSized: typeof saved.userSized === "boolean" ? saved.userSized : Number(saved.height) !== DAMAGE_LEDGER_DEFAULT.height };
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
  input: { keys: new Set(), aim: 0, autoAim: true, touchX: 0, touchY: 0, gamepadX: 0, gamepadY: 0, gamepadButtons: new Set() },
  animation: 0, lastFrame: 0, lastSend: 0, lastBroadcast: 0, lastLobbyBroadcast: 0,
  lastUpgradeKey: "", lastWeaponHUDKey: "", lastPassiveHUDKey: "", lastSquadHUDKey: "", lastBossHUDKey: "", lastEventSeq: 0, endShown: false, resultTimer: null,
  progress: loadProgress(), runHistory: loadRunHistory(), resultGame: null, resultReport: null, resultSavedKey: "",
  mastery: initialMasteryState, resultMasteryAward: null,
  rareDiscoveries: initialRareDiscoveries, resultDiscoveryAward: null,
  challengeAchievements: initialChallengeAchievements, resultChallengeAward: null,
  seededOperationRecords: initialSeededOperationRecords, seededOperationKind: "", resultSeededOperation: null,
  practiceLaboratory: structuredClone(defaultPracticeLaboratoryConfig()),
  lastChallengeWatchTick: -60, lastChallengeWatchKey: "",
  sharedRun: initialSharedRun.value, sharedRunError: initialSharedRun.error, sharedRunPresented: false,
  audioSettings: initialAudioSettings,
  audioAvailable: audioSupported,
  audioStatus: audioOutputState({ supported: audioSupported, enabled: initialAudioSettings.enabled }),
  audioContext: null, audioMixer: null, audioUnlockInFlight: null, audioUnlockAttempts: 0, audioUnlockReason: "startup", audioLastError: "", activeAudioNodes: 0, peakAudioNodes: 0, toastTimer: null, lastVoiceAt: 0,
  soundState: emptySoundState(),
  recentErrors: [], reportSubmitting: false, resumeAfterReport: false, reportImageDataUrl: "", reportImageMimeType: "", reportImageName: "", telemetrySent: false,
  qualitySettings: initialQualitySettings, accessibilitySettings: initialAccessibilitySettings, accessibilityCapture: "", showEnemyHealthBars: initialQualitySettings.healthBars !== "off", inspectPointer: null, inspectActive: false,
  performanceMetrics: null, lastDamageLedgerKey: "",
  damageLedgerLayout: loadDamageLedgerLayout(), damageLedgerResizeObserver: null,
  bannerTimer: null, bannerExitTimer: null,
  resumeToken: loadClientToken(),
  hostPreviousMotion: null, inputMotionStartedAt: 0, inputMotionStart: null, inputWasActive: false,
  replayRecorder: null, lastReplayCheckpointTick: -1, lastReplay: loadLastReplay(), resultReplay: null,
  replayViewer: null,
  draftForecastKey: "", draftForecastKeys: new Map(), draftForecastCache: new Map(),
  draftBanishMode: false, draftSkipArmed: false, replacementChoiceId: "", replacementForecasts: new Map(),
  activeUpgradeGame: null,
  runtimeConfig: { config: DEFAULT_RUNTIME_CONFIG, source: "built-in", status: "initializing" },
  recoveryOffer: null, lastRecoverySaveAt: 0,
  networkLab: null,
  authorityEpoch: 0, authorityHostId: "", authorityState: "active", authoritySnapshotSeq: 0,
  migrationLastCheckpointTick: -1, migrationCheckpointBytes: 0, migrationOffer: null,
  migrationFailureReason: "", migrationStartedAt: 0,
  reconnectTimer: null, reconnectAttempts: 0, authorityRestoreTimer: null, authorityWatchdogTimer: null, authorityPreviousFocus: null,
  squadPresence: new SquadPresenceTracker(), lastPresenceAnnouncement: "",
  pings: new Map(), pingWheel: null, pingPointerId: null,
  pingStats: { sent: 0, received: 0, rejected: 0, byIntent: Object.fromEntries(PING_WHEEL_ORDER.map((intent) => [intent, 0])) },
  draftRecommendations: new DraftRecommendationStore(),
  draftRecommendationStats: { sent: 0, received: 0, rejected: 0 },
  runAdmission: null, joinPackageId: "signature", joiningActiveRun: false, joinRequestSent: false, pendingRunAdmissions: [],
};

const runtimeConfigReady = loadRuntimeConfig({ endpoint: RUNTIME_CONFIG_ENDPOINT }).then((result) => {
  state.runtimeConfig = result;
  syncPingAvailability();
  syncDraftRecommendationAvailability();
  syncArchiveAvailability();
  syncPracticeLaboratoryAvailability();
  syncAccessibilityAvailability();
  renderSeededOperations();
  renderMasteryLoadout(state.selected);
  refreshRecoveryOffer();
  return result;
});

function migrationCompatibility() {
  return {
    build: BUILD, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH,
    configVersion: state.runtimeConfig.config.configVersion,
    gameplayVersion: state.runtimeConfig.config.gameplayVersion,
    objectiveEvents: state.runtimeConfig.config.flags.objectiveEvents,
    squadSynergies: state.runtimeConfig.config.flags.squadSynergies,
    sharedParticipationCredit: state.runtimeConfig.config.flags.sharedParticipationCredit,
    downedActivity: state.runtimeConfig.config.flags.downedActivity,
    joinInProgressNormalization: state.runtimeConfig.config.flags.joinInProgressNormalization,
    squadEnemyDirector: state.runtimeConfig.config.flags.squadEnemyDirector,
    mapMechanics: state.runtimeConfig.config.flags.mapMechanics,
    campaignMutations: state.runtimeConfig.config.flags.campaignMutations,
    specialistMastery: state.runtimeConfig.config.flags.specialistMastery,
    rareDiscoveries: state.runtimeConfig.config.flags.rareDiscoveries,
    registryVersion: state.runtimeConfig.config.registryVersion,
    recoveryVersion: RECOVERY_SIMULATION_VERSION,
  };
}

function migrationCapabilities() { return createMigrationCapabilities(migrationCompatibility()); }

function clearGameplayControls() {
  state.input.keys.clear(); state.input.touchX = 0; state.input.touchY = 0;
  state.inspectActive = false; hideInspectPanel(); movementPredictor.reset();
}

function canRestoreAuthorityFocus(node) {
  return node instanceof HTMLElement && node !== document.body && node.isConnected && !node.inert && !node.closest(".hidden,[inert]");
}

function trapAuthorityFocus(event) {
  if (event.key !== "Tab" || $("network-state-overlay").classList.contains("hidden")) return;
  const card = $("network-state-overlay").querySelector(".network-state-card");
  const focusable = [...$("network-state-overlay").querySelectorAll("button:not(.hidden):not(:disabled)")];
  if (!focusable.length) { event.preventDefault(); card.focus(); return; }
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function setAuthorityState(next, detail = {}) {
  const previous = state.authorityState;
  clearTimeout(state.authorityWatchdogTimer); state.authorityWatchdogTimer = null;
  const watchdogMs = AUTHORITY_WATCHDOG_MS[next];
  if (watchdogMs) state.authorityWatchdogTimer = setTimeout(() => {
    state.authorityWatchdogTimer = null;
    if (state.authorityState === next) setAuthorityState("unavailable", { reason: "timeout" });
  }, watchdogMs);
  if (!["active", "restored"].includes(next)) { clearTimeout(state.authorityRestoreTimer); state.authorityRestoreTimer = null; }
  state.authorityState = next;
  if (next !== "active") clearGameplayControls();
  if (next !== "active") closePingWheel({ restoreFocus: false });
  if (["migrating", "reconnecting", "synchronizing"].includes(next)) state.migrationStartedAt ||= performance.now();
  if (next === "active") { state.migrationStartedAt = 0; state.migrationFailureReason = ""; }
  if (next === "unavailable") state.migrationFailureReason = String(detail.reason || "unavailable");
  const overlay = $("network-state-overlay");
  if (!overlay) return;
  const visible = next !== "active";
  if (visible && !state.authorityPreviousFocus) state.authorityPreviousFocus = document.activeElement;
  overlay.classList.toggle("hidden", !visible);
  for (const [name, screen] of Object.entries(screens)) {
    const blocked = visible && name === state.screen;
    screen.inert = blocked;
    if (name === "game" || name === "result") screen.setAttribute("aria-busy", blocked ? "true" : "false");
  }
  $("game-canvas").setAttribute("aria-disabled", visible && state.screen === "game" ? "true" : "false");
  for (const id of ["report-button", "build-history-button"]) $(id).inert = visible;
  const presentation = authorityStateCopy(next, detail);
  $("network-state-mark").textContent = presentation.mark;
  $("network-state-title").textContent = presentation.title;
  $("network-state-copy").textContent = presentation.copy;
  $("network-state-progress").textContent = presentation.progress;
  const canRetry = next === "reconnecting" || next === "unavailable" && ["reconnect-exhausted", "timeout"].includes(detail.reason);
  $("network-state-retry").classList.toggle("hidden", !canRetry);
  $("network-state-retry").disabled = state.connecting;
  $("network-state-return").querySelector("span").textContent = presentation.terminal ? "Return home" : "Leave run";
  if (next !== previous && ["reconnecting", "migrating", "unavailable"].includes(next)) $("network-state-announcement").textContent = `${presentation.title}. ${presentation.copy}`;
  overlay.dataset.state = next;
  if (presentation.terminal) requestAnimationFrame(() => $("network-state-return").focus());
  else if (visible && next !== previous) requestAnimationFrame(() => overlay.querySelector(".network-state-card").focus());
  if (!visible) {
    const focus = state.authorityPreviousFocus; state.authorityPreviousFocus = null;
    if (detail.restoreFocus !== false) requestAnimationFrame(() => (canRestoreAuthorityFocus(focus) ? focus : $("game-canvas")).focus?.());
  }
}

function finishAuthorityRestoration(onActive = null) {
  clearTimeout(state.authorityRestoreTimer);
  setAuthorityState("restored");
  state.authorityRestoreTimer = setTimeout(() => {
    state.authorityRestoreTimer = null;
    if (state.authorityState === "restored") { setAuthorityState("active"); onActive?.(); }
  }, 900);
}

function presenceTick(game = state.sim || state.snapshot) {
  return Math.max(0, Number.isSafeInteger(game?.tick) ? game.tick : 0);
}

function presenceTransitionCopy(entry, tick = presenceTick()) {
  const spec = SPECIALISTS[entry.specialist]?.name || "Specialist";
  if (entry.status === "reconnecting") {
    const seconds = Math.max(0, Math.ceil((entry.deadlineTick - tick) / 60));
    return { visible: `RECONNECTING · ${formatTime(seconds)}`, icon: "↻", announcement: `${entry.name}, ${spec}, disconnected. Seat reserved for ${Math.ceil(seconds / 60)} minutes.` };
  }
  if (entry.status === "restored") return { visible: "RESTORED", icon: "✓", announcement: `${entry.name}, ${spec}, restored with their run state.` };
  if (entry.status === "departed") return { visible: "DEPARTED", icon: "×", announcement: `${entry.name}, ${spec}, departed. Their reserved seat expired.` };
  return { visible: "", icon: "", announcement: "" };
}

function announcePresence(entry, tick = presenceTick()) {
  if (!entry || entry.status === "connected") return;
  const key = `${entry.replaySlot}:${entry.status}:${entry.statusSinceTick}`;
  if (key === state.lastPresenceAnnouncement) return;
  state.lastPresenceAnnouncement = key;
  $("squad-connection-status").textContent = presenceTransitionCopy(entry, tick).announcement;
}

function observeSquadPresence(game) {
  if (!game?.players) return state.squadPresence.view();
  const tick = presenceTick(game), activeSlots = new Set(game.players.map(({ replaySlot }) => replaySlot));
  for (const entry of state.squadPresence.view()) {
    if (["connected", "restored"].includes(entry.status) && !activeSlots.has(entry.replaySlot)) announcePresence(state.squadPresence.disconnect(entry, tick), tick);
  }
  for (const entry of state.squadPresence.observe(game.players, tick)) announcePresence(entry, tick);
  return state.squadPresence.view();
}

function migrationRoster(simulation = state.sim) {
  return (simulation?.players || []).map(({ id, replaySlot }) => ({ id, replaySlot })).sort((left, right) => left.replaySlot - right.replaySlot);
}

function publishMigrationCheckpoint(force = false) {
  const flags = state.runtimeConfig.config.flags;
  if (!flags.migrationCheckpointReplication || state.partyMode === "solo" || !state.isHost || state.authorityState !== "active"
    || !state.sim || state.sim.players.length < 2 || state.ws?.readyState !== WebSocket.OPEN || !["running", "boss", "won", "lost"].includes(state.sim.stage)) return false;
  if (!force && state.sim.tick - state.migrationLastCheckpointTick < MIGRATION_CHECKPOINT_INTERVAL_TICKS) return false;
  try {
    const checkpoint = createMigrationCheckpoint({
      epoch: state.authorityEpoch, tick: state.sim.tick, hash: hashSimulationState(state.sim),
      ack: hostInputSequences.acknowledgements(), compatibility: migrationCompatibility(), roster: migrationRoster(),
      simulation: state.sim.exportRecoveryState(), replay: state.replayRecorder?.exportDraft(state.sim.tick) || null,
    });
    state.migrationLastCheckpointTick = checkpoint.tick;
    state.migrationCheckpointBytes = new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength;
    send(checkpoint);
    return true;
  } catch (error) {
    captureClientError("host migration checkpoint", error);
    return false;
  }
}

function stageMigrationOffer(message) {
  const offeredEpoch = Number(message?.authorityEpoch);
  if (!state.runtimeConfig.config.flags.hostMigrationResume || (offeredEpoch !== state.authorityEpoch && offeredEpoch !== state.authorityEpoch + 1)) return false;
  try {
    const checkpoint = validateMigrationCheckpoint(message.checkpoint);
    if (!migrationCompatibilityMatches(checkpoint.compatibility, migrationCompatibility())) throw new TypeError("Migration checkpoint build contract mismatch");
    const playerIdsBySlot = Object.fromEntries(checkpoint.roster.map(({ id, replaySlot }) => [replaySlot, id]));
    if (!checkpoint.roster.some(({ id }) => id === state.clientId)) throw new TypeError("Local player is absent from migration checkpoint");
    const sim = Simulation.fromRecoveryState(checkpoint.simulation, { playerIdsBySlot });
    for (const player of sim.players) {
      const lobbyPlayer = state.lobby.get(player.id) || [...state.lobby.values()].find(({ replaySlot }) => replaySlot === player.replaySlot);
      if (lobbyPlayer?.name) player.name = lobbyPlayer.name;
      player.reconnectKey = `migration-slot-${player.replaySlot}`;
    }
    if (hashSimulationState(sim) !== checkpoint.hash) throw new TypeError("Migration checkpoint hash mismatch");
    const replayRecorder = checkpoint.replay ? ReplayRecorder.fromDraft(checkpoint.replay, sim.players) : null;
    state.migrationOffer = { checkpoint, sim, replayRecorder, oldHostId: message.oldHostId, epoch: offeredEpoch };
    setAuthorityState("migrating", { tick: checkpoint.tick });
    send(createMigrationReady({ epoch: offeredEpoch, checkpointId: checkpoint.checkpointId, tick: checkpoint.tick, hash: checkpoint.hash }));
    return true;
  } catch (error) {
    captureClientError("host migration restore", error);
    state.migrationOffer = null;
    return false;
  }
}

function commitMigratedAuthority(message) {
  clearTimeout(state.resultTimer); state.resultTimer = null; state.endShown = false;
  state.authorityEpoch = message.authorityEpoch;
  pingSequences.reset(state.authorityEpoch); hostPingGate.reset(state.authorityEpoch); clearPings();
  draftRecommendationSequences.reset(state.authorityEpoch); hostDraftRecommendationGate.reset(state.authorityEpoch); state.draftRecommendations.rebase(state.authorityEpoch);
  state.authorityHostId = message.id;
  authoritySnapshotGate.commit({ epoch: state.authorityEpoch, hostId: state.authorityHostId });
  guestInputSequences.setEpoch(state.authorityEpoch);
  if (message.id !== state.clientId) {
    state.isHost = false; state.migrationOffer = null; clearGameplayControls();
    setAuthorityState("synchronizing"); return;
  }
  const offer = state.migrationOffer;
  if (!offer || offer.epoch !== state.authorityEpoch || offer.checkpoint.checkpointId !== message.checkpointId) {
    setAuthorityState("unavailable", { reason: "missing-candidate-state" }); return;
  }
  state.isHost = true; state.sim = offer.sim; state.replayRecorder = offer.replayRecorder;
  hostInputSequences.restore(offer.checkpoint.ack, state.authorityEpoch);
  state.authoritySnapshotSeq = 0;
  const departed = state.sim.players.find(({ id }) => id === message.oldHostId);
  if (departed) {
    departed.reconnectKey = `migration-slot-${departed.replaySlot}`;
    state.replayRecorder?.recordLeave(message.oldHostId, state.sim.tick);
    state.sim.removePlayer(message.oldHostId);
  }
  state.previousSnapshot = null; state.snapshot = null; state.migrationOffer = null;
  fixedClock.reset(); clearGameplayControls();
  if (state.screen === "result" && ["running", "boss"].includes(state.sim.stage)) setScreen("game");
  else if (state.screen === "result") {
    for (const peer of state.lobby.values()) if (peer.id !== state.clientId) sendRunSync(peer.id);
  }
  pruneDraftRecommendations(state.sim);
  finishAuthorityRestoration(() => { publishMigrationCheckpoint(true); sendDraftRecommendationSync(); });
}

function replayRunConfig() {
  return { map: state.config.map, difficulty: state.config.difficulty, duration: Number(state.config.duration), ...(state.config.seededOperation ? { seededOperation: state.config.seededOperation } : {}) };
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
    squadSynergies: state.runtimeConfig.config.flags.squadSynergies,
    sharedParticipationCredit: state.runtimeConfig.config.flags.sharedParticipationCredit,
    downedActivity: state.runtimeConfig.config.flags.downedActivity,
    joinInProgressNormalization: state.runtimeConfig.config.flags.joinInProgressNormalization,
    squadEnemyDirector: state.runtimeConfig.config.flags.squadEnemyDirector,
    mapMechanics: state.runtimeConfig.config.flags.mapMechanics,
    campaignMutations: state.runtimeConfig.config.flags.campaignMutations,
    specialistMastery: state.runtimeConfig.config.flags.specialistMastery,
    rareDiscoveries: state.runtimeConfig.config.flags.rareDiscoveries,
    registryVersion: state.runtimeConfig.config.registryVersion,
    rng: RNG_ALGORITHM, seed, run: replayRunConfig(),
  });
  for (const player of players) state.replayRecorder.registerPlayer(player.id, player.specialist, { slot: player.replaySlot, masteryStart: player.masteryStart, initial: true });
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
  const recorder = state.replayRecorder;
  state.replayRecorder = null;
  try {
    const replay = recorder.finalize(state.sim.tick, hashSimulationState(state.sim));
    state.lastReplay = replay;
    state.resultReplay = replay;
    try { sessionStorage.setItem(LAST_REPLAY_KEY, JSON.stringify(replay)); } catch { /* Replay export remains available in memory. */ }
    return replay;
  } catch (error) {
    state.resultReplay = null;
    captureClientError("replay finalize", error);
    console.warn("Replay capture could not be finalized", error);
    return null;
  }
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
      ...(checkpoint.simulation.header.seededOperation ? { seededOperation: checkpoint.simulation.header.seededOperation } : {}),
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
  state.replayRecorder?.recordInput(playerId, state.sim.tick, normalized, { coalesceSameTick: state.sim.paused });
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
  hostInputSequences.reset({ epoch: state.authorityEpoch });
  guestInputSequences.reset({ epoch: state.authorityEpoch });
  authoritySnapshotGate.reset({ epoch: state.authorityEpoch, hostId: state.authorityHostId });
  pingSequences.reset(state.authorityEpoch);
  hostPingGate.reset(state.authorityEpoch);
  draftRecommendationSequences.reset(state.authorityEpoch);
  hostDraftRecommendationGate.reset(state.authorityEpoch);
  state.draftRecommendations.rebase(state.authorityEpoch);
  clearPings();
}

function currentGameState() { return state.isHost ? state.sim : state.snapshot || state.sim; }

function localGamePlayer(game = currentGameState()) {
  return game?.players?.find((player) => player.id === state.clientId) || game?.players?.[0] || null;
}

function downedActivityEnabled(game = currentGameState()) {
  return Boolean(game?.downedActivity ?? game?.features?.downedActivity ?? state.runtimeConfig.config.flags.downedActivity);
}

/**
 * Presentation contract supplied by the authoritative snapshot when downedActivity is enabled:
 * downedSupportCooldown, downedSupportCooldownMax, downedSupportReady,
 * downedSupportLabel, downedCrawling, and reviveRequired. Every field remains null-safe
 * so an older host can render without granting a client-only action.
 */
function downedPresentation(player) {
  const cooldown = Math.max(0, Number(player?.downedSupportCooldown) || 0);
  const cooldownMax = Math.max(.01, Number(player?.downedSupportCooldownMax) || 3);
  return {
    cooldown, cooldownMax,
    ready: player?.downedSupportReady === true || (player?.downedSupportReady == null && cooldown <= .04),
    label: String(player?.downedSupportLabel || "Guard pulse"),
    crawling: Boolean(player?.downedCrawling),
    reviveRequired: Math.max(.01, Number(player?.reviveRequired) || 3),
  };
}
function pingKey({ epoch, replaySlot, seq }) { return `${epoch}:${replaySlot}:${seq}`; }

function clearPings() {
  state.pings.clear();
  renderer.setPings?.([]);
  closePingWheel({ restoreFocus: false });
}

function syncPingAvailability() {
  const enabled = Boolean(state.runtimeConfig.config.flags.contextualPings);
  document.documentElement.dataset.contextualPings = enabled ? "true" : "false";
  for (const node of document.querySelectorAll('[data-control-ping]')) node.hidden = !enabled;
  if ($('touch-ping')) $('touch-ping').hidden = !enabled;
  if (!enabled) closePingWheel({ restoreFocus: false });
}

function syncDraftRecommendationAvailability() {
  const enabled = Boolean(state.runtimeConfig.config.flags.upgradeRecommendations);
  document.documentElement.dataset.upgradeRecommendations = enabled ? "true" : "false";
  if (!enabled) {
    state.draftRecommendations.reset(state.authorityEpoch);
    state.lastUpgradeKey = "";
    if (state.activeUpgradeGame) updateUpgrade(state.activeUpgradeGame);
  }
}

function draftRecommendationGame() { return state.isHost ? state.sim : state.snapshot || state.sim; }

function draftRecommendationInputAvailable(game = draftRecommendationGame()) {
  return Boolean(state.runtimeConfig.config.flags.upgradeRecommendations && state.partyMode !== "solo"
    && state.authorityState === "active" && game?.pendingChoices);
}

function recommendationPlayerBySlot(game, replaySlot) {
  return game?.players?.find((player) => player.replaySlot === replaySlot) || null;
}

function draftRecommendationStateEntry(recommendation) {
  return {
    type: "draft_recommendation_state", protocolVersion: DRAFT_RECOMMENDATION_PROTOCOL_VERSION,
    epoch: recommendation.epoch, seq: recommendation.seq, recommenderSlot: recommendation.recommenderSlot,
    targetSlot: recommendation.targetSlot, round: recommendation.round, revision: recommendation.revision,
    optionIndex: recommendation.optionIndex, active: recommendation.active,
  };
}

function pruneDraftRecommendations(game = draftRecommendationGame(), { broadcast = false } = {}) {
  const changed = state.draftRecommendations.prune(game);
  if (changed && broadcast && state.isHost) sendDraftRecommendationSync();
  return changed;
}

function recommendationAnnouncement(entry, game, removed = !entry.active) {
  const source = recommendationPlayerBySlot(game, entry.recommenderSlot), target = recommendationPlayerBySlot(game, entry.targetSlot);
  const choice = target ? game?.pendingChoices?.[target.id]?.[entry.optionIndex] : null;
  return `${source?.name || `Specialist ${entry.recommenderSlot + 1}`} ${removed ? "removed their recommendation" : `recommends ${choice?.name || "an upgrade"}`} ${target?.name ? `for ${target.name}` : ""}.`.replace(/\s+\./, ".");
}

function applyDraftRecommendationState(message, { announce = true } = {}) {
  let parsed; try { parsed = sanitizeDraftRecommendationState(message, { transport: Boolean(message?._from) }); }
  catch { state.draftRecommendationStats.rejected++; return false; }
  if (parsed.epoch !== state.authorityEpoch) { state.draftRecommendationStats.rejected++; return false; }
  const game = draftRecommendationGame(), result = state.draftRecommendations.apply(parsed);
  if (!result.accepted) { state.draftRecommendationStats.rejected++; return false; }
  state.draftRecommendationStats.received++;
  renderDraftRecommendationMarkers(game);
  if (announce && $("draft-status")) $("draft-status").textContent = recommendationAnnouncement(parsed, game);
  return true;
}

function acceptHostDraftRecommendation(message) {
  if (!state.isHost || !draftRecommendationInputAvailable(state.sim) || state.sim?.pauseReason !== "upgrade") return false;
  let parsed; try { parsed = sanitizeDraftRecommendationRequest(message, { transport: true }); }
  catch { state.draftRecommendationStats.rejected++; return false; }
  const source = recommendationPlayerBySlot(state.sim, parsed.recommenderSlot), target = recommendationPlayerBySlot(state.sim, parsed.targetSlot);
  const choices = target ? state.sim.pendingChoices?.[target.id] : null, draft = target?.draft;
  if (!source || source.id !== parsed._from || !target || source === target || !Array.isArray(choices) || !choices[parsed.optionIndex]
    || !draft || state.sim.choiceReady?.[target.id]) { state.draftRecommendationStats.rejected++; return false; }
  const current = state.draftRecommendations.recommendationBy(parsed.recommenderSlot, parsed.targetSlot);
  if (!parsed.active && (!current || current.round !== parsed.round || current.revision !== parsed.revision || current.optionIndex !== parsed.optionIndex)) {
    state.draftRecommendationStats.rejected++; return false;
  }
  const verdict = hostDraftRecommendationGate.apply(parsed, { round: draft.round, revision: draft.revision });
  if (!verdict.accepted) { state.draftRecommendationStats.rejected++; return false; }
  if (!applyDraftRecommendationState(verdict.recommendation)) return false;
  send(verdict.recommendation); return true;
}

function requestDraftRecommendation(targetSlot, optionIndex) {
  const game = draftRecommendationGame();
  if (!draftRecommendationInputAvailable(game)) return false;
  const target = recommendationPlayerBySlot(game, Number(targetSlot)), localSlot = localReplaySlot(game);
  const draft = target?.draft, choices = target ? game.pendingChoices?.[target.id] : null;
  if (!target || localSlot === target.replaySlot || !draft || !choices?.[optionIndex] || game.choiceReady?.[target.id]) return false;
  const current = state.draftRecommendations.recommendationBy(localSlot, target.replaySlot);
  const active = !(current && current.round === draft.round && current.revision === draft.revision && current.optionIndex === optionIndex);
  const request = draftRecommendationSequences.create({ targetSlot: target.replaySlot, round: draft.round, revision: draft.revision, optionIndex, active });
  state.draftRecommendationStats.sent++;
  if (state.isHost) return acceptHostDraftRecommendation({ ...request, _from: state.clientId, recommenderSlot: localSlot });
  send(request); $("draft-status").textContent = active ? `Recommendation sent to ${target.name}.` : `Removing recommendation for ${target.name}.`;
  return true;
}

function sendDraftRecommendationSync(targetId = "") {
  if (!state.isHost || !state.runtimeConfig.config.flags.upgradeRecommendations || state.partyMode === "solo") return false;
  if (!targetId) {
    let sent = false;
    for (const peer of state.lobby.values()) if (peer.id !== state.clientId) sent = sendDraftRecommendationSync(peer.id) || sent;
    return sent;
  }
  pruneDraftRecommendations(state.sim);
  const sync = createDraftRecommendationSync({
    epoch: state.authorityEpoch,
    entries: state.draftRecommendations.entries().map(draftRecommendationStateEntry),
  });
  send(sync, targetId); return true;
}

function localReplaySlot(game = currentGameState()) {
  return game?.players?.find((player) => player.id === state.clientId)?.replaySlot
    ?? state.lobby.get(state.clientId)?.replaySlot ?? 0;
}

function pingInputAvailable() {
  if (!state.runtimeConfig.config.flags.contextualPings) return false;
  if (state.screen !== "game" || state.authorityState !== "active" || !currentGameState()) return false;
  if (document.querySelector("dialog[open]")) return false;
  if (!$('upgrade-overlay').classList.contains('hidden') || !$('pause-overlay').classList.contains('hidden')) return false;
  return !currentGameState()?.paused;
}

function pingTargetAt(clientX, clientY) {
  const game = currentGameState();
  const canvas = $('game-canvas'), rect = canvas.getBoundingClientRect();
  const fallback = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  const pointer = Number.isFinite(clientX) && Number.isFinite(clientY) ? { clientX, clientY } : fallback;
  const world = renderer.clientToWorld?.(pointer.clientX, pointer.clientY)
    || { x: 0, y: 0 };
  const inspected = renderer.inspectAt(pointer.clientX, pointer.clientY, game);
  const targetKind = ["enemy", "objective", "pickup", "cache", "ally"].includes(inspected?.type) ? inspected.type : "ground";
  return {
    x: clamp(inspected?.world?.x ?? world.x, -WORLD.width / 2 + 20, WORLD.width / 2 - 20),
    y: clamp(inspected?.world?.y ?? world.y, -WORLD.height / 2 + 20, WORLD.height / 2 - 20),
    targetKind,
  };
}

function resolveAuthoritativePing(request) {
  return resolveContextualPing(state.sim, request);
}

function acceptVisiblePing(message) {
  let ping; try { ping = sanitizePingBroadcast(message, { transport: Boolean(message?._from) }); } catch { state.pingStats.rejected++; return false; }
  if (ping.epoch !== state.authorityEpoch) { state.pingStats.rejected++; return false; }
  const key = pingKey(ping);
  if (state.pings.has(key)) return false;
  state.pings.set(key, { ...ping });
  while (state.pings.size > 24) state.pings.delete(state.pings.keys().next().value);
  state.pingStats.received++; state.pingStats.byIntent[ping.intent]++;
  const source = [...state.lobby.values()].find((player) => player.replaySlot === ping.replaySlot);
  const label = PING_INTENTS[ping.intent].label;
  $('ping-live-region').textContent = `${source?.name || `Specialist ${ping.replaySlot + 1}`} pinged ${label.toLowerCase()}.`;
  if (performance.now() - (state.pingAudioAt || 0) > 120) {
    state.pingAudioAt = performance.now();
    sfx(ping.intent === "danger" ? "danger" : ping.intent === "objective" ? "objective" : ping.intent === "pickup" ? "reward" : "ui");
  }
  return true;
}

function acceptHostPing(message) {
  if (!state.isHost || state.authorityState !== "active" || !state.sim) return false;
  let parsed; try { parsed = sanitizePingRequest(message, { transport: true }); } catch { state.pingStats.rejected++; return false; }
  const target = resolveAuthoritativePing(parsed);
  if (!target) { state.pingStats.rejected++; return false; }
  const verdict = hostPingGate.apply(parsed, state.sim.tick);
  if (!verdict.accepted) { state.pingStats.rejected++; return false; }
  const broadcast = sanitizePingBroadcast({ ...verdict.ping, ...target });
  acceptVisiblePing(broadcast);
  if (state.partyMode !== "solo" && state.ws?.readyState === WebSocket.OPEN) send(broadcast);
  return true;
}

function commitPing(intent, target = pingTargetAt()) {
  if (!pingInputAvailable() || !PING_INTENTS[intent]) return false;
  const game = currentGameState(), request = pingSequences.create({ tick: game.tick, intent, ...target });
  state.pingStats.sent++;
  if (state.partyMode === "solo") return acceptHostPing({ ...request, _from: state.clientId, replaySlot: localReplaySlot(game) });
  send(request);
  return true;
}

function setPingWheelSelection(intent) {
  if (!state.pingWheel || intent && !PING_INTENTS[intent]) return;
  state.pingWheel.intent = intent || null;
  $('ping-wheel').querySelectorAll('[data-ping-intent]').forEach((button) => {
    const selected = button.dataset.pingIntent === state.pingWheel.intent;
    button.classList.toggle('selected', selected); button.setAttribute('aria-checked', String(selected));
  });
  $('ping-wheel').dataset.intent = state.pingWheel.intent || "none";
}

function openPingWheel({ clientX, clientY, visualClientX, visualClientY, source = "keyboard", pointerId = null } = {}) {
  if (!pingInputAvailable()) return false;
  const canvas = $('game-canvas'), rect = canvas.getBoundingClientRect();
  const targetClientX = Number.isFinite(clientX) ? clientX : state.inspectPointer?.clientX ?? rect.left + rect.width / 2;
  const targetClientY = Number.isFinite(clientY) ? clientY : state.inspectPointer?.clientY ?? rect.top + rect.height / 2;
  const visualX = clamp(Number.isFinite(visualClientX) ? visualClientX : targetClientX, 112, innerWidth - 112);
  const visualY = clamp(Number.isFinite(visualClientY) ? visualClientY : targetClientY, 112, innerHeight - 112);
  state.pingWheel = { source, pointerId, clientX: targetClientX, clientY: targetClientY, visualX, visualY, intent: null };
  state.pingPointerId = pointerId;
  const wheel = $('ping-wheel'); wheel.classList.remove('hidden'); wheel.style.left = `${visualX}px`; wheel.style.top = `${visualY}px`;
  wheel.setAttribute('aria-hidden', 'false');
  setPingWheelSelection(state.pingWheel.intent);
  $('ping-live-region').textContent = "Ping wheel open. Choose danger, objective, pickup, help, regroup, or recommend.";
  return true;
}

function updatePingWheel(clientX, clientY) {
  if (!state.pingWheel) return;
  setPingWheelSelection(pingIntentFromDelta(clientX - state.pingWheel.visualX, clientY - state.pingWheel.visualY));
}

function closePingWheel({ commit = false, restoreFocus = true } = {}) {
  const wheelState = state.pingWheel;
  state.pingWheel = null; state.pingPointerId = null;
  const wheel = $('ping-wheel');
  if (wheel) { wheel.classList.add('hidden'); wheel.setAttribute('aria-hidden', 'true'); wheel.dataset.intent = "none"; }
  if (commit && wheelState?.intent) commitPing(wheelState.intent, pingTargetAt(wheelState.clientX, wheelState.clientY));
  if (restoreFocus && state.screen === "game" && state.authorityState === "active") $('game-canvas').focus({ preventScroll: true });
}

function prunePings() {
  const tick = currentGameState()?.tick;
  if (Number.isSafeInteger(tick)) for (const [key, ping] of state.pings) if (ping.tick > tick || tick - ping.tick >= PING_LIFETIME_TICKS) state.pings.delete(key);
  renderer.setPings?.([...state.pings.values()]);
}

function recordHostCast(playerId, slot) {
  if (!state.sim?.cast(playerId, slot)) return false;
  state.replayRecorder?.recordCast(playerId, state.sim.tick, slot);
  if (slot === "r") publishMigrationCheckpoint(true);
  return true;
}

function recordHostDraftAction(playerId, action) {
  const result = state.sim?.draftAction(playerId, action);
  if (!result?.accepted) return result || { accepted: false, reason: "no_simulation" };
  if (result.action === "pick") state.replayRecorder?.recordUpgrade(playerId, state.sim.tick, result.choiceId);
  else if (result.action === "replace") state.replayRecorder?.recordDraftReplacement(playerId, state.sim.tick, result.choiceId, result.replacementId);
  else if (result.action === "reroll") state.replayRecorder?.recordDraftReroll(playerId, state.sim.tick);
  else if (result.action === "banish") state.replayRecorder?.recordDraftBanish(playerId, state.sim.tick, result.choiceId);
  else if (result.action === "skip") state.replayRecorder?.recordDraftSkip(playerId, state.sim.tick);
  pruneDraftRecommendations(state.sim, { broadcast: true });
  publishMigrationCheckpoint(true);
  return result;
}

function recordHostChoice(playerId, choiceId) {
  return Boolean(recordHostDraftAction(playerId, { type: "pick", choiceId })?.accepted);
}

function setScreen(name) {
  closePingWheel({ restoreFocus: false });
  state.screen = name;
  for (const [key, screen] of Object.entries(screens)) screen.classList.toggle("hidden", key !== name);
  document.body.style.overflow = name === "game" ? "hidden" : "auto";
  if (name !== "game") { state.inspectActive = false; setTacticalIntel(false); hideInspectPanel(); }
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
  renderDeploymentMutations();
}

function mutationPackageMarkup(difficultyId, mapId, mutationState = null) {
  const definition = campaignMutationDefinition(difficultyId), mapPackage = CAMPAIGN_MUTATIONS.maps[mapId] || CAMPAIGN_MUTATIONS.maps.warehouse;
  const enabled = Boolean((state.runtimeConfig?.config?.flags?.campaignMutations ?? true) && difficultyId !== "story");
  const rules = [];
  if (!enabled) rules.push(difficultyId === "story" ? "No mutation encounters · readable baseline rules" : "Mutation rollback active · legacy threat scalars only");
  else {
    rules.push(`Objective retaliation · ${(definition.objectiveRetaliation.warningTicks / 60).toFixed(1)}s warning · ${(definition.objectiveRetaliation.cooldownTicks / 60).toFixed(1)}s cooldown · ${definition.objectiveRetaliation.rewardGold} gold`);
    rules.push(`Operation pressure · next map cycle advances ${(definition.mapPressureAdvanceTicks / 60).toFixed(1)}s per completed objective`);
    if (definition.surge.enabled) rules.push(`Elite surge · waves ${definition.surgeWaves.join(", ")} · ${(definition.surge.cooldownTicks / 60).toFixed(1)}s cooldown · ${definition.surge.rewardGold} gold + ${definition.surge.rewardCards} access card`);
  }
  const tick = Number(mutationState?.tick || 0);
  const live = mutationState?.pending
    ? `${mutationState.pending.kind} inbound · ${Math.max(0, Math.ceil((mutationState.pending.dueTick - tick) / 60))}s`
    : mutationState?.active ? `${mutationState.active.kind} active · clear every marked hostile` : "No mutation encounter active";
  return `<header><span>${escapeHTML(DIFFICULTIES[difficultyId].name)} package</span><strong>${escapeHTML(definition.name)}</strong></header><p>${escapeHTML(definition.summary)}</p><ul>${rules.map((rule) => `<li>${escapeHTML(rule)}</li>`).join("")}<li>${escapeHTML(MAPS[mapId].name)} approach · ${escapeHTML(mapPackage.approach.replaceAll("-", " "))}</li></ul>${mutationState ? `<small>${escapeHTML(live)}</small>` : ""}`;
}

function renderDeploymentMutations() {
  const target = $("deployment-mutations");
  if (target) target.innerHTML = mutationPackageMarkup($("difficulty-select").value, $("map-select").value);
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

function seededOperationRecord(id) {
  return state.seededOperationRecords.records.find((record) => record.id === id) || null;
}

function renderSeededOperations(now = new Date()) {
  const section = $("seeded-operations"), enabled = Boolean(state.runtimeConfig?.config?.flags?.seededOperations);
  if (!section) return;
  section.classList.toggle("hidden", !enabled || state.partyMode === "join");
  if (!enabled || state.partyMode === "join") return;
  const operations = [seededOperationFor("daily", now), seededOperationFor("weekly", now)];
  $("seeded-operation-cards").innerHTML = operations.map((operation) => {
    const record = seededOperationRecord(operation.id), selected = state.seededOperationKind === operation.kind;
    const windowLabel = operation.kind === "daily" ? "Resets 00:00 UTC" : `Ends ${new Date(operation.windowEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} UTC`;
    return `<button type="button" class="seeded-operation-card" data-seeded-operation="${operation.kind}" aria-pressed="${selected}"><span>${operation.kind} // ${escapeHTML(operation.id.split(":")[1])}</span><strong>${escapeHTML(MAPS[operation.map].name)} · ${escapeHTML(DIFFICULTIES[operation.difficulty].name)}</strong><small>${Math.round(operation.duration / 60)} min · ${escapeHTML(operation.modifierId.replaceAll("-", " "))} · ${operation.challengeIds.length} goals</small><em>${record?.completed ? `Complete · best ${record.best.score.toLocaleString()}` : record ? `Attempted · best ${record.best.score.toLocaleString()}` : windowLabel}</em></button>`;
  }).join("");
  const selected = operations.find((operation) => operation.kind === state.seededOperationKind);
  const selectedGoals = selected?.challengeIds.map((id) => challengeAchievementDefinition(id)?.name || id).join(" · ") || "";
  $("seeded-operation-status").textContent = selected
    ? `${selected.kind === "daily" ? "Daily" : "Weekly"} contract selected · fixed seed and rules · goals: ${selectedGoals} · ${selected.reward.name} is cosmetic only. Select again to return to a standard operation.`
    : "Standard operation selected. Seeded results and bests stay only in this browser unless you explicitly share a report.";
}

function selectSeededOperation(kind) {
  if (!["daily", "weekly"].includes(kind) || !state.runtimeConfig.config.flags.seededOperations || state.partyMode === "join") return;
  state.seededOperationKind = state.seededOperationKind === kind ? "" : kind;
  const selected = state.seededOperationKind ? seededOperationFor(state.seededOperationKind, new Date()) : null;
  if (selected) {
    $("map-select").value = selected.map; $("difficulty-select").value = selected.difficulty; $("duration-select").value = String(selected.duration);
    renderDeploymentMutations();
  } else updateProgressionUI();
  renderSeededOperations();
}

function practiceLaboratoryEnabled() { return Boolean(state.runtimeConfig?.config?.flags?.practiceLaboratory); }

function syncPracticeLaboratoryAvailability() {
  const enabled = practiceLaboratoryEnabled();
  document.documentElement.dataset.practiceLaboratory = String(enabled);
  for (const id of ["practice-button", "lobby-practice"]) $(id)?.classList.toggle("hidden", !enabled);
  if (!enabled && $("practice-dialog")?.open) $("practice-dialog").close();
}

function practiceWeaponName(id) { return id === "signature" ? SPECIALISTS[state.practiceLaboratory.specialist].signature.name : WEAPONS[id]?.name || id; }
function practiceWeaponPassive(id) { return id === "signature" ? SPECIALISTS[state.practiceLaboratory.specialist].signature.passive : WEAPONS[id]?.passive; }
function practicePassiveName(id) { return PASSIVES[id]?.name || id; }
function practiceTargetName(id) { return id === "apex" ? `${MAPS[state.practiceLaboratory.map].boss} (apex)` : ENEMY_TYPES[id]?.name || id; }

function practiceFieldKitUnlocked(specialist = state.practiceLaboratory.specialist) {
  return Number(state.mastery?.tracks?.[specialist]?.level || 1) >= masteryStartDefinition(specialist, "field-kit").unlockLevel;
}

function addPracticePassive(id, rank = 1) {
  const draft = state.practiceLaboratory;
  const existing = draft.passives.find((passive) => passive.id === id);
  if (existing) { existing.rank = Math.max(existing.rank, rank); return true; }
  if (!PASSIVES[id] || draft.passives.length >= PRACTICE_MAX_PASSIVES) return false;
  draft.passives.push({ id, rank });
  return true;
}

function reconcilePracticeLoadout() {
  const draft = state.practiceLaboratory, required = SPECIALISTS[draft.specialist].signature.passive;
  if (draft.masteryStart === "field-kit" && !addPracticePassive(required)) draft.masteryStart = "baseline";
  for (const weapon of draft.weapons) {
    if (!weapon.evolved) continue;
    const paired = practiceWeaponPassive(weapon.id);
    if (weapon.level !== 5 || !draft.passives.some(({ id }) => id === paired)) weapon.evolved = false;
  }
  draft.weapons.sort((left, right) => left.id === "signature" ? -1 : right.id === "signature" ? 1 : left.id.localeCompare(right.id));
  draft.passives.sort((left, right) => left.id.localeCompare(right.id));
}

function practiceSelectOptions(records, selected, disabled = () => false) {
  return records.map(([id, name]) => `<option value="${escapeHTML(id)}"${id === selected ? " selected" : ""}${disabled(id) ? " disabled" : ""}>${escapeHTML(name)}</option>`).join("");
}

function invalidatePracticeMeasurement(message = "Build changed; reset and measure again for authoritative output.") {
  $("practice-results").classList.add("hidden");
  $("practice-status").textContent = message;
}

function renderPracticeLaboratory() {
  reconcilePracticeLoadout();
  const draft = state.practiceLaboratory;
  $("practice-specialist").innerHTML = practiceSelectOptions(SPECIALIST_ORDER.map((id) => [id, SPECIALISTS[id].name]), draft.specialist);
  $("practice-mastery-start").innerHTML = practiceSelectOptions([["baseline", "Standard issue"], ["field-kit", practiceFieldKitUnlocked() ? "Field kit" : `Field kit (mastery level ${masteryStartDefinition(draft.specialist, "field-kit").unlockLevel})`]], draft.masteryStart, (id) => id === "field-kit" && !practiceFieldKitUnlocked());
  $("practice-map").innerHTML = practiceSelectOptions(Object.entries(MAPS).map(([id, value]) => [id, value.name]), draft.map);
  $("practice-difficulty").innerHTML = practiceSelectOptions(Object.entries(DIFFICULTIES).map(([id, value]) => [id, value.name]), draft.difficulty);
  $("practice-target").innerHTML = practiceSelectOptions([...Object.entries(ENEMY_TYPES).map(([id, value]) => [id, value.name]), ["apex", `${MAPS[draft.map].boss} (apex)`]], draft.target.type);
  const affixes = [["none", "No elite affix"], ...Object.keys(ELITE_AFFIXES).map((id) => [id, id[0].toUpperCase() + id.slice(1)])];
  $("practice-affix").innerHTML = practiceSelectOptions(affixes, draft.target.eliteAffix, (id) => id !== "none" && (draft.target.type === "apex" || !eliteAffixEligibility({ spawnContext: "practice-laboratory", typeId: draft.target.type, elite: true, miniboss: draft.target.type === "shark", boss: false, eventType: null }, id).eligible));
  $("practice-behavior").value = draft.target.behavior; $("practice-window").value = String(draft.measurementSeconds); $("practice-invulnerable").checked = draft.playerInvulnerable;
  const usedWeapons = new Set(draft.weapons.map(({ id }) => id));
  $("practice-weapons").innerHTML = draft.weapons.map((weapon, index) => {
    const choices = [["signature", SPECIALISTS[draft.specialist].signature.name], ...Object.entries(WEAPONS).map(([id, value]) => [id, value.name])];
    const options = practiceSelectOptions(choices, weapon.id, (id) => id !== weapon.id && usedWeapons.has(id));
    return `<div class="practice-loadout-row" data-practice-weapon="${index}"><label><span>Weapon</span><select data-practice-weapon-id${index === 0 ? " disabled" : ""}>${options}</select></label><label><span>Level</span><select data-practice-weapon-level>${[1,2,3,4,5].map((level) => `<option value="${level}"${level === weapon.level ? " selected" : ""}>${level}</option>`).join("")}</select></label><label class="practice-check"><input type="checkbox" data-practice-evolved${weapon.evolved ? " checked" : ""}><span>Evolved</span></label>${index ? `<button type="button" data-practice-remove-weapon aria-label="Remove ${escapeHTML(practiceWeaponName(weapon.id))}">Remove</button>` : ""}</div>`;
  }).join("");
  const usedPassives = new Set(draft.passives.map(({ id }) => id)), required = draft.masteryStart === "field-kit" ? SPECIALISTS[draft.specialist].signature.passive : "";
  $("practice-passives").innerHTML = draft.passives.map((passive, index) => {
    const options = practiceSelectOptions(Object.entries(PASSIVES).map(([id, value]) => [id, value.name]), passive.id, (id) => id !== passive.id && usedPassives.has(id));
    return `<div class="practice-loadout-row" data-practice-passive="${index}"><label><span>Passive</span><select data-practice-passive-id>${options}</select></label><label><span>Rank</span><select data-practice-passive-rank>${Array.from({ length: PASSIVES[passive.id].max }, (_, offset) => offset + 1).map((rank) => `<option value="${rank}"${rank === passive.rank ? " selected" : ""}>${rank}</option>`).join("")}</select></label><button type="button" data-practice-remove-passive${passive.id === required ? " disabled" : ""} aria-label="Remove ${escapeHTML(practicePassiveName(passive.id))}">Remove</button></div>`;
  }).join("") || `<p class="practice-empty">No passives equipped.</p>`;
  $("practice-add-weapon").disabled = draft.weapons.length >= PRACTICE_MAX_WEAPONS;
  $("practice-add-passive").disabled = draft.passives.length >= PRACTICE_MAX_PASSIVES;
  invalidatePracticeMeasurement();
}

function renderPracticeResults(result) {
  const sourceName = (id) => id === "signature" ? SPECIALISTS[result.config.specialist].signature.name : WEAPONS[id]?.name || id.replaceAll("_", " ");
  const sources = result.sources.length ? result.sources.map((source) => `<tr><th scope="row">${escapeHTML(sourceName(source.id))}</th><td>${source.damage.toLocaleString()}</td><td>${source.dps.toLocaleString()}</td></tr>`).join("") : `<tr><td colspan="3">No damage resolved in this window.</td></tr>`;
  const stats = Object.entries(result.stats).map(([id, value]) => `<div><dt>${escapeHTML(id.replace(/([A-Z])/g, " $1"))}</dt><dd>${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd></div>`).join("");
  const weapons = result.weapons.map((weapon) => `<article><strong>${escapeHTML(sourceName(weapon.id))} · L${weapon.level}${weapon.evolved ? " · evolved" : ""}</strong><span>${escapeHTML(weapon.damage)} · ${escapeHTML(weapon.interval)} · ${escapeHTML(weapon.projectiles)}</span></article>`).join("");
  $("practice-results-body").innerHTML = `<div class="practice-result-hero"><div><span>Actual damage</span><strong>${result.totalDamage.toLocaleString()}</strong></div><div><span>DPS</span><strong>${result.dps.toLocaleString()}</strong></div><div><span>Window</span><strong>${result.config.measurementSeconds}s · ${result.ticks} ticks</strong></div><div><span>Target</span><strong>${escapeHTML(practiceTargetName(result.target.type))}</strong></div></div><table><thead><tr><th>Source</th><th>Damage</th><th>DPS</th></tr></thead><tbody>${sources}</tbody></table><section><h3>Build stats</h3><dl class="practice-stat-grid">${stats}</dl></section><section><h3>Weapon telemetry</h3><div class="practice-weapon-results">${weapons}</div></section>`;
  $("practice-results").classList.remove("hidden");
}

function openPracticeLaboratory() {
  if (!practiceLaboratoryEnabled()) return;
  renderPracticeLaboratory(); $("practice-status").textContent = "Configure a build, then run an identity-free local measurement."; $("practice-dialog").showModal();
}

function measurePracticeBuild() {
  try {
    $("practice-status").textContent = "Resetting the fixed seed and measuring authoritative simulation…";
    const config = normalizePracticeLaboratoryConfig(state.practiceLaboratory), result = measurePracticeLaboratory(config);
    renderPracticeResults(result); $("practice-status").textContent = `Measurement complete · ${result.ticks} deterministic ticks · no record saved.`;
  } catch (error) { $("practice-status").textContent = `Configuration needs attention: ${String(error?.message || error)}`; }
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

function pairedPassiveDelta(evolution) {
  return evolution.pairedPassive.changes.length
    ? evolution.pairedPassive.changes.map((change) => `${change.label}: ${change.before} → ${change.after}`).join(" · ")
    : evolution.pairedPassive.effect;
}

function guideWeaponDetails(weaponId, specialist = "zuri") {
  const player = guidePlayer(specialist), telemetry = weaponTelemetry(weaponId, { level: 1, evolved: false }, player);
  const impact = getWeaponImpactGrammar(weaponId, { specialistId: specialist, evolved: false });
  const buildcraft = sourceBuildcraft(weaponId, { specialistId: specialist }), buildTraits = buildcraft?.traits.map(({ value }) => value).join(" · ") || "—";
  if (weaponId === "signature") {
    const evolution = signatureEvolutionTelemetry(specialist, player);
    return {
      Damage: telemetry.damage, Cadence: telemetry.interval, Projectiles: telemetry.projectiles,
      Radius: telemetry.radius, Reach: telemetry.reach, Pierce: telemetry.pierce, Lifetime: telemetry.lifetime,
      Secondary: telemetry.secondary, "Build traits": buildTraits, "Scales with": buildcraft?.scalesWith.map(({ name }) => name).join(", ") || "None", "Paired passive": `${evolution.pairedPassive.name}: ${pairedPassiveDelta(evolution)}`,
      Evolution: `${evolution.requirement}. ${evolution.summary}`,
    };
  }
  return { Damage: telemetry.damage, Cooldown: telemetry.interval, Projectiles: telemetry.projectiles, Range: telemetry.note, "Build traits": buildTraits, "Scales with": buildcraft?.scalesWith.map(({ name }) => name).join(", ") || "None", Impact: impact?.impact.replaceAll("-", " ") || "Authored effect", Audio: impact?.soundFamily.replaceAll("-", " ") || "Combat" };
}

const SIGNATURE_BEHAVIORS = {
  zuri: "Fires a sustained burst of long-range rounds toward the nearest threat.",
  echo: "Launches resonant waves that spread across multiple nearby threats.",
  sola: "Projects a forward shield beam whose damage grows with Sola's armor.",
  bront: "Crashes a heavy tidal hammer into the closest threat for a wide impact.",
  fang: "Rends targets at close range; the strike grows stronger with Fang's maximum health.",
  gale: "Spends 100 Flow to release a piercing mid-range current; Flow regenerates continuously and scales partially with haste.",
  rift: "Slams a kinetic shock into nearby threats while fighting at close range.",
  nova: "Sends guiding hexes toward distant threats, building toward spirit detonations.",
  vesper: "Throws winged daggers that leave temporary feathers for Blade Recall to pull through the fight.",
};

function renderStartingWeaponDetails(spec) {
  const player = guidePlayer(spec.id);
  const telemetry = weaponTelemetry("signature", { level: 1, evolved: false }, player);
  const evolution = signatureEvolutionTelemetry(spec.id, player);
  $("detail-weapon-tooltip-name").textContent = spec.signature.name;
  $("detail-weapon-behavior").textContent = SIGNATURE_BEHAVIORS[spec.id] || "Automatically attacks nearby threats.";
  $("detail-weapon-stats").innerHTML = Object.entries({ Damage: telemetry.damage, Cadence: telemetry.interval, Projectiles: telemetry.projectiles, Radius: telemetry.radius, Reach: telemetry.reach, Pierce: telemetry.pierce, Lifetime: telemetry.lifetime, Secondary: telemetry.secondary })
    .map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("");
  $("detail-weapon-evolution").textContent = `Evolves into ${spec.signature.evolve}. ${evolution.requirement}. ${evolution.summary.replace(/[.!?]+$/, "")}. Paired passive: ${evolution.pairedPassive.name} — ${pairedPassiveDelta(evolution)}.`;
  $("starting-weapon-trigger").setAttribute("aria-label", `Inspect ${spec.signature.name} starting weapon`);
}

function renderGuide() {
  let campaign = MAP_ORDER.map((map, index) => {
    const unlocked = isMapUnlocked(state.progress, map);
    const cleared = DIFFICULTY_ORDER.filter((difficulty) => hasCompleted(state.progress, map, difficulty)).map((difficulty) => DIFFICULTIES[difficulty].name);
    const requirement = MAP_REQUIREMENTS[map];
    return `<article class="campaign-node ${unlocked ? "unlocked" : "locked"}"><img src="${MAPS[map].texture}" alt=""><div><b>${String(index + 1).padStart(2, "0")}</b><span>${MAPS[map].name}</span><small>${unlocked ? `${cleared.length}/3 cleared${cleared.length ? ` · ${cleared.join(", ")}` : ""}` : `Locked · clear ${requirementCopy(requirement)}`}</small></div></article>`;
  }).join("");
  const mutations = DIFFICULTY_ORDER.map((difficultyId) => {
    const definition = campaignMutationDefinition(difficultyId);
    const rules = difficultyId === "story"
      ? "No retaliation or surge encounters. Small passive recovery remains available for onboarding."
      : `Successful objectives schedule a ${(definition.objectiveRetaliation.warningTicks / 60).toFixed(1)}s retaliation worth ${definition.objectiveRetaliation.rewardGold} gold and advance map pressure ${(definition.mapPressureAdvanceTicks / 60).toFixed(1)}s.${definition.surge.enabled ? ` Waves ${definition.surgeWaves.join(", ")} add an elite surge worth ${definition.surge.rewardGold} gold and ${definition.surge.rewardCards} access card.` : ""}`;
    return guideCard("THREAT", definition.name, DIFFICULTIES[difficultyId].name, `${definition.summary} ${rules}`, "", MAPS.warehouse.texture, {
      Retaliation: definition.objectiveRetaliation.enabled ? `${definition.objectiveRetaliation.enemyCount} hostiles · ${definition.objectiveRetaliation.eliteCount} elite` : "None",
      Surges: definition.surge.enabled ? `Waves ${definition.surgeWaves.join(", ")}` : "None",
      Counterplay: "Read the countdown and approach; clear every marked hostile for the reward",
      Rollback: difficultyId === "story" ? "Always baseline" : "Independent runtime flag",
    });
  }).join("");
  campaign += `<div class="campaign-mutation-manual"><h4>Threat mutation packages</h4><p>Warnings use text, countdowns, and named approaches—not color alone.</p><div class="guide-grid">${mutations}</div></div>`;
  const apexes = MAP_ORDER.map((mapId) => {
    const contract = APEX_CONTRACTS[mapId], map = MAPS[mapId];
    const phases = contract.phases.map((phase, phaseIndex) => `Phase ${phaseIndex + 1}: ${phase.id.replaceAll("-", " ")} (${phase.arenaMode.replaceAll("-", " ")})`).join(" · ");
    const attacks = Object.values(contract.intents).map((intent) => `${intent.text}: ${intent.pattern.replaceAll("-", " ")}, ${(intent.telegraphTicks / 60).toFixed(1)}s warning`).join(". ");
    return guideCard("APEX", contract.bossName, `${map.name} · gate ${Math.round(contract.phaseGateRatio * 100)}%`, `${phases}. ${attacks}.`, "", map.texture, { Phases: contract.phases.length, "Phase gate": `${Math.round(contract.phaseGateRatio * 100)}%`, Enrage: `${contract.enrageTicks / 60}s`, Lethal: `${contract.lethalTicks / 60}s`, Counterplay: "Read shape, pattern, countdown, and arena boundary" });
  }).join("");
  const mapMechanics = MAP_ORDER.map((mapId) => {
    const map = MAPS[mapId], mechanic = mapMechanicDefinition(mapId);
    const effectCopy = mechanic.effect.kind === "freight"
      ? `Carries specialists and ordinary enemies at ${mechanic.effect.pushPerSecond} units per second.`
      : mechanic.effect.kind === "ion"
        ? `Deals ${mechanic.effect.playerDamage} vitality to specialists and ${Math.round(mechanic.effect.enemyDamageFraction * 1000) / 10}% max health to ordinary enemies once per cycle.`
        : mechanic.effect.kind === "cryo"
          ? `Reduces specialist movement to ${Math.round(mechanic.effect.playerSpeedMultiplier * 100)}% and interrupts ordinary enemies for ${mechanic.effect.enemyControlSeconds.toFixed(2)} seconds.`
          : `Deals ${mechanic.effect.playerDamage} vitality once per cycle, reduces movement to ${Math.round(mechanic.effect.playerSpeedMultiplier * 100)}%, and carries combatants at ${mechanic.effect.pushPerSecond} units per second.`;
    const favored = Object.entries(mechanic.composition).sort((left, right) => right[1] - left[1]).slice(0, 2).map(([enemyId]) => ENEMY_TYPES[enemyId].name).join(" + ");
    return guideCard("MAP", `${map.name} · ${mechanic.name}`, `${mechanic.short} · every ${(mechanic.cycleTicks / 60).toFixed(0)}s`, `${mechanic.description} ${mechanic.counterplay}`, "", map.texture, {
      Warning: `${(mechanic.warningTicks / 60).toFixed(1)} seconds`, Active: `${(mechanic.activeTicks / 60).toFixed(1)} seconds`, Effect: effectCopy, "Favored enemies": favored, Determinism: "Authoritative simulation tick",
    });
  }).join("");
  const environmentTheme = getThemeEnvironmentChunks();
  const environments = MAP_ORDER.map((mapId) => {
    const map = MAPS[mapId], environment = environmentTheme.maps[mapId];
    return guideCard("ENV", `${map.name} · ${environment.name}`, environment.short, environment.story, "", getThemeAsset(environment.atlasKey), {
      Language: environment.material, Landmarks: environment.frames.length, Collision: "None · visual set dressing", Layer: "Below combat information", Quality: `${environmentTheme.budgets.high} / ${environmentTheme.budgets.reduced} / ${environmentTheme.budgets.minimal} world chunks`, Contract: environmentTheme.schema,
    });
  }).join("");
  const signatures = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id], evolution = signatureEvolutionTelemetry(id, guidePlayer(id));
    return guideCard(spec.signature.glyph, `${spec.name} · ${spec.signature.name}`, `Evolves to ${spec.signature.evolve}`, `${evolution.requirement}. ${evolution.summary}`, "", spec.signature.icon, guideWeaponDetails("signature", id));
  }).join("");
  const identities = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id], identity = getSpecialistIdentity(id);
    const label = (value) => String(value).replaceAll("-", " ");
    const strong = (tier) => ["high", "very-high"].includes(tier);
    const strengths = [strong(identity.mobility.tier) && `${label(identity.mobility.tier)} mobility`, strong(identity.safety.tier) && `${label(identity.safety.tier)} safety`, strong(identity.control.tier) && `${label(identity.control.tier)} control`, strong(identity.support.tier) && `${label(identity.support.tier)} support`].filter(Boolean).join(" · ") || `${label(identity.damageShape.cadence)} ${label(identity.range)}-range damage`;
    return guideCard(spec.number, spec.name, `${label(identity.role.primary)} · ${label(identity.role.specialization)}`, `${strengths}. Failure point: ${identity.failureModes[0].consequence}`, "", spec.sprite, {
      Range: label(identity.range), Mobility: label(identity.mobility.tier), Durability: label(identity.durability.tier), Safety: label(identity.safety.tier), Control: label(identity.control.tier), Support: label(identity.support.tier), "Identity contract": SPECIALIST_IDENTITY_VERSION,
    });
  }).join("");
  const weapons = Object.values(WEAPONS).map((weapon) => {
    const evolution = getWeaponEvolution(weapon.id);
    const evolutionBehavior = evolution?.capabilities?.map(({ note }) => note).join(" ") || "Evolution behavior unavailable.";
    const details = { ...guideWeaponDetails(weapon.id), Evolution: evolutionBehavior };
    return guideCard(weapon.glyph, weapon.name, `Evolves to ${weapon.evolve}`, `${weapon.copy} Evolution requires level 5 + ${PASSIVES[weapon.passive]?.name || weapon.passive} + an elite access card. ${evolutionBehavior}`, "", weapon.icon, details);
  }).join("");
  const materials = MATERIAL_CLASSES.map((id) => {
    const material = getThemeMaterial(id);
    return guideCard(id.slice(0, 3).toUpperCase(), material.label, material.examples, `Weapon endpoints adapt with ${material.particles.shape.replaceAll("-", " ")}, a ${material.decal.shape.replaceAll("-", " ")} decal, and an accessibility-safe ${material.fallback.pattern.replaceAll("-", " ")} cue.`, "", "", { Particles: `${material.particles.count} max`, Decal: `${material.decal.lifetimeMs}ms`, Audio: material.sound.family, Fallback: material.fallback.label });
  }).join("");
  const passives = Object.values(PASSIVES).map((passive) => guideCard(passive.glyph, passive.name, `${passive.amount} · max ${passive.max}`, passive.id === "projectiles" ? "Adds a projectile to compatible attacks; single-instance fields and utility effects do not multiply." : "Passive stats also unlock matching weapon evolutions.", "", passive.icon, { "Each rank": passive.amount, "Maximum": `${passive.max} ranks` })).join("");
  const fieldObjects = [
    ...Object.values(ENEMY_TYPES).map((enemy) => {
      const identity = ENEMY_ARCHETYPES[enemy.id];
      const behavior = {
        mite: "Weaves through the swarm and pressures by contact. Area coverage keeps packs from stacking.",
        hound: "Locks a lane, shows a directional windup, then commits to a dodgeable straight charge.",
        spitter: "Maintains range, leads moving targets, and shows a dotted aim line before firing one hostile bolt.",
        brute: "Closes slowly, then marks a toothed ground ring before a heavy seismic slam.",
        bomber: "Arms at close range and shows its full blast radius. Destroy or stun it before detonation.",
        shark: "A miniboss linebreaker with a broad charge wedge, committed travel, and an endpoint shockwave.",
      }[enemy.id];
      const storyDamage = enemy.damage * DIFFICULTIES.story.attack * (identity.handler === "kite-shot-v1" ? DIFFICULTIES.story.spell : 1);
      return guideCard("EN", enemy.name, `${identity.role.replaceAll("-", " ")} · ${identity.handler.replace("-v1", "").replaceAll("-", " ")}`, behavior, "", enemy.icon, { Health: enemy.health, "Story hit": `${storyDamage.toFixed(1)} HP`, "Hits vs 10 HP": Math.ceil(BASE_VITALITY / storyDamage), Speed: enemy.speed, XP: enemy.xp });
    }),
    guideCard("XP", "Combat data", "Cyan crystal pickup", "Collect data motes to advance the squad's next upgrade choice.", "", getThemeAsset("guide.field.combatData"), { Effect: "Squad XP", Attraction: "Pickup radius" }),
    guideCard("BREAK", "Supply cache", "Destructible field object", "Damage the orange cache with projectiles or area attacks to reveal a random pickup.", "", getThemeAsset("guide.field.supplyCache"), { Integrity: 100, Collision: "None", Drops: "Repair / vacuum / mine / gold" }),
    guideCard("!", "Hostile projectile", "Orange-red enemy fire", "Evade hostile bolts. Apex attacks lock exact danger geometry after a named countdown.", "", getThemeAsset("guide.field.hostileProjectile"), { Threat: "Damage", Apex: "Named shape telegraph" }),
    guideCard("+", "Repair kit", "Green squad pickup", "Restores 20% health to every surviving specialist.", "", getThemeAsset("guide.field.repairKit"), { Healing: "20% max HP", Target: "Whole squad" }),
    guideCard("ORB", "Relay ball", "Push objective", "Make contact to drive the relay core into its destination ring.", "", getThemeAsset("guide.field.relayBall"), { Time: "62 seconds", Reward: "Gold + data + access card" }),
    guideCard("FIELD", "Operation device", "Map-specific objective", "Stand close to charge the central device. Its effect changes with the operation.", "", getThemeAsset("guide.field.fieldDevice"), { Charge: "2.4 seconds", Effect: "Map-specific" }),
  ].join("");
  const synergies = SQUAD_SYNERGY_REGISTRY.entries.map((entry) => {
    const details = entry.id === "breach-window" ? {
      Trigger: "30+ control ticks, then a different damage role", Window: `${(entry.timing.windowTicks / 60).toFixed(1)}s`, Cooldown: `${entry.timing.cooldownTicks / 60}s per target`, Effect: `20% follow-up damage, capped by level`, Stacking: "Maximum two procs per tick",
    } : entry.id === "ultimate-resonance" ? {
      Trigger: "Two distinct nearby ultimate casts", Window: `${entry.timing.windowTicks / 60}s`, Radius: `${entry.effect.radius} units`, Shield: `${Math.round(entry.effect.maxHealth * 100)}% max HP`, Cooldown: `${entry.timing.cooldownTicks / 60}s team cooldown`,
    } : {
      Trigger: "Two allies moving together for 0.8s", "Enter range": `${entry.condition.enterDistance[0]}–${entry.condition.enterDistance[1]}`, "Leave range": `${entry.condition.stayDistance[0]}–${entry.condition.stayDistance[1]}`, Effect: `${Math.round((1 - entry.effect.multiplier) * 100)}% less direct impact damage`, Stacking: "Never stacks",
    };
    return guideCard(entry.presentation.glyph, entry.name, entry.category.replaceAll("-", " "), `${entry.presentation.copy} Solo runs are unchanged.`, "", "", details);
  }).join("");
  const participation = [
    guideCard("+", "Effective support", "Healing & shielding", "Only health actually restored and shield actually granted count. Overheal, overshield, shield decay, reconnect restoration, and respawn restoration are excluded."),
    guideCard("AS", "Damage assists", "Priority participation", `Deal 5% of target max health, bounded from ${PARTICIPATION_REGISTRY.damageAssist.minimumDamage} to ${PARTICIPATION_REGISTRY.damageAssist.maximumDamage} damage, within ${PARTICIPATION_REGISTRY.damageAssist.recencyTicks / 60} seconds. Overkill, environment damage, and proximity do not count.`),
    guideCard("CC", "Control assists", "Effective crowd control", `Extend control by ${PARTICIPATION_REGISTRY.controlAssist.minimumExtensionTicks} new ticks within ${PARTICIPATION_REGISTRY.controlAssist.recencyTicks / 60} seconds. Refreshing existing control and duplicate traffic do not count twice.`),
    guideCard("RV", "Revive work", "Shared rescue", `Contribute ${PARTICIPATION_REGISTRY.revive.minimumTicks} ticks and ${Math.round(PARTICIPATION_REGISTRY.revive.minimumShare * 100)}% of completed work. Credit follows active time in the ring, not the final frame.`),
    guideCard("OBJ", "Objective work", "Presence & movement", `Zone credit needs ${PARTICIPATION_REGISTRY.objective.minimumTicks} ticks and ${Math.round(PARTICIPATION_REGISTRY.objective.minimumShare * 100)}% of work. Relay credit counts only movement toward the destination: ${PARTICIPATION_REGISTRY.objective.relayMinimumMovement} units or ${Math.round(PARTICIPATION_REGISTRY.objective.relayRouteRatio * 100)}% of route.`),
  ].join("");
  const downed = [
    guideCard("WASD", "Crawl to safety", "Downed movement", "You keep limited ground movement while downed. Crawl out of hazards or toward a standing squadmate; cover and arena boundaries still block you.", "", "", { Control: "WASD / arrows / touch stick", Combat: "Weapons, active ability, and ultimate disabled", Pickup: "Disabled", Objectives: "Disabled" }),
    guideCard("E", "Guard pulse", "Weak support action", "Protect a nearby standing ally with a small shield. The pulse deals no damage, cannot heal, cannot target you, and never contributes to your own rescue.", "", "", { Control: "E / downed action button", Cooldown: "Shown in the downed panel", Target: "Nearby standing ally", "Self-revive": "Never" }),
    guideCard("G", "Call for help", "Contextual ping", "Open the ping wheel and mark Help or Regroup without interrupting your crawl. The battlefield ring and HUD show both bleedout and incoming rescue progress.", "", "", { Control: "G / touch ping", Bleedout: "10 seconds", Rescue: "3 seconds of nearby squad work", Readability: "Pattern + text + color" }),
  ].join("");
  const director = [
    guideCard("ARC", "Formation pressure", "Squad-only enemy direction", "Two-to-four-player runs receive deterministic lanes, pincers, wedges, columns, and arcs. The director spends the existing spawn budget, so formations do not create free enemies.", "", getThemeAsset("guide.field.hostileProjectile"), { Solo: "Legacy spawn path unchanged", Readability: "Bounded formation warnings", Scaling: "Squad size + wave phase" }),
    guideCard("OBJ", "Directive convergence", "Objective-aware approach", "When an uplink, trial, or relay is active, some authored approaches form around that directive instead of only centering on the squad.", "", getThemeAsset("guide.field.fieldDevice"), { Trigger: "Active field directive", Counterplay: "Read the approach warning", Privacy: "Aggregate run totals only" }),
    guideCard("EL", "Elite escort", "Late-run squad encounter", "Three- and four-player squads can meet ordinary formation escorts around scheduled elites after the operation midpoint. Escorts never duplicate elite keys or elite rewards.", "", getThemeAsset("archive.events.eliteAccessCard"), { Squad: "3–4 standing specialists", Timing: "After 45% progress", Rewards: "Standard enemy rewards only" }),
  ].join("");
  const legacyRare = [
    guideCard("KEY", "Elite access card", "Rare evolution drop", "Elites and minibosses drop access cards. A card evolves one eligible level-five weapon whose matching passive is owned.", "", getThemeAsset("archive.events.eliteAccessCard")),
    guideCard("$", "Treasure runner", "Timed chase event", "Catch the fleeing gold target before it escapes to earn bonus gold, data, and access cards.", "", getThemeAsset("archive.events.treasureRunner")),
    guideCard("ORB", "Relay ball", "Push objective", "Make contact to drive the relay ball into its marked destination ring for a squad reward.", "", getThemeAsset("archive.events.relayBall")),
    guideCard("»", "Hasted elite", "Elite affix", `Moves ${Math.round((ELITE_AFFIXES.hasted.speedMultiplier - 1) * 100)}% faster and recovers attacks ${Math.round((1 - ELITE_AFFIXES.hasted.cooldownMultiplier) * 100)}% sooner. Triple chevrons identify it without color.`, "", getThemeAsset("archive.augments.withHaste")),
    guideCard("◇", "Shielded elite", "Elite affix", `Arrives with a one-time barrier worth ${Math.round(ELITE_AFFIXES.shielded.shieldMaxHealth * 100)}% of maximum health. A diamond badge and separate barrier readout mark it.`, "", getThemeAsset("archive.boons.squadShield")),
    guideCard("!", "Volatile elite", "Elite affix", `Leaves a ${ELITE_AFFIXES.volatile.radius}-unit delayed blast on death. A notched warning ring remains visible with motion, flash, and effects reduced.`, "", getThemeAsset("archive.augments.eliteBomber")),
    ...BOONS.map((boon) => guideCard("★", boon.name, "Rare squad boon", boon.copy, "", boon.icon)),
    ...AUGMENTS.map((augment) => guideCard("AUG", augment.name, "Rare augment", augment.copy, "", augment.icon)),
  ].join("");
  const discoveryEnabled = Boolean(state.runtimeConfig?.config?.flags?.rareDiscoveries);
  const discovered = new Set(state.rareDiscoveries.discovered);
  const rare = discoveryEnabled ? RARE_DISCOVERY_REGISTRY.entries.map((entry) => {
    const revealed = discovered.has(entry.id);
    return guideCard(revealed ? entry.glyph : "?", revealed ? entry.name : entry.concealed,
      `${entry.category} // ${revealed ? "catalogued" : "undiscovered"}`,
      revealed ? `${entry.copy} ${entry.lore}` : "Encounter this signal in a completed operation to decrypt its Field Manual entry.",
      revealed ? "discovered" : "locked", revealed ? entry.icon : "");
  }).join("") : legacyRare;
  const rareHeading = discoveryEnabled
    ? `Rare discoveries // ${discovered.size}/${RARE_DISCOVERY_REGISTRY.entries.length}`
    : "Rare finds & events";
  const challengeEnabled = Boolean(state.runtimeConfig?.config?.flags?.challengeAchievements);
  document.querySelector('a[href="#guide-challenges"]')?.classList.toggle("hidden", !challengeEnabled);
  const completedChallenges = new Set(state.challengeAchievements.completed);
  const challenges = challengeEnabled ? CHALLENGE_ACHIEVEMENT_REGISTRY.entries.map((item) => {
    const complete = completedChallenges.has(item.id);
    return guideCard(complete ? "OK" : "GOAL", item.name, `${item.category} // ${item.scope} // ${complete ? "complete" : "open"}`,
      `${item.summary} Reward: ${item.reward.name} (${item.reward.kind}).`, complete ? "complete" : "open", item.icon,
      { Progress: complete ? "1 / 1" : "0 / 1", Evidence: "Validated terminal report", Power: "No gameplay power", Rollback: "Independent runtime flag" });
  }).join("") : "";
  $("guide-content").innerHTML = `<section id="guide-campaign" class="guide-section"><h3>Campaign route</h3><p>Clear threat tiers to unlock harder operations. Progress is saved in this browser.</p><div class="campaign-route">${campaign}</div></section><section id="guide-map-mechanics" class="guide-section"><h3>Operation identities</h3><p>Every operation changes battlefield routing, enemy composition, and counterplay through a deterministic map mechanic.</p><div class="guide-grid">${mapMechanics}</div></section><section id="guide-environments" class="guide-section"><h3>Environment identities</h3><p>Generated landmark atlases give every operation authored set dressing. These chunks are visual only: they never block movement, hide a pickup, or enter multiplayer snapshots.</p><div class="guide-grid">${environments}</div></section><section id="guide-apex" class="guide-section"><h3>Map apexes</h3><p>Every apex has two deterministic phases, a real health gate, named attacks, and a map-specific arena change.</p><div class="guide-grid">${apexes}</div></section><section id="guide-specialists" class="guide-section"><h3>Specialist identities</h3><p>Measured roles, strengths, and failure points from the versioned simulation contract.</p><div class="guide-grid">${identities}</div></section><section id="guide-field" class="guide-section"><h3>Field objects</h3><p>Hold Shift and point at a live field object for its current stats.</p><div class="guide-grid">${fieldObjects}</div></section><section id="guide-signatures" class="guide-section"><h3>Signature evolutions</h3><div class="guide-grid">${signatures}</div></section><section id="guide-weapons" class="guide-section"><h3>Universal weapons</h3><div class="guide-grid">${weapons}</div></section><section id="guide-materials" class="guide-section"><h3>Impact materials</h3><p>Every weapon keeps its silhouette while contact particles, decals, flash, and sound adapt to the target. Shape and pattern remain available when color or motion is reduced.</p><div class="guide-grid">${materials}</div></section><section id="guide-passives" class="guide-section"><h3>Passive upgrades</h3><div class="guide-grid">${passives}</div></section><section id="guide-downed" class="guide-section"><h3>Downed activity</h3><p>A downed specialist stays useful but cannot fight, collect, score objective work, or revive themself. The authoritative simulation decides every action.</p><div class="guide-grid">${downed}</div></section><section id="guide-participation" class="guide-section"><h3>Participation credit</h3><p>Credit records effective work by anonymous specialist slot. Genuine overlap is shared; duplicate traffic, excess values, idle proximity, and system restoration are excluded.</p><div class="guide-grid">${participation}</div></section><section id="guide-synergies" class="guide-section"><h3>Squad synergies</h3><p>Coordinate roles, ultimate timing, and movement. Effects are authoritative, bounded, non-stacking, and disabled in solo runs.</p><div class="guide-grid">${synergies}</div></section><section id="guide-director" class="guide-section"><h3>Squad enemy director</h3><p>Squad runs receive deterministic, objective-aware formations while solo and rollback paths preserve the original spawn contract.</p><div class="guide-grid">${director}</div></section>${challengeEnabled ? `<section id="guide-challenges" class="guide-section"><h3>Challenges & achievements // ${completedChallenges.size}/${CHALLENGE_ACHIEVEMENT_REGISTRY.entries.length}</h3><p>Authored goals reward unusual builds and cooperative mastery with local badges, titles, lore, and cosmetics. They never grant gameplay power.</p><div class="guide-grid">${challenges}</div></section>` : ""}<section id="guide-rare" class="guide-section"><h3>Rare finds & events</h3><div class="guide-grid">${rare}</div></section>`;
  const rareSection = $("guide-content").querySelector("#guide-rare");
  rareSection.querySelector("h3").textContent = rareHeading;
  if (discoveryEnabled) rareSection.querySelector("h3").insertAdjacentHTML("afterend", "<p>Discoveries are informational, local to this browser, and never grant combat power.</p>");
}

function renderSpecialistGrid() {
  $("specialist-grid").innerHTML = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id];
    return `<button class="specialist-card" type="button" role="option" data-specialist="${id}" aria-selected="${id === state.selected}"><small>${spec.number}</small><img class="specialist-art" src="${spec.sprite}" alt=""><span class="specialist-name">${spec.name.toUpperCase()}</span><span class="specialist-weapon"><img src="${spec.signature.icon}" alt=""><em>${escapeHTML(spec.signature.name)}</em></span></button>`;
  }).join("");
  $("specialist-grid").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectSpecialist(button.dataset.specialist)));
  $("mastery-loadout").querySelectorAll("[data-mastery-start]").forEach((button) => button.addEventListener("click", () => chooseMasteryStart(button.dataset.masteryStart)));
}

function renderMasteryLoadout(id) {
  const definition = SPECIALIST_MASTERY.tracks[id], track = state.mastery.tracks[id];
  const enabled = Boolean(state.runtimeConfig.config.flags.specialistMastery);
  $("mastery-loadout").classList.toggle("hidden", !enabled);
  if (!enabled) return;
  const next = SPECIALIST_MASTERY_LEVELS[track.level] ?? SPECIALIST_MASTERY_LEVELS.at(-1);
  $("mastery-loadout-title").textContent = `${definition.name} // level ${track.level}`;
  $("mastery-points").textContent = track.level === 5 ? `${track.points} // mastered` : `${track.points} / ${next}`;
  $("mastery-summary").textContent = definition.summary;
  const challengeDone = track.completedChallenges.includes(definition.challenge.id);
  $("mastery-challenge").textContent = `${challengeDone ? "Challenge complete" : "Track challenge"} // ${definition.challenge.field.replace("participation.", "")} ${definition.challenge.minimum.toLocaleString()} // +${definition.challenge.rewardPoints}`;
  $("mastery-loadout").querySelectorAll("[data-mastery-start]").forEach((button) => {
    const start = masteryStartDefinition(id, button.dataset.masteryStart), locked = track.level < start.unlockLevel;
    button.disabled = locked; button.setAttribute("aria-checked", String(track.selectedStart === start.id));
    button.querySelector("small").textContent = locked ? `Unlocks at mastery level ${start.unlockLevel}.` : start.summary;
  });
}

function chooseMasteryStart(startId) {
  if (!state.runtimeConfig.config.flags.specialistMastery) return;
  try {
    state.mastery = saveSpecialistMasteryState(localStorage, selectMasteryStart(state.mastery, state.selected, startId));
    renderMasteryLoadout(state.selected);
    if (state.screen === "lobby") updateLocalProfile({ masteryStart: startId });
  } catch { toast("That field kit is still locked"); }
}

function selectSpecialist(id) {
  if (!SPECIALISTS[id]) return;
  state.selected = id;
  const spec = SPECIALISTS[id];
  $("specialist-grid").querySelectorAll("button").forEach((button) => button.setAttribute("aria-selected", button.dataset.specialist === id));
  $("detail-number").textContent = spec.number; $("detail-art").src = spec.sprite; $("detail-art").alt = spec.name;
  $("detail-role").textContent = spec.role; $("detail-name").textContent = spec.name.toUpperCase(); $("detail-tagline").textContent = spec.tagline;
  $("detail-health").textContent = spec.health; $("detail-armor").textContent = spec.armor; $("detail-range").textContent = spec.range;
  const identity = getSpecialistIdentity(id), label = (value) => String(value).replaceAll("-", " ");
  const strong = (tier) => ["high", "very-high"].includes(tier);
  $("identity-strengths").textContent = [strong(identity.mobility.tier) && `${label(identity.mobility.tier)} mobility`, strong(identity.safety.tier) && `${label(identity.safety.tier)} safety`, strong(identity.control.tier) && `${label(identity.control.tier)} control`, strong(identity.support.tier) && `${label(identity.support.tier)} support`].filter(Boolean).join(" · ") || `${label(identity.damageShape.cadence)} ${label(identity.range)}-range damage`;
  $("identity-risk").textContent = identity.failureModes[0].consequence;
  $("detail-weapon-icon").src = spec.signature.icon; $("detail-weapon-icon").alt = ""; $("detail-weapon-name").textContent = spec.signature.name;
  renderStartingWeaponDetails(spec);
  $("passive-name").textContent = spec.passive[0]; $("passive-copy").textContent = spec.passive[1];
  $("active-name").textContent = spec.active[0]; $("active-copy").textContent = spec.active[1];
  $("ultimate-name").textContent = spec.ultimate[0]; $("ultimate-copy").textContent = spec.ultimate[1];
  renderMasteryLoadout(id);
  if (state.screen === "lobby") updateLocalProfile({ specialist: id, masteryStart: state.mastery.tracks[id].selectedStart });
}

function setPartyMode(mode) {
  const clearedSeededOperation = mode === "join" && Boolean(state.seededOperationKind);
  state.partyMode = mode;
  if (mode === "join") state.seededOperationKind = "";
  document.querySelectorAll(".mode-tab").forEach((button) => {
    const active = button.dataset.partyMode === mode; button.classList.toggle("active", active); button.setAttribute("aria-selected", active);
  });
  $("join-fields").classList.toggle("hidden", mode !== "join");
  $("host-options").classList.toggle("hidden", mode === "join");
  $("progression-note").classList.toggle("hidden", mode === "join");
  $("deploy-button").querySelector("span").textContent = mode === "solo" ? "Deploy solo" : mode === "host" ? "Create squad" : "Join squad";
  if (clearedSeededOperation) { updateProgressionUI(); renderDeploymentMutations(); }
  renderSeededOperations();
}

async function deploy() {
  if (state.connecting) return;
  state.connecting = true; $("deploy-button").disabled = true;
  await runtimeConfigReady;
  state.connecting = false; $("deploy-button").disabled = false;
  const seeded = state.runtimeConfig.config.flags.seededOperations && state.seededOperationKind ? seededOperationFor(state.seededOperationKind, new Date()) : null;
  state.config = seeded
    ? { map: seeded.map, difficulty: seeded.difficulty, duration: seeded.duration, seededOperation: seeded }
    : { map: $("map-select").value, difficulty: $("difficulty-select").value, duration: Number($("duration-select").value) };
  if (!seeded && state.partyMode !== "join" && (!isMapUnlocked(state.progress, state.config.map) || !isDifficultyUnlocked(state.progress, state.config.map, state.config.difficulty))) {
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

function renderReinforcementPanel() {
  const panel = $("reinforcement-panel"), admission = state.runAdmission;
  panel.classList.toggle("hidden", !state.joiningActiveRun);
  if (!state.joiningActiveRun) return;
  const choosing = ["fresh", "waiting"].includes(admission?.kind) && !state.joinRequestSent && admission?.kind !== "denied";
  const denied = admission?.kind === "denied";
  $("reinforcement-packages").classList.toggle("hidden", !choosing);
  $("reinforcement-waiting").classList.toggle("hidden", choosing || denied);
  $("reinforcement-status").textContent = denied ? "Deployment unavailable" : choosing ? "Your choices do not pause the squad." : "Admission secured · synchronizing with the host.";
  $("reinforcement-waiting-copy").textContent = admission?.kind === "reconnect"
    ? "Your reserved seat is restoring its exact loadout and progress."
    : admission?.kind === "waiting" ? "Host migration is finishing before deployment." : "The host is applying your package at a safe squad position.";
  $("reinforcement-copy").textContent = denied
    ? `This operation cannot accept another specialist${admission?.reason ? `: ${String(admission.reason).replaceAll("-", " ")}` : "."}`
    : "Pick a specialist, then choose how the command rig distributes your deterministic catch-up ranks. Catch-up grants no retroactive XP, gold, rare finds, or participation.";
  document.querySelectorAll("[data-join-package]").forEach((button) => button.setAttribute("aria-checked", String(button.dataset.joinPackage === state.joinPackageId)));
}

function renderLobby() {
  const map = MAPS[state.config.map], difficulty = DIFFICULTIES[state.config.difficulty];
  const seeded = state.config.seededOperation ? ` · ${state.config.seededOperation.kind.toUpperCase()}` : "";
  $("lobby-mission").textContent = `${map.name} · ${difficulty.name} · ${state.config.duration === 900 ? "15:00" : "04:00"}${seeded}`;
  $("lobby-mutations").innerHTML = mutationPackageMarkup(state.config.difficulty, state.config.map);
  renderParty();
  const button = $("ready-button"), members = [...state.lobby.values()];
  renderReinforcementPanel();
  if (state.joiningActiveRun) {
    const choosing = ["fresh", "waiting"].includes(state.runAdmission?.kind) && !state.joinRequestSent && state.runAdmission?.kind !== "denied";
    button.disabled = !choosing;
    button.innerHTML = `<span>${state.runAdmission?.kind === "denied" ? "Operation locked" : state.joinRequestSent || state.runAdmission?.kind === "reconnect" ? "Synchronizing" : "Deploy reinforcement"}</span><span>${state.joinPackageId.toUpperCase()}</span>`;
  }
  else if (state.partyMode === "solo") { button.disabled = false; button.innerHTML = `<span>Start operation</span><span>Solo</span>`; }
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
    const start = member.masteryStart === "field-kit" ? "FIELD KIT" : "STANDARD";
    return `<div class="party-member ${member.ready || member.id === state.clientId && state.isHost ? "ready" : ""}"><img src="${spec.sprite}" alt=""><div><strong>${escapeHTML(member.name || "Connecting…")}</strong><small>${member.id === state.clientId ? "YOU" : member.ready ? "READY" : "CHOOSING"} · ${spec.name} · ${start}</small></div></div>`;
  }).join("");
}

function updateLocalProfile(patch = {}) {
  const current = state.lobby.get(state.clientId) || { id: state.clientId, name: callsign(), specialist: state.selected, masteryStart: state.mastery.tracks[state.selected].selectedStart, ready: state.isHost };
  const profile = { ...current, ...patch, id: state.clientId, name: callsign(), resumeToken: current.resumeToken || state.resumeToken };
  state.lobby.set(state.clientId, profile);
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "profile", profile });
  if (state.isHost) broadcastLobby();
  renderLobby();
}

function handleReady() {
  if (state.joiningActiveRun) {
    if (state.joinRequestSent || state.runAdmission?.kind === "reconnect" || state.runAdmission?.kind === "denied") return;
    state.joinRequestSent = true;
    send({ type: "join_request", protocolVersion: 2, specialist: state.selected, packageId: state.joinPackageId });
    renderLobby();
    return;
  }
  if (state.partyMode === "solo") { startHostedGame(); return; }
  if (state.isHost) { startHostedGame(); return; }
  const me = state.lobby.get(state.clientId); updateLocalProfile({ ready: !me?.ready });
}

function startHostedGame() {
  if (!state.isHost) return;
  state.joiningActiveRun = false; state.runAdmission = null; state.joinRequestSent = false;
  const players = [...state.lobby.values()].map((p, replaySlot) => ({
    id: p.id, name: p.name, specialist: p.specialist,
    masteryStart: state.runtimeConfig.config.flags.specialistMastery ? p.masteryStart || "baseline" : "baseline", replaySlot,
    ...(state.partyMode === "solo" ? {} : { reconnectSlot: `migration-slot-${replaySlot}` }),
  }));
  if (!players.length) return;
  for (const player of players) state.lobby.set(player.id, { ...state.lobby.get(player.id), replaySlot: player.replaySlot });
  const seed = state.config.seededOperation?.seed || createRandomSeed();
  const features = gameplayFeatureContract(state.runtimeConfig.config);
  state.config = { ...state.config, features };
  state.sim = new Simulation({ ...state.config, players }, { seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  state.squadPresence.reset(state.sim.players, state.sim.tick); state.lastPresenceAnnouncement = "";
  state.authorityEpoch = 0; state.authorityHostId = state.clientId; state.authoritySnapshotSeq = 0; state.migrationLastCheckpointTick = -1; setAuthorityState("active");
  state.draftRecommendations.reset(0); draftRecommendationSequences.reset(0); hostDraftRecommendationGate.reset(0);
  beginReplayCapture(players, seed);
  discardRecovery({ notify: false });
  state.previousSnapshot = null; state.snapshot = null;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "start", config: state.config, players: publicLobbyPlayers() });
  enterGame();
  persistRecoveryCheckpoint(true);
  publishMigrationCheckpoint(true);
}

function startRemoteGame(message) {
  const synchronizing = ["reconnecting", "synchronizing"].includes(state.authorityState);
  state.joiningActiveRun = false; state.runAdmission = null; state.joinRequestSent = false;
  if (Array.isArray(message.players)) state.lobby = new Map(message.players.map((player) => [player.id, player]));
  state.config = message.config; state.sim = null; state.previousSnapshot = null; state.snapshot = null; state.migrationLastCheckpointTick = -1;
  if (!synchronizing) state.draftRecommendations.reset(state.authorityEpoch);
  if (!synchronizing) setAuthorityState("active");
  const players = message.state?.players || message.players || [];
  if (!synchronizing) { state.squadPresence.reset(players, presenceTick(message.state)); state.lastPresenceAnnouncement = ""; }
  movementPredictor.reset(); enterGame();
}

function enterGame() {
  setScreen("game"); renderer.resize(); state.endShown = false; state.telemetrySent = false; state.resultSavedKey = ""; state.resultReport = null; state.lastEventSeq = 0; state.lastUpgradeKey = ""; state.lastWeaponHUDKey = ""; state.lastPassiveHUDKey = ""; state.lastSquadHUDKey = ""; state.lastFrame = performance.now();
  state.performanceMetrics = { samples: [], frames: 0, longFrames: 0, maxEntities: {}, inputLatencies: [], predictionCorrections: [] };
  state.soundState = emptySoundState();
  state.lastDamageLedgerKey = "";
  state.lastSend = 0; state.lastBroadcast = 0; state.hostPreviousMotion = null; state.inputMotionStartedAt = 0; state.inputMotionStart = null; state.inputWasActive = false;
  fixedClock.reset(); movementPredictor.reset(); resetInputProtocol(); renderer.resetCamera(); $("game-canvas").focus();
  if (!state.animation) state.animation = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (state.screen !== "game") { state.animation = 0; return; }
  pollGamepadInput();
  const dt = Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000)); state.lastFrame = now;
  const frameStarted = performance.now(); let simulationMs = 0;
  const input = currentInput();
  let interpolation = 1, renderPrevious = null, renderState = null;
  if (state.isHost && state.sim && state.authorityState === "active") {
    processPendingRunAdmissions();
    const simulationStarted = performance.now(); const hostInput = applyHostInput(state.clientId, input);
    const timing = fixedClock.advance(dt, (stepSeconds) => {
      state.hostPreviousMotion = captureMotionState(state.sim);
      state.sim.update(stepSeconds);
      recordReplayCheckpoint();
    });
    persistRecoveryCheckpoint();
    publishMigrationCheckpoint();
    simulationMs = performance.now() - simulationStarted; interpolation = timing.alpha; renderPrevious = state.hostPreviousMotion;
    renderState = withLocalMovementPreview(state.sim, hostInput, fixedClock.accumulator);
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastBroadcast > 83) {
      state.lastBroadcast = now;
      send(createSnapshotMessage(state.sim.snapshot({ presentation: true }), hostInputSequences.acknowledgements(), { epoch: state.authorityEpoch, snapshotSeq: state.authoritySnapshotSeq++ }));
    }
  } else if (state.authorityState === "active") {
    const authoritative = state.snapshot?.players?.find((player) => player.id === state.clientId);
    if (authoritative && !movementPredictor.player) movementPredictor.sync(authoritative);
    if (movementPredictor.player && !authoritative?.downed) movementPredictor.advance(input, dt, playerMovementSpeed(movementPredictor.player), moveEntityWithCover);
    renderState = withPredictedPlayer(state.snapshot, authoritative?.downed ? null : movementPredictor.player); renderPrevious = state.previousSnapshot;
    interpolation = clamp((now - state.snapshotAt) / state.snapshotInterval, 0, 1);
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastSend > 35) {
      state.lastSend = now;
      send(guestInputSequences.create(input, now));
    }
  }
  const current = state.isHost ? state.sim : state.snapshot || state.sim;
  if (current) {
    prunePings();
    const renderStarted = performance.now(); renderer.draw(renderState || current, state.clientId, renderPrevious, interpolation, dt); const renderMs = performance.now() - renderStarted;
    const impactSignals = renderer.drainImpactFeedbackSignals(4).filter((signal) => signal.local);
    if (impactSignals.length && state.accessibilitySettings.controller.enabled) {
      const gamepad = navigator.getGamepads?.() ? [...navigator.getGamepads()].find((candidate) => candidate?.connected && candidate.mapping === "standard") : null;
      void playFeedbackHaptics(impactSignals, { gamepad, paused: current.paused, connected: Boolean(gamepad), allowVibrate: false });
    }
    const materialCue = now - state.soundState.lastMaterial > 140 ? renderer.drainMaterialAudioCues(1)[0] : null;
    if (materialCue) {
      const listener = current.players?.find((player) => player.id === state.clientId) || current.players?.[0];
      state.soundState.lastMaterial = now; sfx(`material:${materialCue.family}`, { ...materialCue, pan: accessibleAudioPan(spatialAudioPan(materialCue, listener)) });
    }
    const hudStarted = performance.now(); updateHUD(current); updateUpgrade(current); processEvents(current.events || []); const hudMs = performance.now() - hudStarted;
    if (state.inspectActive && state.inspectPointer) inspectCanvasAt({ ...state.inspectPointer, shiftKey: true });
    trackInputLatency(renderState || current, input, now);
    trackPerformance(current, dt * 1000, performance.now() - frameStarted, simulationMs, renderMs, hudMs);
    if ((current.stage === "won" || current.stage === "lost") && !state.endShown) { publishMigrationCheckpoint(true); scheduleResult(current); }
  }
  state.animation = requestAnimationFrame(gameLoop);
}

function captureMotionState(game) {
  const capture = (list) => (list || []).map(({ id, x, y }) => ({ id, x, y }));
  return { players: capture(game.players), enemies: capture(game.enemies), drones: capture(game.drones), effects: capture(game.effects) };
}

function withLocalMovementPreview(game, input, remainingSeconds) {
  const player = game?.players?.find((entry) => entry.id === state.clientId);
  if (!player || player.downed || remainingSeconds <= 0) return game;
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
    environmentInteractions: renderer.environmentDiagnostics(),
    audioMix: state.audioMixer?.diagnostics() || null,
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
  const keys = state.input.keys, bindings = effectiveAccessibilitySettings().bindings;
  let x = (keys.has(bindings.moveRight) ? 1 : 0) - (keys.has(bindings.moveLeft) ? 1 : 0) + state.input.touchX + state.input.gamepadX;
  let y = (keys.has(bindings.moveDown) ? 1 : 0) - (keys.has(bindings.moveUp) ? 1 : 0) + state.input.touchY + state.input.gamepadY;
  const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
  return { x, y, aim: state.input.aim, autoAim: state.input.autoAim };
}

function cast(slot) {
  if (state.screen !== "game" || state.authorityState !== "active") return;
  const game = currentGameState(), player = localGamePlayer(game);
  if (!player || player.dead) return;
  if (player.downed) {
    const activity = downedPresentation(player);
    if (!downedActivityEnabled(game) || slot !== "e" || !activity.ready) return;
  }
  if (state.isHost) {
    if (recordHostCast(state.clientId, slot)) {
      sfx(slot === "r" ? "ultimate" : "ability");
      send({ type: "cast_audio", playerId: state.clientId, slot });
      if (slot === "r") comicVoice("pew pew pew");
    }
  } else {
    if (movementPredictor.player && !player.downed) {
      movementPredictor.player.animState = slot === "r" ? "castR" : "castE";
      movementPredictor.player.animTime = slot === "r" ? .42 : .28;
      movementPredictor.player.aimFacing = state.input.aim;
    }
    send({ type: "cast", slot }); sfx(slot === "r" ? "ultimate" : "ability");
    if (slot === "r") comicVoice("pew pew pew");
  }
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
  const evolution = weaponId === "signature" ? signatureEvolutionTelemetry(player.specialist, player) : null;
  const buildcraft = sourceBuildcraft(weaponId, { specialistId: player.specialist, evolved: Boolean(weapon.evolved) });
  const signatureRows = evolution ? `<div><dt>Radius</dt><dd>${escapeHTML(telemetry.radius)}</dd></div><div><dt>Reach</dt><dd>${escapeHTML(telemetry.reach)}</dd></div><div><dt>Pierce</dt><dd>${escapeHTML(telemetry.pierce)}</dd></div><div><dt>Lifetime</dt><dd>${escapeHTML(telemetry.lifetime)}</dd></div><div><dt>Secondary</dt><dd>${escapeHTML(telemetry.secondary)}</dd></div>` : "";
  const evolutionCopy = `${evolution ? `${evolution.requirement}. Paired passive: ${evolution.pairedPassive.name} — ${pairedPassiveDelta(evolution)}. Evolution delta: ${evolution.summary}` : `Level 5 + ${PASSIVES[passive]?.name || passive} + an elite access card`} Build traits: ${buildcraft?.traits.map(({ value }) => value).join(", ") || "none"}. Direct scaling: ${buildcraft?.scalesWith.map(({ name }) => name).join(", ") || "none"}.`;
  return `<div class="weapon-slot ${weapon.evolved ? "evolved" : ""}" data-weapon-id="${weaponId}" data-cooldown-max="${telemetry.cooldownSeconds}" data-cadence-kind="${telemetry.cadenceKind || "cooldown"}" tabindex="0" aria-label="${escapeHTML(weapon.evolved ? data.evolve : data.name)} weapon details"><img src="${icon}" alt=""><i class="weapon-cooldown-sweep" aria-hidden="true"></i><b class="weapon-cooldown-seconds" aria-hidden="true"></b><small>${weapon.evolved ? "E" : weapon.level}</small><div class="weapon-tooltip"><span>${weapon.evolved ? "Evolved weapon" : `Level ${weapon.level}`}</span><strong>${escapeHTML(weapon.evolved ? data.evolve : data.name)}</strong><p>${escapeHTML(data.copy || spec.tagline)}</p><dl><div><dt>Damage</dt><dd>${telemetry.damage}</dd></div><div><dt>${evolution ? "Cadence" : "Cooldown"}</dt><dd>${telemetry.interval}</dd></div><div><dt>Projectiles</dt><dd>${telemetry.projectiles}</dd></div>${signatureRows}<div><dt>Impact</dt><dd>${escapeHTML(impactSummary(impact))}</dd></div><div><dt>Run damage</dt><dd data-run-damage>${statNumber(damage)}</dd></div><div><dt>DPS</dt><dd data-run-dps>${dps.toFixed(1)}</dd></div></dl><em>${escapeHTML(evolution ? telemetry.secondary : weapon.evolved ? impact?.behavior || telemetry.note : impact?.evolvedDifference || telemetry.note)}</em><small>Evolution: ${escapeHTML(evolutionCopy)}</small></div></div>`;
}

function currentAffectedSources(passiveId, player, gameLevel = 0) {
  return getPassiveAffectedSources(passiveId, { specialistId: player?.specialist, weapons: player?.weapons || {} }).filter((source) => {
    if (source.id === "ability:e") return gameLevel >= 3;
    if (source.id === "ability:r") return gameLevel >= 6;
    return true;
  });
}

function passiveSlotMarkup(passiveId, rank, player, gameLevel = 0) {
  const passive = PASSIVES[passiveId];
  if (!passive) return "";
  const level = Math.max(1, Math.floor(Number(rank) || 1));
  const affected = currentAffectedSources(passiveId, player, gameLevel);
  const buildcraft = passiveBuildcraft(passiveId);
  const impact = `${affected.length ? `Affects now: ${affected.map((source) => source.name).join(", ")}.` : passiveId === "projectiles" ? "No equipped attacks can gain another projectile yet." : "Improves a core specialist system rather than a specific attack."} Trait: ${buildcraft?.trait.category.replaceAll("-", " ") || "support"}. Evolution pairs: ${buildcraft?.pairedSources.map(({ name }) => name).join(", ") || "none"}.`;
  return `<div class="passive-slot" style="--passive-color:${escapeHTML(passive.color)}" tabindex="0" aria-label="${escapeHTML(passive.name)}, passive rank ${level} of ${passive.max}"><span><img src="${passive.icon}" alt=""></span><small>${level}</small><div class="weapon-tooltip"><span>Passive upgrade</span><strong>${escapeHTML(passive.name)}</strong><p>${escapeHTML(passive.amount)} per rank. ${passive.id === "projectiles" ? "Applies only to attacks marked as multishot-compatible." : "Compatibility comes from the authoritative combat model."}</p><dl><div><dt>Current rank</dt><dd>${level} / ${passive.max}</dd></div><div><dt>Each rank</dt><dd>${escapeHTML(passive.amount)}</dd></div></dl><em>${escapeHTML(impact)}</em></div></div>`;
}

function updateCooldownSlot(slot, remaining, maximum, unlocked, unlockLevel) {
  const node = $(`${slot}-slot`), sweep = $(`${slot}-cooldown`), seconds = $(`${slot}-cooldown-seconds`);
  const cooldown = Math.max(0, Number(remaining) || 0);
  node.classList.toggle("locked", !unlocked);
  sweep.style.setProperty("--cooldown-sweep", `${unlocked ? clamp(cooldown / Math.max(.01, maximum) * 100, 0, 100) : 100}%`);
  seconds.textContent = unlocked && cooldown > .04 ? `${cooldown < 10 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s` : "";
  node.setAttribute("aria-label", !unlocked ? `Unlocks at level ${unlockLevel}` : cooldown > .04 ? `${cooldown.toFixed(1)} seconds remaining` : "Ready");
  node.setAttribute("aria-disabled", String(!unlocked || cooldown > .04));
}

const ENEMY_HEALTH_BAR_MODES = new Set(["all", "important", "off"]);

function normalizeEnemyHealthBarMode(mode) {
  if (ENEMY_HEALTH_BAR_MODES.has(mode)) return mode;
  if (mode === true || mode === "true") return "all";
  if (mode === false || mode === "false") return "off";
  return "important";
}

function syncEnemyHealthBarControls() {
  const mode = normalizeEnemyHealthBarMode(state.qualitySettings.healthBars);
  state.showEnemyHealthBars = mode !== "off";
  $("enemy-health-bars-toggle").value = mode;
  $("game-canvas").dataset.enemyHealthBars = state.showEnemyHealthBars ? "visible" : "hidden";
  $("game-canvas").dataset.enemyHealthBarMode = mode;
}

function setEnemyHealthBars(mode, persist = true) {
  applyQualitySettings({ ...state.qualitySettings, preset: "custom", healthBars: normalizeEnemyHealthBarMode(mode) }, persist);
}

const QUALITY_FIELDS = Object.freeze({
  effectsDensity: "quality-effects", shake: "quality-shake", hitFlashes: "quality-hit-flashes",
  healthBars: "quality-health-bars", flashIntensity: "quality-flash",
});

const ACCESSIBILITY_FIELD_IDS = Object.freeze({
  textScale: "accessibility-text-scale", hudScale: "accessibility-hud-scale", touchScale: "accessibility-touch-scale",
  colorVision: "accessibility-color-vision", directionalAudio: "accessibility-directional-audio",
});
const ACCESSIBILITY_ACTION_LABELS = Object.freeze({
  moveUp: "Move up", moveDown: "Move down", moveLeft: "Move left", moveRight: "Move right", active: "Active ability",
  ultimate: "Ultimate ability", autoAim: "Toggle auto-aim", ping: "Contextual ping", pause: "Pause", inspect: "Inspect field",
  report: "Open report", choice1: "Draft choice 1", choice2: "Draft choice 2", choice3: "Draft choice 3",
  reroll: "Reroll draft", banish: "Banish draft choice", skip: "Skip draft",
});

function accessibilityEnabled() { return Boolean(state.runtimeConfig?.config?.flags?.accessibilityPass); }
function effectiveAccessibilitySettings() { return accessibilityEnabled() ? state.accessibilitySettings : defaultAccessibilitySettings(systemReducedMotion); }
function effectiveQualitySettings() {
  const access = effectiveAccessibilitySettings();
  return access.reducedFlash ? { ...state.qualitySettings, hitFlashes: "off", flashIntensity: "off" } : state.qualitySettings;
}
function accessibleAudioPan(pan) {
  const mode = effectiveAccessibilitySettings().directionalAudio;
  return mode === "mono" ? 0 : mode === "enhanced" ? clamp(Number(pan || 0) * 1.45, -1, 1) : pan;
}

function renderAccessibilityControls(message = "") {
  if (!$(`accessibility-bindings`)) return;
  const enabled = accessibilityEnabled(), settings = effectiveAccessibilitySettings();
  $("accessibility-settings").hidden = !enabled;
  if (!enabled) return;
  for (const [key, id] of Object.entries(ACCESSIBILITY_FIELD_IDS)) $(id).value = String(settings[key]);
  $("accessibility-reduced-flash").checked = settings.reducedFlash;
  $("accessibility-controller").checked = settings.controller.enabled;
  $("accessibility-deadzone").value = String(settings.controller.deadzone);
  $("accessibility-bindings").innerHTML = ACCESSIBILITY_ACTIONS.map((action) => `<button type="button" data-binding-action="${action}" aria-label="Remap ${ACCESSIBILITY_ACTION_LABELS[action]}. Current key ${bindingLabel(settings.bindings[action])}"><span>${ACCESSIBILITY_ACTION_LABELS[action]}</span><kbd>${bindingLabel(settings.bindings[action])}</kbd></button>`).join("");
  const gamepad = navigator.getGamepads?.() ? [...navigator.getGamepads()].find((candidate) => candidate?.connected && candidate.mapping === "standard") : null;
  $("accessibility-controller-status").textContent = gamepad ? `${gamepad.id || "Standard gamepad"} connected.` : "No standard gamepad detected.";
  if (message) $("accessibility-status").textContent = message;
  syncControlLabels();
}

function syncControlLabels() {
  const bindings = effectiveAccessibilitySettings().bindings;
  const ariaShortcut = (code) => String(code).replace(/^Key/, "").replace(/^Digit/, "").replace("Backquote", "`").replace(/^(Shift|Control|Alt)(Left|Right)$/, "$1");
  const labels = { "e-slot": "active", "r-slot": "ultimate", "downed-support-action": "active", "touch-ping": "ping" };
  for (const [id, action] of Object.entries(labels)) {
    const node = $(id); if (!node) continue;
    node.querySelector("kbd")?.replaceChildren(bindingLabel(bindings[action]));
    node.setAttribute("aria-keyshortcuts", ariaShortcut(bindings[action]));
  }
  for (const node of document.querySelectorAll("[data-control-action]")) {
    const action = node.dataset.controlAction, label = bindingLabel(bindings[action]);
    const target = node.matches("kbd,dd") ? node : node.querySelector("kbd");
    if (target) target.textContent = label;
    node.setAttribute("aria-keyshortcuts", ariaShortcut(bindings[action]));
  }
  const movement = ["moveUp", "moveLeft", "moveDown", "moveRight"].map((action) => bindingLabel(bindings[action])).join(" ");
  for (const node of document.querySelectorAll("[data-control-movement]")) { node.querySelector("kbd").textContent = movement; node.setAttribute("aria-keyshortcuts", ["moveUp", "moveLeft", "moveDown", "moveRight"].map((action) => ariaShortcut(bindings[action])).join(" ")); }
  const choices = ["choice1", "choice2", "choice3"].map((action) => bindingLabel(bindings[action])).join(" ");
  for (const node of document.querySelectorAll("[data-control-choices]")) { node.querySelector("kbd").textContent = choices; node.setAttribute("aria-keyshortcuts", ["choice1", "choice2", "choice3"].map((action) => ariaShortcut(bindings[action])).join(" ")); }
  const crawl = $("downed-crawl-status")?.querySelector("kbd");
  if (crawl) crawl.textContent = movement;
}

function applyAccessibilitySettings(settings, persist = true, message = "Accessibility settings saved locally.") {
  state.accessibilitySettings = persist ? saveAccessibilitySettings(settings) : settings;
  const access = effectiveAccessibilitySettings(), root = document.documentElement;
  root.style.setProperty("--interface-scale", access.textScale);
  root.style.setProperty("--hud-scale", access.hudScale);
  root.style.setProperty("--touch-scale", access.touchScale);
  root.dataset.colorVision = access.colorVision;
  root.dataset.interfaceScale = String(access.textScale);
  root.dataset.reducedFlash = String(access.reducedFlash);
  root.dataset.directionalAudio = access.directionalAudio;
  renderer.setQualitySettings(effectiveQualitySettings()); replayRenderer.setQualitySettings(effectiveQualitySettings());
  renderAccessibilityControls(message);
}

function syncAccessibilityAvailability() {
  document.documentElement.dataset.accessibilityPass = String(accessibilityEnabled());
  applyAccessibilitySettings(state.accessibilitySettings, false, accessibilityEnabled() ? "Accessibility settings are local and never alter simulation or shared records." : "Accessibility controls are unavailable in this release channel.");
}

function updateAccessibilitySetting(patch) { applyAccessibilitySettings({ ...state.accessibilitySettings, ...patch }); }

function handleBindingCapture(event) {
  if (!state.accessibilityCapture) return false;
  event.preventDefault(); event.stopPropagation();
  const action = state.accessibilityCapture; state.accessibilityCapture = "";
  if (event.code === "Escape") { renderAccessibilityControls("Remapping cancelled."); return true; }
  const conflict = ACCESSIBILITY_ACTIONS.find((candidate) => candidate !== action && state.accessibilitySettings.bindings[candidate] === event.code);
  if (conflict) { renderAccessibilityControls(`${bindingLabel(event.code)} is already assigned to ${ACCESSIBILITY_ACTION_LABELS[conflict]}.`); return true; }
  applyAccessibilitySettings({ ...state.accessibilitySettings, bindings: { ...state.accessibilitySettings.bindings, [action]: event.code } }, true, `${ACCESSIBILITY_ACTION_LABELS[action]} is now ${bindingLabel(event.code)}.`);
  $(`accessibility-bindings`).querySelector(`[data-binding-action="${action}"]`)?.focus();
  return true;
}

function performMappedAction(action) {
  const upgradeOpen = !$(`upgrade-overlay`).classList.contains("hidden");
  if (upgradeOpen) {
    const choices = { choice1: 0, choice2: 1, choice3: 2 };
    if (action in choices) { $("upgrade-cards").querySelectorAll("button")[choices[action]]?.click(); return true; }
    const buttons = { reroll: "draft-reroll", banish: "draft-banish", skip: "draft-skip" };
    if (buttons[action]) { $(buttons[action]).click(); return true; }
  }
  if (action === "active") cast("e");
  else if (action === "ultimate") cast("r");
  else if (action === "autoAim") { state.input.autoAim = !state.input.autoAim; toast(state.input.autoAim ? "Auto-aim on" : "Manual aim on"); }
  else if (action === "ping") openPingWheel({ source: "keyboard" });
  else if (action === "pause") togglePause();
  else if (action === "report") openReport();
  else return false;
  return true;
}

function pollGamepadInput() {
  const settings = effectiveAccessibilitySettings();
  if (!settings.controller.enabled || !navigator.getGamepads) {
    state.input.gamepadX = 0; state.input.gamepadY = 0; state.input.gamepadButtons.clear();
    document.documentElement.dataset.controllerConnected = "false";
    return;
  }
  const gamepad = [...navigator.getGamepads()].find((candidate) => candidate?.connected && candidate.mapping === "standard");
  const sample = readStandardGamepad(gamepad, state.input.gamepadButtons, settings.controller.deadzone);
  state.input.gamepadX = sample.movement.x; state.input.gamepadY = sample.movement.y;
  if (sample.aim !== null) state.input.aim = sample.aim;
  state.input.gamepadButtons = new Set(sample.held);
  document.documentElement.dataset.controllerConnected = String(sample.connected);
  const status = $("accessibility-controller-status");
  const statusCopy = sample.connected ? `${gamepad.id || "Standard gamepad"} connected.` : "No standard gamepad detected.";
  if (status && status.textContent !== statusCopy) status.textContent = statusCopy;
  state.inspectActive = sample.held.includes(4) || state.input.keys.has(settings.bindings.inspect);
  setTacticalIntel(state.inspectActive);
  const draftOpen = !$(`upgrade-overlay`).classList.contains("hidden");
  if (draftOpen) {
    const draftButtons = { 0: "choice1", 2: "choice2", 3: "choice3", 4: "reroll", 5: "banish", 8: "skip" };
    for (const button of sample.pressed) if (draftButtons[button]) performMappedAction(draftButtons[button]);
  } else {
    if (sample.pressed.includes(2)) openPingWheel({ source: "gamepad" });
    if (state.pingWheel?.source === "gamepad" && !sample.held.includes(2)) closePingWheel({ commit: true });
    for (const button of sample.pressed) if (GAMEPAD_ACTIONS[button] && !["inspect", "ping"].includes(GAMEPAD_ACTIONS[button])) performMappedAction(GAMEPAD_ACTIONS[button]);
  }
}

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
  renderer.setQualitySettings(effectiveQualitySettings()); replayRenderer.setQualitySettings(effectiveQualitySettings());
  state.audioMixer?.setDensity(state.qualitySettings.effectsDensity);
  syncEnemyHealthBarControls();
  renderQualityControls();
}

function openQualitySettings() {
  renderQualityControls();
  renderAccessibilityControls();
  $("quality-dialog").showModal();
  requestAnimationFrame(() => $("quality-preset").focus());
}

function updateSoundState(game) {
  const now = performance.now();
  const local = game.players?.find((player) => player.id === state.clientId) || game.players?.[0];
  const timerActivations = weaponTimerActivations(state.soundState.weaponTimers, game.players);
  state.soundState.weaponTimers = timerActivations.timers;
  const fieldActivation = [...timerActivations.activated].reverse().find(({ player }) => player.id === local?.id) || timerActivations.activated.at(-1);
  if (fieldActivation && now - state.soundState.lastShot > 125) {
    state.soundState.lastShot = now;
    sfx(`weapon:universal-${fieldActivation.weaponId}`, { pan: accessibleAudioPan(spatialAudioPan(fieldActivation.player, local)) });
  }
  const projectiles = newEntities(state.soundState.projectileIds, game.projectiles);
  state.soundState.projectileIds = projectiles.ids;
  if (projectiles.added.length && now - state.soundState.lastShot > 125) {
    const projectile = [...projectiles.added].reverse().find((candidate) => candidate.owner === local?.id) || projectiles.added.at(-1);
    const grammar = resolveEntityImpact(projectile, game);
    state.soundState.lastShot = now;
    sfx(grammar ? weaponAudioCueName(grammar) : "shot", { pan: accessibleAudioPan(spatialAudioPan(projectile, local)) });
  }
  const effects = newEntities(state.soundState.effectIds, game.effects);
  state.soundState.effectIds = effects.ids;
  const hostileEffect = effects.added.find((effect) => effect.owner === "enemy" && effect.kind === "danger");
  if (hostileEffect && now - state.soundState.lastEnemy > 180) {
    state.soundState.lastEnemy = now;
    sfx("enemy:bomber", { pan: accessibleAudioPan(spatialAudioPan(hostileEffect, local)) });
  } else if (!projectiles.added.length && effects.added.length && now - state.soundState.lastShot > 140) {
    const effect = [...effects.added].reverse().find((candidate) => resolveEntityImpact(candidate, game));
    const grammar = resolveEntityImpact(effect, game);
    if (grammar) { state.soundState.lastShot = now; sfx(weaponAudioCueName(grammar), { pan: accessibleAudioPan(spatialAudioPan(effect, local)) }); }
  }
  const hostile = newEntities(state.soundState.hostileIds, game.hostile);
  state.soundState.hostileIds = hostile.ids;
  if (hostile.added.length && now - state.soundState.lastEnemy > 130) {
    const projectile = hostile.added.at(-1);
    state.soundState.lastEnemy = now;
    sfx(enemyAudioCueName(projectile, game.enemies), { pan: accessibleAudioPan(spatialAudioPan(projectile, local)) });
  }
  const attackers = newEntities(state.soundState.attackingIds, (game.enemies || []).filter((enemy) => Number(enemy.attackFlash) > .04));
  state.soundState.attackingIds = attackers.ids;
  if (attackers.added.length && now - state.soundState.lastEnemy > 180) {
    const attacker = attackers.added.at(-1);
    state.soundState.lastEnemy = now;
    sfx(enemyAudioCueName(attacker, game.enemies), { pan: accessibleAudioPan(spatialAudioPan(attacker, local)) });
  }
  if (game.kills > state.soundState.kills && now - state.soundState.lastKill > 100) { state.soundState.lastKill = now; sfx("kill"); }
  if (game.level > state.soundState.level) sfx("level");
  if ((local?.damageTaken || 0) > state.soundState.damageTaken) sfx("hurt");
  if ((local?.xpCollected || 0) > state.soundState.xpCollected && now - state.soundState.lastXP > 170) { state.soundState.lastXP = now; sfx("xp"); }
  state.soundState.kills = game.kills || 0;
  state.soundState.level = game.level || 1;
  state.soundState.damageTaken = local?.damageTaken || 0;
  state.soundState.xpCollected = local?.xpCollected || 0;
}

function updateWeaponCooldowns(player, game) {
  for (const slot of $("weapon-hud").querySelectorAll(".weapon-slot")) {
    const weaponId = slot.dataset.weaponId;
    const usesFlow = weaponId === "signature" && slot.dataset.cadenceKind === "flow";
    const maximum = usesFlow ? 100 : Math.max(.01, Number(slot.dataset.cooldownMax || 0));
    const remaining = usesFlow ? Math.max(0, 100 - Number(player.flow || 0)) : Math.max(0, Number(player.weaponTimers?.[weaponId] || 0));
    slot.querySelector(".weapon-cooldown-sweep")?.style.setProperty("--weapon-cooldown", `${clamp(remaining / maximum * 100, 0, 100)}%`);
    const seconds = slot.querySelector(".weapon-cooldown-seconds");
    if (seconds) seconds.textContent = usesFlow ? `${Math.round(100 - remaining)} Flow` : remaining > .08 ? `${remaining < 10 ? remaining.toFixed(1) : Math.ceil(remaining)}s` : "";
    const damage = Number(player.damageBySource?.[weaponId] || 0);
    const runDamage = slot.querySelector("[data-run-damage]"), runDps = slot.querySelector("[data-run-dps]");
    if (runDamage) runDamage.textContent = statNumber(damage);
    if (runDps) runDps.textContent = (damage / elapsedRunSeconds(game)).toFixed(1);
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
    ["speedBuff", "Speed surge", getThemeAsset("archive.boons.cruiseControl"), 15, "Massively increases movement speed."],
    ["hasteBuff", "Rapid fire", getThemeAsset("archive.boons.ultraRapidFire"), 15, "Massively increases weapon and ability haste."],
    ["firedUpBuff", "Fired Up", getThemeAsset("archive.boons.firedUp"), 15, "Strong fireballs hunt the nearest enemy."],
    ["healthbackBuff", "Healthback", getThemeAsset("archive.boons.healthback"), 15, "Every takedown restores a little health."],
    ["stopwavesBuff", "Stopwaves", getThemeAsset("archive.boons.stopwaves"), 15, "Periodic shockwaves freeze nearby enemies."],
    ["frenzy", "Frenzy", SPECIALISTS.fang.signature.icon, 6, "Movement and attacks accelerate during the hunt."],
    ["hotTime", "Hot streak", SPECIALISTS.zuri.signature.icon, 8, "Weapon haste and movement speed surge after a kill streak."],
  ];
  const active = definitions.map(([field, name, icon, max, copy]) => ({ field, name, icon, max, copy, remaining: Number(player[field] || 0) })).filter((buff) => buff.remaining > .04);
  reconcileActiveBuffs($("active-buffs-hud"), active);
}

function updateSynergyHUD(game) {
  const root = $("synergy-hud"), synergy = game.synergyState;
  if (!root || !synergy?.enabled || game.players.length < 2) { if (root) reconcileActiveSynergies(root, []); return; }
  const definition = (id) => SQUAD_SYNERGY_REGISTRY.entries.find((entry) => entry.id === id);
  const contributors = (slots) => [...new Set(slots)].sort((a, b) => a - b).map((slot) => ({
    slot, name: game.players.find((player) => player.replaySlot === slot)?.name || "Specialist",
  }));
  const entries = [];
  const breachTargets = synergy.breachTargets.filter((target) => target.expiresTick >= game.tick && target.cooldownUntilTick <= game.tick);
  if (breachTargets.length) {
    const item = definition("breach-window"), remaining = Math.max(...breachTargets.map((target) => target.expiresTick - game.tick));
    entries.push({ id: item.id, name: item.name, glyph: item.presentation.glyph, status: `${(remaining / 60).toFixed(1)}s · ${breachTargets.length} marked`, copy: item.presentation.copy, contributors: contributors(breachTargets.map(({ setupSlot }) => setupSlot)), progress: remaining / item.timing.windowTicks });
  }
  if (synergy.ultimateWindow.length) {
    const item = definition("ultimate-resonance"), latest = Math.max(...synergy.ultimateWindow.map(({ tick }) => tick)), remaining = Math.max(0, latest + item.timing.windowTicks - game.tick);
    if (remaining > 0) entries.push({ id: item.id, name: item.name, glyph: item.presentation.glyph, status: `${(remaining / 60).toFixed(1)}s · chain armed`, copy: item.presentation.copy, contributors: contributors(synergy.ultimateWindow.map(({ slot }) => slot)), progress: remaining / item.timing.windowTicks });
  }
  const links = synergy.formationLinks.filter(({ active }) => active);
  if (links.length) {
    const item = definition("moving-screen");
    entries.push({ id: item.id, name: item.name, glyph: item.presentation.glyph, status: `${links.length} active link${links.length === 1 ? "" : "s"} · 15% impact guard`, copy: item.presentation.copy, contributors: contributors(links.flatMap(({ a, b }) => [a, b])), progress: 1 });
  }
  reconcileActiveSynergies(root, entries);
}

function updateDamageLedger(player, game) {
  const sources = Object.entries(player.damageBySource || {}).filter(([, damage]) => damage > 0).sort((a, b) => b[1] - a[1]);
  const key = JSON.stringify(sources.map(([id, damage]) => [id, Math.round(damage)]));
  if (key === state.lastDamageLedgerKey) return; state.lastDamageLedgerKey = key;
  const seconds = elapsedRunSeconds(game), panel = $("damage-ledger"), content = $("damage-ledger-content");
  panel.classList.toggle("no-data", sources.length === 0);
  content.innerHTML = sources.map(([id, damage], index) => `<div class="${index === 0 ? "leader" : ""}"><span>${escapeHTML(sourceName(id, player))}</span><b>${statNumber(damage)}</b><small>${(damage / seconds).toFixed(1)} DPS</small></div>`).join("");
  fitDamageLedgerToContents();
}

function healthDividerMarkup(layout) {
  return layout.dividers.map((divider) => `<i class="health-divider${divider.major ? " major" : ""}" style="left:${(divider.position * 100).toFixed(4)}%"></i>`).join("");
}

function saveDamageLedgerLayout() {
  try { localStorage.setItem(DAMAGE_LEDGER_LAYOUT_KEY, JSON.stringify(state.damageLedgerLayout)); } catch { /* Storage is optional. */ }
}

function damageLedgerIsMobile() { return matchMedia("(max-width: 650px)").matches; }

function fitDamageLedgerToContents() {
  const panel = $("damage-ledger"), layout = state.damageLedgerLayout;
  if (!panel || layout.userSized || layout.collapsed || damageLedgerIsMobile() || panel.classList.contains("no-data")) return;
  const bounds = panel.parentElement.getBoundingClientRect();
  const rowsHeight = [...$("damage-ledger-content").children].reduce((height, row) => height + row.getBoundingClientRect().height, 0);
  layout.height = clamp($("damage-ledger-handle").getBoundingClientRect().height + rowsHeight + 14, 110, Math.max(110, bounds.height - 96));
  applyDamageLedgerLayout();
}

function clampDamageLedgerLayout() {
  const panel = $("damage-ledger"), bounds = panel.parentElement.getBoundingClientRect(), layout = state.damageLedgerLayout;
  const maxWidth = Math.max(210, Math.min(440, bounds.width - 16));
  const maxHeight = Math.max(110, bounds.height - 96);
  layout.width = clamp(Number(layout.width) || DAMAGE_LEDGER_DEFAULT.width, 210, maxWidth);
  layout.height = clamp(Number(layout.height) || DAMAGE_LEDGER_DEFAULT.height, 110, maxHeight);
  layout.x = clamp(Number(layout.x) || 0, 8, Math.max(8, bounds.width - layout.width - 8));
  layout.y = clamp(Number(layout.y) || 0, DAMAGE_LEDGER_DEFAULT.y, Math.max(DAMAGE_LEDGER_DEFAULT.y, bounds.height - (layout.collapsed ? 40 : layout.height) - 24));
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
  let drag = null, applying = false, resizeArmed = false;
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
    if (resize) state.damageLedgerLayout.userSized = true;
    event.preventDefault(); event.stopPropagation(); applyDamageLedgerLayout({ persist: true });
  });
  panel.addEventListener("keydown", (event) => event.stopPropagation());
  panel.addEventListener("keyup", (event) => event.stopPropagation());
  panel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeArmed = !damageLedgerIsMobile() && event.button === 0 && event.clientX >= rect.right - 20 && event.clientY >= rect.bottom - 20;
  });
  window.addEventListener("pointerup", () => {
    if (!resizeArmed) return;
    resizeArmed = false; state.damageLedgerLayout.userSized = true; saveDamageLedgerLayout();
  });
  collapseButton.addEventListener("click", () => {
    state.damageLedgerLayout.collapsed = !state.damageLedgerLayout.collapsed;
    applyDamageLedgerLayout({ persist: true });
    if (!state.damageLedgerLayout.collapsed) fitDamageLedgerToContents();
  });
  $("damage-ledger-reset").addEventListener("click", () => {
    state.damageLedgerLayout = { ...DAMAGE_LEDGER_DEFAULT, collapsed: state.damageLedgerLayout.collapsed };
    fitDamageLedgerToContents(); applyDamageLedgerLayout({ persist: true }); handle.focus();
  });
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
  if (next) closePingWheel({ restoreFocus: false });
  $("pause-overlay").classList.toggle("hidden", !next);
}

function abandon() {
  if (state.isHost && state.sim) { state.replayRecorder?.recordAbandon(state.sim.tick); state.sim.lose("The squad withdrew from the breach."); }
  $("pause-overlay").classList.add("hidden");
}

function updateDownedActivity(game, player) {
  const panel = $("downed-activity"), live = $("downed-activity-live");
  if (!panel) return;
  const visible = downedActivityEnabled(game) && Boolean(player?.downed) && !player?.dead;
  panel.hidden = !visible; panel.classList.toggle("hidden", !visible);
  screens.game.classList.toggle("downed-active", visible);
  if (!visible) {
    if (panel.dataset.announcementKey) live.textContent = "";
    panel.dataset.announcementKey = "";
    return;
  }

  const activity = downedPresentation(player);
  const bleedout = Math.max(0, Number(player.downTimer) || 0), bleedoutMaximum = 10;
  const rescue = clamp(Number(player.reviveProgress) || 0, 0, activity.reviveRequired);
  const rescuePercent = clamp(rescue / activity.reviveRequired * 100, 0, 100);
  const bleedoutPercent = clamp(bleedout / bleedoutMaximum * 100, 0, 100);
  $("downed-bleedout-copy").textContent = `${bleedout.toFixed(1)}s`;
  $("downed-bleedout").style.setProperty("--downed-progress", `${bleedoutPercent}%`);
  $("downed-bleedout").setAttribute("aria-valuenow", bleedout.toFixed(1));
  $("downed-bleedout").setAttribute("aria-valuetext", `${bleedout.toFixed(1)} seconds before bleedout`);
  $("downed-revive-copy").textContent = rescue > .01 ? `${rescue.toFixed(1)} / ${activity.reviveRequired.toFixed(1)}s` : "No rescuer in range";
  $("downed-revive").style.setProperty("--downed-progress", `${rescuePercent}%`);
  $("downed-revive").setAttribute("aria-valuemax", activity.reviveRequired.toFixed(1));
  $("downed-revive").setAttribute("aria-valuenow", rescue.toFixed(1));
  $("downed-revive").setAttribute("aria-valuetext", rescue > .01 ? `${Math.round(rescuePercent)} percent revived` : "No rescuer in range");

  $("downed-crawl-status").classList.toggle("is-active", activity.crawling);
  $("downed-crawl-status").querySelector("b").textContent = activity.crawling ? "Crawling" : "Crawl to cover";
  $("downed-support-label").textContent = activity.label;
  $("downed-support-status").textContent = activity.ready ? "Ready · protects a nearby ally" : `${activity.cooldown.toFixed(1)}s cooldown`;
  const supportButton = $("downed-support-action");
  supportButton.disabled = !activity.ready; supportButton.setAttribute("aria-disabled", String(!activity.ready));
  $("downed-ping-status").querySelector("b").textContent = state.runtimeConfig.config.flags.contextualPings ? "Ping for help" : "Ping unavailable";

  updateCooldownSlot("e", activity.cooldown, activity.cooldownMax, true, 0);
  $("e-name").textContent = activity.label;
  $("e-detail-status").textContent = activity.ready ? "Ready" : `${activity.cooldown.toFixed(1)}s remaining`;
  $("e-detail-copy").textContent = "Send a weak protective pulse to a nearby standing ally. It cannot revive you or deal damage.";
  $("e-detail-cooldown").textContent = `${activity.cooldownMax.toFixed(1)}s`;
  $("r-slot").classList.add("locked"); $("r-slot").setAttribute("aria-disabled", "true");
  $("r-slot").setAttribute("aria-label", "Ultimate unavailable while downed");
  $("r-cooldown").style.setProperty("--cooldown-sweep", "100%"); $("r-cooldown-seconds").textContent = "";

  const announcementKey = `downed:${rescue > .01 ? "rescue" : "waiting"}:${activity.ready ? "support-ready" : "support-cooldown"}`;
  if (announcementKey !== panel.dataset.announcementKey) {
    panel.dataset.announcementKey = announcementKey;
    live.textContent = rescue > .01
      ? `Downed. Rescue in progress, ${Math.round(rescuePercent)} percent. Crawl with movement controls, press E for ${activity.label} when ready, or G to ping.`
      : `Downed. ${bleedout.toFixed(1)} seconds remain. Crawl with movement controls, press E for ${activity.label} when ready, or G to ping for help.`;
  }
}

function updateMutationHUD(game) {
  const target = $("mutation-hud"), mutation = game.mutationState;
  if (!target || !mutation) return;
  const definition = campaignMutationDefinition(mutation.difficulty), encounter = mutation.pending || mutation.active;
  target.classList.toggle("is-active", Boolean(encounter));
  target.classList.toggle("is-enabled", Boolean(mutation.enabled));
  if (mutation.pending) {
    const seconds = Math.max(0, Math.ceil((mutation.pending.dueTick - game.tick) / 60));
    target.innerHTML = `<span>${escapeHTML(definition.name)}</span><strong>${escapeHTML(mutation.pending.kind.toUpperCase())} INBOUND · ${seconds}s</strong><small>Clear every marked hostile for the named reward</small>`;
  } else if (mutation.active) {
    const living = (game.enemies || []).filter((enemy) => enemy.campaignMutationId === mutation.active.id && !enemy.dead).length;
    target.innerHTML = `<span>${escapeHTML(definition.name)}</span><strong>${escapeHTML(mutation.active.kind.toUpperCase())} ACTIVE · ${living} REMAIN</strong><small>Reward pays only after the complete formation is cleared</small>`;
  } else {
    target.innerHTML = `<span>${escapeHTML(definition.name)}</span><strong>${mutation.enabled ? "MUTATION READY" : "BASELINE RULES"}</strong><small>${mutation.pressureAdvanceTicks ? `${Math.round(mutation.pressureAdvanceTicks / 60)}s operation pressure` : "No active mutation encounter"}</small>`;
  }
  $("pause-mutations").innerHTML = mutationPackageMarkup(mutation.difficulty, typeof game.map === "string" ? game.map : game.map.id, { ...mutation, tick: game.tick });
}

function updateChallengeWatch(game, player) {
  const target = $("challenge-watch"), enabled = Boolean(state.runtimeConfig.config.flags.challengeAchievements);
  if (!enabled || !target || !player || !["running", "boss"].includes(game.stage)) { target?.classList.add("hidden"); return; }
  if (game.tick >= state.lastChallengeWatchTick && game.tick - state.lastChallengeWatchTick < 60) return;
  state.lastChallengeWatchTick = game.tick;
  try {
    const provisional = createSquadRunReport({ ...game, stage: "lost" }, { build: BUILD });
    const achieved = evaluateChallengeAchievements(provisional, player.replaySlot).filter((id) => !state.challengeAchievements.completed.includes(id));
    const key = achieved.join("|");
    if (key === state.lastChallengeWatchKey) return;
    state.lastChallengeWatchKey = key;
    target.classList.toggle("hidden", !achieved.length);
    if (achieved.length) target.innerHTML = `<span>Challenge condition met</span><strong>${achieved.length} pending verification</strong><small>${achieved.slice(0, 2).map((id) => escapeHTML(challengeAchievementDefinition(id)?.name || id)).join(" · ")}${achieved.length > 2 ? ` · +${achieved.length - 2} more` : ""} · complete the operation to archive</small>`;
  } catch { target.classList.add("hidden"); }
}

function updateHUD(game) {
  const player = game.players.find((p) => p.id === state.clientId) || game.players[0]; if (!player) return;
  updateSoundState(game);
  const spec = SPECIALISTS[player.specialist];
  $("game-timer").textContent = game.stage === "boss" ? "APEX" : formatTime(game.remaining);
  $("wave-label").textContent = game.stage === "boss" ? `${(typeof game.map === "string" ? MAPS[game.map] : game.map).boss} · ENRAGE ${formatTime(300 - (game.bossElapsed || 0))}` : `Wave ${String((game.wave || 0) + 1).padStart(2, "0")} · ${WAVE_NAMES[game.wave || 0]}`;
  $("timer-progress").style.width = `${game.stage === "boss" ? 100 : clamp(game.time / game.duration * 100, 0, 100)}%`;
  $("kill-count").textContent = Number(game.kills || 0).toLocaleString(); $("gold-count").textContent = Math.round(game.gold || 0).toLocaleString();
  updateMutationHUD(game);
  updateChallengeWatch(game, player);
  $("level-label").textContent = `LV ${game.level}`; $("xp-progress").style.width = `${clamp(game.teamXP / game.xpNeed * 100, 0, 100)}%`;
  $("e-name").textContent = game.level < 3 ? "Unlocks Lv 3" : spec.active[0]; $("r-name").textContent = game.level < 6 ? "Unlocks Lv 6" : spec.ultimate[0];
  updateCooldownSlot("e", player.eCd, player.eCdMax || spec.cooldownE, game.level >= 3, 3); updateCooldownSlot("r", player.rCd, player.rCdMax || spec.cooldownR, game.level >= 6, 6);
  updateAbilityDetails(player, spec, game);
  updateDownedActivity(game, player);
  $("pause-overlay").classList.toggle("hidden", !(game.paused && game.pauseReason === "manual"));
  const boss = game.enemies?.find((enemy) => enemy.boss);
  screens.game.classList.toggle("apex-active", Boolean(boss));
  $("boss-hud").classList.toggle("hidden", !boss);
  if (boss) {
    const apexContract = APEX_CONTRACTS[typeof game.map === "string" ? game.map : game.map.id], apexPhase = apexContract?.phases[boss.apexPhaseIndex || 0];
    const apexPercent = Math.round(clamp(boss.hp / boss.maxHp * 100, 0, 100));
    $("boss-name").textContent = `${(typeof game.map === "string" ? MAPS[game.map] : game.map).boss} · PHASE ${(boss.apexPhaseIndex || 0) + 1}/${apexContract?.phases.length || 2}${apexPhase ? ` · ${apexPhase.id.replaceAll("-", " ").toUpperCase()}` : ""}`;
    $("boss-health").style.width = `${apexPercent}%`;
    $("boss-hud").setAttribute("aria-valuenow", String(apexPercent));
    $("boss-hud").setAttribute("aria-valuetext", `Phase ${(boss.apexPhaseIndex || 0) + 1} of ${apexContract?.phases.length || 2}, ${apexPhase?.id.replaceAll("-", " ") || "apex"}, ${apexPercent} percent health${boss.apexActionId ? `, ${boss.apexActionId.replaceAll("-", " ")} ${boss.apexActionState}` : ""}`);
    const bossHUDKey = `${boss.id}:${boss.maxHp}`;
    if (bossHUDKey !== state.lastBossHUDKey) {
      state.lastBossHUDKey = bossHUDKey;
      $("boss-health-segments").innerHTML = healthDividerMarkup(bossHealthSegments(boss.maxHp, apexContract?.phases.slice(1).map((phase) => phase.enterHpRatio)));
    }
  } else state.lastBossHUDKey = "";
  const presenceEntries = observeSquadPresence(game), currentPresenceTick = presenceTick(game);
  const squadHUDKey = JSON.stringify(presenceEntries.map((p) => [p.replaySlot, p.id, p.name, p.specialist, p.maxHp, p.status, p.statusSinceTick]));
  if (squadHUDKey !== state.lastSquadHUDKey) {
    state.lastSquadHUDKey = squadHUDKey;
    $("squad-hud").innerHTML = presenceEntries.map((p) => {
      const spec = SPECIALISTS[p.specialist] || SPECIALISTS.zuri, status = presenceTransitionCopy(p, currentPresenceTick);
      return `<div class="squad-pill" role="listitem" data-replay-slot="${p.replaySlot}" data-connection-state="${p.status}"><img src="${spec.sprite}" alt=""><div><span>${escapeHTML(p.name)}</span><small class="squad-connection-state"${p.status === "connected" ? " hidden" : ""}><i aria-hidden="true">${status.icon}</i><b>${status.visible}</b></small><div class="mini-health"><i class="mini-health-fill"></i><b class="mini-shield-fill"></b><em class="health-dividers" aria-hidden="true">${healthDividerMarkup(playerHealthSegments(p.maxHp))}</em></div></div></div>`;
    }).join("");
  }
  [...$("squad-hud").children].forEach((pill) => {
    const p = presenceEntries.find(({ replaySlot }) => replaySlot === Number(pill.dataset.replaySlot)); if (!p) return;
    const maximum = Math.max(1, p.maxHp || 1), status = presenceTransitionCopy(p, currentPresenceTick), spec = SPECIALISTS[p.specialist]?.name || "Specialist";
    pill.querySelector(".mini-health-fill").style.width = `${clamp(p.hp / maximum * 100, 0, 100)}%`;
    pill.querySelector(".mini-shield-fill").style.width = `${clamp((p.shield || 0) / maximum * 100, 0, 100)}%`;
    const connection = pill.querySelector(".squad-connection-state"); connection.hidden = p.status === "connected";
    if (!connection.hidden) { connection.querySelector("i").textContent = status.icon; connection.querySelector("b").textContent = status.visible; }
    pill.setAttribute("aria-label", `${p.name}, ${spec}, ${p.status}${p.status === "reconnecting" ? ", seat reserved" : ""}, ${Math.round(clamp(p.hp / maximum * 100, 0, 100))} percent health`);
  });
  const weaponEntries = Object.entries(player.weapons || {});
  const weaponHUDKey = JSON.stringify({ weapons: player.weapons, passives: player.passives, maxHp: Math.round(player.maxHp), armor: Math.round(player.armor), specialist: player.specialist, hasteState: [player.hotTime > 0, player.hasteBuff > 0, player.frenzy > 0] });
  if (weaponHUDKey !== state.lastWeaponHUDKey) {
    state.lastWeaponHUDKey = weaponHUDKey;
    $("weapon-hud").innerHTML = weaponEntries.map(([weaponId, weapon]) => weaponSlotMarkup(weaponId, weapon, player, spec, game)).join("");
  }
  updateWeaponCooldowns(player, game);
  const passiveHUDKey = JSON.stringify({ passives: player.passives || {}, abilityTier: game.level >= 6 ? 2 : game.level >= 3 ? 1 : 0 });
  if (passiveHUDKey !== state.lastPassiveHUDKey) {
    state.lastPassiveHUDKey = passiveHUDKey;
    $("passive-hud").innerHTML = Object.entries(player.passives || {}).filter(([, rank]) => Number(rank) > 0).map(([passiveId, rank]) => passiveSlotMarkup(passiveId, rank, player, game.level)).join("");
  }
  updateActiveBuffs(player); updateSynergyHUD(game); updateDamageLedger(player, game);
}

function upgradeChoiceVisual(choice) {
  const icon = typeof choice.icon === "string" && choice.icon.trim() ? choice.icon : "";
  return { className: icon ? "has-image" : "", markup: icon ? `<img src="${escapeHTML(icon)}" alt="">` : escapeHTML(choice.glyph || "?") };
}

function upgradeChoiceDetails(choice, player, forecast) { return forecast?.comparisonRows || buildUpgradeComparison(choice, player); }

function buildcraftTagsMarkup(buildcraft, limit = 3) {
  if (!buildcraft) return "";
  const traits = buildcraft.traits || (buildcraft.trait ? [buildcraft.trait] : []), shown = traits.slice(0, limit), hidden = Math.max(0, traits.length - shown.length);
  return `<div class="buildcraft-tags" aria-label="Build traits">${shown.map(({ category, value, themeToken }) => `<span data-buildcraft-category="${escapeHTML(category)}" data-theme-token="${escapeHTML(themeToken)}">${escapeHTML(value)}</span>`).join("")}${hidden ? `<b aria-label="${hidden} more build traits">+${hidden}</b>` : ""}</div>`;
}

function forecastConsequencesMarkup(forecast) {
  if (!forecast) return "";
  const labels = { hp: "Health", maxHealth: "Max health", armor: "Armor", damage: "Damage", haste: "Haste", area: "Area", crit: "Crit", duration: "Duration", projectiles: "Projectiles", xp: "XP gain", pickup: "Pickup", regen: "Repair", move: "Move speed" };
  const format = (id, value) => ["damage", "area", "duration", "xp"].includes(id) ? `${Math.round(value * 100)}%` : id === "crit" ? `${Math.round(value * 100)}%` : ["pickup", "move"].includes(id) ? String(Math.round(value)) : id === "regen" ? Number(value).toFixed(2) : Number.isInteger(value) ? String(value) : Number(value).toFixed(2);
  const notes = forecast.statChanges.slice(0, 3).map(({ id, before, after }) => `${labels[id] || id}: ${format(id, before)} → ${format(id, after)}`);
  if (forecast.evolution.newlyReady.length) notes.push(`${forecast.evolution.newlyReady.map(({ sourceId }) => sourceId === "signature" ? "Signature" : WEAPONS[sourceId]?.name || sourceId).join(", ")} ready for next access card`);
  if (forecast.slots.weapons.after > forecast.slots.weapons.before) notes.push(`Weapons ${forecast.slots.weapons.before}/${forecast.slots.weapons.max} → ${forecast.slots.weapons.after}/${forecast.slots.weapons.max}`);
  if (forecast.slots.passives.after > forecast.slots.passives.before) notes.push(`Passives ${forecast.slots.passives.before}/${forecast.slots.passives.max} → ${forecast.slots.passives.after}/${forecast.slots.passives.max}`);
  notes.push(forecast.requiresReplacement ? "Choose a replacement to preview the final result" : `Squad gold +${forecast.economy.delta}`);
  return `<div class="forecast-consequences" aria-label="Draft consequences">${notes.map((note) => `<span>${escapeHTML(note)}</span>`).join("")}</div>`;
}

function draftForecastIdentity(game) {
  return game.pendingChoices ? `${game.level}:${Object.entries(game.pendingChoices).map(([id, choices]) => `${id}:${choices.map((choice) => choice.id).join(",")}`).join("|")}` : "";
}

function ensureDraftForecasts(game) {
  if (!game.pendingChoices) { state.draftForecastKey = ""; state.draftForecastKeys.clear(); state.draftForecastCache.clear(); state.replacementForecasts.clear(); return; }
  for (const player of game.players || []) {
    const choices = game.pendingChoices?.[player.id] || [], draft = player.draft || {};
    const identity = `${game.level}:${draft.round || 0}:${draft.revision || 0}:${choices.map(({ id }) => id).join(",")}`;
    if (state.draftForecastKeys.get(player.id) === identity) continue;
    state.draftForecastKeys.set(player.id, identity);
    for (const key of [...state.draftForecastCache.keys()]) if (key.startsWith(`${player.id}:`)) state.draftForecastCache.delete(key);
    for (const key of [...state.replacementForecasts.keys()]) if (key.startsWith(`${player.id}:`)) state.replacementForecasts.delete(key);
    if (game.choiceReady?.[player.id]) continue;
    for (const choice of choices) state.draftForecastCache.set(`${player.id}:${choice.id}`, forecastDraftChoice(choice, player, { gold: game.gold, gameLevel: game.level }));
  }
}

function cachedDraftForecast(playerId, choiceId) { return state.draftForecastCache.get(`${playerId}:${choiceId}`) || null; }

function upgradeComparisonMarkup(rows) {
  return rows.map(({ label, before, after, changed }) => `<div class="${changed ? "changed" : "unchanged"}"><dt>${escapeHTML(label)}</dt><dd><span>${escapeHTML(before)}</span><i aria-hidden="true">→</i><strong>${escapeHTML(after)}</strong></dd></div>`).join("");
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

function affectedLoadoutMarkup(choice, player, forecast, gameLevel = 0) {
  const [kind, passiveId] = String(choice?.id || "").split(":");
  if (kind !== "passive" || !player) return "";
  const affected = forecast?.affectedSources?.length ? forecast.affectedSources : currentAffectedSources(passiveId, player, gameLevel);
  if (!affected.length) {
    const message = passiveId === "projectiles" ? "No equipped attacks are multishot-compatible yet." : "Improves a core specialist system; no equipped attack uses it directly.";
    return `<div class="affected-loadout empty"><span>Affects now</span><p>${escapeHTML(message)}</p></div>`;
  }
  return `<div class="affected-loadout"><span>Affects now</span><div>${affected.map((source) => `<b data-source-kind="${escapeHTML(source.kind)}">${escapeHTML(source.name)}</b>`).join("")}</div></div>`;
}

function renderUpgradeStats(player) {
  const { damage, haste, projectiles, crit, area, move, armor, pickup, regen } = playerBuildStats(player);
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

function draftRecommendationMarkersMarkup(game, target, optionIndex) {
  const draft = target?.draft;
  const entries = draft ? state.draftRecommendations.forOption(target.replaySlot, draft.round, draft.revision, optionIndex) : [];
  const markers = recommendationMarkerModel(entries, game?.players || []), names = markers.map(({ name }) => name);
  return `<div class="draft-recommendation-markers ${markers.length ? "has-recommendations" : ""}" data-recommendation-markers data-recommend-target="${target?.replaySlot ?? -1}" data-recommend-option="${optionIndex}" aria-label="${escapeHTML(names.length ? `Recommended by ${names.join(", ")}` : "No squad recommendations")}"><span aria-hidden="true">★ Squad recommends</span><div>${markers.map(({ replaySlot, name, specialist }) => `<i data-replay-slot="${replaySlot}" title="${escapeHTML(name)}"><img src="${escapeHTML(SPECIALISTS[specialist]?.sprite || SPECIALISTS.zuri.sprite)}" alt=""><b>${replaySlot + 1}</b></i>`).join("")}</div></div>`;
}

function draftRecommendationButtonMarkup(game, target, choice, optionIndex, targetReady) {
  if (!draftRecommendationInputAvailable(game) || targetReady || target.replaySlot === localReplaySlot(game)) return "";
  const localSlot = localReplaySlot(game), draft = target.draft;
  const current = state.draftRecommendations.recommendationBy(localSlot, target.replaySlot);
  const pressed = Boolean(current && current.round === draft.round && current.revision === draft.revision && current.optionIndex === optionIndex);
  return `<button class="draft-recommend-button" type="button" data-recommend-target="${target.replaySlot}" data-recommend-option="${optionIndex}" aria-pressed="${pressed}" aria-label="${escapeHTML(`${pressed ? "Remove recommendation of" : "Recommend"} ${choice.name} ${pressed ? "for" : "to"} ${target.name}`)}"><span aria-hidden="true">★</span><b>${pressed ? "Recommended" : "Recommend"}</b></button>`;
}

function bindDraftRecommendationButtons(root = $("teammate-upgrades")) {
  root?.querySelectorAll(".draft-recommend-button").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault(); event.stopPropagation(); requestDraftRecommendation(Number(button.dataset.recommendTarget), Number(button.dataset.recommendOption));
  }));
}

function renderDraftRecommendationMarkers(game = state.activeUpgradeGame) {
  if (!game || $("upgrade-overlay")?.classList.contains("hidden")) return;
  pruneDraftRecommendations(game);
  document.querySelectorAll("[data-recommendation-markers]").forEach((node) => {
    const target = recommendationPlayerBySlot(game, Number(node.dataset.recommendTarget));
    const optionIndex = Number(node.dataset.recommendOption), draft = target?.draft;
    const entries = draft ? state.draftRecommendations.forOption(target.replaySlot, draft.round, draft.revision, optionIndex) : [];
    const markers = recommendationMarkerModel(entries, game.players || []), names = markers.map(({ name }) => name);
    node.classList.toggle("has-recommendations", markers.length > 0);
    node.setAttribute("aria-label", names.length ? `Recommended by ${names.join(", ")}` : "No squad recommendations");
    const list = node.querySelector("div");
    if (list) list.innerHTML = markers.map(({ replaySlot, name, specialist }) => `<i data-replay-slot="${replaySlot}" title="${escapeHTML(name)}"><img src="${escapeHTML(SPECIALISTS[specialist]?.sprite || SPECIALISTS.zuri.sprite)}" alt=""><b>${replaySlot + 1}</b></i>`).join("");
  });
  document.querySelectorAll(".draft-recommend-button").forEach((button) => {
    const target = recommendationPlayerBySlot(game, Number(button.dataset.recommendTarget)), optionIndex = Number(button.dataset.recommendOption);
    const current = state.draftRecommendations.recommendationBy(localReplaySlot(game), target?.replaySlot), draft = target?.draft;
    const pressed = Boolean(current && draft && current.round === draft.round && current.revision === draft.revision && current.optionIndex === optionIndex);
    button.setAttribute("aria-pressed", String(pressed)); button.querySelector("b").textContent = pressed ? "Recommended" : "Recommend";
    const choice = target ? game.pendingChoices?.[target.id]?.[optionIndex] : null;
    if (choice && target) button.setAttribute("aria-label", `${pressed ? "Remove recommendation of" : "Recommend"} ${choice.name} ${pressed ? "for" : "to"} ${target.name}`);
  });
}

function updateUpgrade(game) {
  state.activeUpgradeGame = game;
  const pending = game.pendingChoices?.[state.clientId];
  if (!pending) { if (pruneDraftRecommendations(game) && state.isHost) sendDraftRecommendationSync(); $("upgrade-overlay").classList.add("hidden"); state.lastUpgradeKey = ""; ensureDraftForecasts(game); return; }
  closePingWheel({ restoreFocus: false });
  ensureDraftForecasts(game);
  $("upgrade-overlay").classList.remove("hidden");
  const ready = Boolean(game.choiceReady?.[state.clientId]);
  const selectedDecision = game.selectedChoices?.[state.clientId] || "", selectedId = selectedBaseChoiceId(selectedDecision);
  const key = `${game.level}:${JSON.stringify(game.choiceReady)}:${JSON.stringify(game.selectedChoices)}:${JSON.stringify(game.players.map(({ id, draft }) => [id, draft]))}:${state.draftBanishMode}:${state.draftSkipArmed}:${state.replacementChoiceId}:${Object.entries(game.pendingChoices || {}).map(([id, choices]) => `${id}:${choices.map((choice) => choice.id).join(",")}`).join("|")}`;
  if (key === state.lastUpgradeKey) return; state.lastUpgradeKey = key;
  const localPlayer = game.players.find((player) => player.id === state.clientId);
  renderUpgradeStats(localPlayer);
  $("upgrade-local-name").textContent = localPlayer?.name || callsign();
  $("upgrade-local-status").textContent = ready ? "Locked" : "Choosing";
  const draft = localPlayer?.draft || {};
  $("draft-rerolls").textContent = Number(draft.rerolls || 0); $("draft-banishes").textContent = Number(draft.banishes || 0); $("draft-skips").textContent = Number(draft.skips || 0);
  const replacementActive = Boolean(state.replacementChoiceId);
  $("draft-reroll").disabled = ready || replacementActive || Number(draft.rerolls || 0) < 1;
  $("draft-banish").disabled = ready || replacementActive || Number(draft.banishes || 0) < 1;
  $("draft-skip").disabled = ready || replacementActive || Number(draft.skips || 0) < 1;
  $("draft-banish").setAttribute("aria-pressed", String(state.draftBanishMode));
  $("draft-skip").querySelector("span").textContent = state.draftSkipArmed ? `Confirm skip · +${BALANCE.core.draft.skipGold} gold` : `Skip · +${BALANCE.core.draft.skipGold} gold`;
  $("upgrade-cards").innerHTML = pending.map((choice, index) => {
    const selected = selectedId === choice.id, passed = ready && !selected;
    const visual = upgradeChoiceVisual(choice);
    const forecast = cachedDraftForecast(localPlayer.id, choice.id), details = upgradeChoiceDetails(choice, localPlayer, forecast);
    const pair = evolutionPair(choice, localPlayer);
    const target = choice.id.split(":")[1], buildcraft = forecast?.tags || (choice.kind === "weapon" ? sourceBuildcraft(target, { specialistId: localPlayer.specialist }) : choice.kind === "passive" ? passiveBuildcraft(target) : null);
    const needsReplacement = replacementRequired(choice, localPlayer);
    return `<button class="upgrade-card ${pair ? "evolution-ready" : ""} ${needsReplacement ? "replacement-required" : ""} ${selected ? "selected" : ""} ${passed ? "passed" : ""}" type="button" data-choice="${escapeHTML(choice.id)}" ${ready ? `aria-disabled="true"` : ""}><span class="card-type">${selected ? "Locked choice" : needsReplacement ? "Replacement required" : escapeHTML(choice.kind)}</span><kbd class="choice-key">${index + 1}</kbd><div class="card-icon ${visual.className}">${visual.markup}</div><h3>${escapeHTML(choice.name)}</h3>${buildcraftTagsMarkup(buildcraft)}<p>${escapeHTML(choice.copy)}</p>${evolutionPairMarkup(pair)}<dl class="card-stats">${upgradeComparisonMarkup(details)}</dl>${forecastConsequencesMarkup(forecast)}${affectedLoadoutMarkup(choice, localPlayer, forecast, game.level)}${draftRecommendationMarkersMarkup(game, localPlayer, index)}<div class="level-pips">${Array.from({ length: choice.max }, (_, i) => `<i class="${i < choice.level ? "on" : ""}"></i>`).join("")}</div></button>`;
  }).join("");
  if (!ready) $("upgrade-cards").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseUpgrade(button.dataset.choice)));

  const teammates = game.players.filter((player) => player.id !== state.clientId);
  $("teammate-upgrades").classList.toggle("hidden", teammates.length === 0);
  $("teammate-upgrades").parentElement.classList.toggle("solo", teammates.length === 0);
  $("teammate-upgrades").innerHTML = teammates.map((player) => {
    const choices = game.pendingChoices?.[player.id] || [];
    const teammateReady = Boolean(game.choiceReady?.[player.id]);
    const teammateDecision = game.selectedChoices?.[player.id] || "", teammateSelection = selectedBaseChoiceId(teammateDecision);
    return `<section class="teammate-draft ${teammateReady ? "ready" : ""}"><header><img src="${SPECIALISTS[player.specialist].sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><span>${teammateReady ? "Choice locked" : "Choosing…"}</span></div></header><div class="teammate-choice-grid">${choices.map((choice, optionIndex) => {
      const visual = upgradeChoiceVisual(choice), forecast = cachedDraftForecast(player.id, choice.id), details = upgradeChoiceDetails(choice, player, forecast), pair = evolutionPair(choice, player);
      const target = choice.id.split(":")[1], buildcraft = forecast?.tags || (choice.kind === "weapon" ? sourceBuildcraft(target, { specialistId: player.specialist }) : choice.kind === "passive" ? passiveBuildcraft(target) : null);
      const replacedId = teammateDecision.startsWith("replace:") && choice.id === teammateSelection ? teammateDecision.split(":")[3] : "";
      const replacedName = replacedId ? teammateDecision.split(":")[1] === "passive" ? PASSIVES[replacedId]?.name || replacedId : WEAPONS[replacedId]?.name || replacedId : "";
      return `<div class="teammate-choice ${pair ? "evolution-ready" : ""} ${choice.id === teammateSelection ? "selected" : ""} ${teammateReady && choice.id !== teammateSelection ? "passed" : ""}" tabindex="0"><i class="${visual.className}">${visual.markup}</i><b>${escapeHTML(choice.name)}</b>${buildcraftTagsMarkup(buildcraft, 2)}<small>${escapeHTML(choice.kind)} · ${choice.level}/${choice.max}${replacedName ? ` · replaces ${escapeHTML(replacedName)}` : ""}</small>${draftRecommendationMarkersMarkup(game, player, optionIndex)}${draftRecommendationButtonMarkup(game, player, choice, optionIndex, teammateReady)}<div class="teammate-choice-tooltip"><span>${escapeHTML(choice.kind)} · level ${choice.level}/${choice.max}</span><strong>${escapeHTML(choice.name)}</strong><p>${escapeHTML(choice.copy)}</p>${evolutionPairMarkup(pair)}<dl>${upgradeComparisonMarkup(details)}</dl>${forecastConsequencesMarkup(forecast)}</div></div>`;
    }).join("")}</div></section>`;
  }).join("");
  bindDraftRecommendationButtons();

  const waiting = game.players.filter((player) => !game.choiceReady?.[player.id]).map((player) => player.id === state.clientId ? "you" : player.name);
  const picked = pending.find((choice) => choice.id === selectedId);
  const pickedName = selectedDecision === "draft:skip" ? `Skipped · +${BALANCE.core.draft.skipGold} gold` : picked?.name || "Upgrade";
  $("upgrade-wait").textContent = ready ? `${pickedName} locked. Waiting on ${waiting.join(", ") || "the squad"}.` : state.draftBanishMode ? "Banish mode: press 1, 2, or 3 to remove that option from this run. Press Escape to cancel." : "Press 1, 2, or 3 to pick. Use 4 to reroll, 5 to banish, or 0 twice to skip.";
  renderReplacementTray(game, localPlayer);
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

function setTacticalIntel(active) { $("game-screen")?.classList.toggle("tactical-intel", Boolean(active)); }

function hideInspectPanel() { renderer.clearInspection(); $("inspect-panel").classList.add("hidden"); }

function inspectCanvasAt(pointer) {
  if (state.screen !== "game" || !pointer?.shiftKey) { hideInspectPanel(); return; }
  const game = state.isHost ? state.sim : state.snapshot; if (!game) { hideInspectPanel(); return; }
  const detail = renderer.inspectAt(pointer.clientX, pointer.clientY, game);
  if (!detail) { hideInspectPanel(); return; }
  showInspectPanel({ ...detail, x: pointer.clientX, y: pointer.clientY });
}

window.LastlightInspect = Object.freeze({ show: showInspectPanel, hide: hideInspectPanel });

function currentDraftContext() {
  const game = state.activeUpgradeGame || (state.isHost ? state.sim : state.snapshot);
  const player = game?.players?.find(({ id }) => id === state.clientId);
  return { game, player, draft: player?.draft || null };
}

function performDraftAction(action) {
  if (state.authorityState !== "active") return { accepted: false, reason: "authority_hold" };
  const { draft } = currentDraftContext();
  if (!draft) return { accepted: false, reason: "no_draft" };
  const message = { ...action, round: draft.round, revision: draft.revision };
  const result = state.isHost ? recordHostDraftAction(state.clientId, message) : (send(createDraftActionMessage({ ...message, action: message.type }, state.authorityEpoch)), { accepted: true, pending: true });
  if (result?.accepted) {
    sfx(action.type === "skip" ? "reward" : "select");
    state.draftBanishMode = false; state.draftSkipArmed = false;
    if (action.type === "replace") closeReplacement({ focus: false });
    state.lastUpgradeKey = "";
    $("draft-status").textContent = action.type === "reroll" ? "Upgrade choices rerolled." : action.type === "banish" ? "Upgrade banished for this run." : action.type === "skip" ? `Upgrade skipped for ${BALANCE.core.draft.skipGold} squad gold.` : action.type === "replace" ? "Loadout replacement locked." : "Upgrade locked.";
  }
  return result;
}

function chooseUpgrade(choiceId) {
  const { game, player } = currentDraftContext();
  const choice = game?.pendingChoices?.[state.clientId]?.find(({ id }) => id === choiceId);
  if (!choice || !player || game.choiceReady?.[state.clientId]) return;
  if (state.draftBanishMode) { performDraftAction({ type: "banish", choiceId }); return; }
  if (replacementRequired(choice, player)) {
    state.replacementChoiceId = choiceId; state.lastUpgradeKey = ""; updateUpgrade(game);
    requestAnimationFrame(() => $("replacement-tray").querySelector("button[data-replacement]")?.focus());
    return;
  }
  performDraftAction({ type: "pick", choiceId });
}

function processEvents(events) {
  for (const event of events) {
    if (event.seq <= state.lastEventSeq) continue; state.lastEventSeq = event.seq;
    if (event.type === "cast") continue;
    if (event.type === "signature-evolution-proc" || event.type === "weapon-evolution-proc") continue;
    if (event.type === "synergy") {
      $("synergy-live-region").textContent = `${event.title}. ${event.copy || ""}`.trim();
      sfx("reward");
      continue;
    }
    if (event.type === "participation") {
      $("participation-live-region").textContent = `${event.title}. ${event.copy || ""}`.trim();
      sfx("reward");
      continue;
    }
    if (event.type === "discovery") {
      $("discovery-live-region").textContent = `${event.title}. ${event.copy || "Field Manual entry catalogued."}`;
    }
    if (event.type === "danger") sfx(event.apexIntent || event.apexPhase || /apex|phase|has arrived|enraged/i.test(event.title) ? "enemy:apex" : "danger");
    else if (event.type === "victory") sfx("victory");
    else if (event.type === "defeat") sfx("defeat");
    else if (event.type === "evolution") { sfx("level"); setTimeout(() => sfx("reward"), 160); }
    else if (event.type === "upgrade" || event.type === "boon" || event.type === "discovery") sfx("reward");
    else sfx("objective");
    showBanner(event.title, event.copy, event.type);
  }
}

function showBanner(title, copy, type) {
  const banner = $("objective-banner"); banner.dataset.type = type; banner.querySelector("span").textContent = type === "danger" ? "THREAT DETECTED" : type === "boon" ? "SQUAD BOOST" : type === "upgrade" ? "SYSTEM UPGRADE" : type === "evolution" ? "WEAPON EVOLVED" : type === "discovery" ? "FIELD MANUAL UPDATED" : "NEW DIRECTIVE";
  banner.querySelector("strong").textContent = `${title}${copy ? ` · ${copy}` : ""}`;
  clearTimeout(state.bannerTimer); clearTimeout(state.bannerExitTimer);
  banner.classList.remove("hidden", "is-visible", "is-exiting");
  void banner.offsetWidth;
  banner.classList.add("is-visible");
  state.bannerTimer = setTimeout(() => {
    banner.classList.remove("is-visible"); banner.classList.add("is-exiting");
    const exitDuration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    state.bannerExitTimer = setTimeout(() => { banner.classList.add("hidden"); banner.classList.remove("is-exiting"); }, exitDuration);
  }, type === "evolution" ? 5600 : type === "danger" ? 4500 : 3800);
}

function scheduleResult(game) {
  state.endShown = true; clearTimeout(state.resultTimer);
  state.resultTimer = setTimeout(() => showResult(game), 900);
}

function statNumber(value) { return Math.round(Number(value) || 0).toLocaleString(); }

function contributionCell(glyph, value, detail, label, heading) {
  const cardLabel = heading || String(label).replace(/\s+-?\d.*$/, "");
  return `<td data-label="${escapeHTML(cardLabel)}" aria-label="${escapeHTML(label)}"><span class="contribution-value"><i aria-hidden="true">${glyph}</i><b>${escapeHTML(value)}</b><small>${escapeHTML(detail)}</small></span></td>`;
}

function renderContributionTable(game) {
  const section = $("result-contribution"), participation = game.participationState;
  if (!section || !participation?.slots) { section?.classList.add("hidden"); return; }
  const bySlot = new Map(participation.slots.map((entry) => [entry.slot, entry]));
  const synergyBySlot = new Map((game.synergyState?.stats || []).map((entry) => [entry.slot, entry]));
  const playersBySlot = new Map(game.players.map((player) => [player.replaySlot, player]));
  $("result-contribution-body").innerHTML = participation.slots.map(({ slot }) => playersBySlot.get(slot) || {
    replaySlot: slot, name: "Departed specialist",
  }).map((player) => {
    const stats = bySlot.get(player.replaySlot) || {}, synergy = synergyBySlot.get(player.replaySlot) || {};
    const support = Number(stats.effectiveHealing || 0) + Number(stats.effectiveShielding || 0);
    const prevented = Number(stats.shieldDamagePrevented || 0) + Number(stats.mitigationPrevented || 0);
    const assists = Number(stats.damageAssists || 0) + Number(stats.controlAssists || 0);
    const synergyActions = Number(synergy.triggers || 0) + Number(synergy.assists || 0) + Number(synergy.ultimateChains || 0);
    const synergyImpact = Number(synergy.damage || 0) + Number(synergy.shielding || 0) + Number(synergy.mitigated || 0);
    return `<tr><th scope="row"><span>S${player.replaySlot + 1}</span>${escapeHTML(player.name)}</th>${contributionCell("+", statNumber(support), `${statNumber(stats.effectiveHealing)} heal · ${statNumber(stats.effectiveShielding)} shield`, `Support ${support}`)}${contributionCell("◇", statNumber(prevented), `${statNumber(stats.shieldDamagePrevented)} barrier · ${statNumber(stats.mitigationPrevented)} formation`, `Damage prevented ${prevented}`)}${contributionCell("A", statNumber(assists), `${statNumber(stats.damageAssists)} damage · ${statNumber(stats.controlAssists)} control`, `Assists ${assists}`)}${contributionCell("R", statNumber(stats.revives), `${(Number(stats.reviveTicks || 0) / 60).toFixed(1)}s active`, `Revives ${stats.revives || 0}`)}${contributionCell("O", statNumber(stats.objectiveCompletions), `${(Number(stats.objectivePresenceTicks || 0) / 60).toFixed(1)}s · ${statNumber(stats.objectiveMovement)}u`, `Objective completions ${stats.objectiveCompletions || 0}`)}${contributionCell("!", `${statNumber(stats.eliteParticipations)}/${statNumber(stats.apexParticipations)}`, "elite / apex", `Priority participation ${stats.eliteParticipations || 0} elite and ${stats.apexParticipations || 0} apex`)}${contributionCell("S", statNumber(synergyActions), `${statNumber(synergyImpact)} impact`, `Synergy actions ${synergyActions}`)}</tr>`;
  }).join("");
  section.classList.remove("hidden");
}

function renderScoreboard(game) {
  const seconds = elapsedRunSeconds(game);
  $("result-scoreboard-body").innerHTML = game.players.map((player) => {
    const spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
    const joinedAt = Math.max(0, Number(player.joinedAtTick || 0) / 60);
    const start = player.masteryStart === "field-kit" ? "Field kit" : "Standard issue";
    const deployment = player.joinKind === "fresh" ? `Reinforcement · ${formatTime(joinedAt)} · ${start}` : `Launch squad · ${start}`;
    return `<tr><td data-label="Specialist"><div class="result-scoreboard-player"><img src="${spec.sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><small>${spec.name}</small></div></div></td><td data-label="Deployment"><span class="result-deployment">${escapeHTML(deployment)}</span></td><td data-label="Damage">${statNumber(player.damage)}</td><td data-label="DPS">${(Number(player.damage || 0) / seconds).toFixed(1)}</td><td data-label="Kills">${statNumber(player.kills)}</td><td data-label="XP picked up">${statNumber(player.xpCollected)}</td><td data-label="Damage taken">${statNumber(player.damageTaken)}</td><td data-label="Revives">${statNumber(player.revives)}</td><td data-label="Distance">${statNumber(player.traveled)}</td><td data-label="Share"><button class="copy-scorecard" type="button" data-player-id="${player.id}">Copy card</button></td></tr>`;
  }).join("");
  $("result-scoreboard-body").querySelectorAll(".copy-scorecard").forEach((button) => button.addEventListener("click", () => copyPlayerScorecard(button.dataset.playerId)));
  renderContributionTable(game);
  const synergyStats = game.synergyState?.stats || [], bySlot = new Map(synergyStats.map((entry) => [entry.slot, entry]));
  const teamwork = [
    { id: "breach-window", fields: [["Triggers", "triggers"], ["Setup assists", "assists"], ["Bonus damage", "damage"]] },
    { id: "ultimate-resonance", fields: [["Chains", "ultimateChains"], ["Shielding", "shielding"]] },
    { id: "moving-screen", fields: [["Formation time", "formationTicks"], ["Damage prevented", "mitigated"]] },
  ].map((group) => {
    const registry = SQUAD_SYNERGY_REGISTRY.entries.find(({ id }) => id === group.id);
    const total = group.fields.reduce((sum, [, key]) => sum + synergyStats.reduce((value, entry) => value + Number(entry[key] || 0), 0), 0);
    if (total <= 0) return "";
    const rows = game.players.map((player) => {
      const stats = bySlot.get(player.replaySlot) || {};
      const values = group.fields.map(([label, key]) => `${label}: ${key === "formationTicks" ? `${(Number(stats[key] || 0) / 60).toFixed(1)}s` : statNumber(stats[key])}`).join(" · ");
      return `<li><span>S${player.replaySlot + 1} · ${escapeHTML(player.name)}</span><b>${values}</b></li>`;
    }).join("");
    return `<article class="result-synergy-card synergy-${group.id}"><header><b>${registry.presentation.glyph}</b><div><strong>${registry.name}</strong><span>${registry.category.replaceAll("-", " ")}</span></div></header><p>${registry.presentation.copy}</p><ul>${rows}</ul></article>`;
  }).filter(Boolean);
  $("result-synergies").classList.toggle("hidden", teamwork.length === 0);
  $("result-synergy-cards").innerHTML = teamwork.join("");
  $("result-damage-breakdown").innerHTML = game.players.map((player) => {
    const sources = Object.entries(player.damageBySource || {}).filter(([, damage]) => damage > 0).sort((a, b) => b[1] - a[1]);
    const displayedSources = sources.length > 6
      ? [...sources.slice(0, 5), [`Other sources (${sources.length - 5})`, sources.slice(5).reduce((sum, [, damage]) => sum + damage, 0)]]
      : sources;
    const total = Math.max(1, Number(player.damage || 0));
    return `<article><header><strong>${escapeHTML(player.name)} · damage by source</strong><span>${statNumber(player.damage)} total</span></header>${displayedSources.length ? displayedSources.map(([id, damage], index) => `<div class="${index === 0 ? "leader" : ""}"><span>${escapeHTML(id.startsWith("Other sources") ? id : sourceName(id, player))}</span><i><b style="width:${clamp(damage / total * 100, 0, 100)}%"></b></i><em>${statNumber(damage)} · ${(damage / seconds).toFixed(1)} DPS · ${Math.round(damage / total * 100)}%</em></div>`).join("") : `<p>No source data recorded.</p>`}</article>`;
  }).join("");
}

function saveCompletedRun(game) {
  const report = createSquadRunReport(game, { build: BUILD });
  if (state.resultSavedKey === report.id && state.resultReport) return state.resultReport;
  state.resultSavedKey = report.id; state.resultReport = report;
  state.runHistory = upsertRunArchive(state.runHistory, report);
  try { localStorage.setItem(RUN_ARCHIVE_STORAGE_KEY, JSON.stringify(state.runHistory)); } catch { /* Run history is optional. */ }
  return report;
}

function awardLocalMastery(report, localPlayer) {
  if (!state.runtimeConfig.config.flags.specialistMastery || !localPlayer || !report) return null;
  try {
    const result = awardSpecialistMastery(state.mastery, report, localPlayer.replaySlot);
    state.mastery = saveSpecialistMasteryState(localStorage, result.state);
    state.resultMasteryAward = result.award;
    return result.award;
  } catch (error) { captureClientError("specialist mastery award", error); return null; }
}

function renderResultMastery(award) {
  $("result-mastery").classList.toggle("hidden", !award);
  if (!award) return;
  const specialist = SPECIALISTS[award.specialist]?.name || award.specialist;
  $("result-mastery-title").textContent = `${specialist} // +${award.points} mastery`;
  const level = award.level > award.beforeLevel ? `Level ${award.level} reached.` : `Level ${award.level}.`;
  const challenge = award.challenge ? " Track challenge complete." : "";
  const unlocks = award.unlocked.length ? ` Unlocked: ${award.unlocked.map(({ kind }) => kind === "start" ? "Field kit" : kind).join(" · ")}.` : "";
  $("result-mastery-copy").textContent = `${level}${challenge}${unlocks}`;
}

function awardLocalRareDiscoveries(report) {
  if (!state.runtimeConfig.config.flags.rareDiscoveries || !report) return null;
  try {
    const result = awardRareDiscoveries(state.rareDiscoveries, report);
    state.rareDiscoveries = saveRareDiscoveryCollection(localStorage, result.state);
    state.resultDiscoveryAward = result.award;
    return result.award;
  } catch (error) { captureClientError("rare discovery award", error); return null; }
}

function renderResultRareDiscoveries(report, award) {
  const discoveries = report?.discoveries || [];
  $("result-discoveries").classList.toggle("hidden", !state.runtimeConfig.config.flags.rareDiscoveries || !discoveries.length);
  if (!discoveries.length) return;
  const newlyRevealed = new Set(award?.discovered || []);
  $("result-discoveries-title").textContent = `${discoveries.length} signal${discoveries.length === 1 ? "" : "s"} catalogued`;
  $("result-discoveries-copy").textContent = award?.discovered?.length
    ? `${award.discovered.length} new Field Manual ${award.discovered.length === 1 ? "entry" : "entries"} decrypted. Collection ${award.total}/${award.available}.`
    : `All signals were already catalogued. Collection ${state.rareDiscoveries.discovered.length}/${RARE_DISCOVERY_REGISTRY.entries.length}.`;
  $("result-discovery-list").innerHTML = discoveries.map((id) => {
    const entry = rareDiscoveryDefinition(id);
    return `<li class="${newlyRevealed.has(id) ? "new" : ""}"><span>${escapeHTML(entry?.glyph || "?")}</span><b>${escapeHTML(entry?.name || id)}</b>${newlyRevealed.has(id) ? "<em>New</em>" : ""}</li>`;
  }).join("");
}

function awardLocalChallengeAchievements(report, localPlayer = null) {
  if (!state.runtimeConfig.config.flags.challengeAchievements || !report) return null;
  try {
    const result = awardChallengeAchievements(state.challengeAchievements, report, localPlayer?.replaySlot ?? null);
    state.challengeAchievements = saveChallengeAchievementState(localStorage, result.state);
    state.resultChallengeAward = result.award;
    return result.award;
  } catch (error) { captureClientError("challenge achievement award", error); return null; }
}

function renderResultChallengeAchievements(award) {
  const completed = award?.completed || [];
  $("result-achievements").classList.toggle("hidden", !completed.length);
  if (!completed.length) return;
  $("result-achievements-title").textContent = `${completed.length} record${completed.length === 1 ? "" : "s"} completed`;
  $("result-achievements-copy").textContent = `Archive ${award.total}/${award.available}. Rewards are local, cosmetic or informational, and grant no gameplay power.`;
  $("result-achievement-list").innerHTML = completed.map((id) => {
    const item = challengeAchievementDefinition(id);
    return `<li class="new"><span>OK</span><b>${escapeHTML(item?.name || id)}</b><em>${escapeHTML(item?.reward?.name || "Complete")}</em></li>`;
  }).join("");
}

function awardLocalSeededOperation(report) {
  if (!state.runtimeConfig.config.flags.seededOperations || !report?.seededOperation) return null;
  try {
    const result = recordSeededOperationResult(state.seededOperationRecords, report);
    state.seededOperationRecords = saveSeededOperationRecords(localStorage, result.state);
    state.resultSeededOperation = result;
    renderSeededOperations();
    return result;
  } catch (error) { captureClientError("seeded operation record", error); return null; }
}

function renderResultSeededOperation(result) {
  const panel = $("result-seeded-operation"), record = result?.record;
  panel.classList.toggle("hidden", !record);
  if (!record) return;
  const operation = seededOperationFromId(record.id), improved = Boolean(result.changed);
  $("result-seeded-operation-title").textContent = improved ? `${operation.kind} record updated` : `${operation.kind} record held`;
  $("result-seeded-operation-copy").textContent = `${record.completed ? "Contract complete" : "Attempt archived"} · score ${record.best.score.toLocaleString()} · fixed configuration ${operation.configHash.toUpperCase()}. Results stay local unless you explicitly share the signed squad report.`;
  $("result-seeded-operation-list").innerHTML = `<li class="${improved ? "new" : ""}"><span>${operation.kind === "daily" ? "24H" : "7D"}</span><b>${escapeHTML(MAPS[operation.map].name)} · ${escapeHTML(DIFFICULTIES[operation.difficulty].name)}</b><em>${result.reward ? `${escapeHTML(result.reward.name)} · cosmetic only` : improved ? "New local best" : "Previous best retained"}</em></li>`;
}

function reportChallengeEvidence(report) {
  if (!state.runtimeConfig.config.flags.challengeAchievements) return [];
  try {
    const ids = new Set(evaluateChallengeAchievements(report, null));
    for (const player of report.players) for (const id of evaluateChallengeAchievements(report, player.slot)) ids.add(id);
    return [...ids].sort((left, right) => left.localeCompare(right));
  } catch { return []; }
}

function localMasteryTelemetry(player) {
  if (!player || !state.runtimeConfig.config.flags.specialistMastery) return null;
  const track = state.mastery.tracks[player.specialist];
  if (!track) return null;
  return {
    specialist: player.specialist,
    levelBand: track.level >= 5 ? "5" : track.level >= 3 ? "3-4" : "1-2",
    challengeCompletions: track.completedChallenges.length,
    milestoneUnlocks: SPECIALIST_MASTERY.tracks[player.specialist].unlocks.filter(({ level }) => level <= track.level).length,
    selectedStart: player.masteryStart === "field-kit" ? "field-kit" : "baseline",
  };
}

function archiveEnabled() { return Boolean(state.runtimeConfig.config.flags.sharedSquadRunArchive); }

function archivePlayerCard(player, elapsed) {
  const spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
  const support = Number(player.participation.effectiveHealing) + Number(player.participation.effectiveShielding);
  const prevented = Number(player.participation.shieldDamagePrevented) + Number(player.participation.mitigationPrevented);
  const assists = Number(player.participation.damageAssists) + Number(player.participation.controlAssists);
  const synergy = Number(player.synergy.triggers) + Number(player.synergy.assists) + Number(player.synergy.ultimateChains);
  const loadout = [
    ...player.weapons.map((weapon) => {
      const data = weapon.id === "signature" ? spec.signature : WEAPONS[weapon.id];
      const name = weapon.evolved ? data?.evolve : data?.name;
      return `<span><img src="${escapeHTML(data?.icon || spec.signature.icon)}" alt=""><b>${escapeHTML(name || weapon.id)}</b><em>${weapon.evolved ? "Evolved" : `L${weapon.level}`}</em></span>`;
    }),
    ...player.passives.map((passive) => `<span><img src="${escapeHTML(PASSIVES[passive.id]?.icon || "")}" alt=""><b>${escapeHTML(PASSIVES[passive.id]?.name || passive.id)}</b><em>R${passive.rank}</em></span>`),
  ].join("");
  const sources = player.damageSources.slice(0, 5).map((source) => `<li><span>${escapeHTML(sourceName(source.id, player))}</span><b>${statNumber(source.damage)}</b></li>`).join("");
  const start = player.masteryStart === "field-kit" ? "Field kit" : "Standard issue";
  const deployment = player.joinKind === "fresh" ? `Reinforcement at ${formatTime(player.joinedAtSecond)}${player.campaignEligible ? "" : " · assist only"} · ${start}` : `Launch squad · ${start}`;
  return `<article class="archive-player"><header><img src="${escapeHTML(spec.sprite)}" alt=""><div><strong>${escapeHTML(player.callsign)}</strong><span>S${player.slot + 1} · ${escapeHTML(spec.name)}</span></div><em>${escapeHTML(deployment)}</em></header><dl><div><dt>Damage</dt><dd>${statNumber(player.damage)}</dd></div><div><dt>DPS</dt><dd>${(player.damage / Math.max(1, elapsed)).toFixed(1)}</dd></div><div><dt>Kills</dt><dd>${statNumber(player.kills)}</dd></div><div><dt>XP</dt><dd>${statNumber(player.xpCollected)}</dd></div><div><dt>Taken</dt><dd>${statNumber(player.damageTaken)}</dd></div><div><dt>Revives</dt><dd>${statNumber(player.revives)}</dd></div></dl><div class="archive-loadout">${loadout}</div><div class="archive-contribution"><span>Support <b>${statNumber(support)}</b></span><span>Prevented <b>${statNumber(prevented)}</b></span><span>Assists <b>${statNumber(assists)}</b></span><span>Objectives <b>${statNumber(player.participation.objectiveCompletions)}</b></span><span>Synergy <b>${statNumber(synergy)}</b></span></div>${sources ? `<ol class="archive-sources">${sources}</ol>` : ""}</article>`;
}

function archiveEntryCard(entry, { imported = false, mode = "local" } = {}) {
  const report = entry.report, savedAt = entry.savedAt;
  const map = MAPS[report.map]?.name || report.map, difficulty = DIFFICULTIES[report.difficulty]?.name || report.difficulty;
  const saved = state.runHistory.some((candidate) => candidate.report.id === report.id);
  const date = savedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(savedAt)) : "Shared report";
  const discoverySummary = report.discoveries?.length
    ? `<p class="archive-discoveries"><strong>Rare discoveries ${report.discoveries.length}</strong> · ${report.discoveries.map((id) => escapeHTML(rareDiscoveryDefinition(id)?.name || id)).join(" · ")}</p>` : "";
  const challengeEvidence = reportChallengeEvidence(report);
  const challengeSummary = challengeEvidence.length
    ? `<p class="archive-discoveries"><strong>Challenge evidence ${challengeEvidence.length}</strong> · ${challengeEvidence.map((id) => escapeHTML(challengeAchievementDefinition(id)?.name || id)).join(" · ")}</p>` : "";
  const seededSummary = report.seededOperation
    ? `<p class="archive-discoveries"><strong>${escapeHTML(report.seededOperation.kind)} seeded operation</strong> · ${escapeHTML(report.seededOperation.id)} · configuration ${escapeHTML(report.seededOperation.configHash.toUpperCase())}</p>` : "";
  const players = `${seededSummary}${challengeSummary}${discoverySummary}${report.players.map((player) => archivePlayerCard(player, report.elapsed)).join("")}`;
  const shareActions = archiveEnabled() ? `<button type="button" data-archive-share="${report.id}">Copy anonymous link</button><button type="button" data-archive-share-named="${report.id}">Include callsigns</button>` : "";
  const saveAction = imported && !saved ? `<button type="button" data-archive-save="${report.id}">Save to this browser</button>` : "";
  const mutation = report.mutations;
  const mutationSummary = `<p class="archive-mutations"><strong>${escapeHTML(mutation.packageId)}</strong> · ${mutation.enabled ? `${mutation.clears}/${mutation.encounters} cleared · ${mutation.objectiveCompletions} objectives · ${mutation.surgeWaves} surges` : "Baseline rules"}</p>`;
  return `<details class="run-history-entry ${report.outcome === "won" ? "won" : "lost"}${imported ? " imported" : ""}"><summary><div><span>${imported ? `Shared · ${mode}` : report.outcome === "won" ? "Victory" : "Defeat"}</span><strong>${escapeHTML(map)} · ${escapeHTML(difficulty)}</strong><small>${report.players.map((player) => `${escapeHTML(player.callsign)} / ${escapeHTML(SPECIALISTS[player.specialist]?.name || player.specialist)}`).join(" · ")}</small></div><time${savedAt ? ` datetime="${escapeHTML(savedAt)}"` : ""}>${escapeHTML(date)}</time></summary><div class="archive-overview"><dl><div><dt>Time</dt><dd>${formatTime(report.elapsed)}</dd></div><div><dt>Level</dt><dd>${report.level}</dd></div><div><dt>Kills</dt><dd>${statNumber(report.squadKills)}</dd></div><div><dt>Damage</dt><dd>${statNumber(report.totals.damage)}</dd></div><div><dt>DPS</dt><dd>${(report.totals.damage / Math.max(1, report.elapsed)).toFixed(1)}</dd></div><div><dt>Gold</dt><dd>${statNumber(report.gold)}</dd></div></dl>${mutationSummary}<p>Report ${escapeHTML(report.id)} · Integrity ${escapeHTML(report.fingerprint.slice(0, 8).toUpperCase())}</p></div><div class="archive-players">${players}</div><footer>${saveAction}${shareActions}</footer></details>`;
}

function archiveReportById(id) {
  if (state.resultReport?.id === id) return state.resultReport;
  if (state.sharedRun?.report?.id === id) return state.sharedRun.report;
  return state.runHistory.find((entry) => entry.report.id === id)?.report || null;
}

async function copySquadReportLink(report, { includeCallsigns = false } = {}) {
  if (!archiveEnabled() || !report) { toast("Squad report sharing is currently disabled"); return false; }
  try {
    const url = new URL(location.href); url.search = ""; url.hash = squadRunShareFragment(report, { includeCallsigns });
    await navigator.clipboard.writeText(url.toString());
    toast(includeCallsigns ? "Named squad report link copied" : "Anonymous squad report link copied");
    return true;
  } catch (error) { captureClientError("squad report share", error); toast("Could not copy the squad report"); return false; }
}

function saveImportedRun(id) {
  const report = state.sharedRun?.report?.id === id ? state.sharedRun.report : null;
  if (!report) return;
  state.runHistory = upsertRunArchive(state.runHistory, report);
  try { localStorage.setItem(RUN_ARCHIVE_STORAGE_KEY, JSON.stringify(state.runHistory)); } catch { /* Archive remains readable in memory. */ }
  const award = awardLocalRareDiscoveries(report), challengeAward = awardLocalChallengeAchievements(report), seededResult = awardLocalSeededOperation(report);
  renderRunHistory();
  if ($("guide-dialog").open) renderGuide();
  const updates = [award?.discovered?.length ? `${award.discovered.length} discoveries decrypted` : "", challengeAward?.completed?.length ? `${challengeAward.completed.length} squad challenges completed` : "", seededResult?.changed ? `${seededResult.record.kind} local best updated` : ""].filter(Boolean).join(" · ");
  toast(updates ? `Squad report saved · ${updates}` : "Squad report saved to this browser");
}

function renderRunHistory() {
  const imported = archiveEnabled() && state.sharedRun?.report && !state.runHistory.some((entry) => entry.report.id === state.sharedRun.report.id)
    ? archiveEntryCard({ report: state.sharedRun.report, savedAt: "" }, { imported: true, mode: state.sharedRun.mode }) : "";
  const local = state.runHistory.map((entry) => archiveEntryCard(entry)).join("");
  $("run-history-list").innerHTML = imported || local ? `${imported}${local}` : `<div class="run-history-empty"><strong>No operations recorded yet.</strong><p>Completed and failed runs will be saved in this browser.</p></div>`;
  $("run-history-list").querySelectorAll("[data-archive-share]").forEach((button) => button.addEventListener("click", () => copySquadReportLink(archiveReportById(button.dataset.archiveShare))));
  $("run-history-list").querySelectorAll("[data-archive-share-named]").forEach((button) => button.addEventListener("click", () => copySquadReportLink(archiveReportById(button.dataset.archiveShareNamed), { includeCallsigns: true })));
  $("run-history-list").querySelectorAll("[data-archive-save]").forEach((button) => button.addEventListener("click", () => saveImportedRun(button.dataset.archiveSave)));
}

function openRunHistory() { renderRunHistory(); $("run-history-dialog").showModal(); }

function syncArchiveAvailability() {
  const enabled = archiveEnabled(); document.documentElement.dataset.sharedRunArchive = String(enabled);
  for (const id of ["copy-squad-report", "copy-squad-report-named"]) $(id)?.classList.toggle("hidden", !enabled);
  if (state.sharedRunError && !state.sharedRunPresented) { state.sharedRunPresented = true; setTimeout(() => toast("Shared squad report link could not be verified"), 0); }
  else if (enabled && state.sharedRun && !state.sharedRunPresented) { state.sharedRunPresented = true; setTimeout(openRunHistory, 0); }
}

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
  document.querySelectorAll("#result-screen details").forEach((details) => { details.open = false; });
  const won = game.stage === "won"; $("result-eyebrow").textContent = won ? "Operation complete" : "Signal lost";
  $("result-title").textContent = won ? "APEX NEUTRALIZED" : "THE LINE BROKE"; $("result-title").style.color = won ? "var(--cyan)" : "var(--danger)";
  $("result-copy").textContent = won ? "The line held. Final City gets another sunrise." : "Recalibrate the loadout, regroup, and breach again.";
  $("result-time").textContent = formatTime(game.time + (game.bossElapsed || 0)); $("result-kills").textContent = Number(game.kills || 0).toLocaleString(); $("result-level").textContent = game.level; $("result-gold").textContent = Math.round(game.gold || 0);
  const mapId = typeof game.map === "string" ? game.map : game.map.id;
  const difficultyId = typeof game.difficulty === "string" ? game.difficulty : game.difficulty.id;
  const mutation = game.mutationState;
  $("result-mutations").querySelector("div").innerHTML = mutationPackageMarkup(difficultyId, mapId, mutation ? { ...mutation, tick: game.tick } : null);
  const localPlayer = game.players?.find((player) => player.id === state.clientId);
  const joinEligibility = localPlayer?.joinKind === "fresh" && state.runtimeConfig.config.flags.joinInProgressNormalization
    ? campaignJoinEligibility({ activeCombatTicks: Number(localPlayer.preApexDeployedTicks || 0), preApexCombatTicks: Math.round(Number(game.duration || state.config.duration || 240) * 60) })
    : { eligible: true, requiredCombatSeconds: 0 };
  const unlocks = won && joinEligibility.eligible && !game.seededOperation ? recordVictory(mapId, difficultyId) : [];
  const ineligibleClear = won && !joinEligibility.eligible;
  $("result-unlock").classList.toggle("hidden", !unlocks.length && !ineligibleClear);
  $("result-unlock").textContent = unlocks.length ? `Campaign updated · ${unlocks.join(" · ")}` : ineligibleClear ? `Campaign clear not awarded · reinforce for at least ${Math.ceil(joinEligibility.requiredCombatSeconds)} pre-apex seconds` : "";
  if (state.isHost && game === state.sim) finalizeReplayCapture();
  $("watch-replay").classList.toggle("hidden", !state.resultReplay);
  state.resultGame = game;
  const report = saveCompletedRun(game);
  renderResultMastery(awardLocalMastery(report, localPlayer));
  const challengeAward = awardLocalChallengeAchievements(report, localPlayer);
  renderResultChallengeAchievements(challengeAward);
  renderResultSeededOperation(awardLocalSeededOperation(report));
  const discoveryAward = awardLocalRareDiscoveries(report);
  renderResultRareDiscoveries(report, discoveryAward);
  renderScoreboard(game);
  syncArchiveAvailability();
  setScreen("result");
  if (state.isHost && !state.telemetrySent && state.runtimeConfig.config.flags.runTelemetry) {
    state.telemetrySent = true;
    submitRunTelemetry(game, BUILD, {
      masteryTelemetry: localMasteryTelemetry(localPlayer),
      discoveryTelemetry: rareDiscoveryTelemetry(state.rareDiscoveries, discoveryAward?.discovered || []),
      challengeTelemetry: state.runtimeConfig.config.flags.challengeAchievements ? challengeAchievementTelemetry(state.challengeAchievements, challengeAward?.completed || []) : null,
      seededOperationTelemetry: state.runtimeConfig.config.flags.seededOperations && report ? seededOperationTelemetry(report) : null,
    }).catch((error) => console.warn("Run telemetry unavailable", error));
  }
}

async function copyReplay() {
  if (!state.resultReplay) return;
  try { await navigator.clipboard.writeText(JSON.stringify(state.resultReplay)); toast("Deterministic replay copied"); }
  catch (error) { captureClientError("replay", error); toast("Could not copy the replay"); }
}

function replayWeaponMarkup(player) {
  const spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
  const weapons = Object.entries(player.weapons || {}).map(([id, weapon]) => {
    const data = id === "signature" ? spec.signature : WEAPONS[id];
    if (!data) return "";
    const name = weapon.evolved ? data.evolve : data.name;
    return `<span title="${escapeHTML(name)}"><img src="${escapeHTML(data.icon)}" alt=""><b>${escapeHTML(name)} ${weapon.evolved ? "E" : `L${weapon.level}`}</b></span>`;
  }).join("");
  const passives = Object.entries(player.passives || {}).filter(([, rank]) => Number(rank) > 0).map(([id, rank]) => {
    const passive = PASSIVES[id]; if (!passive) return "";
    return `<span title="${escapeHTML(passive.name)}"><img src="${escapeHTML(passive.icon)}" alt=""><b>${escapeHTML(passive.name)} ${rank}</b></span>`;
  }).join("");
  return weapons + passives || `<span>No upgrades yet</span>`;
}

function renderReplayViewer(force = false) {
  const viewer = state.replayViewer; if (!viewer) return;
  const timeline = viewer.timeline, playback = timeline.state(), game = playback.simulation;
  $("replay-timeline").max = String(timeline.replay.finalTick);
  $("replay-timeline").value = String(playback.tick);
  $("replay-time").textContent = `${formatTime(playback.seconds)} / ${formatTime(playback.durationSeconds)}`;
  $("replay-play").textContent = viewer.playing ? "Pause" : playback.complete ? "Replay" : "Play";
  $("replay-play").setAttribute("aria-pressed", String(viewer.playing));
  const verification = $("replay-verification"); verification.classList.toggle("invalid", Boolean(viewer.error));
  verification.textContent = viewer.error ? "Verification failed" : playback.finalVerified ? "Final hash verified" : playback.lastVerifiedTick === null ? "Awaiting checkpoint" : `Checkpoint verified / ${formatTime(playback.lastVerifiedTick / 60)}`;
  const stage = game.stage === "boss" ? "Apex" : game.stage === "won" ? "Victory" : game.stage === "lost" ? "Defeat" : `Wave ${String((game.wave || 0) + 1).padStart(2, "0")}`;
  $("replay-stats").innerHTML = [
    ["Record time", formatTime(playback.seconds)], ["Phase", stage], ["Level", game.level || 1], ["Squad kills", statNumber(game.kills)], ["Gold", statNumber(game.gold)], ["Entities", statNumber((game.enemies?.length || 0) + (game.projectiles?.length || 0) + (game.hostile?.length || 0))],
  ].map(([label, value]) => `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("");
  const loadoutKey = JSON.stringify((game.players || []).map((player) => [player.replaySlot, player.hp, player.damage, player.kills, player.weapons, player.passives]));
  if (force || loadoutKey !== viewer.loadoutKey) {
    viewer.loadoutKey = loadoutKey;
    $("replay-loadouts").innerHTML = (game.players || []).map((player) => {
      const spec = SPECIALISTS[player.specialist] || SPECIALISTS.zuri;
      return `<article class="replay-player"><header><img src="${escapeHTML(spec.sprite)}" alt=""><div><strong>Specialist ${Number(player.replaySlot) + 1}</strong><small>${escapeHTML(spec.name)}</small></div><em>${Math.max(0, Number(player.hp || 0)).toFixed(1)} HP</em></header><dl><div><dt>Damage</dt><dd>${statNumber(player.damage)}</dd></div><div><dt>Kills</dt><dd>${statNumber(player.kills)}</dd></div><div><dt>XP</dt><dd>${statNumber(player.xpCollected)}</dd></div></dl><div class="replay-kit">${replayWeaponMarkup(player)}</div></article>`;
    }).join("") || `<p>No active specialists at this point in the record.</p>`;
  }
}

function drawReplayFrame(now) {
  const viewer = state.replayViewer;
  if (!viewer || !$("replay-dialog").open) return;
  const dt = Math.min(.05, Math.max(0, (now - viewer.lastFrame) / 1000)); viewer.lastFrame = now;
  if (viewer.playing && !viewer.error) {
    try {
      viewer.timeline.advance(dt, viewer.speed);
      if (viewer.timeline.complete) viewer.playing = false;
    } catch (error) {
      viewer.playing = false; viewer.error = error; captureClientError("replay viewer", error);
    }
  }
  const game = viewer.timeline.simulation, focus = game.players?.[0]?.id;
  replayRenderer.draw(game, focus, null, 1, dt);
  if (now - viewer.lastUiAt > 80 || viewer.lastTick !== viewer.timeline.tick) {
    viewer.lastUiAt = now; viewer.lastTick = viewer.timeline.tick; renderReplayViewer();
  }
  viewer.animation = requestAnimationFrame(drawReplayFrame);
}

function seekReplayTo(targetTick) {
  const viewer = state.replayViewer; if (!viewer || viewer.error) return;
  viewer.playing = false;
  try {
    const before = viewer.timeline.tick;
    viewer.timeline.seek(targetTick);
    if (Math.abs(before - viewer.timeline.tick) > 60) replayRenderer.resetCamera();
    renderReplayViewer(true);
  } catch (error) {
    viewer.error = error; captureClientError("replay seek", error); renderReplayViewer(true);
  }
}

function queueReplaySeek(targetTick) {
  const viewer = state.replayViewer; if (!viewer) return;
  viewer.playing = false; viewer.pendingSeek = Number(targetTick);
  if (viewer.seekFrame) return;
  viewer.seekFrame = requestAnimationFrame(() => {
    if (!state.replayViewer) return;
    const target = state.replayViewer.pendingSeek; state.replayViewer.seekFrame = 0;
    seekReplayTo(target);
  });
}

function toggleReplayPlayback() {
  const viewer = state.replayViewer; if (!viewer || viewer.error) return;
  if (viewer.timeline.complete) { viewer.timeline.reset(); replayRenderer.resetCamera(); }
  viewer.playing = !viewer.playing; viewer.lastFrame = performance.now(); renderReplayViewer(true);
}

function openReplayViewer() {
  if (!state.resultReplay) return;
  try {
    const timeline = new VerifiedReplayTimeline(state.resultReplay, createGameReplayAdapters(), {
      balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, rng: RNG_ALGORITHM, stepHz: 60,
    });
    state.replayViewer = { timeline, playing: true, speed: 1, error: null, animation: 0, seekFrame: 0, pendingSeek: 0, lastFrame: performance.now(), lastUiAt: 0, lastTick: -1, loadoutKey: "" };
    $("replay-speed").value = "1";
    $("replay-dialog").showModal(); replayRenderer.setQualitySettings(effectiveQualitySettings()); replayRenderer.resetCamera(); replayRenderer.resize();
    renderReplayViewer(true); state.replayViewer.animation = requestAnimationFrame(drawReplayFrame);
  } catch (error) { captureClientError("replay open", error); toast("This replay could not be verified"); }
}

function stopReplayViewer() {
  const viewer = state.replayViewer; if (!viewer) return;
  cancelAnimationFrame(viewer.animation); cancelAnimationFrame(viewer.seekFrame);
  replayRenderer.clearInspection(); state.replayViewer = null;
}

function inspectReplayCanvas(event) {
  const viewer = state.replayViewer; if (!viewer) return;
  const detail = replayRenderer.inspectAt(event.clientX, event.clientY, viewer.timeline.simulation), panel = $("replay-inspect");
  if (!detail) { panel.classList.add("hidden"); return; }
  const rows = Object.entries(detail.stats || {}).slice(0, 4);
  panel.innerHTML = `<span>${escapeHTML(detail.type || "Field contact")}</span><strong>${escapeHTML(detail.name || "Unknown")}</strong><p>${escapeHTML(detail.description || detail.copy || "")}</p>${rows.length ? `<dl>${rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>` : ""}`;
  panel.classList.remove("hidden");
}

function returnToLobby() {
  discardRecovery({ notify: false });
  resetInputProtocol();
  state.sim = null; state.snapshot = null; state.previousSnapshot = null; state.replayRecorder = null; state.endShown = false; state.joiningActiveRun = false; state.runAdmission = null; state.joinRequestSent = false; state.pendingRunAdmissions = []; clearTimeout(state.resultTimer);
  state.draftRecommendations.reset(state.authorityEpoch);
  state.squadPresence.reset(); state.lastPresenceAnnouncement = ""; clearTimeout(state.authorityRestoreTimer); state.authorityRestoreTimer = null; setAuthorityState("active", { restoreFocus: false });
  for (const member of state.lobby.values()) member.ready = member.id === state.clientId && state.isHost;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "return_lobby" });
  enterLobby(); if (state.isHost) broadcastLobby(); else updateLocalProfile({ ready: false });
  requestAnimationFrame(() => $("ready-button").focus());
}

function leaveToHome() {
  closeSocket(); state.sim = null; state.snapshot = null; state.replayRecorder = null; state.resultGame = null; state.resultReport = null; state.lobby.clear(); state.joiningActiveRun = false; state.runAdmission = null; state.joinRequestSent = false; state.pendingRunAdmissions = []; state.draftRecommendations.reset(state.authorityEpoch);
  state.squadPresence.reset(); state.lastPresenceAnnouncement = ""; clearTimeout(state.authorityRestoreTimer); state.authorityRestoreTimer = null; setAuthorityState("active", { restoreFocus: false });
  const url = new URL(location.href); url.searchParams.delete("room"); history.replaceState(null, "", url);
  setScreen("home"); updateProgressionUI(); refreshRecoveryOffer();
  requestAnimationFrame(() => $("callsign-input").focus());
}

function rememberRoomInUrl(code) {
  const url = new URL(location.href); url.searchParams.set("room", code); history.replaceState(null, "", url);
}

function scheduleRoomReconnect({ immediate = false } = {}) {
  if (state.reconnectTimer || state.connecting || state.partyMode === "solo" || !state.room || !["game", "result"].includes(state.screen)) return;
  if (state.reconnectAttempts >= RECONNECT_DELAYS_MS.length) {
    setAuthorityState("unavailable", { reason: "reconnect-exhausted" }); return;
  }
  if (navigator.onLine === false) { setAuthorityState("reconnecting", { attempt: state.reconnectAttempts, phase: "offline" }); return; }
  const delay = immediate ? 0 : RECONNECT_DELAYS_MS[state.reconnectAttempts];
  setAuthorityState("reconnecting", { attempt: state.reconnectAttempts, nextRetryMs: delay, phase: "waiting" });
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null; state.reconnectAttempts++;
    setAuthorityState("reconnecting", { attempt: state.reconnectAttempts, phase: "connecting" });
    connectRoom(state.room, { reconnecting: true }).then((welcome) => {
      state.reconnectAttempts = 0;
      if (!welcome.hostId && welcome.role !== "host") {
        setAuthorityState("unavailable", { reason: "no-compatible-successor" });
        toast("Relay restored · no compatible authority survived"); return;
      }
      setAuthorityState("synchronizing"); toast("Relay restored · synchronizing authority");
    }).catch(() => scheduleRoomReconnect());
  }, delay);
}

function retryRoomConnection() {
  if (state.connecting || state.partyMode === "solo" || !state.room) return;
  clearTimeout(state.reconnectTimer); state.reconnectTimer = null;
  if (state.authorityState === "unavailable") state.reconnectAttempts = 0;
  scheduleRoomReconnect({ immediate: true });
}

function connectRoom(code, { reconnecting = false } = {}) {
  closeSocket({ preserveReconnect: reconnecting }); state.room = code; state.connecting = true; rememberRoomInUrl(code);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { state.connecting = false; reject(new Error("Relay connection timed out")); closeSocket({ preserveReconnect: reconnecting }); }, 7000);
    state.connectResolve = (message) => { clearTimeout(timeout); state.connecting = false; resolve(message); };
    state.connectReject = (error) => { clearTimeout(timeout); state.connecting = false; reject(error); };
    const url = new URL(`${RELAY_BASE}${encodeURIComponent(code)}`);
    const ws = new WebSocket(url); state.ws = ws;
    state.networkLab = createActivatedNetworkLab(NETWORK_LAB_ACTIVATION, {
      onForcedDisconnect: () => { if (state.ws === ws) ws.close(4100, "Network lab reconnect"); },
      onError: (error) => captureClientError("network lab", error),
    });
    ws.addEventListener("open", () => send({
      type: "hello", profile: { name: callsign(), specialist: state.selected, masteryStart: state.mastery.tracks[state.selected].selectedStart, resumeToken: state.resumeToken },
      roomProtocolVersion: 2,
      migrationCapabilities: migrationCapabilities(),
    }));
    ws.addEventListener("message", (event) => {
      if (state.networkLab) state.networkLab.downstream(event.data, (payload) => handleNetworkMessage(payload));
      else handleNetworkMessage(event.data);
    });
    ws.addEventListener("error", () => state.connectReject?.(new Error("Relay connection failed")));
    ws.addEventListener("close", () => {
      if (ws.__lastlightIntentionalClose) return;
      if (state.ws === ws) state.ws = null;
      const rejectConnection = state.connectReject; state.connectReject = null; rejectConnection?.(new Error("Relay connection closed")); state.connecting = false;
      if (state.screen === "game" && state.partyMode !== "solo") {
        const visibleGame = state.sim || state.snapshot, localPlayer = visibleGame?.players?.find(({ id }) => id === state.clientId);
        if (localPlayer) announcePresence(state.squadPresence.disconnect(localPlayer, presenceTick(visibleGame)));
        setAuthorityState("reconnecting"); toast("Squad connection lost · operation frozen");
        captureClientError("network", "Squad relay connection closed during a run");
        scheduleRoomReconnect();
      } else if (state.screen === "result" && state.partyMode !== "solo") {
        setAuthorityState("reconnecting"); scheduleRoomReconnect();
      }
    });
  });
}

function resolveRunAdmission(message) {
  if (!state.isHost || message.protocolVersion !== 2 || !message.admissionId || !Number.isInteger(message.replaySlot)) return;
  const reject = (reason) => send({ type: "join_rejected", protocolVersion: 2, admissionId: message.admissionId, replaySlot: message.replaySlot, reason }, message._from);
  if (!state.sim || !["game", "result"].includes(state.screen)) { reject("run-unavailable"); return; }
  if (state.sim.paused || ["draft", "migrating", "synchronizing"].includes(state.authorityState)) {
    if (!state.pendingRunAdmissions.some((entry) => entry.admissionId === message.admissionId)) state.pendingRunAdmissions.push(message);
    return;
  }
  if (message.kind === "fresh" && state.sim.stage !== "running") { reject("run-locked"); return; }
  try {
    const info = { ...message.profile, id: message._from, replaySlot: message.replaySlot };
    let player, resumed = message.kind === "reconnect", deployment = null;
    if (resumed) {
      player = state.sim.addPlayer({ ...info, reconnectSlot: `migration-slot-${message.replaySlot}` });
      if (!player?.reconnected) throw new Error("reconnect-seat-mismatch");
      if (player) delete player.reconnected;
    } else if (message.kind === "fresh") {
      deployment = state.sim.deployLateJoin(info, { packageId: message.packageId });
      player = deployment.player;
    } else throw new Error("unsupported-admission-kind");
    if (!player || player.replaySlot !== message.replaySlot) throw new Error("seat-mismatch");
    state.lobby.set(message._from, { ...message.profile, id: message._from, replaySlot: player.replaySlot });
    if (state.replayRecorder) {
      if (resumed) state.replayRecorder.registerPlayer(message._from, player.specialist, { slot: player.replaySlot, tick: state.sim.tick, masteryStart: player.masteryStart, reconnect: true });
      else state.replayRecorder.registerPlayer(message._from, player.specialist, { slot: player.replaySlot, tick: state.sim.tick, packageId: deployment.packageId, catchUpRanks: deployment.catchUpRanks });
    }
    state.draftRecommendations.resetSeat(player.replaySlot);
    const presence = resumed ? state.squadPresence.restore(player, state.sim.tick) : state.squadPresence.connect(player, state.sim.tick);
    if (resumed) announcePresence(presence, state.sim.tick);
    state.sim.pushEvent("boon", `${player.name} ${resumed ? "reconnected" : "joined the run"}`, resumed ? "Loadout and progress restored" : `${deployment.packageId} package · ${deployment.catchUpRanks} catch-up ranks`);
    send({ type: "join_committed", protocolVersion: 2, admissionId: message.admissionId, replaySlot: message.replaySlot }, message._from);
    publishMigrationCheckpoint(true);
    sendRunSync(message._from); broadcastLobby();
    toast(`${player.name} ${resumed ? "reconnected" : "deployed"}`);
  } catch (error) {
    captureClientError("run admission", error);
    reject("admission-failed");
  }
}

function processPendingRunAdmissions() {
  if (!state.isHost || !state.sim || state.sim.paused || state.authorityState !== "active" || !state.pendingRunAdmissions.length) return;
  const pending = state.pendingRunAdmissions.splice(0);
  for (const admission of pending) resolveRunAdmission(admission);
}

function handleNetworkMessage(raw) {
  let message; try { message = JSON.parse(raw); } catch { return; }
  if (message.type === "welcome") {
    const recoveringAuthority = ["reconnecting", "synchronizing"].includes(state.authorityState);
    state.clientId = message.id; state.isHost = message.role === "host"; state.authorityEpoch = Number(message.authorityEpoch || 0); state.authorityHostId = message.hostId || (state.isHost ? message.id : ""); state.lobby = new Map();
    guestInputSequences.setEpoch(state.authorityEpoch);
    pingSequences.reset(state.authorityEpoch); hostPingGate.reset(state.authorityEpoch); clearPings();
    draftRecommendationSequences.reset(state.authorityEpoch); hostDraftRecommendationGate.reset(state.authorityEpoch);
    if (recoveringAuthority) state.draftRecommendations.rebase(state.authorityEpoch); else state.draftRecommendations.reset(state.authorityEpoch);
    if (state.authorityHostId) {
      authoritySnapshotGate.commit({ epoch: state.authorityEpoch, hostId: state.authorityHostId });
      if (recoveringAuthority) setAuthorityState("synchronizing");
    }
    for (const peer of message.peers || []) state.lobby.set(peer.id, { id: peer.id, name: peer.name || "Connecting…", specialist: peer.specialist || "zuri", ready: false });
    state.lobby.set(state.clientId, { id: state.clientId, name: callsign(), specialist: state.selected, ready: state.isHost, resumeToken: state.resumeToken });
    state.joiningActiveRun = Boolean(message.runActive);
    state.runAdmission = message.runActive ? (message.admission || { kind: "denied", reason: "unsupported-admission" }) : null;
    state.joinRequestSent = ["reconnect", "denied"].includes(state.runAdmission?.kind)
      || state.runAdmission?.kind === "waiting" && Number.isInteger(state.runAdmission?.slot);
    send({ type: "profile", profile: state.lobby.get(state.clientId) }); state.connectResolve?.(message); state.connectResolve = null; state.connectReject = null; return;
  }
  if (message.type === "peer_joined") {
    if (state.isHost) { state.lobby.set(message.peer.id, { id: message.peer.id, name: message.peer.name || "Connecting…", specialist: message.peer.specialist || "zuri", ready: false, ...(Number.isInteger(message.peer.replaySlot) ? { replaySlot: message.peer.replaySlot } : {}) }); broadcastLobby(); }
  } else if (message.type === "peer_left") {
    const departed = state.lobby.get(message.id);
    const visibleGame = state.sim || state.snapshot;
    const departingPlayer = visibleGame?.players?.find(({ id }) => id === message.id) || (Number.isInteger(departed?.replaySlot) ? departed : null);
    if (departingPlayer) announcePresence(state.squadPresence.disconnect({ ...departingPlayer, name: departed?.name || departingPlayer.name, specialist: departed?.specialist || departingPlayer.specialist }, presenceTick(visibleGame)));
    if (state.isHost && state.sim && state.replayRecorder) {
      try { state.replayRecorder.recordLeave(message.id, state.sim.tick); } catch { /* A pre-run peer has no replay slot. */ }
    }
    hostInputSequences.remove(message.id); state.lobby.delete(message.id);
    const hostedPlayer = state.sim?.players.find(({ id }) => id === message.id);
    if (hostedPlayer && Number.isInteger(hostedPlayer.replaySlot)) hostedPlayer.reconnectKey = `migration-slot-${hostedPlayer.replaySlot}`;
    state.sim?.removePlayer(message.id);
    if (state.isHost && state.sim && state.screen === "game") state.sim.pushEvent("danger", `${departed?.name || "A specialist"} disconnected`, "Their callsign is reserved for three minutes");
    if (state.isHost && pruneDraftRecommendations(state.sim)) sendDraftRecommendationSync();
    if (state.screen === "lobby") renderLobby(); if (state.isHost) broadcastLobby();
  } else if (message.type === "migration_started") {
    clearTimeout(state.resultTimer); state.resultTimer = null; state.endShown = false;
    state.authorityEpoch = Number(message.authorityEpoch); setAuthorityState("migrating", { tick: message.tick });
  } else if (message.type === "migration_offer") {
    stageMigrationOffer(message);
  } else if (message.type === "migration_failed") {
    state.isHost = false; state.migrationOffer = null; setAuthorityState("unavailable", { reason: message.reason });
  } else if (message.type === "host_changed") {
    if (message.migrated && ["game", "result"].includes(state.screen)) commitMigratedAuthority(message);
    else {
      state.authorityEpoch = Number(message.authorityEpoch || state.authorityEpoch); state.authorityHostId = message.id;
      state.isHost = message.id === state.clientId; authoritySnapshotGate.commit({ epoch: state.authorityEpoch, hostId: message.id });
      if (state.isHost && state.screen === "lobby") { const me = state.lobby.get(state.clientId); if (me) me.ready = true; broadcastLobby(); renderLobby(); }
    }
  } else if (message.type === "run_admission" && state.isHost) {
    resolveRunAdmission(message);
  } else if (message.type === "join_committed" && !state.isHost) {
    state.runAdmission = { kind: "committed", slot: message.replaySlot, roomProtocolVersion: 2 };
    state.joinRequestSent = true; renderLobby();
  } else if (message.type === "join_rejected" && !state.isHost) {
    state.runAdmission = { kind: "denied", reason: message.reason, roomProtocolVersion: 2 };
    state.joinRequestSent = true; renderLobby();
  } else if (message.type === "profile" && state.isHost) {
    state.lobby.set(message._from, { ...message.profile, id: message._from });
    // Active-run identity and seat changes are admitted only through the
    // relay-owned v2 barrier above. Profile updates remain lobby metadata.
    broadcastLobby();
    if (state.screen === "lobby") renderLobby();
    else if (state.sim && state.screen === "result") {
      sendRunSync(message._from);
    }
  } else if (message.type === "lobby_state" && !state.isHost) {
    state.config = message.config; state.lobby = new Map(message.players.map((p) => [p.id, p])); if (state.screen === "lobby") renderLobby();
  } else if (message.type === "start" && !state.isHost) startRemoteGame(message);
  else if (message.type === "sync_game" && !state.isHost) {
    const recoveringAuthority = ["reconnecting", "synchronizing"].includes(state.authorityState);
    state.lobby = new Map((message.players || []).map((player) => [player.id, player]));
    const recoveringResult = recoveringAuthority && state.screen === "result";
    if (!recoveringResult) startRemoteGame(message);
    state.snapshot = message.state; state.snapshotAt = performance.now();
    if (recoveringResult) state.resultGame = message.state;
    for (const transition of state.squadPresence.observe(state.snapshot?.players || [], presenceTick(state.snapshot))) announcePresence(transition, presenceTick(state.snapshot));
    movementPredictor.sync(state.snapshot?.players?.find((player) => player.id === state.clientId));
    if (recoveringAuthority) { finishAuthorityRestoration(); toast("Operation restored · run state synchronized"); }
    else toast("Joined operation in progress");
  }
  else if (message.type === "return_lobby" && !state.isHost) returnToLobby();
  else if (message.type === "ping" && state.isHost) acceptHostPing(message);
  else if (message.type === "ping_broadcast" && !state.isHost) {
    if (message._from !== state.authorityHostId) { state.pingStats.rejected++; return; }
    acceptVisiblePing(message);
  }
  else if (message.type === "draft_recommendation" && state.isHost) acceptHostDraftRecommendation(message);
  else if (message.type === "draft_recommendation_state" && !state.isHost) {
    if (message._from !== state.authorityHostId) { state.draftRecommendationStats.rejected++; return; }
    applyDraftRecommendationState(message);
  }
  else if (message.type === "draft_recommendation_sync" && !state.isHost) {
    if (message._from !== state.authorityHostId) { state.draftRecommendationStats.rejected++; return; }
    let sync; try { sync = sanitizeDraftRecommendationSync(message, { transport: true }); }
    catch { state.draftRecommendationStats.rejected++; return; }
    if (sync.epoch !== state.authorityEpoch || !state.draftRecommendations.replace(sync).accepted) { state.draftRecommendationStats.rejected++; return; }
    pruneDraftRecommendations(draftRecommendationGame()); renderDraftRecommendationMarkers(draftRecommendationGame());
  }
  else if (message.type === "input" && state.isHost) applyGuestNetworkInput(message);
  else if (message.type === "cast" && state.isHost) {
    if (recordHostCast(message._from, message.slot)) {
      sfx(message.slot === "r" ? "ultimate" : "ability");
      send({ type: "cast_audio", playerId: message._from, slot: message.slot });
    }
  }
  else if (message.type === "cast_audio" && !state.isHost && message.playerId !== state.clientId) sfx(message.slot === "r" ? "ultimate" : "ability");
  else if (message.type === "choice" && state.isHost) recordHostChoice(message._from, message.choiceId);
  else if (message.type === "draft_action" && state.isHost) {
    let action; try { action = sanitizeDraftActionMessage(message, { transport: true }); } catch { return; }
    recordHostDraftAction(action._from, { ...action, type: action.action });
  }
  else if (message.type === "snapshot" && !state.isHost) {
    let snapshotMessage; try { snapshotMessage = sanitizeSnapshotMessage(message, { transport: true }); } catch { return; }
    if (snapshotMessage.protocolVersion === 3 && !authoritySnapshotGate.accept({
      epoch: snapshotMessage.epoch, hostId: snapshotMessage._from, tick: snapshotMessage.tick, sequence: snapshotMessage.snapshotSeq,
    })) return;
    if (snapshotMessage.protocolVersion !== 3 && state.authorityEpoch > 0) return;
    const now = performance.now(); if (state.snapshotAt) state.snapshotInterval = clamp(now - state.snapshotAt, 60, 180);
    if (snapshotMessage.protocolVersion) guestInputSequences.acknowledge(snapshotMessage.ack[state.clientId], now);
    else guestInputSequences.observeLegacySnapshot(now);
    state.previousSnapshot = state.snapshot; state.snapshot = snapshotMessage.state; state.snapshotAt = now;
    for (const transition of state.squadPresence.observe(state.snapshot?.players || [], presenceTick(state.snapshot))) announcePresence(transition, presenceTick(state.snapshot));
    const predicted = movementPredictor.sync(state.snapshot?.players?.find((player) => player.id === state.clientId));
    if (predicted && movementPredictor.lastCorrectionDistance > 0) {
      const corrections = state.performanceMetrics?.predictionCorrections;
      if (corrections) { corrections.push(movementPredictor.lastCorrectionDistance); if (corrections.length > 600) corrections.splice(0, 60); }
    }
    if (state.authorityState === "synchronizing") finishAuthorityRestoration();
  }
}

function broadcastLobby() {
  if (!state.isHost || state.ws?.readyState !== WebSocket.OPEN) return;
  send({ type: "lobby_state", config: state.config, players: publicLobbyPlayers() });
}

function publicLobbyPlayers() {
  return [...state.lobby.values()].map(({ id, name, specialist, masteryStart, ready, replaySlot }) => ({
    id, name, specialist, masteryStart: masteryStart === "field-kit" ? "field-kit" : "baseline", ready: Boolean(ready),
    ...(Number.isInteger(replaySlot) ? { replaySlot } : {}),
  }));
}

function sendRunSync(targetId) {
  if (!state.isHost || !state.sim || !targetId) return false;
  send({ type: "sync_game", config: state.config, players: publicLobbyPlayers(), state: state.sim.snapshot({ presentation: true }) }, targetId);
  sendDraftRecommendationSync(targetId);
  return true;
}

function send(message, targetId = "") {
  if (state.ws?.readyState !== WebSocket.OPEN) return;
  const epochTypes = new Set(["cast", "cast_audio", "choice", "draft_action", "sync_game", "return_lobby"]);
  const framed = epochTypes.has(message.type) && !Object.hasOwn(message, "epoch") ? { ...message, epoch: state.authorityEpoch } : message;
  const socket = state.ws, payload = JSON.stringify(targetId ? { ...framed, _to: targetId } : framed);
  const deliver = (delayed) => { if (state.ws === socket && socket.readyState === WebSocket.OPEN) socket.send(delayed); };
  if (state.networkLab) state.networkLab.upstream(payload, deliver); else deliver(payload);
}
function closeSocket({ preserveReconnect = false } = {}) {
  state.networkLab?.teardown(); state.networkLab = null;
  if (!preserveReconnect) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; state.reconnectAttempts = 0; }
  const socket = state.ws; state.ws = null;
  if (socket) { socket.__lastlightIntentionalClose = true; try { socket.close(); } catch { /* Already closed. */ } }
  state.connectResolve = null; state.connectReject = null; resetInputProtocol();
}
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
    pings: {
      protocolVersion: 1,
      active: state.pings.size,
      sent: state.pingStats.sent,
      received: state.pingStats.received,
      rejected: state.pingStats.rejected,
      byIntent: { ...state.pingStats.byIntent },
      hostGate: state.isHost ? hostPingGate.diagnostics() : null,
    },
    draftRecommendations: {
      protocolVersion: DRAFT_RECOMMENDATION_PROTOCOL_VERSION,
      enabled: Boolean(state.runtimeConfig.config.flags.upgradeRecommendations),
      active: state.draftRecommendations.entries().length,
      sent: state.draftRecommendationStats.sent,
      received: state.draftRecommendationStats.received,
      rejected: state.draftRecommendationStats.rejected,
    },
    hostMigration: {
      enabled: Boolean(state.runtimeConfig.config.flags.migrationCheckpointReplication
        && state.runtimeConfig.config.flags.hostMigrationElection
        && state.runtimeConfig.config.flags.hostMigrationResume),
      protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION,
      state: state.authorityState,
      authorityEpoch: state.authorityEpoch,
      checkpointTick: state.migrationLastCheckpointTick,
      checkpointBytes: state.migrationCheckpointBytes,
      elapsedMilliseconds: state.migrationStartedAt ? Math.max(0, Math.round(performance.now() - state.migrationStartedAt)) : 0,
      failureReason: state.migrationFailureReason || null,
      snapshotGate: authoritySnapshotGate.diagnostics(),
    },
    squadPresence: state.squadPresence.view().map(({ replaySlot, status, statusSinceTick, deadlineTick }) => ({ replaySlot, status, statusSinceTick, deadlineTick })),
    networkLab: state.networkLab ? (() => { const { seed, ...diagnostics } = state.networkLab.diagnostics(); return diagnostics; })() : { active: false, reason: NETWORK_LAB_ACTIVATION.reason },
    runtimeConfig: {
      version: state.runtimeConfig.config.configVersion,
      gameplayVersion: state.config?.features?.gameplayVersion || state.runtimeConfig.config.gameplayVersion,
      source: state.runtimeConfig.source,
      status: state.runtimeConfig.status,
      flags: { ...state.runtimeConfig.config.flags },
    },
    enemyHealthBars: state.showEnemyHealthBars,
    enemyHealthBarMode: state.qualitySettings.healthBars,
    displayQuality: renderer.getQualityStatus(),
    audio: audioDiagnostics(),
    audioMix: state.audioMixer?.diagnostics() || null,
    entities: game ? {
      enemies: game.enemies?.length || 0, friendlyProjectiles: game.projectiles?.length || 0,
      hostileProjectiles: game.hostile?.length || 0, dataMotes: game.orbs?.length || 0,
      effects: game.effects?.length || 0, feathers: game.feathers?.length || 0,
    } : null,
    performance: state.screen === "game" ? performanceSummary() : null,
  };
}

function reportLocation() { return `${location.origin}${location.pathname}`; }

function diagnosticText() {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    url: reportLocation(),
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

function clearReportImage() {
  state.reportImageDataUrl = ""; state.reportImageMimeType = ""; state.reportImageName = "";
  $("report-image-status").innerHTML = "<strong>Paste a screenshot</strong> anywhere while this form is open. It will attach automatically.";
  $("report-image-status").className = "";
}

async function attachReportImage(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { $("report-image-status").textContent = "Choose a PNG, JPEG, or WebP screenshot."; $("report-image-status").className = "error"; return; }
  if (file.size > 5_000_000) { $("report-image-status").textContent = "That screenshot is over 5 MB. Please crop or compress it first."; $("report-image-status").className = "error"; return; }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error || new Error("Screenshot could not be read"));
      reader.readAsDataURL(file);
    });
    state.reportImageDataUrl = dataUrl; state.reportImageMimeType = file.type; state.reportImageName = file.name || "pasted screenshot";
    $("report-image-status").textContent = `${state.reportImageName} attached · ${(file.size / 1_000_000).toFixed(1)} MB`;
    $("report-image-status").className = "success";
  } catch { $("report-image-status").textContent = "That screenshot could not be attached."; $("report-image-status").className = "error"; }
}

function pasteReportImage(event) {
  const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault(); attachReportImage(file);
}

function openReport() {
  closePingWheel({ restoreFocus: false });
  const game = gameDiagnostics();
  clearReportNote(); clearReportImage();
  state.resumeAfterReport = false;
  if (state.screen === "game" && state.authorityState === "active" && state.isHost && state.sim && !state.sim.paused) { togglePause(true); state.resumeAfterReport = true; }
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
  let dataUrl = state.reportImageDataUrl, mimeType = state.reportImageMimeType;
  if (!dataUrl && $("report-screenshot").checked && state.screen === "game") {
    try { mimeType = "image/jpeg"; dataUrl = $("game-canvas").toDataURL(mimeType, .76); } catch { /* A report is still useful without a screenshot. */ }
  }
  const game = gameDiagnostics(), contact = $("report-contact").value.trim();
  const payload = {
    kind: "vellum.feedback", version: 1, project: "lastlight", capturedAt: new Date().toISOString(),
    note: `[${$("report-category").value}] ${note}`,
    reporter: { flow: "public-user", signedIn: false, userLabel: (contact || callsign()).slice(0, 180) },
    url: reportLocation(),
    diagnostics: {
      app: "lastlight", build: BUILD, game,
      route: { viewMode: state.screen, path: location.pathname, search: "", activeLocation: game.map || state.screen },
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
    $("report-status").className = "report-status success"; $("report-alert").classList.add("hidden"); clearReportNote(); clearReportImage(); sfx("reward");
  } catch (error) {
    console.error(error); $("report-status").textContent = "Could not send automatically. Use “Copy diagnostic details” and share them directly.";
    $("report-status").className = "report-status error"; sfx("danger");
  } finally { state.reportSubmitting = false; $("report-submit").disabled = false; }
}

async function copyDiagnostics() {
  try { await navigator.clipboard.writeText(`${$("report-note").value.trim()}\n\n${diagnosticText()}`); toast("Diagnostic details copied"); }
  catch { toast("Clipboard unavailable"); }
}

function ensureAudio() {
  if (state.audioContext) return state.audioContext;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) { state.audioAvailable = false; state.audioStatus = "unavailable"; renderAudioControls(); return null; }
  try {
    state.audioContext = new AudioContextConstructor();
    state.audioMixer = new DynamicAudioMixer(state.audioContext, {
      density: state.qualitySettings.effectsDensity,
      masterVolume: state.audioSettings.master,
      effectsVolume: state.audioSettings.effects,
      muted: !state.audioSettings.enabled,
    });
    state.audioContext.addEventListener?.("statechange", () => {
      state.audioStatus = audioOutputState({ supported: true, enabled: state.audioSettings.enabled, contextState: state.audioContext.state });
      renderAudioControls();
    });
    return state.audioContext;
  } catch (error) {
    captureClientError("audio unavailable", error);
    state.audioAvailable = false;
    state.audioLastError = String(error?.message || error).slice(0, 240);
    state.audioStatus = "unavailable"; renderAudioControls(); return null;
  }
}

function audioDiagnostics() {
  return {
    state: state.audioStatus,
    supported: state.audioAvailable,
    contextState: state.audioContext?.state || null,
    unlockAttempts: state.audioUnlockAttempts,
    lastUnlockReason: state.audioUnlockReason,
    lastError: state.audioLastError || null,
    settings: { ...state.audioSettings },
    cueRegistry: { schema: LASTLIGHT_AUDIO_CUES.schema, version: LASTLIGHT_AUDIO_CUES.schemaVersion, provenance: { ...LASTLIGHT_AUDIO_CUES.provenance } },
    runtimeNodes: { active: state.activeAudioNodes, peak: state.peakAudioNodes },
    mix: state.audioMixer?.diagnostics() || null,
  };
}

function renderAudioControls() {
  const labels = { locked: "Sound locked", ready: "Sound ready", muted: "Sound muted", unavailable: "Sound unavailable" };
  const descriptions = {
    locked: "Sound is waiting for a click or key press. Use Test sound to unlock it now.",
    ready: "Sound is unlocked and ready.",
    muted: "Sound is muted on this device.",
    unavailable: "This browser does not expose Web Audio. Sound cannot play here.",
  };
  document.documentElement.dataset.audioState = state.audioStatus;
  for (const id of ["audio-button", "lobby-audio", "pause-audio"]) {
    const button = $(id); if (!button) continue;
    const statusLabel = button.querySelector("strong");
    if (statusLabel) statusLabel.textContent = labels[state.audioStatus];
    else button.textContent = labels[state.audioStatus];
    button.dataset.audioState = state.audioStatus;
    button.setAttribute("aria-label", `Open sound settings · ${state.audioStatus}`);
    button.setAttribute("aria-haspopup", "dialog");
  }
  if (!$('audio-status')) return;
  $("audio-status").textContent = descriptions[state.audioStatus];
  $("audio-status").dataset.state = state.audioStatus;
  $("audio-mute").textContent = state.audioSettings.enabled ? "Mute sound" : "Turn sound on";
  $("audio-mute").setAttribute("aria-pressed", String(!state.audioSettings.enabled));
  for (const [key, id] of [["master", "audio-master"], ["effects", "audio-effects"], ["voice", "audio-voice"]]) {
    $(id).value = String(Math.round(state.audioSettings[key] * 100));
    $(`${id}-value`).textContent = audioPercent(state.audioSettings[key]);
  }
  $("audio-funny-voice").checked = state.audioSettings.funnyVoice;
  $("audio-test").disabled = state.audioStatus === "unavailable" || !state.audioSettings.enabled;
}

function applyAudioSettings(settings, persist = true) {
  state.audioSettings = persist ? saveAudioSettings(settings) : settings;
  state.audioMixer?.setVolumes({ master: state.audioSettings.master, effects: state.audioSettings.effects });
  state.audioMixer?.setMuted(!state.audioSettings.enabled);
  if (!state.audioSettings.enabled || !state.audioSettings.funnyVoice || state.audioSettings.voice <= 0) window.speechSynthesis?.cancel();
  state.audioStatus = audioOutputState({ supported: state.audioAvailable, enabled: state.audioSettings.enabled, contextState: state.audioContext?.state });
  renderAudioControls();
}

async function unlockAudioFromGesture(reason = "gesture") {
  state.audioUnlockAttempts += 1;
  state.audioUnlockReason = String(reason).slice(0, 40);
  if (!state.audioAvailable) { state.audioStatus = "unavailable"; renderAudioControls(); return false; }
  if (!state.audioSettings.enabled) { state.audioStatus = "muted"; renderAudioControls(); return false; }
  if (state.audioUnlockInFlight) return state.audioUnlockInFlight;
  const audio = ensureAudio();
  if (!audio) return false;
  state.audioUnlockInFlight = (async () => {
    try {
      if (audio.state !== "running" && !await settleAudioResume(audio.resume())) throw new Error("Audio unlock timed out");
      state.audioLastError = "";
      state.audioStatus = audioOutputState({ supported: state.audioAvailable, enabled: state.audioSettings.enabled, contextState: audio.state });
      return state.audioStatus === "ready";
    } catch (error) {
      state.audioLastError = String(error?.message || error).slice(0, 240);
      state.audioStatus = audioOutputState({ supported: state.audioAvailable, enabled: state.audioSettings.enabled, contextState: audio.state });
      if (state.audioStatus === "locked" && !/notallowed|gesture|timed out/i.test(state.audioLastError)) captureClientError("audio unlock", error);
      return false;
    } finally {
      state.audioUnlockInFlight = null;
      renderAudioControls();
    }
  })();
  return state.audioUnlockInFlight;
}

function audioTone(audio, frequency, offset = 0, duration = .08, type = "sine", volume = .025, endFrequency = frequency, destination = audio.destination, pan = 0) {
  if (volume <= 0) return;
  const start = audio.currentTime + offset, oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  const panner = audio.createStereoPanner?.();
  if (panner) { panner.pan.setValueAtTime(Math.max(-1, Math.min(1, Number(pan) || 0)), start); oscillator.connect(gain).connect(panner).connect(destination); }
  else oscillator.connect(gain).connect(destination);
  state.activeAudioNodes += 1; state.peakAudioNodes = Math.max(state.peakAudioNodes, state.activeAudioNodes);
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; state.activeAudioNodes = Math.max(0, state.activeAudioNodes - 1); oscillator.disconnect?.(); gain.disconnect?.(); panner?.disconnect?.(); };
  oscillator.addEventListener?.("ended", cleanup, { once: true });
  oscillator.start(start); oscillator.stop(start + duration + .01);
}

function replacementRequired(choice, player) {
  const [kind, target] = String(choice?.id || "").split(":");
  if (kind === "weapon") return !player.weapons?.[target] && Object.keys(player.weapons || {}).length >= BALANCE.core.maxWeaponSlots;
  if (kind === "passive") return Number(player.passives?.[target] || 0) < 1 && Object.values(player.passives || {}).filter((rank) => Number(rank) > 0).length >= BALANCE.core.maxPassiveSlots;
  return false;
}

function replacementTargets(choice, player) {
  const kind = String(choice?.id || "").split(":")[0];
  if (kind === "weapon") return Object.entries(player.weapons || {}).filter(([id]) => id !== "signature").map(([id, item]) => ({ id, name: WEAPONS[id]?.name || id, detail: `${item.evolved ? "Evolved" : `Level ${item.level}`}` }));
  if (kind === "passive") return Object.entries(player.passives || {}).filter(([, rank]) => Number(rank) > 0).map(([id, rank]) => ({ id, name: PASSIVES[id]?.name || id, detail: `Rank ${rank}` }));
  return [];
}

function selectedBaseChoiceId(decisionId) {
  const parts = String(decisionId || "").split(":");
  return parts[0] === "replace" ? `${parts[1]}:${parts[2]}` : decisionId;
}

function closeReplacement({ focus = true } = {}) {
  const choiceId = state.replacementChoiceId;
  state.replacementChoiceId = "";
  $("replacement-tray").classList.add("hidden");
  if (focus && choiceId) $("upgrade-cards").querySelector(`[data-choice="${CSS.escape(choiceId)}"]`)?.focus();
}

function renderReplacementTray(game, player) {
  const choice = game.pendingChoices?.[player.id]?.find(({ id }) => id === state.replacementChoiceId);
  if (!choice || game.choiceReady?.[player.id] || !replacementRequired(choice, player)) { closeReplacement({ focus: false }); return; }
  const tray = $("replacement-tray"), targets = replacementTargets(choice, player);
  $("replacement-title").textContent = `Add ${choice.name}`;
  $("replacement-copy").textContent = `Your ${choice.kind} slots are full. Choose exactly one owned ${choice.kind} to remove; the new item starts at level 1.`;
  $("replacement-options").innerHTML = targets.map((target, index) => {
    const key = `${player.id}:${choice.id}:${target.id}`;
    let forecast = state.replacementForecasts.get(key);
    if (!forecast) { forecast = forecastDraftChoice(choice, player, { gold: game.gold, gameLevel: game.level, replacementId: target.id }); state.replacementForecasts.set(key, forecast); }
    const added = forecast.comparisonRows.filter(({ id }) => ["damage", "cooldown", "projectiles"].includes(id)).map(({ label, after }) => `${label} ${after}`).join(" · ");
    const removed = forecast.removed?.kind === "weapon" ? `${target.detail} · Damage ${forecast.removed.details.damage} · ${forecast.removed.details.interval}` : `${target.detail} · ${forecast.removed?.details?.stat || ""}`;
    const deltas = forecast.statChanges.slice(0, 2).map(({ id, direction }) => `${id} ${direction === "up" ? "increases" : "decreases"}`).join(" · ");
    return `<button class="replacement-option" type="button" data-replacement="${escapeHTML(target.id)}"><b>${index + 1}. Remove ${escapeHTML(target.name)}</b><span>${escapeHTML(removed)} → Add level 1 · ${escapeHTML(added || deltas || "slot preserved")}</span></button>`;
  }).join("");
  tray.classList.remove("hidden");
  tray.querySelectorAll("[data-replacement]").forEach((button) => button.addEventListener("click", () => performDraftAction({ type: "replace", choiceId: choice.id, replacementId: button.dataset.replacement })));
}

function sfx(name, details = {}) {
  if (!state.audioSettings.enabled || state.audioStatus === "unavailable") return false;
  const audio = ensureAudio(); if (!audio) return false;
  if (audio.state !== "running") { state.audioStatus = "locked"; renderAudioControls(); return false; }
  const definition = resolveAudioCue(name, details);
  const envelope = audioCueEnvelopeDuration(name, details);
  const cue = state.audioMixer.requestCue(name, { ...details, duration: Math.max(Number(details.duration) || 0, envelope), voiceCount: definition.voices.length }); if (!cue) return false;
  for (const voice of definition.voices) audioTone(
    audio,
    voice.frequency * cue.variation.pitch,
    voice.offset,
    voice.duration,
    voice.waveform,
    voice.volume * cue.variation.gain,
    voice.endFrequency * cue.variation.pitch,
    cue.destination,
    cue.pan,
  );
  return true;
}

function comicVoice(words) {
  const now = performance.now();
  if (!state.audioSettings.enabled || !state.audioSettings.funnyVoice || state.audioSettings.voice <= 0 || !window.speechSynthesis || window.speechSynthesis.speaking || window.speechSynthesis.pending || now - state.lastVoiceAt < FUNNY_VOICE_MIN_INTERVAL_MS) return;
  state.lastVoiceAt = now;
  const utterance = new SpeechSynthesisUtterance(words); utterance.rate = 1.65; utterance.pitch = 1.35; utterance.volume = state.audioSettings.voice * state.audioSettings.master;
  window.speechSynthesis.speak(utterance);
}

async function measureOfflineAudioHeadroom(names = []) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return { supported: false };
  const sampleRate = 48_000, audio = new OfflineContext(2, sampleRate * 2, sampleRate);
  const mixer = new DynamicAudioMixer(audio, { density: "full", masterVolume: 1, effectsVolume: 1 });
  const entries = Array.isArray(names) ? names.slice(0, 64) : [];
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : String(entry?.name || "ui");
    const details = typeof entry === "object" && entry ? entry : {};
    const definition = resolveAudioCue(name, details), envelope = audioCueEnvelopeDuration(name, details);
    const cue = mixer.requestCue(name, { ...details, duration: envelope, voiceCount: definition.voices.length });
    if (!cue) continue;
    for (const voice of definition.voices) audioTone(audio, voice.frequency, voice.offset, voice.duration, voice.waveform, voice.volume, voice.endFrequency, cue.destination, cue.pan);
  }
  const mix = mixer.diagnostics(), buffer = await audio.startRendering();
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
  mixer.dispose();
  return { supported: true, peak, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, mix };
}

async function toggleAudio() {
  applyAudioSettings({ ...state.audioSettings, enabled: !state.audioSettings.enabled });
  if (state.audioSettings.enabled && await unlockAudioFromGesture("settings-toggle")) sfx("ui");
}

function openAudioSettings() {
  renderAudioControls();
  unlockAudioFromGesture("settings-open");
  $("audio-dialog").showModal();
  requestAnimationFrame(() => $("audio-mute").focus());
}

async function testAudioOutput() {
  $("audio-test-result").textContent = "Unlocking audio…";
  const ready = await unlockAudioFromGesture("sound-test");
  if (ready) $("audio-test-result").textContent = sfx("test") ? "Test tone played." : "Test tone is busy. Try again in a moment.";
  else $("audio-test-result").textContent = state.audioStatus === "muted" ? "Turn sound on before testing." : state.audioStatus === "unavailable" ? "Web Audio is unavailable in this browser." : "Audio is still locked. Try clicking Test sound again.";
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
  for (const [id, slot] of [["e-slot", "e"], ["r-slot", "r"]]) {
    const node = $(id);
    node.setAttribute("role", "button"); node.setAttribute("aria-keyshortcuts", slot.toUpperCase());
    node.addEventListener("pointerdown", (event) => {
      if (!matchMedia("(pointer: coarse)").matches || event.button !== 0) return;
      if (node.getAttribute("aria-disabled") === "true") return;
      event.preventDefault(); cast(slot);
    });
    node.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || event.repeat) return;
      if (node.getAttribute("aria-disabled") === "true") return;
      event.preventDefault(); cast(slot);
    });
  }
  $("downed-support-action").addEventListener("click", (event) => {
    event.preventDefault();
    if (!event.currentTarget.disabled) cast("e");
  });
}

function setupPingControls() {
  const canvas = $('game-canvas'), touchButton = $('touch-ping');
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 1 || !openPingWheel({ clientX: event.clientX, clientY: event.clientY, source: 'pointer', pointerId: event.pointerId })) return;
    event.preventDefault(); canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (state.pingWheel?.source !== 'pointer' || event.pointerId !== state.pingPointerId) return;
    event.preventDefault(); closePingWheel({ commit: true });
  });
  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerId === state.pingPointerId) closePingWheel();
  });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (state.pingWheel?.source === 'pointer' && event.pointerId === state.pingPointerId) closePingWheel();
  });
  touchButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    if (!openPingWheel({
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      visualClientX: event.clientX, visualClientY: event.clientY, source: 'touch', pointerId: event.pointerId,
    })) return;
    event.preventDefault(); state.pingSuppressClickUntil = performance.now() + 500; touchButton.setPointerCapture?.(event.pointerId);
  });
  touchButton.addEventListener('pointermove', (event) => {
    if (state.pingWheel?.source === 'touch' && event.pointerId === state.pingPointerId) updatePingWheel(event.clientX, event.clientY);
  });
  const endTouchPing = (event, commit) => {
    if (state.pingWheel?.source !== 'touch' || event.pointerId !== state.pingPointerId) return;
    event.preventDefault(); closePingWheel({ commit });
  };
  touchButton.addEventListener('pointerup', (event) => endTouchPing(event, true));
  touchButton.addEventListener('pointercancel', (event) => endTouchPing(event, false));
  touchButton.addEventListener('lostpointercapture', (event) => endTouchPing(event, false));
  touchButton.addEventListener('click', (event) => {
    if (performance.now() < (state.pingSuppressClickUntil || 0)) { event.preventDefault(); return; }
    const rect = canvas.getBoundingClientRect();
    if (openPingWheel({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, visualClientX: innerWidth - 112, visualClientY: innerHeight - 150, source: 'button' })) {
      setPingWheelSelection('danger'); $('ping-wheel').querySelector('[data-ping-intent="danger"]').focus();
    }
  });
  $('ping-wheel').querySelectorAll('[data-ping-intent]').forEach((button) => button.addEventListener('click', () => {
    if (!state.pingWheel) return;
    setPingWheelSelection(button.dataset.pingIntent); closePingWheel({ commit: true });
  }));
}

function bindEvents() {
  setupDamageLedger();
  const unlockFromInteraction = (event) => { if (!event.repeat) unlockAudioFromGesture(event.type); };
  document.addEventListener("pointerdown", unlockFromInteraction, { capture: true, passive: true });
  document.addEventListener("click", unlockFromInteraction, { capture: true, passive: true });
  window.addEventListener("keydown", unlockFromInteraction, { capture: true });
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
    document.querySelectorAll(".command-menu[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.querySelectorAll(".command-menu button").forEach((button) => button.addEventListener("click", () => { button.closest(".command-menu").open = false; }));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".command-menu[open]").forEach((menu) => { menu.open = false; });
  });
  document.querySelectorAll(".mode-tab").forEach((button) => button.addEventListener("click", () => setPartyMode(button.dataset.partyMode)));
  $("seeded-operation-cards").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-seeded-operation]");
    if (button) selectSeededOperation(button.dataset.seededOperation);
  });
  for (const id of ["practice-button", "lobby-practice"]) $(id).addEventListener("click", openPracticeLaboratory);
  $("practice-close").addEventListener("click", () => $("practice-dialog").close());
  $("practice-dialog").addEventListener("click", (event) => { if (event.target === $("practice-dialog")) $("practice-dialog").close(); });
  $("practice-specialist").addEventListener("change", (event) => {
    state.practiceLaboratory.specialist = event.currentTarget.value; state.practiceLaboratory.masteryStart = "baseline";
    state.practiceLaboratory.weapons = [{ id: "signature", level: 1, evolved: false }]; state.practiceLaboratory.passives = [];
    renderPracticeLaboratory(); $("practice-status").textContent = "Specialist changed; loadout reset to its authoritative signature baseline.";
  });
  $("practice-mastery-start").addEventListener("change", (event) => { state.practiceLaboratory.masteryStart = event.currentTarget.value; reconcilePracticeLoadout(); renderPracticeLaboratory(); });
  $("practice-map").addEventListener("change", (event) => { state.practiceLaboratory.map = event.currentTarget.value; renderPracticeLaboratory(); });
  $("practice-difficulty").addEventListener("change", (event) => { state.practiceLaboratory.difficulty = event.currentTarget.value; invalidatePracticeMeasurement(); });
  $("practice-target").addEventListener("change", (event) => { state.practiceLaboratory.target.type = event.currentTarget.value; state.practiceLaboratory.target.eliteAffix = "none"; renderPracticeLaboratory(); });
  $("practice-affix").addEventListener("change", (event) => { state.practiceLaboratory.target.eliteAffix = event.currentTarget.value; invalidatePracticeMeasurement(); });
  $("practice-behavior").addEventListener("change", (event) => { state.practiceLaboratory.target.behavior = event.currentTarget.value; invalidatePracticeMeasurement(); });
  $("practice-window").addEventListener("change", (event) => { state.practiceLaboratory.measurementSeconds = Number(event.currentTarget.value); invalidatePracticeMeasurement(); });
  $("practice-invulnerable").addEventListener("change", (event) => { state.practiceLaboratory.playerInvulnerable = event.currentTarget.checked; invalidatePracticeMeasurement(); });
  $("practice-add-weapon").addEventListener("click", () => {
    const id = Object.keys(WEAPONS).find((candidate) => !state.practiceLaboratory.weapons.some((weapon) => weapon.id === candidate));
    if (id && state.practiceLaboratory.weapons.length < PRACTICE_MAX_WEAPONS) state.practiceLaboratory.weapons.push({ id, level: 1, evolved: false });
    renderPracticeLaboratory();
  });
  $("practice-add-passive").addEventListener("click", () => {
    const id = Object.keys(PASSIVES).find((candidate) => !state.practiceLaboratory.passives.some((passive) => passive.id === candidate));
    if (id) addPracticePassive(id); renderPracticeLaboratory();
  });
  $("practice-weapons").addEventListener("change", (event) => {
    const row = event.target.closest("[data-practice-weapon]"), weapon = state.practiceLaboratory.weapons[Number(row?.dataset.practiceWeapon)];
    if (!weapon) return;
    if (event.target.matches("[data-practice-weapon-id]")) { weapon.id = event.target.value; weapon.evolved = false; }
    else if (event.target.matches("[data-practice-weapon-level]")) { weapon.level = Number(event.target.value); if (weapon.level !== 5) weapon.evolved = false; }
    else if (event.target.matches("[data-practice-evolved]")) {
      weapon.evolved = event.target.checked;
      if (weapon.evolved) {
        weapon.level = 5;
        if (!addPracticePassive(practiceWeaponPassive(weapon.id))) weapon.evolved = false;
      }
    }
    renderPracticeLaboratory();
    if (event.target.matches("[data-practice-evolved]") && event.target.checked && !weapon.evolved) invalidatePracticeMeasurement("Remove a passive before evolving this weapon; all passive slots are occupied.");
  });
  $("practice-weapons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-practice-remove-weapon]"), row = button?.closest("[data-practice-weapon]");
    if (!row) return; state.practiceLaboratory.weapons.splice(Number(row.dataset.practiceWeapon), 1); renderPracticeLaboratory();
  });
  $("practice-passives").addEventListener("change", (event) => {
    const row = event.target.closest("[data-practice-passive]"), passive = state.practiceLaboratory.passives[Number(row?.dataset.practicePassive)];
    if (!passive) return;
    if (event.target.matches("[data-practice-passive-id]")) { passive.id = event.target.value; passive.rank = Math.min(passive.rank, PASSIVES[passive.id].max); }
    else if (event.target.matches("[data-practice-passive-rank]")) passive.rank = Number(event.target.value);
    reconcilePracticeLoadout(); renderPracticeLaboratory();
  });
  $("practice-passives").addEventListener("click", (event) => {
    const button = event.target.closest("[data-practice-remove-passive]"), row = button?.closest("[data-practice-passive]");
    if (!row || button.disabled) return; state.practiceLaboratory.passives.splice(Number(row.dataset.practicePassive), 1); reconcilePracticeLoadout(); renderPracticeLaboratory();
  });
  $("practice-measure").addEventListener("click", measurePracticeBuild);
  document.querySelectorAll("[data-join-package]").forEach((button) => button.addEventListener("click", () => {
    if (!state.joiningActiveRun || state.joinRequestSent) return;
    state.joinPackageId = button.dataset.joinPackage; renderLobby();
  }));
  $("map-select").addEventListener("change", updateDifficultyOptions);
  $("difficulty-select").addEventListener("change", renderDeploymentMutations);
  $("deploy-button").addEventListener("click", deploy); $("room-input").addEventListener("keydown", (event) => { if (event.key === "Enter") deploy(); });
  $("recovery-resume").addEventListener("click", resumeRecovery); $("recovery-discard").addEventListener("click", () => discardRecovery());
  $("room-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
  $("lobby-back").addEventListener("click", leaveToHome); $("ready-button").addEventListener("click", handleReady); $("copy-link").addEventListener("click", copyInvite);
  $("pause-button").addEventListener("click", () => togglePause()); $("resume-button").addEventListener("click", () => togglePause(false)); $("abandon-button").addEventListener("click", abandon);
  $("network-state-return").addEventListener("click", leaveToHome);
  $("network-state-retry").addEventListener("click", retryRoomConnection);
  $("network-state-report").addEventListener("click", openReport);
  $("network-state-overlay").addEventListener("keydown", trapAuthorityFocus);
  window.addEventListener("offline", () => {
    if (state.partyMode === "solo" || !["game", "result"].includes(state.screen)) return;
    const visibleGame = state.sim || state.snapshot, localPlayer = visibleGame?.players?.find(({ id }) => id === state.clientId);
    if (localPlayer) announcePresence(state.squadPresence.disconnect(localPlayer, presenceTick(visibleGame)));
    clearTimeout(state.reconnectTimer); state.reconnectTimer = null;
    // A browser may keep a WebSocket reporting OPEN while the network is gone. Close it
    // deliberately so the authority stops applying held input and host election can begin.
    closeSocket({ preserveReconnect: true });
    setAuthorityState("reconnecting", { attempt: state.reconnectAttempts, phase: "offline" });
  });
  window.addEventListener("online", () => {
    if (state.authorityState === "reconnecting" && !state.connecting) scheduleRoomReconnect({ immediate: true });
  });
  $("enemy-health-bars-toggle").addEventListener("change", (event) => setEnemyHealthBars(event.target.value));
  $("again-button").addEventListener("click", returnToLobby); $("result-home").addEventListener("click", leaveToHome);
  $("watch-replay").addEventListener("click", openReplayViewer);
  $("copy-squad-report").addEventListener("click", () => copySquadReportLink(state.resultReport));
  $("copy-squad-report-named").addEventListener("click", () => copySquadReportLink(state.resultReport, { includeCallsigns: true }));
  $("replay-copy").addEventListener("click", copyReplay);
  $("replay-play").addEventListener("click", toggleReplayPlayback);
  $("replay-back").addEventListener("click", () => seekReplayTo((state.replayViewer?.timeline.tick || 0) - 300));
  $("replay-forward").addEventListener("click", () => seekReplayTo((state.replayViewer?.timeline.tick || 0) + 300));
  $("replay-timeline").addEventListener("input", (event) => queueReplaySeek(event.currentTarget.value));
  $("replay-speed").addEventListener("change", (event) => { if (state.replayViewer) state.replayViewer.speed = Number(event.currentTarget.value); });
  $("replay-close").addEventListener("click", () => $("replay-dialog").close());
  $("replay-dialog").addEventListener("close", stopReplayViewer);
  $("replay-dialog").addEventListener("click", (event) => { if (event.target === $("replay-dialog")) $("replay-dialog").close(); });
  $("replay-dialog").addEventListener("keydown", (event) => {
    if (event.target.matches("button,input,select")) return;
    if (event.code === "Space") { event.preventDefault(); toggleReplayPlayback(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); seekReplayTo((state.replayViewer?.timeline.tick || 0) - 300); }
    else if (event.key === "ArrowRight") { event.preventDefault(); seekReplayTo((state.replayViewer?.timeline.tick || 0) + 300); }
    else if (event.key === "Home") { event.preventDefault(); seekReplayTo(0); }
    else if (event.key === "End") { event.preventDefault(); seekReplayTo(state.replayViewer?.timeline.replay.finalTick || 0); }
  });
  $("replay-canvas").addEventListener("pointermove", inspectReplayCanvas);
  $("replay-canvas").addEventListener("pointerleave", () => { replayRenderer.clearInspection(); $("replay-inspect").classList.add("hidden"); });
  for (const id of ["run-history-button", "lobby-run-history", "result-run-history"]) $(id).addEventListener("click", openRunHistory);
  $("run-history-close").addEventListener("click", () => $("run-history-dialog").close());
  $("run-history-dialog").addEventListener("click", (event) => { if (event.target === $("run-history-dialog")) $("run-history-dialog").close(); });
  for (const id of ["audio-button", "lobby-audio", "pause-audio"]) $(id).addEventListener("click", openAudioSettings);
  $("audio-dialog").addEventListener("click", (event) => { if (event.target === $("audio-dialog")) $("audio-dialog").close(); });
  $("audio-mute").addEventListener("click", toggleAudio);
  $("audio-test").addEventListener("click", testAudioOutput);
  for (const [key, id] of [["master", "audio-master"], ["effects", "audio-effects"], ["voice", "audio-voice"]]) {
    $(id).addEventListener("input", (event) => applyAudioSettings({ ...state.audioSettings, [key]: Number(event.currentTarget.value) / 100 }));
  }
  $("audio-funny-voice").addEventListener("change", (event) => applyAudioSettings({ ...state.audioSettings, funnyVoice: event.currentTarget.checked }));
  for (const id of ["quality-button", "lobby-quality", "pause-quality"]) $(id).addEventListener("click", openQualitySettings);
  $("quality-dialog").addEventListener("click", (event) => { if (event.target === $("quality-dialog")) $("quality-dialog").close(); });
  $("quality-preset").addEventListener("change", (event) => applyQualitySettings(settingsForPreset(event.target.value, systemReducedMotion)));
  for (const [key, id] of Object.entries(QUALITY_FIELDS)) $(id).addEventListener("change", (event) => applyQualitySettings({ ...state.qualitySettings, preset: "custom", [key]: event.target.value }));
  $("quality-reduced-motion").addEventListener("change", (event) => applyQualitySettings({ ...state.qualitySettings, preset: "custom", reducedMotion: event.target.checked }));
  for (const [key, id] of Object.entries(ACCESSIBILITY_FIELD_IDS)) $(id).addEventListener("change", (event) => updateAccessibilitySetting({ [key]: Number.isFinite(Number(event.target.value)) && ["textScale", "hudScale", "touchScale"].includes(key) ? Number(event.target.value) : event.target.value }));
  $("accessibility-reduced-flash").addEventListener("change", (event) => updateAccessibilitySetting({ reducedFlash: event.target.checked }));
  $("accessibility-controller").addEventListener("change", (event) => updateAccessibilitySetting({ controller: { ...state.accessibilitySettings.controller, enabled: event.target.checked } }));
  $("accessibility-deadzone").addEventListener("change", (event) => updateAccessibilitySetting({ controller: { ...state.accessibilitySettings.controller, deadzone: Number(event.target.value) } }));
  $("accessibility-reset").addEventListener("click", () => applyAccessibilitySettings(defaultAccessibilitySettings(systemReducedMotion), true, "Accessibility settings reset."));
  $("accessibility-bindings").addEventListener("click", (event) => {
    const button = event.target.closest("[data-binding-action]"); if (!button) return;
    state.accessibilityCapture = button.dataset.bindingAction;
    $("accessibility-status").textContent = `Press a key for ${ACCESSIBILITY_ACTION_LABELS[state.accessibilityCapture]}. Escape cancels.`;
    button.setAttribute("data-capturing", "true");
  });
  $("how-button").addEventListener("click", () => $("manual-dialog").showModal()); $("manual-close").addEventListener("click", () => $("manual-dialog").close());
  $("manual-dialog").addEventListener("click", (event) => { if (event.target === $("manual-dialog")) $("manual-dialog").close(); });
  $("draft-reroll").addEventListener("click", () => performDraftAction({ type: "reroll" }));
  $("draft-banish").addEventListener("click", () => {
    state.draftBanishMode = !state.draftBanishMode; state.draftSkipArmed = false; closeReplacement({ focus: false }); state.lastUpgradeKey = "";
    $("draft-status").textContent = state.draftBanishMode ? "Banish mode enabled. Choose option 1, 2, or 3." : "Banish mode cancelled.";
    updateUpgrade(state.activeUpgradeGame);
  });
  $("draft-skip").addEventListener("click", () => {
    if (state.draftSkipArmed) performDraftAction({ type: "skip" });
    else { state.draftSkipArmed = true; state.draftBanishMode = false; closeReplacement({ focus: false }); state.lastUpgradeKey = ""; $("draft-status").textContent = "Press skip again to confirm."; updateUpgrade(state.activeUpgradeGame); }
  });
  $("replacement-cancel").addEventListener("click", () => { closeReplacement(); state.lastUpgradeKey = ""; });
  for (const id of ["guide-button", "lobby-guide", "upgrade-guide-button", "pause-guide-button"]) $(id).addEventListener("click", () => { renderGuide(); $("guide-dialog").showModal(); });
  $("guide-close").addEventListener("click", () => $("guide-dialog").close());
  $("guide-dialog").addEventListener("click", (event) => { if (event.target === $("guide-dialog")) $("guide-dialog").close(); });
  $("report-button").addEventListener("click", openReport); $("report-close").addEventListener("click", () => $("report-dialog").close());
  $("report-dialog").addEventListener("click", (event) => { if (event.target === $("report-dialog")) $("report-dialog").close(); });
  $("report-dialog").addEventListener("paste", pasteReportImage);
  $("report-dialog").addEventListener("close", handleReportClosed);
  $("report-form").addEventListener("submit", submitReport); $("report-copy").addEventListener("click", copyDiagnostics);
  window.addEventListener("lastlight:inspect", (event) => showInspectPanel(event.detail || {}));
  window.addEventListener("lastlight:inspect-clear", hideInspectPanel);
  window.addEventListener("error", (event) => captureClientError("error", event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => captureClientError("unhandled promise", event.reason));
  window.addEventListener("gamepadconnected", (event) => { if (event.gamepad?.mapping === "standard") renderAccessibilityControls(`${event.gamepad.id || "Standard gamepad"} connected.`); });
  window.addEventListener("gamepaddisconnected", () => renderAccessibilityControls("Standard gamepad disconnected."));
  window.addEventListener("keydown", (event) => {
    if (handleBindingCapture(event)) return;
    const target = event.target;
    const isTyping = target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));
    const key = event.key.toLowerCase();
    const action = keyboardActionForEvent(effectiveAccessibilitySettings(), event);
    if (state.pingWheel && !isTyping && !dialogOpen) {
      if (key === 'escape') { event.preventDefault(); closePingWheel(); return; }
      if (key === 'enter' || key === ' ') { event.preventDefault(); if (!event.repeat) closePingWheel({ commit: true }); return; }
      if (["1", "2", "3", "4", "5", "6"].includes(key)) { event.preventDefault(); if (!event.repeat) setPingWheelSelection(PING_WHEEL_ORDER[Number(key) - 1]); return; }
      if (["arrowleft", "arrowup", "arrowright", "arrowdown"].includes(key)) {
        event.preventDefault();
        if (!event.repeat) {
          const direction = ["arrowleft", "arrowup"].includes(key) ? -1 : 1;
          const current = PING_WHEEL_ORDER.indexOf(state.pingWheel.intent);
          setPingWheelSelection(PING_WHEEL_ORDER[(current < 0 ? direction < 0 ? 0 : -1 : current + direction + PING_WHEEL_ORDER.length) % PING_WHEEL_ORDER.length]);
        }
        return;
      }
      if (action === "ping") { event.preventDefault(); return; }
      if (!["moveUp", "moveDown", "moveLeft", "moveRight"].includes(action)) { event.preventDefault(); return; }
    }
    if (!isTyping && !dialogOpen && action === "ping" && state.screen === 'game') {
      event.preventDefault(); if (!event.repeat) openPingWheel({ source: 'keyboard' }); return;
    }
    if (action === "report" && !isTyping && !dialogOpen) { event.preventDefault(); openReport(); return; }
    if (isReportShortcut(event)) {
      if (!shouldOpenReportShortcut(event, { isTyping, dialogOpen })) return;
      event.preventDefault();
      openReport();
      return;
    }
    if (isTyping || dialogOpen || state.screen !== "game") return;
    if (state.authorityState !== "active") {
      if (action) event.preventDefault();
      return;
    }
    if (action === "inspect") { state.input.keys.add(event.code); state.inspectActive = true; setTacticalIntel(true); inspectCanvasAt(state.inspectPointer ? { ...state.inspectPointer, shiftKey: true } : null); return; }
    const upgradeOpen = !$("upgrade-overlay").classList.contains("hidden");
    const replacementOpen = upgradeOpen && !$("replacement-tray").classList.contains("hidden");
    if (replacementOpen && key === "escape") { event.preventDefault(); closeReplacement(); state.lastUpgradeKey = ""; return; }
    if (replacementOpen && ["1", "2", "3", "4", "5", "6"].includes(key)) {
      event.preventDefault(); if (!event.repeat) $("replacement-options").querySelectorAll("button")[Number(key) - 1]?.click(); return;
    }
    if (replacementOpen && key === "0") { event.preventDefault(); return; }
    if (upgradeOpen && ["reroll", "banish", "skip"].includes(action)) { event.preventDefault(); if (!event.repeat) performMappedAction(action); return; }
    if (upgradeOpen && key === "escape" && state.draftBanishMode) { event.preventDefault(); state.draftBanishMode = false; state.lastUpgradeKey = ""; updateUpgrade(state.activeUpgradeGame); return; }
    const upgradeChoice = ["choice1", "choice2", "choice3"].includes(action) && upgradeOpen;
    if (upgradeChoice) {
      event.preventDefault();
      if (!event.repeat) performMappedAction(action);
      return;
    }
    const localPlayer = localGamePlayer();
    if (localPlayer?.downed && ["active", "ultimate"].includes(action)) {
      event.preventDefault();
      if (action === "active" && !event.repeat) cast("e");
      return;
    }
    if (action) event.preventDefault();
    if (!event.repeat && ["active", "ultimate", "autoAim", "pause"].includes(action)) performMappedAction(action);
    state.input.keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => { const action = keyboardActionForEvent(effectiveAccessibilitySettings(), event); state.input.keys.delete(event.code); if (action === "ping" && state.pingWheel?.source === "keyboard") { event.preventDefault(); closePingWheel({ commit: true }); } if (action === "inspect") { state.inspectActive = false; setTacticalIntel(false); hideInspectPanel(); } });
  window.addEventListener("blur", () => { closePingWheel(); state.input.keys.clear(); state.inspectActive = false; setTacticalIntel(false); hideInspectPanel(); });
  $("game-canvas").addEventListener("pointermove", (event) => {
    const rect = $("game-canvas").getBoundingClientRect();
    state.input.aim = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
    state.inspectPointer = { clientX: event.clientX, clientY: event.clientY };
    if (state.pingWheel && (state.pingWheel.source === "keyboard" || event.pointerId === state.pingPointerId)) updatePingWheel(event.clientX, event.clientY);
    state.inspectActive = event.shiftKey || state.input.keys.has(effectiveAccessibilitySettings().bindings.inspect);
    setTacticalIntel(state.inspectActive);
    inspectCanvasAt({ ...state.inspectPointer, shiftKey: state.inspectActive });
  });
  $("game-canvas").addEventListener("pointerleave", () => { state.inspectPointer = null; state.inspectActive = false; setTacticalIntel(false); hideInspectPanel(); });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  setupPingControls();
  setupTouch();
}

renderSpecialistGrid(); selectSpecialist("zuri"); bindEvents(); applyQualitySettings(state.qualitySettings, false); applyAccessibilitySettings(state.accessibilitySettings, false); applyAudioSettings(state.audioSettings, false); syncPingAvailability(); syncDraftRecommendationAvailability(); syncPracticeLaboratoryAvailability(); syncAccessibilityAvailability(); updateProgressionUI(); setPartyMode("solo");
if (query.get("room")) { setPartyMode("join"); $("room-input").value = query.get("room").toUpperCase().slice(0,6); setTimeout(() => $("callsign-input").focus(), 50); }
if (localHost) Object.defineProperty(window, "__lastlightQA", { value: Object.freeze({
  diagnostics: () => JSON.parse(JSON.stringify(gameDiagnostics())),
  authorityState: () => ({
    clientId: state.clientId,
    room: state.room,
    screen: state.screen,
    isHost: state.isHost,
    authorityEpoch: state.authorityEpoch,
    authorityHostId: state.authorityHostId,
    migrationState: state.authorityState,
    reconnectAttempts: state.reconnectAttempts,
    socketState: state.ws?.readyState ?? WebSocket.CLOSED,
  }),
  squadState: () => state.squadPresence.view().map(({ replaySlot, name, specialist, status, statusSinceTick, deadlineTick }) => ({ replaySlot, name, specialist, status, statusSinceTick, deadlineTick })),
  disconnectRelay: () => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
    state.ws.close(4101, "QA authority loss");
    return true;
  },
  protectPlayers: () => {
    if (!state.sim || !state.isHost) return false;
    for (const player of state.sim.players) player.invuln = Math.max(player.invuln || 0, 999);
    publishMigrationCheckpoint(true);
    return true;
  },
  beginDowned: () => {
    if (!state.sim || !state.isHost || state.screen !== "game") return false;
    const player = state.sim.players.find(({ id }) => id === state.clientId); if (!player || player.dead || player.downed) return false;
    let ally = state.sim.players.find(({ id, dead, downed }) => id !== state.clientId && !dead && !downed);
    if (!ally) ally = state.sim.addPlayer({ id: "qa-downed-ally", name: "QA Ally", specialist: "echo", replaySlot: 1 }, 1);
    ally.dead = false; ally.downed = false; ally.x = player.x + 160; ally.y = player.y; ally.shield = 0;
    state.sim.downPlayer(player); publishMigrationCheckpoint(true); return player.downed;
  },
  audioState: () => JSON.parse(JSON.stringify(audioDiagnostics())),
  testAudio: () => testAudioOutput(),
  reportState: () => ({ screen: state.screen, open: $("report-dialog").open, paused: Boolean(state.sim?.paused), pauseReason: state.sim?.pauseReason || "", resumeAfterReport: state.resumeAfterReport }),
      beginUpgrade: () => { if (!state.sim || state.screen !== "game") return false; state.sim.beginUpgradeChoice(); state.lastUpgradeKey = ""; return true; },
      beginApex: (phase = 1) => {
        if (!state.sim || state.screen !== "game") return false;
        for (const player of state.sim.players) player.invuln = Math.max(player.invuln || 0, 999);
        if (state.sim.stage !== "boss") state.sim.spawnBoss();
        const boss = state.sim.enemies.find((enemy) => enemy.boss && !enemy.dead); if (!boss) return false;
        if (Number(phase) >= 2 && boss.apexPhaseIndex === 0) { state.sim.damageEnemy(boss, boss.maxHp, state.clientId, true, "qa-apex-phase"); state.sim.updateBoss(boss, 1 / 60, state.sim.players.filter((player) => !player.dead && !player.downed)); }
        boss.apexReadyTick = state.sim.tick; boss.apexActionUntilTick = Math.min(boss.apexActionUntilTick, state.sim.tick); return true;
      },
  beginReplacementDraft: () => {
    if (!state.sim || state.screen !== "game") return false;
    const player = state.sim.players.find(({ id }) => id === state.clientId); if (!player) return false;
    player.weapons = { signature: { level: 5, evolved: false }, aura: { level: 4, evolved: false }, mines: { level: 3, evolved: false }, crossbow: { level: 2, evolved: false }, drone: { level: 1, evolved: false } };
    state.sim.beginUpgradeChoice(); const weapon = WEAPONS.uwu;
    state.sim.pendingChoices[player.id] = [{ id: "weapon:uwu", kind: "weapon", name: weapon.name, copy: weapon.copy, glyph: weapon.glyph, icon: weapon.icon, level: 1, max: BALANCE.core.maxWeaponLevel }];
    state.lastUpgradeKey = ""; return true;
  },
  setScreen: (screen) => { if (!screens[screen]) return false; setScreen(screen); return true; },
  showResultFixture: () => {
    const specialists = ["rift", "zuri", "echo", "sola"];
    const players = specialists.map((specialist, replaySlot) => ({
      id: `qa-result-${replaySlot}`, name: ["Rookie", "Long Callsign", "Mender", "Vanguard"][replaySlot], specialist, replaySlot,
      joinKind: replaySlot === 3 ? "fresh" : "initial", joinedAtTick: replaySlot === 3 ? 6_120 : 0,
      damage: 129_675 - replaySlot * 21_337, kills: 429 - replaySlot * 73, xpCollected: 4_237 - replaySlot * 510,
      damageTaken: replaySlot * 318, revives: replaySlot, traveled: 60_823 - replaySlot * 7_120,
      damageBySource: { signature: 53_002 - replaySlot * 4_100, aura: 30_337 - replaySlot * 3_200, mines: 25_164 - replaySlot * 2_700, crossbow: 7_786, active: 3_755, passive: 2_042, ultimate: 1_589 },
    }));
    const slots = players.map(({ replaySlot }) => ({ replaySlot, slot: replaySlot, effectiveHealing: replaySlot * 105, effectiveShielding: replaySlot * 57, shieldDamagePrevented: replaySlot * 88, mitigationPrevented: replaySlot * 24, damageAssists: 5 + replaySlot, controlAssists: replaySlot, revives: replaySlot, reviveTicks: replaySlot * 74, objectiveCompletions: 3 - Math.min(2, replaySlot), objectivePresenceTicks: 974 - replaySlot * 91, objectiveMovement: 711 - replaySlot * 80, eliteParticipations: 4, apexParticipations: 1 }));
    state.telemetrySent = true;
        showResult({ stage: "won", time: 285, bossElapsed: 0, kills: 1_284, level: 13, gold: 660, map: "warehouse", difficulty: "story", players,
          discoveryState: { enabled: true, encountered: ["affix:hasted", "boon:squad-shield", "event:treasure-runner"] },
          participationState: { slots }, synergyState: { stats: players.map(({ replaySlot }) => ({ slot: replaySlot, triggers: replaySlot, assists: replaySlot, ultimateChains: 0, damage: replaySlot * 320, shielding: 0, mitigated: 0, formationTicks: 0 })) } });
    return true;
  },
  renderActiveBuffs: (fields = {}) => updateActiveBuffs(fields),
  renderDamageLedger: (damageBySource = {}) => updateDamageLedger({ specialist: state.selected, damageBySource }, { time: 60 }),
    playAudioCues: (entries = []) => Array.isArray(entries) && entries.slice(0, 64).forEach((entry) => typeof entry === "string" ? sfx(entry) : sfx(String(entry?.name || "ui"), entry || {})),
    measureAudioHeadroom: (names = []) => measureOfflineAudioHeadroom(names),
}), configurable: false, writable: false });
