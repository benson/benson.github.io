import { mapMechanicDefinition } from "./map-mechanics.js?v=20260716.12";
import { alphaMaskCollider } from "./collision-geometry.js?v=20260716.12";
import { ENVIRONMENT_COLLISION_MASKS } from "./environment-collision-masks.js?v=20260716.12";

export const ENVIRONMENT_CHUNK_SCHEMA = "lastlight.environment-chunks.v4";
export const ENVIRONMENT_CHUNK_MAP_IDS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);
export const ENVIRONMENT_CHUNK_QUALITY_TIERS = Object.freeze(["high", "reduced", "minimal"]);

const FRAME_IDS = Object.freeze({
  warehouse: Object.freeze(["freight-gantry", "generator-skid", "cable-station", "hazard-salvage"]),
  outskirts: Object.freeze(["wrecked-transport", "ruined-checkpoint", "field-power", "road-salvage"]),
  lab: Object.freeze(["cryo-pods", "pressure-manifold", "specimen-cargo", "emergency-plant"]),
  beachhead: Object.freeze(["broken-skiff", "corrupted-beacon", "ruptured-cargo", "sea-wall-machine"]),
});

const MAP_COPY = Object.freeze({
  warehouse: Object.freeze({
    name: "Freight remnants", short: "Gantry, generator, conduit, salvage",
    story: "Heavy freight infrastructure and cyan-lit utility machinery make Iron District read as an operating industrial ruin.",
    material: "Graphite steel · cyan utilities · hazard orange", frameOffset: 0, density: .88,
  }),
  outskirts: Object.freeze({
    name: "Ash checkpoints", short: "Transport, checkpoint, field power, rubble",
    story: "Collapsed defensive positions and abandoned field logistics make Ash Outskirts feel evacuated rather than merely dusty.",
    material: "Scorched asphalt · field steel · amber signals", frameOffset: 1, density: .96,
  }),
  lab: Object.freeze({
    name: "Cryogenic infrastructure", short: "Cryo pods, manifolds, specimens, vents",
    story: "Frosted research hardware and pressure systems turn Subzero Lab into a failed facility with visible purpose.",
    material: "Frosted alloy · dark glass · cyan diagnostics", frameOffset: 2, density: .82,
  }),
  beachhead: Object.freeze({
    name: "Corrupted shore salvage", short: "Skiff, beacon, cargo, sea-wall machinery",
    story: "Reef-grown wreckage and violet-corrupted shore machinery make The Beachhead feel claimed by the breach.",
    material: "Volcanic slate · wreck steel · violet reef", frameOffset: 3, density: .86,
  }),
});

const framesFor = (mapId) => FRAME_IDS[mapId].map((id, index) => Object.freeze({
  id, index, layer: "grounded", collision: "solid", anchor: Object.freeze([.5, .5]), drawSize: Object.freeze([300, 300]),
  collisionMask: ENVIRONMENT_COLLISION_MASKS.maps[mapId].frames[index],
}));

