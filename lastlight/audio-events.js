export const AUDIO_SPATIAL_MAX_PAN = 0.82;
export const AUDIO_SPATIAL_FULL_PAN_DISTANCE = 900;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function spatialAudioPan(source, listener, {
  maxPan = AUDIO_SPATIAL_MAX_PAN,
  fullPanDistance = AUDIO_SPATIAL_FULL_PAN_DISTANCE,
} = {}) {
  const sourceX = Number(source?.x), listenerX = Number(listener?.x);
  if (!Number.isFinite(sourceX) || !Number.isFinite(listenerX)) return 0;
  const panLimit = clamp(Number(maxPan) || AUDIO_SPATIAL_MAX_PAN, 0, 1);
  const distance = Math.max(1, Number(fullPanDistance) || AUDIO_SPATIAL_FULL_PAN_DISTANCE);
  return clamp((sourceX - listenerX) / distance, -1, 1) * panLimit;
}

export function weaponAudioCueName(grammar) {
  if (grammar?.sourceId === "signature" && grammar.specialistId) return `weapon:signature-${grammar.specialistId}`;
  if (grammar?.sourceId) return `weapon:universal-${grammar.sourceId}`;
  return `weapon:${grammar?.soundFamily || "pulse"}`;
}

export function enemyAudioCueName(entity, enemies = []) {
  if (entity?.bossShot || entity?.boss) return "enemy:apex";
  const ownerId = entity?.ownerId || entity?.id;
  const owner = enemies.find((enemy) => enemy.id === ownerId) || entity;
  if (owner?.boss) return "enemy:apex";
  if (owner?.type === "spitter" || entity?.hostile) return "enemy:spitter";
  if (owner?.type === "bomber") return "enemy:bomber";
  if (owner?.type === "brute" || owner?.type === "shark" || owner?.miniboss) return "enemy:heavy";
  return "enemy:melee";
}

export function newEntities(previousIds, entities = [], maximumRemembered = 4096) {
  const previous = previousIds instanceof Set ? previousIds : new Set(previousIds || []);
  const ordered = [...entities].filter((entity) => entity?.id != null);
  const added = ordered.filter((entity) => !previous.has(entity.id));
  const next = new Set(ordered.slice(-Math.max(1, Math.floor(maximumRemembered))).map((entity) => entity.id));
  return Object.freeze({ added: Object.freeze(added), ids: next });
}

export function weaponTimerActivations(previousTimers, players, weaponIds = ["aura", "ice"]) {
  const previous = previousTimers instanceof Map ? previousTimers : new Map();
  const current = new Map(), activated = [];
  for (const player of Array.isArray(players) ? players : []) {
    for (const weaponId of weaponIds) {
      if (!player?.weapons?.[weaponId]) continue;
      const key = `${String(player.id)}:${weaponId}`;
      const remaining = Math.max(0, Number(player.weaponTimers?.[weaponId]) || 0);
      const prior = previous.get(key);
      current.set(key, remaining);
      if (Number.isFinite(prior) && remaining > prior + .05) activated.push({ player, weaponId, remaining });
    }
  }
  return { timers: current, activated };
}
