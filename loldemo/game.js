import { SPECIALISTS, SPECIALIST_ORDER, WEAPONS, MAPS, DIFFICULTIES, WAVE_NAMES, formatTime, clamp } from "./data.js";
import { Simulation } from "./engine.js";
import { Renderer } from "./render.js";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home-screen"), lobby: $("lobby-screen"), game: $("game-screen"), result: $("result-screen") };
const query = new URLSearchParams(location.search);
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const RELAY_BASE = query.get("relay") || (localHost ? "ws://localhost:8787/room/" : "wss://lastlight-relay.bensonperry.workers.dev/room/");
const renderer = new Renderer($("game-canvas"));

const state = {
  screen: "home", partyMode: "solo", selected: "zuri", clientId: "solo", isHost: true, room: "",
  lobby: new Map(), ws: null, connecting: false, connectResolve: null, connectReject: null,
  config: { map: "warehouse", difficulty: "story", duration: 240 }, sim: null,
  previousSnapshot: null, snapshot: null, snapshotAt: 0, snapshotInterval: 90,
  input: { keys: new Set(), aim: 0, autoAim: true, touchX: 0, touchY: 0 },
  animation: 0, lastFrame: 0, lastSend: 0, lastBroadcast: 0, lastLobbyBroadcast: 0,
  lastUpgradeKey: "", lastEventSeq: 0, endShown: false, resultTimer: null,
  audio: true, audioContext: null, toastTimer: null,
};

function setScreen(name) {
  state.screen = name;
  for (const [key, screen] of Object.entries(screens)) screen.classList.toggle("hidden", key !== name);
  document.body.style.overflow = name === "game" ? "hidden" : "auto";
}

function callsign() {
  return ($("callsign-input").value.trim() || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16);
}

function renderHomeRoster() {
  $("home-roster").innerHTML = SPECIALIST_ORDER.map((id) => {
    const spec = SPECIALISTS[id];
    return `<button class="roster-mini" type="button" data-specialist="${id}" aria-label="Choose ${spec.name}"><img src="${spec.sprite}" alt=""><span>${spec.number} ${spec.name.toUpperCase()}</span></button>`;
  }).join("");
  $("home-roster").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    selectSpecialist(button.dataset.specialist); enterLobbySoloPreview();
  }));
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
  $("deploy-button").querySelector("span").textContent = mode === "solo" ? "Deploy solo" : mode === "host" ? "Create squad" : "Join squad";
}

