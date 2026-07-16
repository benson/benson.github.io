const EPSILON = 1e-7;

export function rectCollider(rect, id = "cover") {
  const [left, top, width, height] = rect;
  const points = Object.freeze([[left, top], [left + width, top], [left + width, top + height], [left, top + height]].map(Object.freeze));
  return Object.freeze({ id, bounds: Object.freeze([left, top, width, height]), parts: Object.freeze([Object.freeze({ points })]) });
}

export function polygonBounds(parts) {
  const points = parts.flatMap((part) => part.points || part);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  return Object.freeze([left, top, right - left, bottom - top]);
}

export function normalizeCollider(obstacle, id = "cover") {
  if (Array.isArray(obstacle) && obstacle.length === 4 && obstacle.every(Number.isFinite)) return rectCollider(obstacle, id);
  if (obstacle?.mask && obstacle?.transform && Array.isArray(obstacle.bounds) && obstacle.bounds.length === 4) return obstacle;
  if (!obstacle || !Array.isArray(obstacle.parts) || !obstacle.parts.length) throw new TypeError("Invalid cover collider");
  return obstacle;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi || EPSILON) + xi) inside = !inside;
  }
  return inside;
}

function pointSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const [x, y] = nearestPointOnSegment(px, py, ax, ay, bx, by);
  return (px - x) ** 2 + (py - y) ** 2;
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= EPSILON ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return [ax + dx * t, ay + dy * t];
}

function normalizedVector(x, y, fallbackX = 1, fallbackY = 0) {
  let length = Math.hypot(x, y);
  if (length <= EPSILON) { x = fallbackX; y = fallbackY; length = Math.hypot(x, y); }
  if (length <= EPSILON) return Object.freeze({ x: 1, y: 0 });
  return Object.freeze({ x: x / length, y: y / length });
}

function polygonContactNormal(x, y, collider, fallbackX, fallbackY) {
  let nearest = null;
  for (const { points } of collider.parts) {
    const inside = pointInPolygon(x, y, points);
    for (let index = 0; index < points.length; index++) {
      const [ax, ay] = points[index], [bx, by] = points[(index + 1) % points.length];
      const [nearX, nearY] = nearestPointOnSegment(x, y, ax, ay, bx, by);
      const distanceSquared = (x - nearX) ** 2 + (y - nearY) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared) nearest = { nearX, nearY, distanceSquared, inside };
    }
  }
  if (!nearest) return normalizedVector(fallbackX, fallbackY);
  return nearest.inside
    ? normalizedVector(nearest.nearX - x, nearest.nearY - y, fallbackX, fallbackY)
    : normalizedVector(x - nearest.nearX, y - nearest.nearY, fallbackX, fallbackY);
}

export function circleIntersectsCollider(x, y, radius, obstacle) {
  const collider = normalizeCollider(obstacle), [left, top, width, height] = collider.bounds;
  if (x + radius < left || x - radius > left + width || y + radius < top || y - radius > top + height) return false;
  if (collider.mask) return circleIntersectsAlphaMask(x, y, radius, collider);
  const radiusSquared = radius * radius;
  for (const { points } of collider.parts) {
    if (pointInPolygon(x, y, points)) return true;
    for (let index = 0; index < points.length; index++) {
      const [ax, ay] = points[index], [bx, by] = points[(index + 1) % points.length];
      if (pointSegmentDistanceSquared(x, y, ax, ay, bx, by) < radiusSquared) return true;
    }
  }
  return false;
}

// Returns the exact local surface normal at a contact point. Polygon colliders
// use their authored edges; alpha colliders use the occupied run rectangles in
// the mask itself. The fallback is only used for a degenerate point exactly on
// a vertex and should point away from the attempted movement.
export function colliderContactNormal(x, y, obstacle, fallbackX = 1, fallbackY = 0) {
  const collider = normalizeCollider(obstacle);
  return collider.mask
    ? alphaMaskContactNormal(x, y, collider, fallbackX, fallbackY)
    : polygonContactNormal(x, y, collider, fallbackX, fallbackY);
}

