import { PING_WORLD_HALF_HEIGHT, PING_WORLD_HALF_WIDTH, sanitizePingRequest } from "./ping-contract.js?v=20260713.4";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

/** Resolve an untrusted ping request against current host state without mutating it. */
export function resolveContextualPing(game, rawRequest) {
  let request;
  try { request = sanitizePingRequest(rawRequest, { transport: true }); } catch { return null; }
  if (!game || !["running", "boss"].includes(game.stage)) return null;
  const sender = game.players?.find((player) => player.id === request._from && player.replaySlot === request.replaySlot);
  if (!sender) return null;
  if (request.intent === "help") return Object.freeze({ x: Math.round(sender.x), y: Math.round(sender.y), targetKind: "ally" });

  const x = clamp(request.x, -PING_WORLD_HALF_WIDTH + 20, PING_WORLD_HALF_WIDTH - 20);
  const y = clamp(request.y, -PING_WORLD_HALF_HEIGHT + 20, PING_WORLD_HALF_HEIGHT - 20);
  if (Math.hypot(x - sender.x, y - sender.y) > 1_100) return null;

  const candidates = [];
  const add = (list, targetKind, radius) => {
    for (const entity of list || []) {
      if (entity.dead || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) continue;
      const distance = Math.hypot(entity.x - x, entity.y - y);
      if (distance <= radius) candidates.push({ id: String(entity.id || ""), distance, x: Math.round(entity.x), y: Math.round(entity.y), targetKind });
    }
  };

  if (request.intent === "danger") {
    add(game.enemies, "enemy", 180); add(game.hostile, "enemy", 120);
  } else if (request.intent === "objective") {
    add(game.objectives, "objective", 220); add(game.relayBalls, "objective", 220);
    if (game.machine) add([{ id: "machine", x: 0, y: 0 }], "objective", 180);
  } else if (request.intent === "pickup") {
    add(game.drops, "pickup", 150); add(game.orbs, "pickup", 120); add(game.pods, "cache", 170);
  } else if (request.intent === "recommendation") {
    const include = (kind) => request.targetKind === "ground" || request.targetKind === kind;
    if (include("enemy")) add(game.enemies, "enemy", 190);
    if (include("objective")) { add(game.objectives, "objective", 220); add(game.relayBalls, "objective", 220); }
    if (include("pickup")) { add(game.drops, "pickup", 150); add(game.orbs, "pickup", 120); }
    if (include("cache")) add(game.pods, "cache", 170);
    if (include("ally")) add(game.players.filter((player) => player.id !== sender.id), "ally", 190);
  }

  candidates.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  const target = candidates[0];
  return Object.freeze(target
    ? { x: target.x, y: target.y, targetKind: target.targetKind }
    : { x, y, targetKind: "ground" });
}