async function deploy() {
  if (state.connecting) return;
  state.config = { map: $("map-select").value, difficulty: $("difficulty-select").value, duration: Number($("duration-select").value) };
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
  setScreen("game"); renderer.resize(); state.endShown = false; state.lastEventSeq = 0; state.lastUpgradeKey = ""; state.lastFrame = performance.now();
  state.lastSend = 0; state.lastBroadcast = 0; renderer.camera.x = 0; renderer.camera.y = 0; $("game-canvas").focus();
  if (!state.animation) state.animation = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (state.screen !== "game") { state.animation = 0; return; }
  const dt = Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000)); state.lastFrame = now;
  const input = currentInput();
  if (state.isHost && state.sim) {
    state.sim.setInput(state.clientId, input); state.sim.update(dt);
    if (state.ws?.readyState === WebSocket.OPEN && now - state.lastBroadcast > 83) { state.lastBroadcast = now; send({ type: "snapshot", state: state.sim.snapshot() }); }
  } else if (state.ws?.readyState === WebSocket.OPEN && now - state.lastSend > 35) {
    state.lastSend = now; send({ type: "input", input });
  }
  const current = state.isHost ? state.sim : state.snapshot;
  if (current) {
    const interpolation = state.isHost ? 1 : clamp((now - state.snapshotAt) / state.snapshotInterval, 0, 1);
    renderer.draw(current, state.clientId, state.isHost ? null : state.previousSnapshot, interpolation);
    updateHUD(current); updateUpgrade(current); processEvents(current.events || []);
    if ((current.stage === "won" || current.stage === "lost") && !state.endShown) scheduleResult(current);
  }
  state.animation = requestAnimationFrame(gameLoop);
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
  if (state.isHost) { if (state.sim?.cast(state.clientId, slot)) tone(slot === "r" ? 120 : 280, .1, "sawtooth"); }
  else send({ type: "cast", slot });
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
  const spec = SPECIALISTS[player.specialist];
  $("game-timer").textContent = game.stage === "boss" ? "APEX" : formatTime(game.remaining);
  $("wave-label").textContent = game.stage === "boss" ? `${(typeof game.map === "string" ? MAPS[game.map] : game.map).boss} · ENRAGE ${formatTime(300 - (game.bossElapsed || 0))}` : `Wave ${String((game.wave || 0) + 1).padStart(2, "0")} · ${WAVE_NAMES[game.wave || 0]}`;
  $("timer-progress").style.width = `${game.stage === "boss" ? 100 : clamp(game.time / game.duration * 100, 0, 100)}%`;
  $("kill-count").textContent = Number(game.kills || 0).toLocaleString(); $("gold-count").textContent = Math.round(game.gold || 0).toLocaleString();
  $("level-label").textContent = `LV ${game.level}`; $("xp-progress").style.width = `${clamp(game.teamXP / game.xpNeed * 100, 0, 100)}%`;
  $("e-name").textContent = game.level < 3 ? "Unlocks Lv 3" : spec.active[0]; $("r-name").textContent = game.level < 6 ? "Unlocks Lv 6" : spec.ultimate[0];
  $("e-cooldown").style.height = `${clamp(player.eCd / spec.cooldownE * 100, 0, 100)}%`; $("r-cooldown").style.height = `${clamp(player.rCd / spec.cooldownR * 100, 0, 100)}%`;
  $("pause-overlay").classList.toggle("hidden", !(game.paused && game.pauseReason === "manual"));
  const boss = game.enemies?.find((enemy) => enemy.boss);
  $("boss-hud").classList.toggle("hidden", !boss); if (boss) { $("boss-name").textContent = (typeof game.map === "string" ? MAPS[game.map] : game.map).boss; $("boss-health").style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`; }
  $("squad-hud").innerHTML = game.players.map((p) => `<div class="squad-pill"><img src="${SPECIALISTS[p.specialist].sprite}" alt=""><div><span>${escapeHTML(p.name)}</span><div class="mini-health"><i style="width:${clamp(p.hp / p.maxHp * 100,0,100)}%"></i></div></div></div>`).join("");
  const weaponEntries = Object.entries(player.weapons || {});
  $("weapon-hud").innerHTML = weaponEntries.map(([weaponId, weapon]) => {
    const data = weaponId === "signature" ? spec.signature : WEAPONS[weaponId];
    return `<div class="weapon-slot ${weapon.evolved ? "evolved" : ""}" title="${weapon.evolved ? data.evolve : data.name}">${data.glyph}<small>${weapon.evolved ? "E" : weapon.level}</small></div>`;
  }).join("");
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
  $("upgrade-local-name").textContent = localPlayer?.name || callsign();
  $("upgrade-local-status").textContent = ready ? "Locked" : "Choosing";
  $("upgrade-cards").innerHTML = pending.map((choice) => {
    const selected = selectedId === choice.id, passed = ready && !selected;
    return `<button class="upgrade-card ${selected ? "selected" : ""} ${passed ? "passed" : ""}" type="button" data-choice="${choice.id}" ${ready ? "disabled" : ""}><span class="card-type">${selected ? "Locked choice" : choice.kind}</span><div class="card-icon">${choice.glyph}</div><h3>${choice.name}</h3><p>${choice.copy}</p><div class="level-pips">${Array.from({ length: choice.max }, (_, i) => `<i class="${i < choice.level ? "on" : ""}"></i>`).join("")}</div></button>`;
  }).join("");
  if (!ready) $("upgrade-cards").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseUpgrade(button.dataset.choice)));

  const teammates = game.players.filter((player) => player.id !== state.clientId);
  $("teammate-upgrades").classList.toggle("hidden", teammates.length === 0);
  $("teammate-upgrades").parentElement.classList.toggle("solo", teammates.length === 0);
  $("teammate-upgrades").innerHTML = teammates.map((player) => {
    const choices = game.pendingChoices?.[player.id] || [];
    const teammateReady = Boolean(game.choiceReady?.[player.id]);
    const teammateSelection = game.selectedChoices?.[player.id] || "";
    return `<section class="teammate-draft ${teammateReady ? "ready" : ""}"><header><img src="${SPECIALISTS[player.specialist].sprite}" alt=""><div><strong>${escapeHTML(player.name)}</strong><span>${teammateReady ? "Choice locked" : "Choosing…"}</span></div></header><div class="teammate-choice-grid">${choices.map((choice) => `<div class="teammate-choice ${choice.id === teammateSelection ? "selected" : ""} ${teammateReady && choice.id !== teammateSelection ? "passed" : ""}" title="${choice.copy}"><i>${choice.glyph}</i><b>${choice.name}</b><small>${choice.kind} · ${choice.level}/${choice.max}</small></div>`).join("")}</div></section>`;
  }).join("");

  const waiting = game.players.filter((player) => !game.choiceReady?.[player.id]).map((player) => player.id === state.clientId ? "you" : player.name);
  const picked = pending.find((choice) => choice.id === selectedId);
  $("upgrade-wait").textContent = ready ? `${picked?.name || "Upgrade"} locked. Waiting on ${waiting.join(", ") || "the squad"}.` : "Your choices are primary; teammate options stay visible so the squad can coordinate.";
}

function chooseUpgrade(choiceId) {
  tone(520, .08, "triangle");
  if (state.isHost) state.sim?.choose(state.clientId, choiceId); else send({ type: "choice", choiceId });
}

function processEvents(events) {
  for (const event of events) {
    if (event.seq <= state.lastEventSeq) continue; state.lastEventSeq = event.seq;
    if (event.type === "cast") { tone(320, .04, "square"); continue; }
    if (event.type === "danger") tone(105, .18, "sawtooth"); else if (event.type === "victory") tone(620, .45, "triangle"); else tone(430, .08, "sine");
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

function showResult(game) {
  const won = game.stage === "won"; $("result-eyebrow").textContent = won ? "Operation complete" : "Signal lost";
  $("result-title").textContent = won ? "APEX NEUTRALIZED" : "THE LINE BROKE"; $("result-title").style.color = won ? "var(--cyan)" : "var(--danger)";
  $("result-copy").textContent = won ? "The line held. Final City gets another sunrise." : "Recalibrate the loadout, regroup, and breach again.";
  $("result-time").textContent = formatTime(game.time + (game.bossElapsed || 0)); $("result-kills").textContent = Number(game.kills || 0).toLocaleString(); $("result-level").textContent = game.level; $("result-gold").textContent = Math.round(game.gold || 0);
  setScreen("result");
}

function returnToLobby() {
  state.sim = null; state.snapshot = null; state.previousSnapshot = null; state.endShown = false; clearTimeout(state.resultTimer);
  for (const member of state.lobby.values()) member.ready = member.id === state.clientId && state.isHost;
  if (state.ws?.readyState === WebSocket.OPEN) send({ type: "return_lobby" });
  enterLobby(); if (state.isHost) broadcastLobby(); else updateLocalProfile({ ready: false });
}

function leaveToHome() { closeSocket(); state.sim = null; state.snapshot = null; state.lobby.clear(); setScreen("home"); }

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
    ws.addEventListener("close", () => { if (state.screen === "game" && !state.isHost) toast("Squad connection lost"); });
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

function ensureAudio() { if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)(); return state.audioContext; }
function tone(frequency, duration = .08, type = "sine") {
  if (!state.audio) return; const audio = ensureAudio(); if (audio.state === "suspended") audio.resume();
  const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function toggleAudio() { state.audio = !state.audio; for (const id of ["audio-button", "lobby-audio"]) { $(id).textContent = state.audio ? "Sound on" : "Sound off"; $(id).setAttribute("aria-pressed", String(!state.audio)); } if (state.audio) tone(440); }

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
  $("deploy-button").addEventListener("click", deploy); $("room-input").addEventListener("keydown", (event) => { if (event.key === "Enter") deploy(); });
  $("room-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
  $("lobby-back").addEventListener("click", leaveToHome); $("ready-button").addEventListener("click", handleReady); $("copy-link").addEventListener("click", copyInvite);
  $("pause-button").addEventListener("click", () => togglePause()); $("resume-button").addEventListener("click", () => togglePause(false)); $("abandon-button").addEventListener("click", abandon);
  $("again-button").addEventListener("click", returnToLobby); $("result-home").addEventListener("click", leaveToHome);
  for (const id of ["audio-button", "lobby-audio"]) $(id).addEventListener("click", toggleAudio);
  $("how-button").addEventListener("click", () => $("manual-dialog").showModal()); $("manual-close").addEventListener("click", () => $("manual-dialog").close());
  $("manual-dialog").addEventListener("click", (event) => { if (event.target === $("manual-dialog")) $("manual-dialog").close(); });
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    if (isTyping || state.screen !== "game") return;
    const key = event.key.toLowerCase(); if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e","r","c","escape"].includes(key)) event.preventDefault();
    if (key === "e" && !event.repeat) cast("e"); else if (key === "r" && !event.repeat) cast("r");
    else if (key === "c" && !event.repeat) { state.input.autoAim = !state.input.autoAim; toast(state.input.autoAim ? "Auto-aim on" : "Manual aim on"); }
    else if (key === "escape" && !event.repeat && state.screen === "game") togglePause();
    state.input.keys.add(key);
  });
  window.addEventListener("keyup", (event) => state.input.keys.delete(event.key.toLowerCase())); window.addEventListener("blur", () => state.input.keys.clear());
  $("game-canvas").addEventListener("pointermove", (event) => { const rect=$("game-canvas").getBoundingClientRect();state.input.aim=Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2); });
  $("game-canvas").addEventListener("contextmenu", (event) => event.preventDefault());
  setupTouch();
}

renderHomeRoster(); renderSpecialistGrid(); selectSpecialist("zuri"); bindEvents(); setPartyMode("solo");
if (query.get("room")) { setPartyMode("join"); $("room-input").value = query.get("room").toUpperCase().slice(0,6); setTimeout(() => $("callsign-input").focus(), 50); }
