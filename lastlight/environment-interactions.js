import { MATERIAL_CLASSES, MATERIAL_TARGET_METADATA } from "./material-impacts.js?v=20260718.2";

export const ENVIRONMENT_INTERACTION_SCHEMA = "lastlight.environment-interactions.v1";
export const ENVIRONMENT_PROP_KINDS = Object.freeze(["debris", "puddle", "cable", "fiber", "dust"]);
export const ENVIRONMENT_MAP_IDS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);
export const ENVIRONMENT_QUALITY_TIERS = Object.freeze(["high", "reduced", "minimal"]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const LASTLIGHT_ENVIRONMENT_INTERACTIONS = deepFreeze({
  schema: ENVIRONMENT_INTERACTION_SCHEMA,
  field: {
    cellSize: 260, slotsPerCell: 2, movementRadius: 88, impactRadius: 150,
    stepDistance: 34, maxTravelPerFrame: 240, seenImpactCap: 256,
  },
  props: {
    debris: { label: "Reactive debris", shape: "angular-chip", color: "#78909a", secondary: "#d7e3e5", opacity: .34, radius: 8, response: "scatter", maxOffset: 24, settle: 11 },
    puddle: { label: "Shallow puddle", shape: "flat-ripple", color: "#67c6e8", secondary: "#d8f7ff", opacity: .22, radius: 30, response: "ripple", maxOffset: 8, settle: 8 },
    cable: { label: "Loose cable", shape: "ground-spline", color: "#263b46", secondary: "#65e7d6", opacity: .48, radius: 34, response: "flex", maxOffset: 18, settle: 9 },
    fiber: { label: "Surface fiber", shape: "three-blade", color: "#789d68", secondary: "#c8d891", opacity: .38, radius: 18, response: "bend", maxOffset: 20, settle: 7 },
    dust: { label: "Surface dust", shape: "soft-mote", color: "#b9aa91", secondary: "#e2d8c6", opacity: .18, radius: 9, response: "drift", maxOffset: 16, settle: 10 },
  },
  contacts: {
    metal: { style: "tick", color: "#ffd36a", secondary: "#effcff", count: 2, radius: 12, lifetimeMs: 210, strength: .7 },
    concrete: { style: "dust", color: "#a9a49a", secondary: "#ded5c7", count: 3, radius: 15, lifetimeMs: 340, strength: .82 },
    liquid: { style: "ripple", color: "#83dcf7", secondary: "#e9fcff", count: 2, radius: 24, lifetimeMs: 430, strength: .65 },
    organic: { style: "bend", color: "#8fb976", secondary: "#d2e5a4", count: 2, radius: 17, lifetimeMs: 300, strength: .74 },
    energy: { style: "arc", color: "#63f2df", secondary: "#f5ffff", count: 2, radius: 16, lifetimeMs: 230, strength: .76 },
    void: { style: "inward", color: "#bd7aff", secondary: "#ff75a8", count: 3, radius: 19, lifetimeMs: 360, strength: .88 },
  },
  maps: {
    warehouse: { props: ["debris", "cable", "dust"], coverage: .78 },
    outskirts: { props: ["debris", "fiber", "dust"], coverage: .9 },
    lab: { props: ["puddle", "cable", "debris"], coverage: .76 },
    beachhead: { props: ["debris", "fiber", "cable"], coverage: .82 },
  },
  budgets: {
    high: { visibleProps: 96, activeProps: 48, contacts: 36, movers: 48, impacts: 24, checksPerMover: 8 },
    reduced: { visibleProps: 56, activeProps: 24, contacts: 18, movers: 28, impacts: 12, checksPerMover: 5 },
    minimal: { visibleProps: 24, activeProps: 8, contacts: 8, movers: 16, impacts: 4, checksPerMover: 3 },
  },
});

const exactKeys = (value, expected) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const finite = (value, minimum, maximum) => Number.isFinite(value) && value >= minimum && value <= maximum;
const color = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function validateEnvironmentInteractions(theme) {
  const errors = [];
  if (!exactKeys(theme, ["schema", "field", "props", "contacts", "maps", "budgets"]) || theme.schema !== ENVIRONMENT_INTERACTION_SCHEMA) return ["environmentInteractions: invalid schema or root fields"];
  if (!exactKeys(theme.field, ["cellSize", "slotsPerCell", "movementRadius", "impactRadius", "stepDistance", "maxTravelPerFrame", "seenImpactCap"])) errors.push("environmentInteractions.field: fields mismatch");
  for (const [key, minimum, maximum, integer] of [
    ["cellSize", 120, 600, true], ["slotsPerCell", 1, 4, true], ["movementRadius", 24, 180, false],
    ["impactRadius", 48, 280, false], ["stepDistance", 16, 90, false], ["maxTravelPerFrame", 80, 500, false], ["seenImpactCap", 32, 512, true],
  ]) if (!finite(theme.field?.[key], minimum, maximum) || (integer && !Number.isInteger(theme.field[key]))) errors.push(`environmentInteractions.field.${key}: invalid`);

  if (!exactKeys(theme.props, ENVIRONMENT_PROP_KINDS)) errors.push("environmentInteractions.props: classes mismatch");
  for (const kind of ENVIRONMENT_PROP_KINDS) {
    const prop = theme.props?.[kind], path = `environmentInteractions.props.${kind}`;
    if (!exactKeys(prop, ["label", "shape", "color", "secondary", "opacity", "radius", "response", "maxOffset", "settle"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (![prop.label, prop.shape, prop.response].every((value) => typeof value === "string" && value.length > 0)) errors.push(`${path}: text fields required`);
    if (!color(prop.color) || !color(prop.secondary)) errors.push(`${path}: invalid colors`);
    for (const [key, min, max] of [["opacity", .05, .65], ["radius", 2, 48], ["maxOffset", 0, 32], ["settle", 2, 20]]) if (!finite(prop[key], min, max)) errors.push(`${path}.${key}: invalid`);
  }

  if (!exactKeys(theme.contacts, MATERIAL_CLASSES)) errors.push("environmentInteractions.contacts: material classes mismatch");
  for (const material of MATERIAL_CLASSES) {
    const contact = theme.contacts?.[material], path = `environmentInteractions.contacts.${material}`;
    if (!exactKeys(contact, ["style", "color", "secondary", "count", "radius", "lifetimeMs", "strength"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (typeof contact.style !== "string" || !contact.style || !color(contact.color) || !color(contact.secondary)) errors.push(`${path}: invalid style or colors`);
    if (!Number.isInteger(contact.count) || contact.count < 1 || contact.count > 4) errors.push(`${path}.count: invalid`);
    for (const [key, min, max] of [["radius", 6, 40], ["lifetimeMs", 100, 600], ["strength", .1, 1]]) if (!finite(contact[key], min, max)) errors.push(`${path}.${key}: invalid`);
  }

  if (!exactKeys(theme.maps, ENVIRONMENT_MAP_IDS)) errors.push("environmentInteractions.maps: map classes mismatch");
  for (const mapId of ENVIRONMENT_MAP_IDS) {
    const map = theme.maps?.[mapId], path = `environmentInteractions.maps.${mapId}`;
    if (!exactKeys(map, ["props", "coverage"]) || !Array.isArray(map?.props) || map.props.length < 2 || map.props.some((kind) => !ENVIRONMENT_PROP_KINDS.includes(kind)) || new Set(map.props).size !== map.props.length) errors.push(`${path}: invalid props`);
    if (!finite(map?.coverage, .2, 1)) errors.push(`${path}.coverage: invalid`);
  }

  if (!exactKeys(theme.budgets, ENVIRONMENT_QUALITY_TIERS)) errors.push("environmentInteractions.budgets: quality tiers mismatch");
  let previous = Infinity;
  for (const tier of ENVIRONMENT_QUALITY_TIERS) {
    const budget = theme.budgets?.[tier], path = `environmentInteractions.budgets.${tier}`;
    if (!exactKeys(budget, ["visibleProps", "activeProps", "contacts", "movers", "impacts", "checksPerMover"])) { errors.push(`${path}: fields mismatch`); continue; }
    for (const [key, max] of [["visibleProps", 128], ["activeProps", 64], ["contacts", 48], ["movers", 64], ["impacts", 32], ["checksPerMover", 12]]) if (!Number.isInteger(budget[key]) || budget[key] < 0 || budget[key] > max) errors.push(`${path}.${key}: invalid`);
    if (budget.activeProps > budget.visibleProps || budget.visibleProps > previous) errors.push(`${path}: budgets must descend and remain bounded`);
    previous = budget.visibleProps;
  }
  return errors;
}

export function stableEnvironmentUnit(value) {
  const text = String(value || "environment");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function environmentBudget(tier = "high", effectsDensity = 1, theme = LASTLIGHT_ENVIRONMENT_INTERACTIONS) {
  const base = theme.budgets[ENVIRONMENT_QUALITY_TIERS.includes(tier) ? tier : "high"], density = clamp01(effectsDensity);
  return Object.freeze({
    visibleProps: Math.floor(base.visibleProps * density), activeProps: Math.floor(base.activeProps * density),
    contacts: Math.floor(base.contacts * density), movers: Math.max(0, Math.floor(base.movers * Math.max(.35, density))), impacts: Math.floor(base.impacts * density),
    checksPerMover: Math.max(0, Math.floor(base.checksPerMover * Math.max(.35, density))),
  });
}

export function environmentContactPlan(material, { reducedMotion = false, effectsDensity = 1, theme = LASTLIGHT_ENVIRONMENT_INTERACTIONS } = {}) {
  if (!MATERIAL_CLASSES.includes(material)) throw new TypeError(`Unsupported environment material: ${material}`);
  const source = theme.contacts[material], density = clamp01(effectsDensity);
  return Object.freeze({ ...source, material, count: reducedMotion ? 1 : Math.max(0, Math.round(source.count * density)), drift: reducedMotion ? 0 : source.radius * source.strength, reducedMotion });
}

export function environmentalPropsForBounds({ mapId, bounds, tier = "high", effectsDensity = 1, theme = LASTLIGHT_ENVIRONMENT_INTERACTIONS } = {}) {
  if (!ENVIRONMENT_MAP_IDS.includes(mapId) || !bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)) return Object.freeze([]);
  const density = clamp01(effectsDensity), budget = environmentBudget(tier, density, theme);
  if (!budget.visibleProps) return Object.freeze([]);
  const map = theme.maps[mapId], cell = theme.field.cellSize, props = [], centerX = (bounds.left + bounds.right) / 2, centerY = (bounds.top + bounds.bottom) / 2;
  const minX = Math.floor(bounds.left / cell) - 1, maxX = Math.floor(bounds.right / cell) + 1;
  const minY = Math.floor(bounds.top / cell) - 1, maxY = Math.floor(bounds.bottom / cell) + 1;
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) for (let slot = 0; slot < theme.field.slotsPerCell; slot++) {
    const id = `environment:${mapId}:${cx}:${cy}:${slot}`, presence = stableEnvironmentUnit(`${id}:presence`);
    if (presence > map.coverage * density) continue;
    const kind = map.props[Math.min(map.props.length - 1, Math.floor(stableEnvironmentUnit(`${id}:kind`) * map.props.length))];
    const x = (cx + .12 + stableEnvironmentUnit(`${id}:x`) * .76) * cell, y = (cy + .12 + stableEnvironmentUnit(`${id}:y`) * .76) * cell;
    props.push(Object.freeze({ id, mapId, kind, x, y, angle: stableEnvironmentUnit(`${id}:angle`) * Math.PI * 2, scale: .75 + stableEnvironmentUnit(`${id}:scale`) * .5, distance: Math.hypot(x - centerX, y - centerY) }));
  }
  props.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  return Object.freeze(props.slice(0, budget.visibleProps));
}

const byId = (list = []) => new Map(list.filter((entry) => entry && entry.id != null).map((entry) => [entry.id, entry]));

export class EnvironmentInteractionField {
  constructor(theme = LASTLIGHT_ENVIRONMENT_INTERACTIONS) {
    const errors = validateEnvironmentInteractions(theme);
    if (errors.length) throw new Error(`Invalid environmental interaction theme:\n- ${errors.join("\n- ")}`);
    this.theme = theme;
    this.reset();
  }

  reset() {
    this.props = []; this.reactions = new Map(); this.contacts = [];
    this.moverTokens = new Map(); this.seenImpactIds = new Set(); this.seenImpactQueue = [];
    this.lastBudget = environmentBudget("minimal", 0, this.theme); this.lastMapId = ""; this.propCacheKey = "";
  }

  update({ mapId, bounds, state = {}, previous = {}, materialImpacts = [], frameSeconds = 1 / 60, tier = "high", effectsDensity = 1, reducedMotion = false } = {}) {
    const dt = Math.max(0, Math.min(.05, Number(frameSeconds) || 0));
    if (this.lastMapId && this.lastMapId !== mapId) this.reset();
    this.lastMapId = mapId;
    this.lastBudget = environmentBudget(tier, effectsDensity, this.theme);
    const cell = this.theme.field.cellSize;
    const propCacheKey = [mapId, tier, Math.round(clamp01(effectsDensity) * 100), Math.floor(bounds?.left / cell), Math.floor(bounds?.top / cell), Math.floor(bounds?.right / cell), Math.floor(bounds?.bottom / cell)].join(":");
    if (propCacheKey !== this.propCacheKey) {
      this.props = environmentalPropsForBounds({ mapId, bounds, tier, effectsDensity, theme: this.theme });
      this.propCacheKey = propCacheKey;
    }
    const visibleIds = new Set(this.props.map((prop) => prop.id));
    const propById = new Map(this.props.map((prop) => [prop.id, prop]));
    for (const [id, reaction] of this.reactions) {
      if (!visibleIds.has(id) || reducedMotion) { this.reactions.delete(id); continue; }
      const prop = propById.get(id), config = this.theme.props[prop?.kind] || this.theme.props.debris;
      reaction.vx += (-reaction.x * config.settle - reaction.vx * 7) * dt;
      reaction.vy += (-reaction.y * config.settle - reaction.vy * 7) * dt;
      reaction.x += reaction.vx * dt; reaction.y += reaction.vy * dt; reaction.rotation += reaction.spin * dt;
      reaction.energy *= Math.exp(-config.settle * dt * .5);
      if (Math.abs(reaction.x) + Math.abs(reaction.y) + reaction.energy < .08) this.reactions.delete(id);
    }
    for (const contact of this.contacts) contact.ageMs += dt * 1000;
    this.contacts = this.contacts.filter((contact) => contact.ageMs <= contact.plan.lifetimeMs).slice(-this.lastBudget.contacts);
    if (!this.lastBudget.visibleProps) {
      this.reactions.clear(); this.contacts = [];
      for (const impact of materialImpacts) if (impact?.id && !this.seenImpactIds.has(impact.id)) this.rememberImpact(impact.id);
      return this.frame();
    }

    const previousPlayers = byId(previous?.players), previousEnemies = byId(previous?.enemies);
    const movers = [
      ...(state.players || []).map((entity) => ({ entity, before: previousPlayers.get(entity.id), priority: 0 })),
      ...(state.enemies || []).map((entity) => ({ entity, before: previousEnemies.get(entity.id), priority: entity.boss || entity.elite ? 1 : 2 })),
    ].filter(({ entity, before }) => before && [entity.x, entity.y, before.x, before.y].every(Number.isFinite))
      .sort((a, b) => a.priority - b.priority || String(a.entity.id).localeCompare(String(b.entity.id))).slice(0, this.lastBudget.movers);

    const terrainMaterial = MATERIAL_TARGET_METADATA.terrain[mapId] || "concrete";
    const activeMoverIds = new Set(movers.map(({ entity }) => entity.id));
    for (const id of this.moverTokens.keys()) if (!activeMoverIds.has(id)) this.moverTokens.delete(id);
    for (const { entity, before } of movers) {
      const dx = entity.x - before.x, dy = entity.y - before.y, travel = Math.hypot(dx, dy);
      if (travel < 1.5 || travel > this.theme.field.maxTravelPerFrame) continue;
      const direction = Math.atan2(dy, dx), token = `${entity.id}:${Math.floor(entity.x / this.theme.field.stepDistance)}:${Math.floor(entity.y / this.theme.field.stepDistance)}`;
      if (this.moverTokens.get(entity.id) !== token) {
        this.moverTokens.set(entity.id, token);
        if (stableEnvironmentUnit(token) <= effectsDensity) this.addContact({ id: `contact:${token}`, x: entity.x, y: entity.y + (entity.radius || 18) * .55, direction, material: terrainMaterial, intensity: Math.min(1.5, .55 + (entity.radius || 18) / 55), effectsDensity, reducedMotion });
      }
      this.disturbProps(entity.x, entity.y, direction, Math.min(1.6, .55 + travel / 24 + (entity.radius || 18) / 70), this.theme.field.movementRadius + (entity.radius || 18), reducedMotion);
    }

    let processedImpacts = 0;
    for (const impact of [...materialImpacts].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      if (!impact?.id || this.seenImpactIds.has(impact.id)) continue;
      if (processedImpacts++ >= this.lastBudget.impacts) break;
      this.rememberImpact(impact.id);
      const material = impact.response?.material;
      if (!MATERIAL_CLASSES.includes(material)) continue;
      const direction = Number.isFinite(impact.angle) ? impact.angle : stableEnvironmentUnit(`${impact.id}:direction`) * Math.PI * 2;
      this.addContact({ id: `environment:${impact.id}`, x: impact.x, y: impact.y, direction, material, intensity: impact.essential ? 1.7 : 1.25, effectsDensity, reducedMotion });
      this.disturbProps(impact.x, impact.y, direction, impact.essential ? 1.8 : 1.35, this.theme.field.impactRadius, reducedMotion);
    }
    return this.frame();
  }

  addContact({ id, x, y, direction, material, intensity, effectsDensity, reducedMotion }) {
    if (!this.lastBudget.contacts || this.contacts.some((contact) => contact.id === id)) return;
    const plan = environmentContactPlan(material, { reducedMotion, effectsDensity, theme: this.theme });
    if (!plan.count && !reducedMotion) return;
    if (this.contacts.length >= this.lastBudget.contacts) this.contacts.shift();
    this.contacts.push({ id, x, y, direction, intensity, ageMs: 0, plan });
  }

  disturbProps(x, y, direction, intensity, radius, reducedMotion) {
    if (reducedMotion || !this.lastBudget.activeProps || !this.lastBudget.checksPerMover) return;
    let checked = 0;
    for (const prop of this.props) {
      const distance = Math.hypot(prop.x - x, prop.y - y);
      if (distance > radius) continue;
      if (checked++ >= this.lastBudget.checksPerMover) break;
      const config = this.theme.props[prop.kind], falloff = 1 - distance / radius, strength = intensity * falloff;
      let reaction = this.reactions.get(prop.id);
      if (!reaction) {
        if (this.reactions.size >= this.lastBudget.activeProps) this.reactions.delete(this.reactions.keys().next().value);
        reaction = { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0, energy: 0 };
        this.reactions.set(prop.id, reaction);
      }
      const outward = distance > 1 ? Math.atan2(prop.y - y, prop.x - x) : direction;
      const impulse = Math.min(config.maxOffset * config.settle, strength * 95);
      reaction.vx += Math.cos(direction) * impulse * .65 + Math.cos(outward) * impulse * .35;
      reaction.vy += Math.sin(direction) * impulse * .65 + Math.sin(outward) * impulse * .35;
      reaction.spin += (stableEnvironmentUnit(`${prop.id}:spin`) - .5) * strength * 4;
      reaction.energy = Math.max(reaction.energy, strength);
    }
  }

  rememberImpact(id) {
    this.seenImpactIds.add(id); this.seenImpactQueue.push(id);
    while (this.seenImpactQueue.length > this.theme.field.seenImpactCap) this.seenImpactIds.delete(this.seenImpactQueue.shift());
  }

  reactionFor(id) { return this.reactions.get(id) || null; }
  frame() { return { props: this.props, reactions: this.reactions, contacts: this.contacts, budget: this.lastBudget }; }
  diagnostics() { return { visibleProps: this.props.length, activeProps: this.reactions.size, contacts: this.contacts.length, trackedMovers: this.moverTokens.size, seenImpacts: this.seenImpactIds.size, budget: { ...this.lastBudget } }; }
}
