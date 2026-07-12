export const COMBAT_READABILITY_VERSION = "lastlight.readability.v1";

export const READABILITY_PASS_ORDER = Object.freeze([
  "decorative-ground",
  "obstacle-ground",
  "pickup",
  "player-attack",
  "actor",
  "hostile-projectile",
  "objective-overlay",
  "lethal-telegraph",
  "teammate-critical",
  "damage-feedback",
  "inspection",
]);

const palette = (keyline, body, core) => Object.freeze({ keyline, body, core });
const token = ({ priority, pass, essential = false, silhouette, motion, edge, colors, pattern, flash, sound }) => Object.freeze({
  priority, pass, essential, silhouette, motion, edge, palette: colors, pattern, flash, sound,
});

export const COMBAT_READABILITY = Object.freeze({
  decorative: token({
    priority: 0, pass: "decorative-ground", silhouette: "soft-fragment", motion: "slow-drift", edge: "none",
    colors: palette("#07111b", "#6d7b82", "#a8b2b5"), pattern: "low-contrast-scatter", flash: "none", sound: "ambient",
  }),
  obstacle: token({
    priority: 20, pass: "obstacle-ground", silhouette: "solid-block", motion: "static", edge: "double-keyline",
    colors: palette("#02060b", "#6f7a80", "#f1e7ce"), pattern: "hazard-band", flash: "none", sound: "material",
  }),
  pickup: token({
    priority: 35, pass: "pickup", silhouette: "diamond-or-cross", motion: "short-bob", edge: "dark-keyline",
    colors: palette("#06202a", "#62f2e6", "#f8feff"), pattern: "cyan-shard-or-gold-cross", flash: "low", sound: "reward",
  }),
  playerAttack: token({
    priority: 45, pass: "player-attack", silhouette: "authored-weapon", motion: "source-directed", edge: "dark-keyline-white-core",
    colors: palette("#06111b", "#63f2df", "#f8feff"), pattern: "weapon-family", flash: "bounded", sound: "weapon-family",
  }),
  hostileProjectile: token({
    priority: 75, pass: "hostile-projectile", essential: true, silhouette: "winged-arrowhead", motion: "target-directed", edge: "black-rail-hot-core",
    colors: palette("#02060b", "#ff3857", "#ffcf7a"), pattern: "arrowhead-with-hot-tail", flash: "medium", sound: "hostile-shot",
  }),
  lethalTelegraph: token({
    priority: 100, pass: "lethal-telegraph", essential: true, silhouette: "toothed-perimeter", motion: "closing-timing-ring", edge: "black-red-white",
    colors: palette("#02060b", "#ff3857", "#fff4e8"), pattern: "inward-teeth-and-countdown", flash: "high", sound: "danger",
  }),
  objective: token({
    priority: 90, pass: "objective-overlay", essential: true, silhouette: "ring-and-beacon", motion: "directional-dash", edge: "dark-gold-white",
    colors: palette("#07111b", "#f7d76a", "#f8feff"), pattern: "broken-ring-and-label", flash: "low", sound: "objective",
  }),
  teammateCritical: token({
    priority: 105, pass: "teammate-critical", essential: true, silhouette: "four-corner-revive-bracket", motion: "static-pulse", edge: "black-white-coral",
    colors: palette("#02060b", "#ff7184", "#f8feff"), pattern: "revive-cross-and-timer", flash: "medium", sound: "squad-critical",
  }),
  damageFeedback: token({
    priority: 110, pass: "damage-feedback", essential: true, silhouette: "number-or-hit-chevron", motion: "short-source-away", edge: "dark-text-keyline",
    colors: palette("#02060b", "#ff5870", "#f8feff"), pattern: "impact-direction-plus-value", flash: "medium", sound: "hit-confirm",
  }),
  inspection: token({
    priority: 120, pass: "inspection", essential: true, silhouette: "dashed-focus-ring", motion: "static", edge: "black-white",
    colors: palette("#02060b", "#f8feff", "#62f2e6"), pattern: "focus-ring", flash: "none", sound: "none",
  }),
});

