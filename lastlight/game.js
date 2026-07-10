import { SPECIALISTS, SPECIALIST_ORDER, PASSIVES, WEAPONS, MAPS, DIFFICULTIES, ENEMY_TYPES, WAVE_NAMES, BOONS, AUGMENTS, formatTime, clamp } from "./data.js?v=20260710.3";
import { Simulation } from "./engine.js?v=20260710.3";
import { Renderer } from "./render.js?v=20260710.3";
import { MAP_ORDER, DIFFICULTY_ORDER, MAP_REQUIREMENTS, completeRun, emptyProgress, hasCompleted, isDifficultyUnlocked, isMapUnlocked, normalizeProgress } from "./progression.js?v=20260710.3";
import { getThemeAsset } from "./themes/lastlight.js?v=20260710.3";
import { submitRunTelemetry } from "./telemetry.js?v=20260710.3";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home-screen"), lobby: $("lobby-screen"), game: $("game-screen"), result: $("result-screen") };
const query = new URLSearchParams(location.search);
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const RELAY_BASE = query.get("relay") || (localHost ? "ws://localhost:8787/room/" : "wss://lastlight-relay.bensonperry.workers.dev/room/");
const FEEDBACK_URL = "https://biblioplex-api.bensonperry.com/feedback";
const BUILD = "2026.07.10.3";
const renderer = new Renderer($("game-canvas"));
const PROGRESS_KEY = "lastlight:campaign:v1";
const ENEMY_HEALTH_BARS_KEY = "lastlight:enemy-health-bars:v1";
const RUN_HISTORY_KEY = "lastlight:runs:v1";
const DIFFICULTY_COPY = { story: "Story · Sharp hits · Lighter opening", hard: "Hard · 3× health · 2× damage", extreme: "Extreme · 7× health · 3× damage" };

function loadProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null")); }
  catch { return emptyProgress(); }
}

function loadEnemyHealthBars() {
  try { return localStorage.getItem(ENEMY_HEALTH_BARS_KEY) !== "false"; }
  catch { return true; }
}

function loadRunHistory() {
  try {
    const runs = JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || "[]");
    return Array.isArray(runs) ? runs.slice(0, 24) : [];
  } catch { return []; }
}

const state = {
  screen: "home", partyMode: "solo", selected: "zuri", clientId: "solo", isHost: true, room: "",
  lobby: new Map(), ws: null, connecting: false, connectResolve: null, connectReject: null,
  config: { map: "warehouse", difficulty: "story", duration: 240 }, sim: null,
  previousSnapshot: null, snapshot: null, snapshotAt: 0, snapshotInterval: 90,
  input: { keys: new Set(), aim: 0, autoAim: true, touchX: 0, touchY: 0 },
  animation: 0, lastFrame: 0, lastSend: 0, lastBroadcast: 0, lastLobbyBroadcast: 0,
  lastUpgradeKey: "", lastWeaponHUDKey: "", lastPassiveHUDKey: "", lastSquadHUDKey: "", lastEventSeq: 0, endShown: false, resultTimer: null,
  progress: loadProgress(), runHistory: loadRunHistory(), resultGame: null, resultSavedKey: "",
  audio: true, audioContext: null, toastTimer: null, lastVoiceAt: 0,
  soundState: { projectiles: 0, kills: 0, level: 1, damageTaken: 0, xpCollected: 0, lastShot: 0, lastXP: 0 },
  recentErrors: [], reportSubmitting: false, resumeAfterReport: false, telemetrySent: false,
  showEnemyHealthBars: loadEnemyHealthBars(), inspectPointer: null, inspectActive: false,
  performanceMetrics: null, lastActiveBuffKey: "", lastDamageLedgerKey: "",
};

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
  return { Damage: telemetry.damage, Cooldown: telemetry.interval, Projectiles: telemetry.projectiles, Range: weaponId === "signature" ? SPECIALISTS[specialist].range : telemetry.note };
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
  const passives = Object.values(PASSIVES).map((passive) => guideCard(passive.glyph, passive.name, `${passive.amount} · max ${passive.max}`, passive.id === "projectiles" ? "Adds a projectile to compatible attacks; single-instance fields and utility effects do not multiply." : "Passive stats also unlock matching weapon evolutions.", "", passive.icon, { "Each rank": passive.amount, "Maximum": `${passive.max} ranks` })).join("");
  const fieldObjects = [
    ...Object.values(ENEMY_TYPES).map((enemy) => guideCard("EN", enemy.name, enemy.ranged ? "Ranged threat" : enemy.miniboss ? "Miniboss" : enemy.bomber ? "Explosive contact" : "Contact threat", enemy.ranged ? "Keeps its distance and fires orange hostile projectiles." : "Closes distance and deals contact damage.", "", enemy.icon, { Health: enemy.health, Damage: enemy.damage, Speed: enemy.speed, XP: enemy.xp })),
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
  $("guide-content").innerHTML = `<section id="guide-campaign" class="guide-section"><h3>Campaign route</h3><p>Clear threat tiers to unlock harder operations. Progress is saved in this browser.</p><div class="campaign-route">${campaign}</div></section><section id="guide-field" class="guide-section"><h3>Field objects</h3><p>Hold Shift and point at a live field object for its current stats.</p><div class="guide-grid">${fieldObjects}</div></section><section id="guide-signatures" class="guide-section"><h3>Signature evolutions</h3><div class="guide-grid">${signatures}</div></section><section id="guide-weapons" class="guide-section"><h3>Universal weapons</h3><div class="guide-grid">${weapons}</div></section><section id="guide-passives" class="guide-section"><h3>Passive upgrades</h3><div class="guide-grid">${passives}</div></section><section id="guide-rare" class="guide-section"><h3>Rare finds & events</h3><div class="guide-grid">${rare}</div></section>`;
}

