export const MAP_MECHANICS_SCHEMA = "lastlight.map-mechanics.v1";
export const MAP_MECHANIC_IDS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);
export const MAP_MECHANIC_PATTERNS = Object.freeze(["horizontal-lanes", "vertical-lanes", "alternating-grid", "sweep"]);
export const MAP_MECHANIC_EFFECTS = Object.freeze(["freight", "ion", "cryo", "undertow"]);
export const MAP_MECHANIC_ARCHETYPES = Object.freeze(["mite", "hound", "spitter", "brute", "bomber", "shark"]);
export const MAP_MECHANIC_TICK_RATE = 60;

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const composition = (mite, hound, spitter, brute, bomber, shark) => ({ mite, hound, spitter, brute, bomber, shark });
const effect = (kind, playerDamage, enemyDamageFraction, playerSpeedMultiplier, enemyControlSeconds, pushPerSecond) => ({
  kind, playerDamage, enemyDamageFraction, playerSpeedMultiplier, enemyControlSeconds, pushPerSecond,
});

export const MAP_MECHANICS = deepFreeze({
  schema: MAP_MECHANICS_SCHEMA,
  maps: {
    warehouse: {
      id: "warehouse", name: "Freight Grid", short: "Freight lanes",
      description: "Announced freight lanes surge across the district and carry every combatant along their marked direction.",
      counterplay: "Change lanes before the chevrons energize, or ride the freight flow to reposition the horde.",
      cycleTicks: 1_320, warningTicks: 180, activeTicks: 300, pattern: "horizontal-lanes",
      lanes: [-540, 0, 540], halfWidth: 118,
      effect: effect("freight", 0, 0, 1, 0, 92),
      composition: composition(100, 88, 72, 145, 132, 100),
    },
    outskirts: {
      id: "outskirts", name: "Ion Front", short: "Ion strike lanes",
      description: "The ash front marks a vertical kill lane before orbital fire burns through specialists and enemies alike.",
      counterplay: "Leave the bracketed lane during the warning, or bait priority targets into the strike.",
      cycleTicks: 1_500, warningTicks: 210, activeTicks: 72, pattern: "vertical-lanes",
      lanes: [-720, 0, 720], halfWidth: 145,
      effect: effect("ion", 1, .085, 1, 0, 0),
      composition: composition(82, 142, 138, 72, 95, 100),
    },
    lab: {
      id: "lab", name: "Cryo Grid", short: "Alternating cold corridors",
      description: "Containment corridors alternate orientation, slowing specialists while flash-freezing hostiles caught inside.",
      counterplay: "Fight from the warm gaps, or hold enemies inside the blue crosshatch to interrupt their approach.",
      cycleTicks: 1_260, warningTicks: 150, activeTicks: 360, pattern: "alternating-grid",
      lanes: [-500, 0, 500], halfWidth: 132,
      effect: effect("cryo", 0, 0, .7, .18, 0),
      composition: composition(72, 88, 152, 108, 138, 100),
    },
    beachhead: {
      id: "beachhead", name: "Undertow", short: "Cross-field tide sweep",
      description: "A tidal front crosses the beachhead, displacing every combatant and bruising specialists who remain in the current.",
      counterplay: "Cross the warning line before the surge, or use its direction to scatter an encircling wave.",
      cycleTicks: 1_560, warningTicks: 210, activeTicks: 420, pattern: "sweep",
      lanes: [0], halfWidth: 210,
      effect: effect("undertow", .5, 0, .82, 0, 126),
      composition: composition(138, 118, 78, 92, 72, 155),
    },
  },
});

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function finite(value, min, max) { return Number.isFinite(value) && value >= min && value <= max; }

export function validateMapMechanics(value = MAP_MECHANICS) {
  const errors = [];
  if (!exactKeys(value, ["schema", "maps"]) || value.schema !== MAP_MECHANICS_SCHEMA) return ["map mechanics root is invalid"];
  if (!exactKeys(value.maps, MAP_MECHANIC_IDS)) return ["map mechanics coverage is invalid"];
  for (const mapId of MAP_MECHANIC_IDS) {
    const record = value.maps[mapId], path = `maps.${mapId}`;
    if (!exactKeys(record, ["id", "name", "short", "description", "counterplay", "cycleTicks", "warningTicks", "activeTicks", "pattern", "lanes", "halfWidth", "effect", "composition"])) { errors.push(`${path} fields are invalid`); continue; }
    if (record.id !== mapId || ![record.name, record.short, record.description, record.counterplay].every((entry) => typeof entry === "string" && entry.length >= 3)) errors.push(`${path} identity is invalid`);
    if (!Number.isSafeInteger(record.cycleTicks) || !Number.isSafeInteger(record.warningTicks) || !Number.isSafeInteger(record.activeTicks)
      || record.cycleTicks < 600 || record.cycleTicks > 3_600 || record.warningTicks < 60 || record.activeTicks < 30
      || record.warningTicks + record.activeTicks >= record.cycleTicks) errors.push(`${path} cadence is invalid`);
    if (!MAP_MECHANIC_PATTERNS.includes(record.pattern) || !Array.isArray(record.lanes) || record.lanes.length < 1 || record.lanes.length > 4
      || record.lanes.some((lane) => !finite(lane, -1_200, 1_200)) || !finite(record.halfWidth, 80, 320)) errors.push(`${path} geometry is invalid`);
    if (!exactKeys(record.effect, ["kind", "playerDamage", "enemyDamageFraction", "playerSpeedMultiplier", "enemyControlSeconds", "pushPerSecond"])
      || !MAP_MECHANIC_EFFECTS.includes(record.effect?.kind) || !finite(record.effect?.playerDamage, 0, 2) || !finite(record.effect?.enemyDamageFraction, 0, .15)
      || !finite(record.effect?.playerSpeedMultiplier, .5, 1) || !finite(record.effect?.enemyControlSeconds, 0, 1) || !finite(record.effect?.pushPerSecond, 0, 180)) errors.push(`${path} effect is invalid`);
    if (!exactKeys(record.composition, MAP_MECHANIC_ARCHETYPES) || Object.values(record.composition).some((weight) => !Number.isSafeInteger(weight) || weight < 50 || weight > 180)) errors.push(`${path} composition is invalid`);
  }
  return errors;
}