export function sweptCircleColliderImpact(startX, startY, endX, endY, radius, obstacle) {
  const collider = normalizeCollider(obstacle), padding = Math.max(0, Number(radius) || 0);
  const [left, top, width, height] = collider.bounds;
  const pathLeft = Math.min(startX, endX) - padding, pathTop = Math.min(startY, endY) - padding;
  const pathRight = Math.max(startX, endX) + padding, pathBottom = Math.max(startY, endY) + padding;
  if (pathRight < left || pathLeft > left + width || pathBottom < top || pathTop > top + height) return null;
  if (circleIntersectsCollider(startX, startY, padding, collider)) return Object.freeze({ t: 0, x: startX, y: startY });
  const dx = endX - startX, dy = endY - startY, distance = Math.hypot(dx, dy);
  const stepSize = collider.mask ? Math.max(.5, Math.min(4, Math.max(padding * .5, collider.pixelSize))) : 4;
  const steps = Math.max(1, Math.ceil(distance / stepSize));
  let previous = 0;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps, x = startX + dx * t, y = startY + dy * t;
    if (!circleIntersectsCollider(x, y, padding, collider)) { previous = t; continue; }
    let low = previous, high = t;
    for (let iteration = 0; iteration < 9; iteration++) {
      const middle = (low + high) / 2;
      if (circleIntersectsCollider(startX + dx * middle, startY + dy * middle, padding, collider)) high = middle;
      else low = middle;
    }
    return Object.freeze({ t: high, x: startX + dx * high, y: startY + dy * high });
  }
  return null;
}

export function transformCollisionParts(frame, chunk) {
  const width = frame.drawSize[0] * chunk.scale, height = frame.drawSize[1] * chunk.scale;
  const cosine = Math.cos(chunk.rotation || 0), sine = Math.sin(chunk.rotation || 0), flip = chunk.flipX ? -1 : 1;
  const parts = frame.collisionParts.map((normalized) => Object.freeze({ points: Object.freeze(normalized.map(([u, v]) => {
    const localX = (u - frame.anchor[0]) * width * flip, localY = (v - frame.anchor[1]) * height;
    return Object.freeze([chunk.x + localX * cosine - localY * sine, chunk.y + localX * sine + localY * cosine]);
  })) }));
  return Object.freeze(parts);
}

export function compoundCollider(id, parts) {
  const frozen = Object.freeze(parts.map((part) => Object.freeze({ points: Object.freeze(part.points.map((point) => Object.freeze([...point]))) })));
  return Object.freeze({ id, bounds: polygonBounds(frozen), parts: frozen });
}

function transformedPoint(transform, localX, localY) {
  const cosine = Math.cos(transform.rotation), sine = Math.sin(transform.rotation), flip = transform.flipX ? -1 : 1;
  const x = localX * flip;
  return [transform.x + x * cosine - localY * sine, transform.y + x * sine + localY * cosine];
}

function worldToMaskLocal(transform, x, y) {
  const cosine = Math.cos(transform.rotation), sine = Math.sin(transform.rotation);
  const dx = x - transform.x, dy = y - transform.y;
  return [(dx * cosine + dy * sine) * (transform.flipX ? -1 : 1), -dx * sine + dy * cosine];
}

function maskLocalVectorToWorld(transform, x, y) {
  const cosine = Math.cos(transform.rotation), sine = Math.sin(transform.rotation), flip = transform.flipX ? -1 : 1;
  x *= flip;
  return [x * cosine - y * sine, x * sine + y * cosine];
}

function alphaMaskContactNormal(x, y, collider, fallbackX, fallbackY) {
  const { mask, transform } = collider, [localX, localY] = worldToMaskLocal(transform, x, y);
  let nearest = null;
  for (let row = 0; row < mask.height; row++) {
    const runs = mask.rows[row];
    if (!runs?.length) continue;
    const top = (row / mask.height - transform.anchor[1]) * transform.height;
    const bottom = ((row + 1) / mask.height - transform.anchor[1]) * transform.height;
    for (let index = 0; index < runs.length; index += 2) {
      const left = (runs[index] / mask.width - transform.anchor[0]) * transform.width;
      const right = (runs[index + 1] / mask.width - transform.anchor[0]) * transform.width;
      const minX = Math.min(left, right), maxX = Math.max(left, right), minY = Math.min(top, bottom), maxY = Math.max(top, bottom);
      const inside = localX >= minX && localX <= maxX && localY >= minY && localY <= maxY;
      let nearX = Math.max(minX, Math.min(localX, maxX)), nearY = Math.max(minY, Math.min(localY, maxY));
      if (inside) {
        const faces = [
          { distance: localX - minX, x: minX, y: localY }, { distance: maxX - localX, x: maxX, y: localY },
          { distance: localY - minY, x: localX, y: minY }, { distance: maxY - localY, x: localX, y: maxY },
        ].sort((leftFace, rightFace) => leftFace.distance - rightFace.distance);
        nearX = faces[0].x; nearY = faces[0].y;
      }
      const distanceSquared = (localX - nearX) ** 2 + (localY - nearY) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared) nearest = { nearX, nearY, distanceSquared, inside };
    }
  }
  if (!nearest) return normalizedVector(fallbackX, fallbackY);
  const localNormalX = nearest.inside ? nearest.nearX - localX : localX - nearest.nearX;
  const localNormalY = nearest.inside ? nearest.nearY - localY : localY - nearest.nearY;
  const [worldNormalX, worldNormalY] = maskLocalVectorToWorld(transform, localNormalX, localNormalY);
  return normalizedVector(worldNormalX, worldNormalY, fallbackX, fallbackY);
}