function renderSpecialistGrid() {
  $("specialist-grid").innerHTML = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id];
    return `<button class="specialist-card" type="button" role="option" data-specialist="${id}" aria-selected="${id === state.selected}"><small>${spec.number}</small><img src="${spec.sprite}" alt=""><span>${spec.name.toUpperCase()}</span></button>`;
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
  const profile = { ...current, ...patch, id: state.clientId, name: callsign() };
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
  const players = [...state.lobby.values()].map((p) => ({ id: p.id, name: p.name, specialist: p.specialist }));
  if (!players.length) return;
  state.sim = new Simulation({ ...state.config, players });
  state.previousSnapshot = null; state.snapshot = null;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "start", config: state.config, players });
  enterGame();
}

function startRemoteGame(message) {
  state.config = message.config; state.sim = null; state.previousSnapshot = null; state.snapshot = null; enterGame();
}

function enterGame() {
  setScreen("game"); renderer.resize(); state.endShown = false; state.telemetrySent = false; state.resultSavedKey = ""; state.lastEventSeq = 0; state.lastUpgradeKey = ""; state.lastWeaponHUDKey = ""; state.lastPassiveHUDKey = ""; state.lastSquadHUDKey = ""; state.lastFrame = performance.now();
  state.performanceMetrics = { samples: [], frames: 0, longFrames: 0, maxEntities: {} };
  state.soundState = { projectiles: 0, kills: 0, level: 1, damageTaken: 0, xpCollected: 0, lastShot: 0, lastXP: 0 };
  state.lastActiveBuffKey = ""; state.lastDamageLedgerKey = "";
  state.lastSend = 0; state.lastBroadcast = 0; renderer.camera.x = 0; renderer.camera.y = 0; $("game-canvas").focus();
  if (!state.animation) state.animation = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (state.screen !== "game") { state.animation = 0; return; }
  const dt = Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000)); state.lastFrame = now;
  const frameStarted = performance.now(); let simulationMs = 0;
  const input = currentInput();
  if (state.isHost && state.sim) {
    const simulationStarted = performance.now(); state.sim.setInput(state.clientId, input); state.sim.update(dt); simulationMs = performance.now() - simulationStarted;
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastBroadcast > 83) { state.lastBroadcast = now; send({ type: "snapshot", state: state.sim.snapshot() }); }
  } else if (state.ws?.readyState === WebSocket.OPEN && now - state.lastSend > 35) {
    state.lastSend = now; send({ type: "input", input });
  }
  const current = state.isHost ? state.sim : state.snapshot;
  if (current) {
    const interpolation = state.isHost ? 1 : clamp((now - state.snapshotAt) / state.snapshotInterval, 0, 1);
    const renderStarted = performance.now(); renderer.draw(current, state.clientId, state.isHost ? null : state.previousSnapshot, interpolation); const renderMs = performance.now() - renderStarted;
    const hudStarted = performance.now(); updateHUD(current); updateUpgrade(current); processEvents(current.events || []); const hudMs = performance.now() - hudStarted;
    if (state.inspectActive && state.inspectPointer) inspectCanvasAt({ ...state.inspectPointer, shiftKey: true });
    trackPerformance(current, dt * 1000, performance.now() - frameStarted, simulationMs, renderMs, hudMs);
    if ((current.stage === "won" || current.stage === "lost") && !state.endShown) scheduleResult(current);
  }
  state.animation = requestAnimationFrame(gameLoop);
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
    maxEntities: metrics.maxEntities,
  };
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
    if (state.sim?.cast(state.clientId, slot)) {
      sfx(slot === "r" ? "ultimate" : "ability");
      if (slot === "r") comicVoice("pew pew pew");
    }
  } else { send({ type: "cast", slot }); sfx(slot === "r" ? "ultimate" : "ability"); }
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
    const damage = { zuri: 31 + level * 11, echo: 48 + level * 14, sola: 26 + level * 11 + player.armor * 1.2, bront: 70 + level * 24, fang: 36 + level * 19 + player.maxHp * .015, gale: 65 + level * 21, rift: 30 + level * 13, nova: 53 + level * 14, vesper: 51 + level * 14 }[player.specialist];
    const projectiles = { zuri: 2 + level + extra, echo: Math.min(6, level + extra), sola: 3 + Math.floor(level / 2) + extra, bront: 1, fang: 1, gale: Math.min(7, 1 + Math.floor(level / 2) + extra), rift: 1, nova: Math.min(8, 1 + Math.ceil(level / 2) + extra), vesper: 1 + Math.floor(level / 3) + extra }[player.specialist];
    return { damage: `${rounded(damage)} / hit`, interval: `${cd(interval).toFixed(2)}s`, cooldownSeconds: cd(interval), projectiles: String(projectiles), note: SPECIALISTS[player.specialist].signature.evolve };
  }
  const table = {
    uwu: [28 + level * 10, evolved ? .35 : .75 - level * .07, 1 + Math.floor(level / 3) + extra, "Nearest-target needles"],
    slicers: [24 + level * 9, .24, 2 + level + extra, "Orbiting contact blades"],
    aura: [16 + level * 8 + player.maxHp * .008, .34, 1, "Continuous radial field"],
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
  return { damage: table[0] ? `${rounded(table[0])} / hit` : "Utility", interval: `${cd(table[1]).toFixed(2)}s`, cooldownSeconds: cd(table[1]), projectiles: String(table[2]), note: table[3] };
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
  const icon = data.icon;
  const passive = weaponId === "signature" ? spec.signature.passive : data.passive;
  const damage = Number(player.damageBySource?.[weaponId] || 0), dps = damage / elapsedRunSeconds(game);
  return `<div class="weapon-slot ${weapon.evolved ? "evolved" : ""}" data-weapon-id="${weaponId}" data-cooldown-max="${telemetry.cooldownSeconds}" tabindex="0" aria-label="${escapeHTML(weapon.evolved ? data.evolve : data.name)} weapon details"><img src="${icon}" alt=""><i class="weapon-cooldown-sweep" aria-hidden="true"></i><b class="weapon-cooldown-seconds" aria-hidden="true"></b><small>${weapon.evolved ? "E" : weapon.level}</small><div class="weapon-tooltip"><span>${weapon.evolved ? "Evolved weapon" : `Level ${weapon.level}`}</span><strong>${escapeHTML(weapon.evolved ? data.evolve : data.name)}</strong><p>${escapeHTML(data.copy || spec.tagline)}</p><dl><div><dt>Damage</dt><dd>${telemetry.damage}</dd></div><div><dt>Cooldown</dt><dd>${telemetry.interval}</dd></div><div><dt>Projectiles</dt><dd>${telemetry.projectiles}</dd></div><div><dt>Run damage</dt><dd>${statNumber(damage)}</dd></div><div><dt>DPS</dt><dd>${dps.toFixed(1)}</dd></div></dl><em>${escapeHTML(telemetry.note)}</em><small>Evolution: level 5 + ${escapeHTML(PASSIVES[passive]?.name || passive)}</small></div></div>`;
}