export const LASTLIGHT_ENVIRONMENT_CHUNKS = deepFreeze({
  schema: ENVIRONMENT_CHUNK_SCHEMA,
  atlas: { columns: 2, rows: 2, frameCount: 4 },
  field: {
    cellSize: 320, worldMargin: 70, placementRadius: 125, centerClearance: 500,
    obstaclePadding: 45, corridorCenters: [], corridorHalfWidth: 88,
    scaleMin: .82, scaleMax: 1.02, rotationMax: 0, opacityMin: .9, opacityMax: 1,
  },
  maps: Object.fromEntries(ENVIRONMENT_CHUNK_MAP_IDS.map((mapId) => [mapId, {
    ...MAP_COPY[mapId], atlasKey: `environmentChunks.${mapId}`, frames: framesFor(mapId),
    collision: "solid", readability: "raised-cover",
  }])),
  // Each authored structure appears twice as gameplay geometry. Every quality
  // tier renders the same eight objects: quality may simplify effects, never
  // remove cover or change routing.
  budgets: { high: 8, reduced: 8, minimal: 8 },
});

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function finite(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function validateEnvironmentChunks(theme) {
  const errors = [];
  if (!exactKeys(theme, ["schema", "atlas", "field", "maps", "budgets"]) || theme.schema !== ENVIRONMENT_CHUNK_SCHEMA) {
    return ["environmentChunks: invalid schema or root fields"];
  }
  if (!exactKeys(theme.atlas, ["columns", "rows", "frameCount"]) || theme.atlas.columns !== 2 || theme.atlas.rows !== 2 || theme.atlas.frameCount !== 4) {
    errors.push("environmentChunks.atlas: expected a 2x2 four-frame atlas");
  }
  const fieldKeys = ["cellSize", "worldMargin", "placementRadius", "centerClearance", "obstaclePadding", "corridorCenters", "corridorHalfWidth", "scaleMin", "scaleMax", "rotationMax", "opacityMin", "opacityMax"];
  if (!exactKeys(theme.field, fieldKeys)) errors.push("environmentChunks.field: fields mismatch");
  for (const [key, minimum, maximum] of [
    ["cellSize", 320, 800], ["worldMargin", 0, 300], ["placementRadius", 80, 260], ["centerClearance", 240, 800],
    ["obstaclePadding", 0, 240], ["corridorHalfWidth", 0, 240], ["scaleMin", .4, 1.5], ["scaleMax", .4, 1.5],
    ["rotationMax", 0, .2], ["opacityMin", .2, 1], ["opacityMax", .2, 1],
  ]) if (!finite(theme.field?.[key], minimum, maximum)) errors.push(`environmentChunks.field.${key}: invalid`);
  if (theme.field?.scaleMin > theme.field?.scaleMax) errors.push("environmentChunks.field: scale range inverted");
  if (theme.field?.opacityMin > theme.field?.opacityMax) errors.push("environmentChunks.field: opacity range inverted");
  if (!Array.isArray(theme.field?.corridorCenters) || theme.field.corridorCenters.length > 4 || theme.field.corridorCenters.some((value) => !finite(value, -2000, 2000))) errors.push("environmentChunks.field.corridorCenters: invalid");
  if (!exactKeys(theme.maps, ENVIRONMENT_CHUNK_MAP_IDS)) errors.push("environmentChunks.maps: map coverage mismatch");
  for (const mapId of ENVIRONMENT_CHUNK_MAP_IDS) {
    const map = theme.maps?.[mapId], path = `environmentChunks.maps.${mapId}`;
    if (!exactKeys(map, ["name", "short", "story", "material", "frameOffset", "density", "atlasKey", "frames", "collision", "readability"])) { errors.push(`${path}: fields mismatch`); continue; }
    for (const key of ["name", "short", "story", "material"]) if (typeof map[key] !== "string" || !map[key].trim()) errors.push(`${path}.${key}: invalid`);
    if (map.atlasKey !== `environmentChunks.${mapId}`) errors.push(`${path}.atlasKey: invalid`);
    if (!Number.isInteger(map.frameOffset) || map.frameOffset < 0 || map.frameOffset > 3) errors.push(`${path}.frameOffset: invalid`);
    if (!finite(map.density, .25, 1)) errors.push(`${path}.density: invalid`);
    if (map.collision !== "solid" || map.readability !== "raised-cover") errors.push(`${path}: chunks must remain visible solid cover`);
    if (!Array.isArray(map.frames) || map.frames.length !== 4) { errors.push(`${path}.frames: expected four frames`); continue; }
    const ids = new Set();
    for (let index = 0; index < map.frames.length; index++) {
      const frame = map.frames[index], framePath = `${path}.frames[${index}]`;
      if (!exactKeys(frame, ["id", "index", "layer", "collision", "anchor", "drawSize", "collisionMask"])) { errors.push(`${framePath}: fields mismatch`); continue; }
      if (typeof frame.id !== "string" || ids.has(frame.id)) errors.push(`${framePath}.id: invalid or duplicate`); else ids.add(frame.id);
      if (frame.index !== index || frame.layer !== "grounded" || frame.collision !== "solid") errors.push(`${framePath}: invalid index/layer/collision`);
      if (!Array.isArray(frame.anchor) || frame.anchor.length !== 2 || frame.anchor.some((value) => !finite(value, 0, 1))) errors.push(`${framePath}.anchor: invalid`);
      if (!Array.isArray(frame.drawSize) || frame.drawSize.length !== 2 || frame.drawSize.some((value) => !finite(value, 160, 640))) errors.push(`${framePath}.drawSize: invalid`);
      const mask = frame.collisionMask;
      if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1
        || !Array.isArray(mask.bounds) || mask.bounds.length !== 4 || !Array.isArray(mask.rows) || mask.rows.length !== mask.height
        || mask.rows.some((row) => !Array.isArray(row) || row.length % 2 || row.some((value) => !Number.isInteger(value) || value < 0 || value > mask.width))) {
        errors.push(`${framePath}.collisionMask: invalid`);
      }
    }
  }
  if (!exactKeys(theme.budgets, ENVIRONMENT_CHUNK_QUALITY_TIERS)) errors.push("environmentChunks.budgets: quality coverage mismatch");
  for (const tier of ENVIRONMENT_CHUNK_QUALITY_TIERS) if (!Number.isInteger(theme.budgets?.[tier]) || theme.budgets[tier] < 1 || theme.budgets[tier] > 24) errors.push(`environmentChunks.budgets.${tier}: invalid`);
  if (theme.budgets?.high < theme.budgets?.reduced || theme.budgets?.reduced < theme.budgets?.minimal) errors.push("environmentChunks.budgets: tiers must be descending");
  return errors;
}

