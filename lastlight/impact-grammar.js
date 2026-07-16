import { SPECIALIST_ORDER, WEAPONS } from "./data.js?v=20260716.14";
import { parseWeaponVariantId } from "./weapon-evolution.js?v=20260713.1";

export const IMPACT_GRAMMAR_VERSION = "lastlight.impact-grammar.v1";
export const IMPACT_PRIORITIES = Object.freeze(["ambient", "standard", "critical"]);
export const FEEDBACK_TIERS = Object.freeze(["none", "low", "medium", "high"]);

const palette = (keyline, body, core) => Object.freeze({ keyline, body, core });
const trail = (style, length, width = 2) => Object.freeze({ style, length, width });
const access = (priority, colors, pattern) => Object.freeze({ priority, palette: colors, pattern });

function variant({ silhouette, material, motion, trail: trailSpec, contact, impact, decal, shake, flash, soundFamily, accessibility, behavior }) {
  return Object.freeze({ silhouette, material, motion, trail: trailSpec, contact, impact, decal, shake, flash, soundFamily, accessibility, behavior });
}

function entry(base, evolvedDifference, evolvedOverrides) {
  return Object.freeze({
    base: variant(base),
    evolved: variant({ ...base, ...evolvedOverrides, trail: evolvedOverrides.trail || base.trail, accessibility: evolvedOverrides.accessibility || base.accessibility }),
    evolvedDifference,
  });
}

const dark = "#06111b", white = "#f8feff";