function passiveSlotMarkup(passiveId, rank) {
  const passive = PASSIVES[passiveId];
  if (!passive) return "";
  const level = Math.max(1, Math.floor(Number(rank) || 1));
  return `<div class="passive-slot" style="--passive-color:${escapeHTML(passive.color)}" tabindex="0" aria-label="${escapeHTML(passive.name)}, passive rank ${level} of ${passive.max}"><span><img src="${passive.icon}" alt=""></span><small>${level}</small><div class="weapon-tooltip"><span>Passive upgrade</span><strong>${escapeHTML(passive.name)}</strong><p>${escapeHTML(passive.amount)} per rank. ${passive.id === "projectiles" ? "Applies to compatible multi-projectile attacks; utility and single-field effects are unchanged." : "This modifier applies to every compatible system in your loadout."}</p><dl><div><dt>Current rank</dt><dd>${level} / ${passive.max}</dd></div><div><dt>Each rank</dt><dd>${escapeHTML(passive.amount)}</dd></div></dl><em>Persistent for the rest of this operation.</em></div></div>`;
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
  renderer.setEnemyHealthBarsVisible(state.showEnemyHealthBars);
  $("game-canvas").dataset.enemyHealthBars = state.showEnemyHealthBars ? "visible" : "hidden";
  $("enemy-health-bars-toggle").checked = state.showEnemyHealthBars;
  if (persist) {
    try { localStorage.setItem(ENEMY_HEALTH_BARS_KEY, String(state.showEnemyHealthBars)); } catch { /* Storage is optional. */ }
  }
}

