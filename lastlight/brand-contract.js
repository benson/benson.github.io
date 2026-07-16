export const BRAND_SCHEMA = "lastlight.brand.v1";
export const BRAND_VERSION = 1;

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const identity = (label, silhouette, material, signal) => ({ label, silhouette, material, signal });

export const LASTLIGHT_BRAND = freeze({
  schema: BRAND_SCHEMA,
  version: BRAND_VERSION,
  promise: "Hold the line until Final City gets another sunrise.",
  principles: ["industrial-not-generic", "clarity-before-spectacle", "salvage-with-purpose", "warm-humanity-inside-cold-machinery", "state-never-color-only"],
  palette: {
    ink: "#070d18", panel: "#0b1524", panelRaised: "#101c2d", paper: "#edf7f4", muted: "#8ba2ad",
    signal: "#63f2df", breach: "#ff5c35", objective: "#f7d76a", danger: "#ff4667", void: "#b68cff",
  },
  typography: {
    display: "Barlow Condensed", body: "Inter", fallbackDisplay: "Impact", fallbackBody: "system-ui",
    displayUse: "names-headlines-countdowns", bodyUse: "controls-copy-data", casing: "uppercase-for-operational-labels-only",
  },
  shape: {
    frame: "square-cut-industrial", keyline: "one-pixel", selection: "bracket-or-rail", objective: "broken-ring",
    danger: "toothed-perimeter", support: "four-corner-cross", inspection: "dashed-focus-ring",
  },
  motion: {
    easeOut: "cubic-bezier(.23,1,.32,1)", easeInOut: "cubic-bezier(.77,0,.175,1)",
    pressMs: 120, microMs: 150, panelMs: 240, keyboardMs: 0, reduced: "opacity-and-color-only",
  },
  materials: ["metal", "concrete", "liquid", "organic", "energy", "void"],
  renderPriority: ["decorative-ground", "obstacle-ground", "pickup", "player-attack", "actor", "hostile-projectile", "objective-overlay", "lethal-telegraph", "teammate-critical", "damage-feedback", "inspection"],
  surfaces: ["home", "lobby", "specialist-select", "game-hud", "draft", "pause", "results", "archive", "replay", "practice", "recovery", "migration", "report"],
  specialists: {
    zuri: identity("ramping gunner", "forward-rocket-wedge", "painted-steel", "rose-barrage"),
    echo: identity("projectile support", "concentric-speaker-rings", "signal-glass", "cyan-echo"),
    sola: identity("armor vanguard", "shield-and-lance", "golden-plate", "solar-guard"),
    bront: identity("sustain summoner", "hammer-and-totem", "tide-worn-alloy", "teal-current"),
    fang: identity("missing-health brawler", "claw-and-broken-restraint", "scarred-red-plate", "redline"),
    gale: identity("critical duelist", "split-blade-current", "storm-steel", "sky-flow"),
    rift: identity("movement skirmisher", "impact-chevron", "kinetic-gold", "momentum-rail"),
    nova: identity("hex spirit runner", "wisp-and-hex", "violet-glass", "spirit-wake"),
    vesper: identity("pickup ranger", "winged-dagger", "magnetic-violet", "recall-arc"),
  },
  enemies: {
    mite: identity("Skitter", "four-blade-low-body", "graphite", "single-red-optic"),
    hound: identity("Rusher", "sprinting-wedge", "burnt-orange-plate", "amber-eyes"),
    spitter: identity("Spitter", "orb-and-muzzle", "faceted-void-shell", "violet-core"),
    brute: identity("Brute", "broad-shoulders-and-fists", "battered-red-armor", "ember-eyes"),
    bomber: identity("Bomber", "reactor-sphere", "blackened-brass", "amber-panels"),
    shark: identity("Siegebreaker", "horned-fortress", "dark-crimson-siege-plate", "furnace-eyes"),
  },
  apexes: {
    warehouse: identity("Tunnelmaw", "segmented-burrower", "industrial-metal", "cyan-seismic-ring"),
    outskirts: identity("Red Hunger", "predatory-charge", "ash-organic", "orange-ion-line"),
    lab: identity("Void Empress", "crowned-orb", "void-crystal", "blue-violet-freeze"),
    beachhead: identity("Abyss Blade", "tidal-siege-horns", "abyssal-plate", "coral-tide-teeth"),
  },
  maps: {
    warehouse: identity("Iron District", "freight-grid", "steel-and-concrete", "cyan-relay"),
    outskirts: identity("Ash Outskirts", "open-ion-lanes", "ash-and-brass", "amber-cannon"),
    lab: identity("Subzero Lab", "cryo-cells", "ice-and-glass", "blue-freeze-core"),
    beachhead: identity("The Beachhead", "flooded-causeway", "void-water-and-plate", "coral-tide"),
  },
  weapons: {
    signatures: ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"],
    universal: ["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"],
    rule: "Every base/evolved pair keeps one family silhouette and gains one unmistakable mechanical transformation.",
  },
  assetFamilies: [
    { id: "branding", role: "favicon-manifest-social-preview", source: "assets/branding + assets/og*", runtime: "svg-json-png", provenance: "project-authored", constraints: "crisp-at-16px-and-social-crop" },
    { id: "specialist-cutouts", role: "select-and-guide-identity", source: "assets/sprites + assets/squad-atlas*", runtime: "transparent-png", provenance: "project-authored-generated-and-curated", constraints: "full-silhouette-no-crop" },
    { id: "motion", role: "specialist-enemy-apex-state", source: "assets/motion", runtime: "assets/motion-normalized webp", provenance: "project-authored-generated-and-normalized", constraints: "256px-cells-gutters-foot-anchors" },
    { id: "weapons", role: "signature-and-universal-loadout", source: "assets/weapons", runtime: "transparent-webp", provenance: "project-authored", constraints: "family-readable-at-28px" },
    { id: "enemies", role: "runtime-and-field-guide-threats", source: "assets/enemies + assets/guide/enemies", runtime: "transparent-webp", provenance: "project-authored-generated", constraints: "role-silhouette-readable-at-runtime-size" },
    { id: "environments", role: "map-atmosphere-and-collision-safe-chunks", source: "assets/environments + assets/environment-chunks", runtime: "webp-atlases", provenance: "project-authored-generated", constraints: "gameplay-clearance-and-bounded-decode" },
    { id: "guide", role: "passive-field-and-enemy-reference", source: "assets/guide", runtime: "transparent-webp", provenance: "project-authored", constraints: "semantic-label-always-accompanies-image" },
    { id: "archive", role: "event-boon-and-augment-records", source: "assets/archive", runtime: "webp", provenance: "project-authored", constraints: "informational-not-rarity-by-color-alone" },
    { id: "effects", role: "pickup-hostile-cover-and-container-anchors", source: "assets/effects + assets/supply-containers", runtime: "transparent-webp-png-plus-canvas", provenance: "project-authored-generated", constraints: "readability-contract-controls-priority" },
    { id: "audio", role: "weapon-material-enemy-ui-and-critical-cues", source: "audio-cues.js", runtime: "web-audio-generated", provenance: "project-authored-no-external-assets", constraints: "critical-headroom-visual-equivalent" },
  ],
  voice: {
    headlines: "short-imperative-operational", status: "plain-specific-and-actionable", flavor: "wry-but-never-obscures-rules",
    forbidden: ["generic-fantasy", "unexplained-acronym", "color-only-instruction", "false-certainty"],
  },
});

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
const identityFields = ["label", "silhouette", "material", "signal"];