export const SIGNATURE_IMPACT_GRAMMAR = Object.freeze({
  zuri: entry({ silhouette: "needle", material: "pulse-energy", motion: "linear-burst", trail: trail("segmented", 26, 2), contact: "pin-spark", impact: "tight-starburst", decal: "scorch-pin", shake: "low", flash: "medium", soundFamily: "pulse", accessibility: access("standard", palette(dark, "#ff5c8a", white), "single-chevron"), behavior: "Compact rounds read as a rapid pink-white burst." }, "Overdrive rounds cycle faster and punch through targets.", { silhouette: "piercing-needle", trail: trail("double", 38, 3), contact: "through-spark", impact: "piercing-starburst", decal: "paired-scorch", flash: "high", behavior: "Longer twin-core rounds clearly communicate the piercing barrage." }),
  echo: entry({ silhouette: "crescent", material: "sonic", motion: "expanding-wave", trail: trail("ribbon", 22, 3), contact: "frequency-tick", impact: "concentric-ripple", decal: "echo-ring", shake: "none", flash: "low", soundFamily: "resonance", accessibility: access("standard", palette(dark, "#66eee0", white), "double-arc"), behavior: "Wide crescents emphasize coverage rather than lethality." }, "Anima Echo persists longer, making each resonant lane easier to follow.", { silhouette: "double-crescent", trail: trail("ribbon", 36, 4), contact: "harmonic-tick", impact: "double-ripple", decal: "double-echo-ring", flash: "medium", behavior: "A nested second arc and longer wake show the extended waveform." }),
  sola: entry({ silhouette: "prism", material: "hard-light", motion: "linear-guard", trail: trail("double", 28, 3), contact: "shield-chip", impact: "solar-prism", decal: "sun-glyph", shake: "low", flash: "medium", soundFamily: "solar", accessibility: access("standard", palette(dark, "#f7c84b", white), "diamond-core"), behavior: "Shield-shaped bolts read as armor converted into force." }, "Lion's Light cycles every 1.50 seconds instead of 1.75; the first hit of each volley returns an armor-scaled Guard Return shield without adding penetration.", { silhouette: "lion-prism", trail: trail("double", 42, 4), contact: "shield-break", impact: "crowned-prism", decal: "crowned-sun", shake: "medium", flash: "high", behavior: "A crowned diamond core and inward guard flash identify the once-per-volley shield return." }),
  bront: entry({ silhouette: "shock-disc", material: "tidal-tech", motion: "ground-crash", trail: trail("none", 0), contact: "hammer-contact", impact: "tidal-ring", decal: "cracked-ring", shake: "medium", flash: "medium", soundFamily: "heavy", accessibility: access("critical", palette(dark, "#39d2cf", white), "solid-ring"), behavior: "A grounded ring gives the heavy hammer strike weight." }, "Grizzly Surge repeats with a larger delayed crash.", { silhouette: "double-shock-disc", motion: "ground-crash-repeat", trail: trail("echo", 18, 3), contact: "double-hammer-contact", impact: "double-tidal-ring", decal: "split-cracked-ring", shake: "high", flash: "high", behavior: "A visible echo ring previews the second, larger impact without adding bounce." }),
  fang: entry({ silhouette: "claw-arc", material: "bio-metal", motion: "close-sweep", trail: trail("slash", 18, 4), contact: "rake", impact: "three-cut-burst", decal: "three-cuts", shake: "low", flash: "medium", soundFamily: "blade", accessibility: access("critical", palette(dark, "#ff6e55", white), "triple-slash"), behavior: "Three short cuts keep the close-range strike distinct from bullets." }, "Savage Slice cycles faster; every third swipe uses Predator Hook to pull non-boss targets inward, without adding bleed, another hit, or Frenzy healing.", { silhouette: "serrated-claw", trail: trail("slash", 30, 5), contact: "serrated-rake", impact: "serrated-rip", decal: "serrated-cuts", shake: "medium", flash: "high", behavior: "The serrated third after-cut closes inward to telegraph Predator Hook without implying damage-over-time." }),
  gale: entry({ silhouette: "spiral", material: "compressed-wind", motion: "drifting-spin", trail: trail("corkscrew", 24, 2), contact: "wind-shear", impact: "curl-burst", decal: "wind-curl", shake: "none", flash: "low", soundFamily: "wind", accessibility: access("standard", palette(dark, "#9bd7ff", white), "spiral"), behavior: "Open spirals remain readable through dense projectile fields." }, "Wandering Storms raises pierce from 5 to 12 additional targets and refills Flow 15% faster; radius is unchanged.", { silhouette: "double-spiral", trail: trail("corkscrew", 40, 3), contact: "deep-wind-shear", impact: "double-curl-burst", decal: "double-wind-curl", shake: "low", flash: "medium", behavior: "The second spiral and longer wake identify extended penetration without implying a larger hit radius." }),
  rift: entry({ silhouette: "kinetic-wedge", material: "kinetic-light", motion: "snap-slam", trail: trail("speedline", 18, 4), contact: "wedge-hit", impact: "chevron-shock", decal: "skid-chevron", shake: "medium", flash: "medium", soundFamily: "kinetic", accessibility: access("critical", palette(dark, "#e7c53e", white), "forward-chevron"), behavior: "A forward wedge ties the strike to Rift's movement direction." }, "Golden Overrun stores resolved movement as Kinetic Reserve; the next evolved crash scales knockback from 0.12× to 0.32× and then resets the reserve.", { silhouette: "double-wedge", trail: trail("speedline", 34, 5), contact: "overrun-hit", impact: "double-chevron-shock", decal: "gold-skid-chevron", shake: "high", flash: "high", behavior: "Stacked chevrons and a reserve-length skid line convey how much movement is carried into the next crash." }),
  nova: entry({ silhouette: "hex", material: "spirit-arcane", motion: "guided-linear", trail: trail("motes", 24, 2), contact: "rune-stamp", impact: "hex-bloom", decal: "hex-seal", shake: "none", flash: "medium", soundFamily: "arcane", accessibility: access("standard", palette(dark, "#b68cff", white), "hexagon"), behavior: "A solid hex profile makes the mark readable before detonation." }, "Hopped-Up Hex persists longer and carries the mark deeper through a crowd.", { silhouette: "nested-hex", trail: trail("motes", 38, 3), contact: "nested-rune-stamp", impact: "layered-hex-bloom", decal: "nested-hex-seal", shake: "low", flash: "high", behavior: "Nested runes and a longer mote trail communicate the evolved persistence." }),
  vesper: entry({ silhouette: "dagger", material: "polished-alloy", motion: "linear-return", trail: trail("blade-ribbon", 22, 2), contact: "blade-tick", impact: "four-point-star", decal: "pin-mark", shake: "low", flash: "medium", soundFamily: "blade", accessibility: access("standard", palette(dark, "#c05cff", white), "long-diamond"), behavior: "A narrow blade profile reads separately from energy fire." }, "Lover's Ricochet raises signature pierce from 7 to 14 additional targets and cycles faster; Blade Recall is unchanged.", { silhouette: "winged-dagger", trail: trail("blade-ribbon", 40, 3), contact: "ricochet-tick", impact: "winged-star", decal: "paired-pin-mark", shake: "low", flash: "high", behavior: "Winglets and a longer outbound ribbon show greater signature pierce without implying a stronger recall." }),
});