function updateSoundState(game) {
  const now = performance.now(), projectiles = game.projectiles?.length || 0;
  const local = game.players?.find((player) => player.id === state.clientId) || game.players?.[0];
  if (projectiles > state.soundState.projectiles && now - state.soundState.lastShot > 85) {
    state.soundState.lastShot = now; sfx("shot");
  }
  if (game.kills > state.soundState.kills) sfx("kill");
  if (game.level > state.soundState.level) sfx("level");
  if ((local?.damageTaken || 0) > state.soundState.damageTaken) sfx("hurt");
  if ((local?.xpCollected || 0) > state.soundState.xpCollected && now - state.soundState.lastXP > 42) { state.soundState.lastXP = now; sfx("xp"); }
  state.soundState.projectiles = projectiles;
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
  const seconds = elapsedRunSeconds(game);
  $("damage-ledger").innerHTML = sources.length ? `<strong>Damage sources</strong>${sources.map(([id, damage], index) => `<div class="${index === 0 ? "leader" : ""}"><span>${escapeHTML(sourceName(id, player))}</span><b>${statNumber(damage)}</b><small>${(damage / seconds).toFixed(1)} DPS</small></div>`).join("")}` : "";
}

function togglePause(force) {
  if (!state.isHost || !state.sim) { toast("Only the squad leader can pause"); return; }
  if (state.sim.pauseReason === "upgrade") return;
  const next = force ?? !state.sim.paused; state.sim.paused = next; state.sim.pauseReason = next ? "manual" : "";
  $("pause-overlay").classList.toggle("hidden", !next);
}

function abandon() { if (state.isHost && state.sim) state.sim.lose("The squad withdrew from the breach."); $("pause-overlay").classList.add("hidden"); }

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
  $("boss-hud").classList.toggle("hidden", !boss); if (boss) { $("boss-name").textContent = (typeof game.map === "string" ? MAPS[game.map] : game.map).boss; $("boss-health").style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`; }
  const squadHUDKey = JSON.stringify(game.players.map((p) => [p.id, p.name, p.specialist]));
  if (squadHUDKey !== state.lastSquadHUDKey) {
    state.lastSquadHUDKey = squadHUDKey;
    $("squad-hud").innerHTML = game.players.map((p) => `<div class="squad-pill"><img src="${SPECIALISTS[p.specialist].sprite}" alt=""><div><span>${escapeHTML(p.name)}</span><div class="mini-health"><i></i></div></div></div>`).join("");
  }
  [...$("squad-hud").children].forEach((pill, index) => { const p = game.players[index]; pill.querySelector("i").style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`; });
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
    $("passive-hud").innerHTML = Object.entries(player.passives || {}).filter(([, rank]) => Number(rank) > 0).map(([passiveId, rank]) => passiveSlotMarkup(passiveId, rank)).join("");
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

