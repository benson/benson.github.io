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
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= EPSILON ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + dx * t, y = ay + dy * t;
  return (px - x) ** 2 + (py - y) ** 2;
}

export function circleIntersectsCollider(x, y, radius, obstacle) {
  const collider = normalizeCollider(obstacle), [left, top, width, height] = collider.bounds;
  if (x + radius < left || x - radius > left + width || y + radius < top || y - radius > top + height) return false;
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

export function sweptCircleColliderImpact(startX, startY, endX, endY, radius, obstacle) {
  const collider = normalizeCollider(obstacle), padding = Math.max(0, Number(radius) || 0);
  const [left, top, width, height] = collider.bounds;
  const pathLeft = Math.min(startX, endX) - padding, pathTop = Math.min(startY, endY) - padding;
  const pathRight = Math.max(startX, endX) + padding, pathBottom = Math.max(startY, endY) + padding;
  if (pathRight < left || pathLeft > left + width || pathBottom < top || pathTop > top + height) return null;
  if (circleIntersectsCollider(startX, startY, padding, collider)) return Object.freeze({ t: 0, x: startX, y: startY });
  const dx = endX - startX, dy = endY - startY, distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / 4));
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