export function validateBrandContract(value = LASTLIGHT_BRAND) {
  const errors = [];
  const root = ["schema", "version", "promise", "principles", "palette", "typography", "shape", "motion", "materials", "renderPriority", "surfaces", "specialists", "enemies", "apexes", "maps", "weapons", "assetFamilies", "voice"];
  if (!exact(value, root)) return ["brand: fields mismatch"];
  if (value.schema !== BRAND_SCHEMA || value.version !== BRAND_VERSION) errors.push("brand: schema mismatch");
  if (!unique(value.principles) || !strings(value.principles) || value.principles.length !== 5) errors.push("principles: incomplete");
  if (!exact(value.palette, ["ink", "panel", "panelRaised", "paper", "muted", "signal", "breach", "objective", "danger", "void"])) errors.push("palette: fields mismatch");
  for (const [id, color] of Object.entries(value.palette || {})) if (!/^#[0-9a-f]{6}$/i.test(color)) errors.push(`palette.${id}: invalid`);
  if (!exact(value.typography, ["display", "body", "fallbackDisplay", "fallbackBody", "displayUse", "bodyUse", "casing"])) errors.push("typography: fields mismatch");
  if (!exact(value.shape, ["frame", "keyline", "selection", "objective", "danger", "support", "inspection"])) errors.push("shape: fields mismatch");
  if (!exact(value.motion, ["easeOut", "easeInOut", "pressMs", "microMs", "panelMs", "keyboardMs", "reduced"])) errors.push("motion: fields mismatch");
  for (const [name, expected] of [["specialists", 9], ["enemies", 6], ["apexes", 4], ["maps", 4]]) {
    if (!exact(value[name], Object.keys(LASTLIGHT_BRAND[name])) || Object.keys(value[name] || {}).length !== expected) errors.push(`${name}: coverage mismatch`);
    for (const [id, entry] of Object.entries(value[name] || {})) if (!exact(entry, identityFields) || Object.values(entry).some((item) => typeof item !== "string" || !item)) errors.push(`${name}.${id}: identity fields mismatch`);
  }
  if (!unique(value.materials) || !strings(value.materials) || value.materials.length !== 6 || !unique(value.renderPriority) || !strings(value.renderPriority) || value.renderPriority.length !== 11 || !unique(value.surfaces) || !strings(value.surfaces) || value.surfaces.length !== 13) errors.push("brand: taxonomy incomplete");
  if (!exact(value.weapons, ["signatures", "universal", "rule"]) || !unique(value.weapons?.signatures) || !strings(value.weapons?.signatures) || value.weapons.signatures.length !== 9 || !unique(value.weapons?.universal) || !strings(value.weapons?.universal) || value.weapons.universal.length !== 12) errors.push("weapons: coverage mismatch");
  if (!Array.isArray(value.assetFamilies) || value.assetFamilies.length !== 10 || !unique(value.assetFamilies.map((family) => family?.id))) errors.push("assets: family coverage mismatch");
  for (const family of value.assetFamilies || []) if (!exact(family, ["id", "role", "source", "runtime", "provenance", "constraints"]) || Object.values(family).some((item) => typeof item !== "string" || !item)) errors.push(`assets.${family?.id || "unknown"}: fields mismatch`);
  if (!exact(value.voice, ["headlines", "status", "flavor", "forbidden"]) || !unique(value.voice?.forbidden) || !strings(value.voice?.forbidden) || value.voice.forbidden.length !== 4) errors.push("voice: fields mismatch");
  if (value.motion?.keyboardMs !== 0 || value.motion?.pressMs < 100 || value.motion?.pressMs > 160 || value.motion?.microMs < 100 || value.motion?.microMs > 200 || value.motion?.panelMs < 150 || value.motion?.panelMs > 300) errors.push("motion: interaction timing out of bounds");
  return errors;
}
