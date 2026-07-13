export const RECONNECT_DELAYS_MS = Object.freeze([400, 800, 1_500, 3_000, 5_000, 8_000]);
export const RECONNECT_WINDOW_TICKS = 180 * 60;
export const RESTORED_HOLD_TICKS = 3 * 60;
export const DEPARTED_HOLD_TICKS = 5 * 60;

const CONNECTION_STATES = new Set(["connected", "reconnecting", "restored", "departed"]);
const SPECIALIST_ID = /^[a-z][a-z0-9-]{0,31}$/;

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

function replaySlot(value) { return integer(Number(value), 0, 3, "replay slot"); }

function safeText(value, fallback, max = 32) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : fallback;
}

function publicPlayer(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("presence player is invalid");
  const specialist = safeText(value.specialist, fallback.specialist || "zuri").toLowerCase();
  if (!SPECIALIST_ID.test(specialist)) throw new TypeError("presence specialist is invalid");
  return {
    id: safeText(value.id, fallback.id || `seat-${replaySlot(value.replaySlot ?? fallback.replaySlot)}`, 64),
    replaySlot: replaySlot(value.replaySlot ?? fallback.replaySlot),
    name: safeText(value.name, fallback.name || "Specialist"),
    specialist,
    hp: Number.isFinite(value.hp) ? Math.max(0, Number(value.hp)) : Math.max(0, Number(fallback.hp) || 0),
    maxHp: Number.isFinite(value.maxHp) ? Math.max(1, Number(value.maxHp)) : Math.max(1, Number(fallback.maxHp) || 1),
    shield: Number.isFinite(value.shield) ? Math.max(0, Number(value.shield)) : Math.max(0, Number(fallback.shield) || 0),
  };
}

function transition(entry, status, tick, extra = {}) {
  return { ...entry, ...extra, status, statusSinceTick: tick };
}

export function authorityStateCopy(state, detail = {}) {
  const total = RECONNECT_DELAYS_MS.length;
  const attempt = Math.min(total, Math.max(0, Number(detail.attempt) || 0));
  const retryMs = Math.max(0, Number(detail.nextRetryMs) || 0);
  if (state === "reconnecting") {
    const progress = detail.phase === "offline" ? "Browser offline · attempts paused until the connection returns" : detail.phase === "connecting"
      ? `Reconnection attempt ${Math.max(1, attempt)} of ${total}`
      : `Attempt ${Math.min(total, attempt + 1)} of ${total}${retryMs ? ` in ${(retryMs / 1_000).toFixed(retryMs < 1_000 ? 1 : 0)} seconds` : ""}`;
    return { mark: "↻", title: "RECONNECTING", copy: "Connection interrupted. The operation is frozen and no input is being applied.", progress, terminal: false };
  }
  if (state === "synchronizing") return { mark: "⇄", title: "SYNCHRONIZING", copy: "The relay is back. Waiting for the current authority to restore your specialist, loadout, and exact run state.", progress: "Transport restored · authority sync pending", terminal: false };
  if (state === "migrating") return { mark: "↻", title: "MIGRATING HOST", copy: `Restoring deterministic authority${detail.tick !== undefined ? ` from tick ${detail.tick}` : ""}. The battlefield is frozen.`, progress: "Electing successor · verifying checkpoint · fencing stale input", terminal: false };
  if (state === "restored") return { mark: "✓", title: "OPERATION RESTORED", copy: "Your specialist and the squad are synchronized with the current authority. Release movement controls, then continue.", progress: "Authority verified · controls ready", terminal: false };
  if (state === "unavailable") {
    const reason = String(detail.reason || "unavailable");
    const failures = {
      "no-checkpoint": ["NO SAFE CHECKPOINT", "The host disconnected before a verified checkpoint reached the squad."],
      "no-compatible-successor": ["NO COMPATIBLE SUCCESSOR", "No connected specialist can safely resume this run's build and balance contract."],
      disabled: ["RECOVERY DISABLED", "Host recovery is temporarily disabled. The run will not continue from an unverified state."],
      "missing-candidate-state": ["RESTORE STATE MISSING", "The elected host could not verify the exact checkpoint required to resume."],
      "reconnect-exhausted": ["RELAY UNREACHABLE", "All bounded reconnection attempts were exhausted without an authoritative sync."],
      incompatible: ["BUILD MISMATCH", "The available squad clients do not share the run's exact compatibility contract."],
      timeout: ["RECOVERY TIMED OUT", "No successor completed checkpoint verification inside the safe recovery window."],
    };
    const [title, copy] = failures[reason] || ["RUN UNAVAILABLE", "No compatible authority checkpoint survived. This run will not continue from an unsafe state."];
    return { mark: "!", title, copy, progress: `Safe stop · ${reason.replaceAll("-", " ")}`, terminal: true };
  }
  return { mark: "·", title: "NETWORK HOLD", copy: "The operation is frozen while authority is verified.", progress: "Verification pending", terminal: false };
}

