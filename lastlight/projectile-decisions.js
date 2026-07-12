export const MAX_CORRIDOR_CANDIDATES = 12;

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function point(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be a point`);
  return { x: finiteNumber(value.x, `${name}.x`), y: finiteNumber(value.y, `${name}.y`) };
}

function stableId(value, name) {
  if (typeof value !== "string" || !value.length) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}

function compareStableIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validatedEntities(entities) {
  if (!Array.isArray(entities)) throw new TypeError("entities must be an array");
  const ids = new Set();
  return entities.map((entity, index) => {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new TypeError(`entities.${index} must be an object`);
    const id = stableId(entity.id, `entities.${index}.id`);
    if (ids.has(id)) throw new TypeError(`entities.${index}.id must be unique`);
    ids.add(id);
    finiteNumber(entity.x, `entities.${index}.x`);
    finiteNumber(entity.y, `entities.${index}.y`);
    if (entity.radius !== undefined && (!Number.isFinite(entity.radius) || entity.radius < 0)) throw new TypeError(`entities.${index}.radius must be finite and nonnegative`);
    return entity;
  });
}

function hitIdSet(hitIds) {
  if (hitIds === undefined || hitIds === null) return new Set();
  if (typeof hitIds === "string" || typeof hitIds[Symbol.iterator] !== "function") throw new TypeError("hitIds must be an iterable of stable ids");
  const result = new Set();
  let index = 0;
  for (const id of hitIds) result.add(stableId(id, `hitIds.${index++}`));
  return result;
}

function distanceSquared(origin, entity) {
  return (entity.x - origin.x) ** 2 + (entity.y - origin.y) ** 2;
}

function orderedRecords(origin, entities) {
  return validatedEntities(entities).map((entity) => ({ entity, distanceSquared: distanceSquared(origin, entity) })).sort((left, right) =>
    left.distanceSquared - right.distanceSquared || compareStableIds(left.entity.id, right.entity.id));
}

export function orderEntitiesByDistance(origin, entities) {
  const from = point(origin, "origin");
  return orderedRecords(from, entities).map(({ entity }) => entity);
}

export function nearestUnhitTarget(origin, entities, { range, hitIds } = {}) {
  const from = point(origin, "origin");
  const maximum = range === undefined ? Infinity : finiteNumber(range, "range");
  if (maximum < 0) throw new RangeError("range must be nonnegative");
  const excluded = hitIdSet(hitIds), limitSquared = maximum ** 2;
  return orderedRecords(from, entities).find(({ entity, distanceSquared: squared }) => !excluded.has(entity.id) && squared <= limitSquared)?.entity || null;
}

export function scoreCorridorCandidates(origin, entities, { range, halfWidth, maxCandidates = MAX_CORRIDOR_CANDIDATES, hitIds } = {}) {
  const from = point(origin, "origin");
  const maximum = finiteNumber(range, "range"), width = finiteNumber(halfWidth, "halfWidth");
  if (maximum <= 0) throw new RangeError("range must be greater than zero");
  if (width < 0) throw new RangeError("halfWidth must be nonnegative");
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CORRIDOR_CANDIDATES) throw new RangeError(`maxCandidates must be an integer from 1 to ${MAX_CORRIDOR_CANDIDATES}`);
  const excluded = hitIdSet(hitIds), limitSquared = maximum ** 2;
  const candidates = orderedRecords(from, entities).filter(({ entity, distanceSquared: squared }) =>
    !excluded.has(entity.id) && squared > 0 && squared <= limitSquared).slice(0, maxCandidates);
  const scored = candidates.map(({ entity, distanceSquared: squared }) => {
    const distance = Math.sqrt(squared), direction = { x: (entity.x - from.x) / distance, y: (entity.y - from.y) / distance };
    let score = 0;
    for (const { entity: target } of candidates) {
      const offsetX = target.x - from.x, offsetY = target.y - from.y;
      const forward = offsetX * direction.x + offsetY * direction.y;
      if (forward < 0 || forward > maximum) continue;
      const lateral = Math.abs(offsetX * direction.y - offsetY * direction.x);
      if (lateral <= width + Number(target.radius || 0)) score++;
    }
    return { entity, score, distanceSquared: squared, direction };
  });
  return scored.sort((left, right) => right.score - left.score || left.distanceSquared - right.distanceSquared || compareStableIds(left.entity.id, right.entity.id));
}

export function bestCorridorTarget(origin, entities, options) {
  return scoreCorridorCandidates(origin, entities, options)[0] || null;
}

export function movementDistance(previous, current) {
  const from = point(previous, "previous"), to = point(current, "current");
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function accumulateMovementDistance(total, previous, current) {
  const accumulated = finiteNumber(total, "total");
  if (accumulated < 0) throw new RangeError("total must be nonnegative");
  return accumulated + movementDistance(previous, current);
}