export const READABILITY_CATEGORIES = Object.freeze(Object.keys(COMBAT_READABILITY));

export function effectReadabilityCategory(effect) {
  if (!effect) return "decorative";
  if (effect.kind === "number" || effect.kind === "hurt") return "damageFeedback";
  if (effect.owner === "enemy" || effect.kind === "danger" || effect.kind === "bossCast" || effect.delayed) return "lethalTelegraph";
  if (effect.kind === "pickup") return "pickup";
  if (effect.sourceId || ["train", "windwall", "totem", "pop"].includes(effect.kind)) return "playerAttack";
  return "decorative";
}

export function readabilityPlan(category, { reducedMotion = false, reducedFlash = false, qualityTier = "high" } = {}) {
  const value = COMBAT_READABILITY[category] || COMBAT_READABILITY.decorative;
  const minimal = qualityTier === "minimal";
  return Object.freeze({
    ...value,
    motion: reducedMotion ? "static-state-change" : value.motion,
    flash: reducedFlash ? "none" : minimal && !value.essential ? "none" : value.flash,
    visible: value.essential || !minimal || category === "obstacle" || category === "pickup",
  });
}

export function partitionEffects(effects = []) {
  const result = { ground: [], threat: [], feedback: [] };
  for (const effect of effects) {
    const category = effectReadabilityCategory(effect);
    if (category === "lethalTelegraph") result.threat.push(effect);
    else if (category === "damageFeedback") result.feedback.push(effect);
    else result.ground.push(effect);
  }
  return result;
}

export function shouldPromoteCache(pod, { localPlayer = null, hoveredId = null, nearbyRadius = 240 } = {}) {
  if (!pod) return false;
  if (hoveredId === pod.id || (pod.hp ?? 100) < 100) return true;
  if (!localPlayer) return false;
  const dx = (pod.x || 0) - (localPlayer.x || 0), dy = (pod.y || 0) - (localPlayer.y || 0);
  return dx * dx + dy * dy <= nearbyRadius * nearbyRadius;
}

function channel(value) {
  const hex = value.replace("#", "");
  const component = Number.parseInt(hex, 16) / 255;
  return component <= .04045 ? component / 12.92 : ((component + .055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return NaN;
  return .2126 * channel(value.slice(0, 2)) + .7152 * channel(value.slice(2, 4)) + .0722 * channel(value.slice(4, 6));
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first), b = relativeLuminance(second);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function validateCombatReadability() {
  const errors = [];
  const passes = new Set(READABILITY_PASS_ORDER);
  const silhouettes = new Set(), patterns = new Set();
  for (const [id, value] of Object.entries(COMBAT_READABILITY)) {
    if (!passes.has(value.pass)) errors.push(`${id}.pass: unknown`);
    if (!Number.isFinite(value.priority)) errors.push(`${id}.priority: invalid`);
    for (const [name, color] of Object.entries(value.palette)) if (!/^#[0-9a-f]{6}$/i.test(color)) errors.push(`${id}.palette.${name}: invalid`);
    if (contrastRatio(value.palette.keyline, value.palette.core) < 4.5) errors.push(`${id}.palette: keyline/core contrast below 4.5`);
    if (silhouettes.has(value.silhouette)) errors.push(`${id}.silhouette: duplicate`); else silhouettes.add(value.silhouette);
    if (patterns.has(value.pattern)) errors.push(`${id}.pattern: duplicate`); else patterns.add(value.pattern);
  }
  for (let index = 1; index < READABILITY_PASS_ORDER.length; index++) {
    const before = Object.values(COMBAT_READABILITY).find((value) => value.pass === READABILITY_PASS_ORDER[index - 1]);
    const after = Object.values(COMBAT_READABILITY).find((value) => value.pass === READABILITY_PASS_ORDER[index]);
    if (before && after && after.priority <= before.priority) errors.push(`${after.pass}: priority must increase after ${before.pass}`);
  }
  return errors;
}