export const UNIVERSAL_IMPACT_GRAMMAR = Object.freeze({
  uwu: entry({ silhouette: "needle", material: "laser", motion: "rapid-linear", trail: trail("speedline", 20, 2), contact: "needle-ping", impact: "micro-star", decal: "pin-scorch", shake: "none", flash: "low", soundFamily: "pulse", accessibility: access("standard", palette(dark, "#f58cff", white), "thin-chevron"), behavior: "Short magenta needles prioritize cadence over size." }, "Twin Needle Array turns the same projectile once after its first hit toward the nearest unhit enemy within 240 units, dealing 70% damage; raised cover still intercepts the redirected lane.", { silhouette: "twin-needle", trail: trail("double", 32, 2), contact: "double-ping", impact: "twin-star", decal: "paired-pin-scorch", flash: "medium", behavior: "Two parallel cores and a split wake make the single redirected flight readable without implying an extra projectile." }),
  slicers: entry({ silhouette: "crescent-blade", material: "razor-alloy", motion: "orbit", trail: trail("orbit-arc", 18, 4), contact: "metal-slice", impact: "crescent-spark", decal: "arc-cut", shake: "low", flash: "low", soundFamily: "blade", accessibility: access("standard", palette(dark, "#8be6ff", white), "open-crescent"), behavior: "Orbit arcs stay attached to their owner's space." }, "Unceasing Cyclone spins faster and reads as a continuous cutting ring.", { silhouette: "double-crescent-blade", trail: trail("orbit-arc", 34, 5), contact: "cyclone-slice", impact: "double-crescent-spark", decal: "ring-cut", shake: "medium", flash: "medium", behavior: "Nested crescents close the visual ring as orbit speed increases." }),
  aura: entry({ silhouette: "field-ring", material: "radiant-energy", motion: "persistent-field", trail: trail("none", 0), contact: "field-tick", impact: "soft-radial-pulse", decal: "sun-ring", shake: "none", flash: "low", soundFamily: "solar", accessibility: access("ambient", palette(dark, "#ffd861", white), "ring-with-gaps"), behavior: "A quiet broken ring avoids competing with hostile telegraphs." }, "Explosive Embrace gains one charge per occupied pulse; charge eight resets and erupts at 1.45x radius for 2.5x pulse damage.", { silhouette: "eruptive-field-ring", trail: trail("radial", 20, 3), contact: "flare-tick", impact: "eruptive-radial-pulse", decal: "burst-sun-ring", shake: "medium", flash: "high", accessibility: access("standard", palette(dark, "#ffb84f", white), "burst-ring"), behavior: "Seven occupied pulses build charge; the eighth adds one short, larger burst without changing the field cadence." }),
  mines: entry({ silhouette: "diamond-mine", material: "arc-tech", motion: "deploy-arm", trail: trail("none", 0), contact: "trigger-click", impact: "arc-burst", decal: "warning-diamond", shake: "medium", flash: "medium", soundFamily: "tech", accessibility: access("critical", palette(dark, "#ff8d55", white), "diamond-with-ticks"), behavior: "A fixed diamond and closing arming ring telegraph the fuse." }, "Tri-Mine Grid keeps mine count and damage, grouping up to three so the first blast caps sibling fuses at 0.12/0.24 seconds with 25% larger radii.", { silhouette: "tri-diamond-mine", trail: trail("link", 28, 2), contact: "grid-trigger", impact: "tri-arc-burst", decal: "linked-warning-diamonds", shake: "high", flash: "high", behavior: "Linked diamonds show deterministic groups; only remaining siblings gain the larger chained blast." }),
  crossbow: entry({ silhouette: "bolt", material: "ballistic-alloy", motion: "fan-linear", trail: trail("speedline", 24, 2), contact: "bolt-chip", impact: "splinter-star", decal: "bolt-notch", shake: "low", flash: "low", soundFamily: "ballistic", accessibility: access("standard", palette(dark, "#f7d76a", white), "barbed-line"), behavior: "Barbed gold bolts make the random fan direction legible." }, "Prime Ballista deterministically finds the densest lane among the nearest 12 threats. Its center heavy bolt guarantees critical hits only after penetrating three distinct targets.", { silhouette: "heavy-bolt", trail: trail("double", 38, 3), contact: "ballista-chip", impact: "heavy-splinter-star", decal: "deep-bolt-notch", shake: "medium", flash: "medium", behavior: "The evolved fan scores a dense corridor. Its wider center shaft gains guaranteed critical impacts after three penetrations; the other bolts keep their normal behavior." }),
  boomerang: entry({ silhouette: "boomerang", material: "light-alloy", motion: "out-and-return", trail: trail("return-arc", 26, 3), contact: "return-slice", impact: "arc-spark", decal: "curved-cut", shake: "low", flash: "low", soundFamily: "blade", accessibility: access("standard", palette(dark, "#8cefff", white), "open-hook"), behavior: "The open hook shows travel direction at a glance." }, "Quad-o-rang can hit each enemy once outbound and once inbound; return hits follow the owner's current position and gain up to 30% damage after 360 units of resolved movement since cast.", { silhouette: "quad-boomerang", trail: trail("return-arc", 42, 4), contact: "quad-return-slice", impact: "four-arc-spark", decal: "four-curved-cuts", shake: "medium", flash: "medium", behavior: "Four short hook marks and the longer return arc identify the second hit phase and movement-charged inbound lane." }),
  rail: entry({ silhouette: "rail-crescent", material: "solar-rail", motion: "opposed-lanes", trail: trail("lane", 36, 3), contact: "rail-cut", impact: "horizontal-flare", decal: "lane-scorch", shake: "low", flash: "medium", soundFamily: "solar", accessibility: access("standard", palette(dark, "#ffcd71", white), "horizontal-bars"), behavior: "Horizontal bars reinforce the paired left-right lane behavior." }, "Enveloping Light preserves the same count, damage, speed, pierce, and cadence while rotating center-first opposing lanes to the player's current finite aim.", { silhouette: "double-rail-crescent", motion: "aimed-opposed-lanes", trail: trail("lane", 54, 4), contact: "enveloping-cut", impact: "double-horizontal-flare", decal: "double-lane-scorch", shake: "medium", flash: "high", behavior: "A center-first double rail rotates to the current aim; perpendicular offsets keep every opposing lane readable without implying added projectiles." }),
  glove: entry({ silhouette: "orb", material: "vortex-plasma", motion: "rotating-stream", trail: trail("corkscrew", 22, 3), contact: "plasma-tick", impact: "vortex-pop", decal: "spiral-mark", shake: "none", flash: "low", soundFamily: "arcane", accessibility: access("standard", palette(dark, "#77e3ff", white), "orb-with-tail"), behavior: "Small orbs share a spiral wake that reads as one stream." }, "Tempest Gauntlet adds a counter-rotating second stream.", { silhouette: "ringed-orb", trail: trail("double-corkscrew", 38, 4), contact: "tempest-tick", impact: "ringed-vortex-pop", decal: "double-spiral-mark", shake: "low", flash: "medium", behavior: "A ringed core and opposing wake distinguish the second stream." }),
  transit: entry({ silhouette: "train-block", material: "industrial-mass", motion: "screen-sweep", trail: trail("wake", 64, 6), contact: "rail-impact", impact: "industrial-shock", decal: "track-lines", shake: "high", flash: "medium", soundFamily: "industrial", accessibility: access("critical", palette(dark, "#ff7157", white), "solid-rectangle"), behavior: "A broad solid block and track wake read as an unstoppable sweep." }, "Limited Express selects the densest horizontal corridor among the nearest 12 threats. Non-boss hits receive one cover-aware 120-unit forward push and 1.25-second stun; bosses keep the one-second stun and cannot be pushed.", { silhouette: "express-block", trail: trail("double-wake", 88, 8), contact: "express-impact", impact: "double-industrial-shock", decal: "double-track-lines", shake: "high", flash: "high", behavior: "Twin tracks mark the chosen dense corridor; a single forward impact wake communicates the cover-aware push without implying extra damage." }),
  ice: entry({ silhouette: "shield-crystal", material: "cryo-crystal", motion: "guard-break", trail: trail("none", 0), contact: "ice-block", impact: "freeze-ring", decal: "snowflake", shake: "low", flash: "medium", soundFamily: "crystal", accessibility: access("critical", palette(dark, "#9de7ff", white), "six-point-crystal"), behavior: "The shield crystal remains visible until it blocks a hit." }, "Deep Freeze refreshes sooner and leaves a larger, clearer freeze read.", { silhouette: "crowned-shield-crystal", trail: trail("shards", 20, 2), contact: "deep-ice-block", impact: "deep-freeze-ring", decal: "double-snowflake", shake: "medium", flash: "high", behavior: "A crowned crystal and shard ring communicate the improved recovery." }),
  annihilator: entry({ silhouette: "target-ring", material: "void-light", motion: "charge-detonate", trail: trail("radial", 28, 3), contact: "countdown-lock", impact: "screening-bloom", decal: "target-reticle", shake: "high", flash: "high", soundFamily: "void", accessibility: access("critical", palette(dark, "#f7f1bd", white), "reticle"), behavior: "A closing reticle preserves the detonation timing under reduced motion." }, "Animapocalypse cycles sooner with a denser multi-ring detonation.", { silhouette: "triple-target-ring", trail: trail("radial", 44, 4), contact: "triple-countdown-lock", impact: "triple-screening-bloom", decal: "triple-target-reticle", shake: "high", flash: "high", behavior: "Three closing rings identify the evolved cadence without extra camera motion." }),
  drone: entry({ silhouette: "drone-dart", material: "autonomous-tech", motion: "guided-linear", trail: trail("data-dash", 22, 2), contact: "data-ping", impact: "tech-chevron", decal: "pixel-mark", shake: "none", flash: "low", soundFamily: "tech", accessibility: access("standard", palette(dark, "#77efcf", white), "notched-chevron"), behavior: "Notched green darts remain tied to the companion's tech language." }, "Yuum.AI Final charges one protocol every five drone-collected motes: repair the lowest-ratio ally below 70% health, or make the next center bolt retarget through up to three enemies.", { silhouette: "linked-drone-dart", trail: trail("data-dash", 36, 3), contact: "linked-data-ping", impact: "double-tech-chevron", decal: "linked-pixel-mark", shake: "low", flash: "medium", behavior: "Every five drone-collected motes repairs the lowest-ratio ally below 70% health; otherwise one charge makes the next center bolt retarget through up to three enemies without spawning extra projectiles." }),
});