function renderUpgradeStats(player) {
  const damage = (1 + Number(player.passives?.damage || 0) * .1) * (player.specialist === "rift" ? 1.1 : 1);
  const stats = [
    ["Damage", `+${Math.round((damage - 1) * 100)}%`],
    ["Ability haste", `${Math.round(Number(player.passives?.haste || 0) * 10 + (player.hasteBuff > 0 ? 150 : 0))}`],
    ["Extra projectiles", `+${Math.floor(Number(player.passives?.projectiles || 0))}`],
    ["Critical chance", `${Math.round((Number(player.passives?.crit || 0) * .08 + (player.specialist === "gale" ? .15 : 0)) * 100)}%`],
    ["Area size", `+${Math.round(Number(player.passives?.area || 0) * 11)}%`],
    ["Move speed", `${Math.round(player.baseSpeed * (1 + Number(player.passives?.move || 0) * .09))}`],
    ["Armor", `${Math.round(player.armor || 0)}`],
    ["Pickup radius", `${Math.round(85 * (1 + Number(player.passives?.pickup || 0) * .35))}`],
    ["Repair / sec", `${Math.round(Number(player.passives?.regen || 0) * 4)}`],
  ];
  $("upgrade-current-stats").innerHTML = `<strong>Current build</strong>${stats.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}<p>Extra projectiles apply only to compatible attacks; utility effects and single persistent fields do not multiply.</p>`;
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
    return `<button class="upgrade-card ${selected ? "selected" : ""} ${passed ? "passed" : ""}" type="button" data-choice="${escapeHTML(choice.id)}" ${ready ? "disabled" : ""}><span class="card-type">${selected ? "Locked choice" : escapeHTML(choice.kind)}</span><kbd class="choice-key">${index + 1}</kbd><div class="card-icon ${visual.className}">${visual.markup}</div><h3>${escapeHTML(choice.name)}</h3><p>${escapeHTML(choice.copy)}</p><dl class="card-stats">${Object.entries(details).map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl><div class="level-pips">${Array.from({ length: choice.max }, (_, i) => `<i class="${i < choice.level ? "on" : ""}"></i>`).join("")}</div></button>`;
  }).join("");
  if (!ready) $("upgrade-cards").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseUpgrade(button.dataset.choice)));

  const teammates = game.players.filter((player) => player.id !== state.clientId);
  $("teammate-upgrades").classList.toggle("hidden", teammates.length === 0);
  $("teammate-upgrades").parentElement.classList.toggle("solo", teammates.length === 0);
  $("teammate-upgrades").innerHTML = teammates.map((player) => {
    const choices = game.pendingChoices?.[player.id] || [];
    const teammateReady = Boolean(game.choiceReady?.[player.id]);
    const teammateSelection = game.selectedChoices?.[player.id] || "";
    return `<section class="teammate-draft ${teammateReady ? "ready" : ""}"><header><img src="${SPECIALISTS[player.specialist].sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><span>${teammateReady ? "Choice locked" : "Choosing…"}</span></div></header><div class="teammate-choice-grid">${choices.map((choice) => { const visual = upgradeChoiceVisual(choice); return `<div class="teammate-choice ${choice.id === teammateSelection ? "selected" : ""} ${teammateReady && choice.id !== teammateSelection ? "passed" : ""}" title="${escapeHTML(choice.copy)}"><i class="${visual.className}">${visual.markup}</i><b>${escapeHTML(choice.name)}</b><small>${escapeHTML(choice.kind)} · ${choice.level}/${choice.max}</small></div>`; }).join("")}</div></section>`;
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
  if (state.isHost) state.sim?.choose(state.clientId, choiceId); else send({ type: "choice", choiceId });
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
  banner.querySelector("strong").textContent = `${title}${copy ? ` · ${copy}` : ""}`; banner.classList.remove("hidden");
  clearTimeout(banner._timer); banner._timer = setTimeout(() => banner.classList.add("hidden"), type === "danger" ? 3000 : 2400);
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
  const won = game.stage === "won"; $("result-eyebrow").textContent = won ? "Operation complete" : "Signal lost";
  $("result-title").textContent = won ? "APEX NEUTRALIZED" : "THE LINE BROKE"; $("result-title").style.color = won ? "var(--cyan)" : "var(--danger)";
  $("result-copy").textContent = won ? "The line held. Final City gets another sunrise." : "Recalibrate the loadout, regroup, and breach again.";
  $("result-time").textContent = formatTime(game.time + (game.bossElapsed || 0)); $("result-kills").textContent = Number(game.kills || 0).toLocaleString(); $("result-level").textContent = game.level; $("result-gold").textContent = Math.round(game.gold || 0);
  const mapId = typeof game.map === "string" ? game.map : game.map.id;
  const difficultyId = typeof game.difficulty === "string" ? game.difficulty : game.difficulty.id;
  const unlocks = won ? recordVictory(mapId, difficultyId) : [];
  $("result-unlock").classList.toggle("hidden", !unlocks.length);
  $("result-unlock").textContent = unlocks.length ? `Campaign updated · ${unlocks.join(" · ")}` : "";
  state.resultGame = game; renderScoreboard(game);
  saveCompletedRun(game);
  setScreen("result");
  if (state.isHost && !state.telemetrySent) {
    state.telemetrySent = true;
    submitRunTelemetry(game, BUILD).catch((error) => console.warn("Run telemetry unavailable", error));
  }
}

function returnToLobby() {
  state.sim = null; state.snapshot = null; state.previousSnapshot = null; state.endShown = false; clearTimeout(state.resultTimer);
  for (const member of state.lobby.values()) member.ready = member.id === state.clientId && state.isHost;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "return_lobby" });
  enterLobby(); if (state.isHost) broadcastLobby(); else updateLocalProfile({ ready: false });
}