export function stableChunkUnit(value) {
  const text = String(value || "environment-chunk");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967295;
}

function circleIntersectsRect(x, y, radius, rect, padding = 0) {
  const [left, top, width, height] = rect;
  const nearestX = Math.max(left - padding, Math.min(x, left + width + padding));
  const nearestY = Math.max(top - padding, Math.min(y, top + height + padding));
  return Math.hypot(x - nearestX, y - nearestY) < radius;
}

export function environmentChunkClearance(chunk, { obstacles = [], theme = LASTLIGHT_ENVIRONMENT_CHUNKS } = {}) {
  const field = theme.field, radius = field.placementRadius * chunk.scale;
  if (Math.hypot(chunk.x, chunk.y) < field.centerClearance + radius) return false;
  if (field.corridorCenters.some((center) => Math.abs(chunk.y - center) < field.corridorHalfWidth + radius)) return false;
  if (obstacles.some((rect) => circleIntersectsRect(chunk.x, chunk.y, radius, rect, field.obstaclePadding))) return false;
  const mechanic = mapMechanicDefinition(chunk.mapId);
  if (mechanic.effect.pushPerSecond > 0 && mechanic.pattern === "horizontal-lanes") {
    const [, top, , height] = chunk.collisionRect || environmentChunkCollisionRect(chunk, theme), flowClearance = 48;
    if (mechanic.lanes.some((center) => top < center + flowClearance && top + height > center - flowClearance)) return false;
  }
  return true;
}

export function environmentChunkCollisionRect(chunk, theme = LASTLIGHT_ENVIRONMENT_CHUNKS) {
  if (!chunk || !ENVIRONMENT_CHUNK_MAP_IDS.includes(chunk.mapId) || !Number.isInteger(chunk.frame) || chunk.frame < 0 || chunk.frame > 3) throw new TypeError("Invalid environment chunk collision source");
  return environmentChunkCollider(chunk, theme).bounds;
}

export function environmentChunkCollider(chunk, theme = LASTLIGHT_ENVIRONMENT_CHUNKS) {
  if (!chunk || !ENVIRONMENT_CHUNK_MAP_IDS.includes(chunk.mapId) || !Number.isInteger(chunk.frame) || chunk.frame < 0 || chunk.frame > 3) throw new TypeError("Invalid environment chunk collision source");
  const frame = theme.maps[chunk.mapId].frames[chunk.frame];
  return alphaMaskCollider(chunk.id || `environment:${chunk.mapId}:${chunk.frame}`, frame.collisionMask, {
    x: chunk.x, y: chunk.y,
    width: frame.drawSize[0] * chunk.scale, height: frame.drawSize[1] * chunk.scale,
    rotation: chunk.rotation || 0, flipX: chunk.flipX, anchor: frame.anchor,
  });
}