export const SEMANTIC_VISUAL_GRAMMAR = Object.freeze({
  friendly: Object.freeze({ silhouette: "authored-weapon", palette: palette(dark, "#63f2df", white), pattern: "dark-keyline-white-core" }),
  hostile: Object.freeze({ silhouette: "winged-arrowhead", palette: palette("#02060b", "#ff3857", "#ffcf7a"), pattern: "hot-tail-solid-warning" }),
  xp: Object.freeze({ silhouette: "diamond-shard", palette: palette("#08202a", "#62f2e6", white), pattern: "cyan-diamond" }),
  objective: Object.freeze({ silhouette: "ring-and-beacon", palette: palette("#07111b", "#f7d76a", white), pattern: "gold-ring" }),
});

export function getWeaponImpactGrammar(sourceId, { specialistId, evolved = false } = {}) {
  const record = sourceId === "signature" ? SIGNATURE_IMPACT_GRAMMAR[specialistId] : UNIVERSAL_IMPACT_GRAMMAR[sourceId];
  if (!record) return null;
  return Object.freeze({ sourceId, specialistId: sourceId === "signature" ? specialistId : undefined, evolved: Boolean(evolved), evolvedDifference: record.evolvedDifference, ...record[evolved ? "evolved" : "base"] });
}

export function resolveEntityImpact(entity, state = {}) {
  if (!entity || entity.owner === "enemy" || entity.hostile || entity.bossShot) return null;
  const stamped = parseWeaponVariantId(entity.variantId);
  if (stamped) return getWeaponImpactGrammar(stamped.sourceId, { specialistId: stamped.specialistId, evolved: stamped.evolved });
  const owner = (state.players || []).find((player) => player.id === entity.owner);
  let sourceId = entity.sourceId;
  if (!sourceId && entity.kind === "slicer") sourceId = "slicers";
  if (!sourceId && (entity.kind === "aura" || entity.kind === "eruption")) sourceId = "aura";
  if (!sourceId && owner && entity.kind === "bleed" && owner.specialist === "fang") sourceId = "signature";
  if (!sourceId && owner && entity.kind === "slash" && ["fang", "rift"].includes(owner.specialist)) sourceId = "signature";
  if (!sourceId) return null;
  const weapon = sourceId === "signature" ? owner?.weapons?.signature : owner?.weapons?.[sourceId];
  return getWeaponImpactGrammar(sourceId, { specialistId: owner?.specialist, evolved: Boolean(entity.evolved ?? weapon?.evolved) });
}