function leaveToHome() { closeSocket(); state.sim = null; state.snapshot = null; state.resultGame = null; state.lobby.clear(); setScreen("home"); updateProgressionUI(); }

function connectRoom(code) {
  closeSocket(); state.room = code; state.connecting = true;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error("Relay connection timed out")); closeSocket(); }, 7000);
    state.connectResolve = (message) => { clearTimeout(timeout); resolve(message); };
    state.connectReject = (error) => { clearTimeout(timeout); reject(error); };
    const url = new URL(`${RELAY_BASE}${encodeURIComponent(code)}`); url.searchParams.set("name", callsign()); url.searchParams.set("specialist", state.selected);
    const ws = new WebSocket(url); state.ws = ws;
    ws.addEventListener("message", (event) => handleNetworkMessage(event.data));
    ws.addEventListener("error", () => state.connectReject?.(new Error("Relay connection failed")));
    ws.addEventListener("close", () => { if (state.screen === "game" && !state.isHost) { toast("Squad connection lost"); captureClientError("network", "Squad relay connection closed during a run"); } });
  });
}

function handleNetworkMessage(raw) {
  let message; try { message = JSON.parse(raw); } catch { return; }
  if (message.type === "welcome") {
    state.clientId = message.id; state.isHost = message.role === "host"; state.lobby = new Map();
    for (const peer of message.peers || []) state.lobby.set(peer.id, { id: peer.id, name: peer.name || "Connecting…", specialist: peer.specialist || "zuri", ready: false });
    state.lobby.set(state.clientId, { id: state.clientId, name: callsign(), specialist: state.selected, ready: state.isHost });
    send({ type: "profile", profile: state.lobby.get(state.clientId) }); state.connectResolve?.(message); state.connectResolve = null; return;
  }
  if (message.type === "peer_joined") {
    if (state.isHost) { state.lobby.set(message.peer.id, { id: message.peer.id, name: message.peer.name || "Connecting…", specialist: message.peer.specialist || "zuri", ready: false }); broadcastLobby(); }
  } else if (message.type === "peer_left") {
    state.lobby.delete(message.id); state.sim?.removePlayer(message.id); renderLobby(); if (state.isHost) broadcastLobby();
  } else if (message.type === "host_changed") {
    state.isHost = message.id === state.clientId; if (state.isHost && state.screen === "lobby") { const me = state.lobby.get(state.clientId); if (me) me.ready = true; broadcastLobby(); renderLobby(); }
    else if (state.isHost && state.screen === "game" && !state.sim) toast("The host left — this run cannot migrate yet");
  } else if (message.type === "profile" && state.isHost) {
    state.lobby.set(message._from, { ...message.profile, id: message._from }); broadcastLobby(); renderLobby();
  } else if (message.type === "lobby_state" && !state.isHost) {
    state.config = message.config; state.lobby = new Map(message.players.map((p) => [p.id, p])); if (state.screen === "lobby") renderLobby();
  } else if (message.type === "start" && !state.isHost) startRemoteGame(message);
  else if (message.type === "return_lobby" && !state.isHost) returnToLobby();
  else if (message.type === "input" && state.isHost) state.sim?.setInput(message._from, message.input);
  else if (message.type === "cast" && state.isHost) state.sim?.cast(message._from, message.slot);
  else if (message.type === "choice" && state.isHost) state.sim?.choose(message._from, message.choiceId);
  else if (message.type === "snapshot" && !state.isHost) {
    const now = performance.now(); if (state.snapshotAt) state.snapshotInterval = clamp(now - state.snapshotAt, 60, 180);
    state.previousSnapshot = state.snapshot; state.snapshot = message.state; state.snapshotAt = now;
  }
}