function transformedMaskBounds(mask, transform) {
  const [left, top, right, bottom] = mask.bounds;
  const toLocalX = (pixel) => (pixel / mask.width - transform.anchor[0]) * transform.width;
  const toLocalY = (pixel) => (pixel / mask.height - transform.anchor[1]) * transform.height;
  const points = [
    transformedPoint(transform, toLocalX(left), toLocalY(top)),
    transformedPoint(transform, toLocalX(right), toLocalY(top)),
    transformedPoint(transform, toLocalX(right), toLocalY(bottom)),
    transformedPoint(transform, toLocalX(left), toLocalY(bottom)),
  ];
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return Object.freeze([minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY]);
}

function validateAlphaMask(mask) {
  if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1
    || !Array.isArray(mask.bounds) || mask.bounds.length !== 4 || !Array.isArray(mask.rows) || mask.rows.length !== mask.height) {
    throw new TypeError("Invalid alpha collision mask");
  }
}

export function alphaMaskCollider(id, mask, { x = 0, y = 0, width, height, rotation = 0, flipX = false, anchor = [.5, .5] } = {}) {
  validateAlphaMask(mask);
  if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0
    || !Array.isArray(anchor) || anchor.length !== 2 || anchor.some((value) => !Number.isFinite(value))) throw new TypeError("Invalid alpha collision transform");
  const transform = Object.freeze({ x, y, width, height, rotation, flipX: Boolean(flipX), anchor: Object.freeze([...anchor]) });
  return Object.freeze({
    id, mask, transform,
    bounds: transformedMaskBounds(mask, transform),
    pixelSize: Math.min(width / mask.width, height / mask.height),
  });
}

function circleIntersectsAlphaMask(x, y, radius, collider) {
  const { mask, transform } = collider, cosine = Math.cos(transform.rotation), sine = Math.sin(transform.rotation);
  const dx = x - transform.x, dy = y - transform.y;
  const localX = (dx * cosine + dy * sine) * (transform.flipX ? -1 : 1);
  const localY = -dx * sine + dy * cosine;
  const rowStart = Math.max(0, Math.floor(((localY - radius) / transform.height + transform.anchor[1]) * mask.height));
  const rowEnd = Math.min(mask.height - 1, Math.ceil(((localY + radius) / transform.height + transform.anchor[1]) * mask.height));
  const radiusSquared = radius * radius;
  for (let row = rowStart; row <= rowEnd; row++) {
    const runs = mask.rows[row];
    if (!runs?.length) continue;
    const top = (row / mask.height - transform.anchor[1]) * transform.height;
    const bottom = ((row + 1) / mask.height - transform.anchor[1]) * transform.height;
    const nearestY = Math.max(Math.min(top, bottom), Math.min(localY, Math.max(top, bottom)));
    const verticalSquared = (localY - nearestY) ** 2;
    if (verticalSquared > radiusSquared) continue;
    for (let index = 0; index < runs.length; index += 2) {
      const left = (runs[index] / mask.width - transform.anchor[0]) * transform.width;
      const right = (runs[index + 1] / mask.width - transform.anchor[0]) * transform.width;
      const nearestX = Math.max(Math.min(left, right), Math.min(localX, Math.max(left, right)));
      if ((localX - nearestX) ** 2 + verticalSquared <= radiusSquared) return true;
    }
  }
  return false;
}
