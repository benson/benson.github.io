import { circleIntersectsCollider, normalizeCollider } from "./collision-geometry.js?v=20260718.5";

export const MATERIAL_SCHEMA = "lastlight.material-impacts.v1";
export const MATERIAL_CLASSES = Object.freeze(["metal", "concrete", "liquid", "organic", "energy", "void"]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const response = ({ label, examples, particles, decal, flash, sound, lifetimeMs, fallback }) => ({ label, examples, particles, decal, flash, sound, lifetimeMs, fallback });

export const LASTLIGHT_MATERIAL_THEME = deepFreeze({
  schema: MATERIAL_SCHEMA,
  metal: response({
    label: "Metal / armor", examples: "Armored enemies, supply caches, relay cores",
    particles: { shape: "angular-sparks", count: 5, color: "#ffd36a", secondary: "#f8feff", size: 2.5, speed: 115, spread: .72 },
    decal: { shape: "ricochet-notch", color: "#91a8b1", alpha: .28, radius: 14, lifetimeMs: 900 },
    flash: { tier: "medium", color: "#fff2b0", durationMs: 90 },
    sound: { family: "metal", pitch: 1.08, volume: .72 }, lifetimeMs: 520,
    fallback: { pattern: "three-ray-spark", color: "#ffe08a", label: "Armor spark" },
  }),
  concrete: response({
    label: "Concrete / ground", examples: "Raised cover, industrial floors, ash terrain",
    particles: { shape: "square-chips", count: 4, color: "#a9b1ad", secondary: "#e7ded0", size: 3.5, speed: 72, spread: .9 },
    decal: { shape: "fracture", color: "#4f5b5e", alpha: .3, radius: 18, lifetimeMs: 1500 },
    flash: { tier: "low", color: "#e5ddd0", durationMs: 70 },
    sound: { family: "concrete", pitch: .82, volume: .66 }, lifetimeMs: 680,
    fallback: { pattern: "four-way-crack", color: "#d4d0c7", label: "Ground fracture" },
  }),
  liquid: response({
    label: "Liquid / ice", examples: "Subzero floors, frozen structures, water surfaces",
    particles: { shape: "diamond-shards", count: 5, color: "#8edfff", secondary: "#f1fdff", size: 3, speed: 82, spread: 1.05 },
    decal: { shape: "ripple", color: "#75cde9", alpha: .3, radius: 22, lifetimeMs: 1100 },
    flash: { tier: "medium", color: "#dffaff", durationMs: 100 },
    sound: { family: "liquid", pitch: 1.22, volume: .62 }, lifetimeMs: 760,
    fallback: { pattern: "ripple-diamond", color: "#a7edff", label: "Ice ripple" },
  }),
  organic: response({
    label: "Flesh / organic", examples: "Skitter, Rusher, living apex targets",
    particles: { shape: "soft-drops", count: 3, color: "#ff7b72", secondary: "#ffd0a8", size: 3.2, speed: 58, spread: .82 },
    decal: { shape: "soft-burst", color: "#7f3040", alpha: .2, radius: 15, lifetimeMs: 720 },
    flash: { tier: "low", color: "#ffd3ba", durationMs: 75 },
    sound: { family: "organic", pitch: .72, volume: .6 }, lifetimeMs: 560,
    fallback: { pattern: "rounded-burst", color: "#ff9b87", label: "Organic impact" },
  }),
  energy: response({
    label: "Shield / energy", examples: "Uplinks, operation devices, energy shields",
    particles: { shape: "short-arcs", count: 5, color: "#63f2df", secondary: "#f8feff", size: 2.4, speed: 92, spread: 1.2 },
    decal: { shape: "hex-ring", color: "#58dcca", alpha: .3, radius: 20, lifetimeMs: 800 },
    flash: { tier: "high", color: "#eaffff", durationMs: 105 },
    sound: { family: "energy", pitch: 1.35, volume: .62 }, lifetimeMs: 620,
    fallback: { pattern: "broken-hex", color: "#8ff9e9", label: "Shield discharge" },
  }),
  void: response({
    label: "Void / corrupted", examples: "Corrupted enemies, breach trials, abyss terrain",
    particles: { shape: "inward-motes", count: 4, color: "#bf75ff", secondary: "#ff5f8f", size: 3, speed: 64, spread: 1.4 },
    decal: { shape: "broken-spiral", color: "#71399b", alpha: .32, radius: 22, lifetimeMs: 1300 },
    flash: { tier: "medium", color: "#e7baff", durationMs: 115 },
    sound: { family: "void", pitch: .6, volume: .64 }, lifetimeMs: 820,
    fallback: { pattern: "inward-spiral", color: "#d99aff", label: "Corruption collapse" },
  }),
});

export const MATERIAL_TARGET_METADATA = deepFreeze({
  enemies: {
    mite: "organic", hound: "organic", spitter: "void", brute: "metal", bomber: "metal", shark: "metal",
    treasure: "energy", bosses: { warehouse: "metal", outskirts: "organic", lab: "void", beachhead: "void" },
  },
  obstacles: { supplyCache: "metal", raisedCover: Array(14).fill("concrete") },
  terrain: { warehouse: "concrete", outskirts: "concrete", lab: "liquid", beachhead: "void" },
  objectives: { machine: "energy", uplink: "energy", trial: "void", relayBall: "metal", destination: "energy" },
});

const exactKeys = (value, expected) => Object.keys(value || {}).sort().join(",") === [...expected].sort().join(",");
const hex = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function validateMaterialTheme(theme) {
  const errors = [];
  if (!theme || theme.schema !== MATERIAL_SCHEMA || !exactKeys(theme, ["schema", ...MATERIAL_CLASSES])) return ["materials: invalid schema or classes"];
  for (const id of MATERIAL_CLASSES) {
    const item = theme[id], path = `materials.${id}`;
    if (!exactKeys(item, ["label", "examples", "particles", "decal", "flash", "sound", "lifetimeMs", "fallback"])) errors.push(`${path}: fields mismatch`);
    if (!exactKeys(item?.particles, ["shape", "count", "color", "secondary", "size", "speed", "spread"])) errors.push(`${path}.particles: fields mismatch`);
    if (!Number.isInteger(item?.particles?.count) || item.particles.count < 0 || item.particles.count > 6) errors.push(`${path}.particles.count: must be 0..6`);
    for (const key of ["size", "speed", "spread"]) if (!Number.isFinite(item?.particles?.[key]) || item.particles[key] < 0 || item.particles[key] > 180) errors.push(`${path}.particles.${key}: out of bounds`);
    if (!hex(item?.particles?.color) || !hex(item?.particles?.secondary)) errors.push(`${path}.particles: invalid colors`);
    if (!exactKeys(item?.decal, ["shape", "color", "alpha", "radius", "lifetimeMs"]) || !hex(item?.decal?.color) || !Number.isFinite(item?.decal?.alpha) || item.decal.alpha < 0 || item.decal.alpha > .4 || !Number.isFinite(item?.decal?.radius) || item.decal.radius > 40 || !Number.isFinite(item?.decal?.lifetimeMs) || item.decal.lifetimeMs > 2000) errors.push(`${path}.decal: invalid`);
    if (!exactKeys(item?.flash, ["tier", "color", "durationMs"]) || !["none", "low", "medium", "high"].includes(item?.flash?.tier) || !hex(item?.flash?.color) || !Number.isFinite(item?.flash?.durationMs) || item.flash.durationMs > 140) errors.push(`${path}.flash: invalid`);
    if (!exactKeys(item?.sound, ["family", "pitch", "volume"]) || !Number.isFinite(item?.sound?.pitch) || item.sound.pitch < .5 || item.sound.pitch > 1.5 || !Number.isFinite(item?.sound?.volume) || item.sound.volume < 0 || item.sound.volume > .8) errors.push(`${path}.sound: invalid`);
    if (!Number.isFinite(item?.lifetimeMs) || item.lifetimeMs < 120 || item.lifetimeMs > 1000) errors.push(`${path}.lifetimeMs: invalid`);
    if (!exactKeys(item?.fallback, ["pattern", "color", "label"]) || !hex(item?.fallback?.color) || !item?.fallback?.pattern || !item?.fallback?.label) errors.push(`${path}.fallback: invalid`);
  }
  return errors;
}

export function validateMaterialTargets(metadata = MATERIAL_TARGET_METADATA) {
  const errors = [];
  const check = (value, path) => { if (!MATERIAL_CLASSES.includes(value)) errors.push(`${path}: invalid material ${value}`); };
  if (!exactKeys(metadata, ["enemies", "obstacles", "terrain", "objectives"])) return ["material targets: fields mismatch"];
  for (const [id, value] of Object.entries(metadata.enemies || {})) id === "bosses" ? Object.entries(value).forEach(([map, material]) => check(material, `enemies.bosses.${map}`)) : check(value, `enemies.${id}`);
  check(metadata.obstacles?.supplyCache, "obstacles.supplyCache");
  if (!Array.isArray(metadata.obstacles?.raisedCover) || metadata.obstacles.raisedCover.length !== 14) errors.push("obstacles.raisedCover: must cover 14 obstacles");
  else metadata.obstacles.raisedCover.forEach((value, index) => check(value, `obstacles.raisedCover.${index}`));
  for (const [id, value] of Object.entries(metadata.terrain || {})) check(value, `terrain.${id}`);
  for (const [id, value] of Object.entries(metadata.objectives || {})) check(value, `objectives.${id}`);
  return errors;
}

export function materialForEnemy(enemy, mapId = "warehouse") {
  if (enemy?.eventType === "treasure") return MATERIAL_TARGET_METADATA.enemies.treasure;
  if (enemy?.boss) return MATERIAL_TARGET_METADATA.enemies.bosses[mapId] || "void";
  return MATERIAL_TARGET_METADATA.enemies[enemy?.type] || "organic";
}

export function materialAtPoint(point, state = {}, obstacles = [], radius = 18) {
  const mapId = typeof state.map === "string" ? state.map : state.map?.id || "warehouse";
  let best = null, bestDistance = Infinity;
  const consider = (target, targetRadius, material, kind) => {
    const distance = Math.hypot((point.x || 0) - (target.x || 0), (point.y || 0) - (target.y || 0));
    if (distance > radius + targetRadius || distance >= bestDistance) return;
    bestDistance = distance; best = { material, kind, targetId: target.id || kind };
  };
  for (const enemy of state.enemies || []) consider(enemy, enemy.radius || 20, materialForEnemy(enemy, mapId), "enemy");
  for (const pod of state.pods || []) consider(pod, pod.radius || 25, MATERIAL_TARGET_METADATA.obstacles.supplyCache, "supply-cache");
  for (const objective of state.objectives || []) consider(objective, objective.radius || 85, MATERIAL_TARGET_METADATA.objectives[objective.kind] || "energy", "objective");
  for (const ball of state.relayBalls || []) consider(ball, ball.radius || 28, MATERIAL_TARGET_METADATA.objectives.relayBall, "relay-ball");
  consider({ id: "machine", x: 0, y: 0 }, 77, MATERIAL_TARGET_METADATA.objectives.machine, "machine");
  for (let index = 0; index < obstacles.length; index++) {
    const collider = normalizeCollider(obstacles[index], `cover-${index}`);
    if (!circleIntersectsCollider(point.x || 0, point.y || 0, radius, collider)) continue;
    // Shape contact is exact, rather than a distance to the broad bounding box.
    // Transparent corners around fitted structures remain terrain impacts.
    if (bestDistance > 0) {
      bestDistance = 0;
      best = { material: MATERIAL_TARGET_METADATA.obstacles.raisedCover[index] || "concrete", kind: "cover", targetId: collider.id || `cover-${index}` };
    }
  }
  return best || { material: MATERIAL_TARGET_METADATA.terrain[mapId] || "concrete", kind: "terrain", targetId: mapId };
}

export function resolveMaterialImpact(weaponPlan, materialId, { reducedMotion = false, effectsDensity = 1, flashIntensity = 1, soundIntensity = 1, theme = LASTLIGHT_MATERIAL_THEME } = {}) {
  if (!weaponPlan || !MATERIAL_CLASSES.includes(materialId)) throw new TypeError("A weapon plan and supported material are required");
  if (![effectsDensity, flashIntensity, soundIntensity].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new TypeError("Material quality inputs must be finite from 0 to 1");
  const material = theme[materialId], essential = Boolean(weaponPlan.essential);
  let particleCount = Math.round(material.particles.count * effectsDensity);
  if (essential) particleCount = Math.max(1, particleCount);
  if (reducedMotion) particleCount = Math.min(1, particleCount);
  const decalVisible = essential || effectsDensity >= .35;
  return deepFreeze({
    material: materialId, label: material.label,
    particles: { ...material.particles, count: Math.min(6, particleCount), speed: reducedMotion ? 0 : material.particles.speed },
    decal: { ...material.decal, visible: decalVisible, lifetimeMs: decalVisible ? material.decal.lifetimeMs : 0 },
    flash: { ...material.flash, intensity: Math.min(1, flashIntensity) * (reducedMotion ? .55 : 1) },
    sound: { ...material.sound, volume: material.sound.volume * soundIntensity },
    lifetimeMs: reducedMotion ? Math.min(360, material.lifetimeMs) : material.lifetimeMs,
    fallback: material.fallback,
    weapon: { silhouette: weaponPlan.silhouette, impact: weaponPlan.impact, colors: weaponPlan.colors, pattern: weaponPlan.pattern },
  });
}

export function stableImpactUnit(value) {
  const text = String(value || "impact");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}