function broadcastLobby() {
  if (!state.isHost || state.ws?.readyState !== WebSocket.OPEN) return;
  send({ type: "lobby_state", config: state.config, players: [...state.lobby.values()] });
}

function send(message) { if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(message)); }
function closeSocket() { if (state.ws) { state.ws.onclose = null; state.ws.close(); } state.ws = null; state.connectResolve = null; state.connectReject = null; }
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
    enemyHealthBars: state.showEnemyHealthBars,
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

function sfx(name) {
  if (!state.audio) return;
  const audio = ensureAudio(); if (audio.state === "suspended") audio.resume();
  const note = (frequency, offset, duration, type, volume, end) => audioTone(audio, frequency, offset, duration, type, volume, end);
  if (name === "shot") note(820, 0, .055, "square", .008, 210);
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
  document.querySelectorAll(".mode-tab").forEach((button) => button.addEventListener("click", () => setPartyMode(button.dataset.partyMode)));
  $("map-select").addEventListener("change", updateDifficultyOptions);
  $("deploy-button").addEventListener("click", deploy); $("room-input").addEventListener("keydown", (event) => { if (event.key === "Enter") deploy(); });
  $("room-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
  $("lobby-back").addEventListener("click", leaveToHome); $("ready-button").addEventListener("click", handleReady); $("copy-link").addEventListener("click", copyInvite);
  $("pause-button").addEventListener("click", () => togglePause()); $("resume-button").addEventListener("click", () => togglePause(false)); $("abandon-button").addEventListener("click", abandon);
  $("enemy-health-bars-toggle").addEventListener("change", (event) => setEnemyHealthBars(event.target.checked));
  $("again-button").addEventListener("click", returnToLobby); $("result-home").addEventListener("click", leaveToHome);
  for (const id of ["run-history-button", "lobby-run-history", "result-run-history"]) $(id).addEventListener("click", openRunHistory);
  $("run-history-close").addEventListener("click", () => $("run-history-dialog").close());
  $("run-history-dialog").addEventListener("click", (event) => { if (event.target === $("run-history-dialog")) $("run-history-dialog").close(); });
  for (const id of ["audio-button", "lobby-audio"]) $(id).addEventListener("click", toggleAudio);
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
    if (isTyping || state.screen !== "game") return;
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

renderSpecialistGrid(); selectSpecialist("zuri"); bindEvents(); setEnemyHealthBars(state.showEnemyHealthBars, false); updateProgressionUI(); setPartyMode("solo");
if (query.get("room")) { setPartyMode("join"); $("room-input").value = query.get("room").toUpperCase().slice(0,6); setTimeout(() => $("callsign-input").focus(), 50); }