export function environmentChunkLayout({ mapId, tier = "high", world = { width: 3600, height: 2400 }, obstacles = [], theme = LASTLIGHT_ENVIRONMENT_CHUNKS } = {}) {
  const errors = validateEnvironmentChunks(theme);
  if (errors.length) throw new Error(`Invalid environment chunk theme:\n- ${errors.join("\n- ")}`);
  if (!ENVIRONMENT_CHUNK_MAP_IDS.includes(mapId)) throw new TypeError(`Unsupported environment chunk map: ${mapId}`);
  if (!ENVIRONMENT_CHUNK_QUALITY_TIERS.includes(tier)) throw new TypeError(`Unsupported environment chunk quality: ${tier}`);
  if (!finite(world?.width, 1000, 10000) || !finite(world?.height, 800, 10000)) throw new TypeError("Invalid environment chunk world bounds");
  const map = theme.maps[mapId], field = theme.field, halfWidth = world.width / 2, halfHeight = world.height / 2;
  const startX = -halfWidth + field.worldMargin + field.cellSize / 2, endX = halfWidth - field.worldMargin - field.cellSize / 2;
  const startY = -halfHeight + field.worldMargin + field.cellSize / 2, endY = halfHeight - field.worldMargin - field.cellSize / 2;
  const candidates = [];
  let row = 0;
  for (let baseY = startY; baseY <= endY; baseY += field.cellSize, row++) {
    let column = 0;
    for (let baseX = startX; baseX <= endX; baseX += field.cellSize, column++) {
      const id = `environment-chunk:${mapId}:${column}:${row}`, presence = stableChunkUnit(`${id}:presence`);
      if (presence > map.density) continue;
      const offset = field.cellSize * .22;
      const scale = field.scaleMin + stableChunkUnit(`${id}:scale`) * (field.scaleMax - field.scaleMin);
      const chunk = {
        id, mapId, frame: (column + row * 3 + map.frameOffset) % 4,
        x: baseX + (stableChunkUnit(`${id}:x`) - .5) * offset * 2,
        y: baseY + (stableChunkUnit(`${id}:y`) - .5) * offset * 2,
        scale, flipX: stableChunkUnit(`${id}:flip`) >= .5,
        rotation: 0,
        opacity: field.opacityMin + stableChunkUnit(`${id}:opacity`) * (field.opacityMax - field.opacityMin),
        priority: stableChunkUnit(`${id}:priority`), layer: "grounded", collision: "solid",
      };
      chunk.collider = environmentChunkCollider(chunk, theme); chunk.collisionRect = chunk.collider.bounds;
      const radius = field.placementRadius * scale;
      if (Math.abs(chunk.x) + radius > halfWidth - field.worldMargin || Math.abs(chunk.y) + radius > halfHeight - field.worldMargin) continue;
      if (environmentChunkClearance(chunk, { obstacles, theme })) candidates.push(Object.freeze(chunk));
    }
  }
  // Prefer readable landmarks near the opening play space, while the stable
  // hash keeps each map's arrangement from collapsing into a perfect ring.
  const selectionPriority = (chunk) => Math.hypot(chunk.x / halfWidth, chunk.y / halfHeight) + chunk.priority * .24;
  candidates.sort((left, right) => selectionPriority(left) - selectionPriority(right) || left.id.localeCompare(right.id));
  const landmarks = [], budget = theme.budgets[tier];
  // Select in balanced rounds so the field cannot fill with a single repeated
  // silhouette. The built-in eight-object budget yields two of every authored
  // structure while preserving the stable near-to-far ordering.
  for (let frame = 0; frame < map.frames.length; frame++) {
    const target = Math.floor(budget / map.frames.length) + (frame < budget % map.frames.length ? 1 : 0);
    landmarks.push(...candidates.filter((chunk) => chunk.frame === frame).slice(0, target));
  }
  if (landmarks.length !== budget) throw new Error(`Environment chunk layout for ${mapId} cannot place its balanced solid-landmark budget`);
  landmarks.sort((left, right) => selectionPriority(left) - selectionPriority(right) || left.id.localeCompare(right.id));
  return Object.freeze(landmarks);
}

export function environmentChunkObstacles({ mapId, world, obstacles = [], theme = LASTLIGHT_ENVIRONMENT_CHUNKS } = {}) {
  return Object.freeze(environmentChunkLayout({ mapId, tier: "minimal", world, obstacles, theme }).map((chunk) => chunk.collider));
}

export function environmentChunksForBounds({ mapId, bounds, tier = "high", world, obstacles, theme = LASTLIGHT_ENVIRONMENT_CHUNKS, layout = null } = {}) {
  if (!bounds || !["left", "top", "right", "bottom"].every((key) => Number.isFinite(bounds[key]))) throw new TypeError("Invalid environment chunk viewport bounds");
  const chunks = layout || environmentChunkLayout({ mapId, tier, world, obstacles, theme });
  if (!Array.isArray(chunks)) throw new TypeError("Invalid environment chunk layout");
  return Object.freeze(chunks.filter((chunk) => {
    const radius = theme.field.placementRadius * chunk.scale;
    return chunk.x + radius >= bounds.left && chunk.x - radius <= bounds.right && chunk.y + radius >= bounds.top && chunk.y - radius <= bounds.bottom;
  }));
}

const validationErrors = validateEnvironmentChunks(LASTLIGHT_ENVIRONMENT_CHUNKS);
if (validationErrors.length) throw new Error(`Invalid built-in environment chunk theme:\n- ${validationErrors.join("\n- ")}`);