export class SquadPresenceTracker {
  constructor({ reconnectWindowTicks = RECONNECT_WINDOW_TICKS, restoredHoldTicks = RESTORED_HOLD_TICKS, departedHoldTicks = DEPARTED_HOLD_TICKS } = {}) {
    this.reconnectWindowTicks = integer(reconnectWindowTicks, 1, 60 * 60 * 60, "reconnect window");
    this.restoredHoldTicks = integer(restoredHoldTicks, 1, 60 * 60, "restored hold");
    this.departedHoldTicks = integer(departedHoldTicks, 1, 60 * 60, "departed hold");
    this.entries = new Map();
  }

  reset(players = [], tick = 0) {
    this.entries.clear();
    for (const player of players) this.connect(player, tick);
    return this.view();
  }

  getById(id) { return [...this.entries.values()].find((entry) => entry.id === id) || null; }

  connect(player, tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    const previous = this.entries.get(replaySlot(player.replaySlot));
    const profile = publicPlayer(player, previous);
    const entry = { ...profile, status: "connected", statusSinceTick: tick, deadlineTick: null };
    this.entries.set(entry.replaySlot, entry);
    return entry;
  }

  observe(players = [], tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    const transitions = this.advance(tick);
    for (const player of players) {
      const slot = replaySlot(player.replaySlot), previous = this.entries.get(slot);
      if (!previous) { this.connect(player, tick); continue; }
      const profile = publicPlayer(player, previous);
      if (previous.status === "reconnecting" && profile.id !== previous.id) transitions.push(this.restore(profile, tick));
      else if (previous.status === "departed") this.connect(profile, tick);
      else this.entries.set(slot, { ...previous, ...profile });
    }
    return transitions.filter(Boolean);
  }

  disconnect(player, tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    const previous = Number.isInteger(Number(player?.replaySlot)) ? this.entries.get(replaySlot(player.replaySlot)) : this.getById(String(player?.id || ""));
    if (!previous || previous.status === "departed") return null;
    if (previous.status === "reconnecting") return previous;
    const profile = publicPlayer({ ...previous, ...player, replaySlot: previous.replaySlot }, previous);
    const entry = transition(profile, "reconnecting", tick, { deadlineTick: tick + this.reconnectWindowTicks });
    this.entries.set(entry.replaySlot, entry);
    return entry;
  }

  restore(player, tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    const slot = replaySlot(player.replaySlot), previous = this.entries.get(slot);
    if (!previous || previous.status === "departed" || tick > Number(previous.deadlineTick ?? tick)) return this.connect(player, tick);
    if (previous.status === "restored" && previous.id === player.id) return previous;
    const profile = publicPlayer(player, previous);
    const entry = transition(profile, "restored", tick, { deadlineTick: null });
    this.entries.set(slot, entry);
    return entry;
  }

  depart(slot, tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    slot = replaySlot(slot);
    const previous = this.entries.get(slot);
    if (!previous || previous.status === "departed") return previous || null;
    const entry = transition(previous, "departed", tick, { deadlineTick: null });
    this.entries.set(slot, entry);
    return entry;
  }

  advance(tick = 0) {
    tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "presence tick");
    const transitions = [];
    for (const [slot, entry] of this.entries) {
      if (!CONNECTION_STATES.has(entry.status)) { this.entries.delete(slot); continue; }
      if (entry.status === "reconnecting" && tick > entry.deadlineTick) transitions.push(this.depart(slot, tick));
      else if (entry.status === "restored" && tick - entry.statusSinceTick >= this.restoredHoldTicks) this.entries.set(slot, transition(entry, "connected", tick, { deadlineTick: null }));
      else if (entry.status === "departed" && tick - entry.statusSinceTick >= this.departedHoldTicks) this.entries.delete(slot);
    }
    return transitions.filter(Boolean);
  }

  view() { return [...this.entries.values()].sort((left, right) => left.replaySlot - right.replaySlot).map((entry) => ({ ...entry })); }
}