export function mapMechanicDefinition(mapId, registry = MAP_MECHANICS) {
  const errors = validateMapMechanics(registry);
  if (errors.length) throw new TypeError(errors.join("; "));
  const definition = registry.maps[mapId];
  if (!definition) throw new RangeError(`Unsupported map mechanic: ${mapId}`);
  return definition;
}

export function mapMechanicFrame(mapId, tick, { worldWidth = 3_600, worldHeight = 2_400 } = {}) {
  const definition = mapMechanicDefinition(mapId);
  if (!Number.isSafeInteger(tick) || tick < 0 || !finite(worldWidth, 1_000, 10_000) || !finite(worldHeight, 800, 10_000)) throw new RangeError("Map mechanic frame input is invalid");
  const cycle = Math.floor(tick / definition.cycleTicks), localTick = tick % definition.cycleTicks;
  const activeStart = definition.cycleTicks - definition.activeTicks, warningStart = activeStart - definition.warningTicks;
  const phase = localTick >= activeStart ? "active" : localTick >= warningStart ? "warning" : "idle";
  const remainingTicks = phase === "active" ? definition.cycleTicks - localTick : phase === "warning" ? activeStart - localTick : warningStart - localTick;
  const laneIndex = cycle % definition.lanes.length, direction = cycle % 2 === 0 ? 1 : -1;
  let axis = definition.pattern === "vertical-lanes" ? "vertical" : "horizontal", center = definition.lanes[laneIndex];
  if (definition.pattern === "alternating-grid") axis = cycle % 2 === 0 ? "vertical" : "horizontal";
  if (definition.pattern === "sweep") {
    axis = "vertical";
    const progress = phase === "active" ? Math.min(1, Math.max(0, (localTick - activeStart) / definition.activeTicks)) : 0;
    center = direction > 0 ? -worldWidth / 2 + progress * worldWidth : worldWidth / 2 - progress * worldWidth;
  }
  return deepFreeze({
    schema: MAP_MECHANICS_SCHEMA, mapId, name: definition.name, short: definition.short, phase, cycle, laneIndex, direction,
    remainingTicks, remainingSeconds: Math.ceil(remainingTicks / MAP_MECHANIC_TICK_RATE), active: phase === "active", warning: phase === "warning",
    geometry: { kind: definition.pattern === "sweep" ? "sweep" : "lane", axis, center, halfWidth: definition.halfWidth, worldWidth, worldHeight },
    effect: definition.effect,
  });
}

export function pointInMapMechanic(frame, x, y) {
  if (!frame?.geometry || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const coordinate = frame.geometry.axis === "vertical" ? x : y;
  return Math.abs(coordinate - frame.geometry.center) <= frame.geometry.halfWidth;
}

export function mapSpawnWeights(mapId, baseWeights, registry = MAP_MECHANICS) {
  const definition = mapMechanicDefinition(mapId, registry);
  if (!baseWeights || typeof baseWeights !== "object" || Array.isArray(baseWeights) || !Object.keys(baseWeights).length) throw new TypeError("Base spawn weights are required");
  const entries = Object.entries(baseWeights).sort(([left], [right]) => left.localeCompare(right));
  if (entries.some(([id, weight]) => !MAP_MECHANIC_ARCHETYPES.includes(id) || !Number.isSafeInteger(weight) || weight <= 0)) throw new TypeError("Base spawn weights are invalid");
  const weighted = entries.map(([id, weight]) => [id, weight * definition.composition[id]]);
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0), available = 100 - weighted.length;
  const shares = weighted.map(([id, weight]) => {
    const scaled = weight / total * available, floor = Math.floor(scaled);
    return { id, value: 1 + floor, remainder: scaled - floor };
  });
  let remainder = 100 - shares.reduce((sum, entry) => sum + entry.value, 0);
  for (const entry of [...shares].sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id))) {
    if (remainder-- <= 0) break;
    entry.value++;
  }
  return deepFreeze(Object.fromEntries(shares.sort((left, right) => left.id.localeCompare(right.id)).map(({ id, value }) => [id, value])));
}

const validationErrors = validateMapMechanics();
if (validationErrors.length) throw new Error(`Invalid map mechanics registry:\n- ${validationErrors.join("\n- ")}`);
