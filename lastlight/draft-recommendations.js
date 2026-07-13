const MAX_REPLAY_SLOT = 3;

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

function entryKey(entry) { return `${entry.recommenderSlot}:${entry.targetSlot}`; }

function normalizeEntry(value, { active = value?.active !== false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("draft recommendation entry is invalid");
  return Object.freeze({
    epoch: integer(value.epoch, 0, 0x7fffffff, "recommendation epoch"),
    seq: integer(value.seq, 0, 0x7fffffff, "recommendation sequence"),
    recommenderSlot: integer(value.recommenderSlot, 0, MAX_REPLAY_SLOT, "recommender slot"),
    targetSlot: integer(value.targetSlot, 0, MAX_REPLAY_SLOT, "target slot"),
    round: integer(value.round, 0, 0x7fffffff, "draft round"),
    revision: integer(value.revision, 0, 0x7fffffff, "draft revision"),
    optionIndex: integer(value.optionIndex, 0, 2, "draft option index"),
    active: Boolean(active),
  });
}

/** Presentation-only recommendation state. Never serialize this through Simulation. */
export class DraftRecommendationStore {
  constructor(epoch = 0) { this.reset(epoch); }

  reset(epoch = 0) {
    this.epoch = integer(epoch, 0, 0x7fffffff, "recommendation epoch");
    this.active = new Map();
    this.lastSequence = new Map();
    this.revision = 0;
    return this;
  }

  rebase(epoch = 0) {
    epoch = integer(epoch, 0, 0x7fffffff, "recommendation epoch");
    this.epoch = epoch;
    this.active = new Map([...this.active].map(([key, entry]) => [key, Object.freeze({ ...entry, epoch })]));
    this.lastSequence.clear();
    this.revision++;
    return this;
  }

  resetSeat(replaySlot) {
    replaySlot = integer(replaySlot, 0, MAX_REPLAY_SLOT, "recommendation replay slot");
    return this.lastSequence.delete(replaySlot);
  }

  apply(value) {
    const entry = normalizeEntry(value);
    if (entry.epoch !== this.epoch || entry.recommenderSlot === entry.targetSlot) return { accepted: false, reason: "identity" };
    const previousSequence = this.lastSequence.get(entry.recommenderSlot);
    if (previousSequence !== undefined && entry.seq <= previousSequence) return { accepted: false, reason: "sequence" };
    this.lastSequence.set(entry.recommenderSlot, entry.seq);
    const key = entryKey(entry), current = this.active.get(key);
    if (entry.active) this.active.set(key, entry);
    else if (current && current.round === entry.round && current.revision === entry.revision && current.optionIndex === entry.optionIndex) this.active.delete(key);
    this.revision++;
    return { accepted: true, entry, replaced: current || null };
  }

  replace(sync) {
    const epoch = integer(sync?.epoch, 0, 0x7fffffff, "recommendation sync epoch");
    if (epoch !== this.epoch || !Array.isArray(sync?.entries) || sync.entries.length > 12) return { accepted: false, reason: "sync" };
    const next = new Map(), lastSequence = new Map();
    for (const value of sync.entries) {
      const entry = normalizeEntry({ ...value, epoch }, { active: true });
      if (entry.recommenderSlot === entry.targetSlot) return { accepted: false, reason: "identity" };
      const key = entryKey(entry);
      if (next.has(key)) return { accepted: false, reason: "duplicate" };
      next.set(key, entry);
      lastSequence.set(entry.recommenderSlot, Math.max(lastSequence.get(entry.recommenderSlot) ?? -1, entry.seq));
    }
    this.active = next; this.lastSequence = lastSequence; this.revision++;
    return { accepted: true, entries: this.entries() };
  }

  prune(game) {
    const players = Array.isArray(game?.players) ? game.players : [];
    const bySlot = new Map(players.filter((player) => Number.isInteger(player.replaySlot)).map((player) => [player.replaySlot, player]));
    let changed = false;
    for (const [key, entry] of this.active) {
      const target = bySlot.get(entry.targetSlot), source = bySlot.get(entry.recommenderSlot);
      const choices = target ? game?.pendingChoices?.[target.id] : null;
      const draft = target?.draft;
      const future = draft && (draft.round < entry.round || draft.round === entry.round && draft.revision < entry.revision);
      const current = draft && draft.round === entry.round && draft.revision === entry.revision;
      if (!source || !target || !Array.isArray(choices) || !draft || !future && (!current || !choices[entry.optionIndex])) {
        this.active.delete(key); changed = true;
      }
    }
    if (changed) this.revision++;
    return changed;
  }

  entries() {
    return [...this.active.values()].sort((left, right) => left.targetSlot - right.targetSlot || left.recommenderSlot - right.recommenderSlot);
  }

  forOption(targetSlot, round, revision, optionIndex) {
    return this.entries().filter((entry) => entry.targetSlot === targetSlot && entry.round === round && entry.revision === revision && entry.optionIndex === optionIndex);
  }

  recommendationBy(recommenderSlot, targetSlot) { return this.active.get(`${recommenderSlot}:${targetSlot}`) || null; }
}

export function recommendationMarkerModel(entries, players = []) {
  const bySlot = new Map(players.map((player) => [player.replaySlot, player]));
  return entries.map((entry) => {
    const player = bySlot.get(entry.recommenderSlot);
    return Object.freeze({
      replaySlot: entry.recommenderSlot,
      name: player?.name || `Specialist ${entry.recommenderSlot + 1}`,
      specialist: player?.specialist || "zuri",
    });
  });
}