export function impactSummary(grammar) {
  if (!grammar) return "Authored combat effect";
  return `${grammar.material.replaceAll("-", " ")} · ${grammar.impact.replaceAll("-", " ")} · ${grammar.soundFamily.replaceAll("-", " ")}`;
}

export function impactRenderPlan(entity, state, { reducedMotion = false, density = 1 } = {}) {
  const grammar = resolveEntityImpact(entity, state);
  if (!grammar) return null;
  const essential = grammar.accessibility.priority === "critical";
  const fullTrail = grammar.trail.style !== "none" && (essential || density >= .5);
  return Object.freeze({
    silhouette: grammar.silhouette,
    material: grammar.material,
    colors: grammar.accessibility.palette,
    pattern: grammar.accessibility.pattern,
    trail: reducedMotion ? { style: fullTrail ? "direction-line" : "none", length: Math.min(18, grammar.trail.length), width: grammar.trail.width } : fullTrail ? grammar.trail : { style: "none", length: 0, width: 0 },
    impact: grammar.impact,
    decal: grammar.decal,
    shake: reducedMotion ? "none" : grammar.shake,
    flash: grammar.flash,
    essential,
    soundFamily: grammar.soundFamily,
  });
}

export function validateImpactGrammar() {
  const errors = [];
  const exact = (value, keys, path) => {
    const actual = Object.keys(value || {}).sort().join(","), expected = [...keys].sort().join(",");
    if (actual !== expected) errors.push(`${path}: expected ${expected}; got ${actual}`);
  };
  const inspect = (record, path) => {
    exact(record, ["base", "evolved", "evolvedDifference"], path);
    if (typeof record.evolvedDifference !== "string" || !record.evolvedDifference.trim()) errors.push(`${path}.evolvedDifference: required`);
    for (const name of ["base", "evolved"]) {
      const value = record[name];
      exact(value, ["silhouette", "material", "motion", "trail", "contact", "impact", "decal", "shake", "flash", "soundFamily", "accessibility", "behavior"], `${path}.${name}`);
      for (const key of ["silhouette", "material", "motion", "contact", "impact", "decal", "soundFamily", "behavior"]) if (typeof value?.[key] !== "string" || !value[key]) errors.push(`${path}.${name}.${key}: required`);
      if (!FEEDBACK_TIERS.includes(value?.shake) || !FEEDBACK_TIERS.includes(value?.flash)) errors.push(`${path}.${name}: invalid feedback tier`);
      exact(value?.trail, ["style", "length", "width"], `${path}.${name}.trail`);
      if (!Number.isFinite(value?.trail?.length) || value.trail.length < 0 || !Number.isFinite(value?.trail?.width) || value.trail.width < 0) errors.push(`${path}.${name}.trail: invalid`);
      exact(value?.accessibility, ["priority", "palette", "pattern"], `${path}.${name}.accessibility`);
      if (!IMPACT_PRIORITIES.includes(value?.accessibility?.priority)) errors.push(`${path}.${name}.accessibility.priority: invalid`);
      exact(value?.accessibility?.palette, ["keyline", "body", "core"], `${path}.${name}.accessibility.palette`);
      for (const color of Object.values(value?.accessibility?.palette || {})) if (!/^#[0-9a-f]{6}$/i.test(color)) errors.push(`${path}.${name}.accessibility.palette: invalid color`);
    }
    if (JSON.stringify(record.base) === JSON.stringify(record.evolved)) errors.push(`${path}: evolved variant is visually identical`);
  };
  for (const id of SPECIALIST_ORDER) if (!SIGNATURE_IMPACT_GRAMMAR[id]) errors.push(`signature.${id}: missing`); else inspect(SIGNATURE_IMPACT_GRAMMAR[id], `signature.${id}`);
  for (const id of Object.keys(WEAPONS)) if (!UNIVERSAL_IMPACT_GRAMMAR[id]) errors.push(`universal.${id}: missing`); else inspect(UNIVERSAL_IMPACT_GRAMMAR[id], `universal.${id}`);
  for (const id of Object.keys(SIGNATURE_IMPACT_GRAMMAR)) if (!SPECIALIST_ORDER.includes(id)) errors.push(`signature.${id}: unknown`);
  for (const id of Object.keys(UNIVERSAL_IMPACT_GRAMMAR)) if (!WEAPONS[id]) errors.push(`universal.${id}: unknown`);
  return errors;
}
