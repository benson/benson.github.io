import { EnvironmentInteractionField, environmentalPropsForBounds } from "../environment-interactions.js";
import { MATERIAL_CLASSES } from "../material-impacts.js";

/** Renderer-only field stress hook. Every entity and impact is anonymous,
 * synthetic, and kept outside Simulation/replay/protocol state. */
export function createEnvironmentInteractionStressFixture({ mapId = "outskirts", tier = "high", effectsDensity = 1, reducedMotion = false } = {}) {
  const bounds = Object.freeze({ left: -1200, top: -800, right: 1200, bottom: 800 });
  const props = environmentalPropsForBounds({ mapId, bounds, tier, effectsDensity });
  const moverSeeds = props.slice(0, 64);
  const movers = moverSeeds.map((prop, index) => Object.freeze({ id: `stress-mover-${index}`, x: prop.x, y: prop.y, radius: index < 4 ? 18 : 20 + index % 18 }));
  const beforeMovers = movers.map((mover, index) => Object.freeze({ ...mover, x: mover.x - 10 - index % 16, y: mover.y + (index % 3 - 1) * 4 }));
  const split = Math.min(4, movers.length);
  const state = Object.freeze({ map: mapId, players: movers.slice(0, split), enemies: movers.slice(split), effects: [], projectiles: [] });
  const previous = Object.freeze({ players: beforeMovers.slice(0, split), enemies: beforeMovers.slice(split) });
  const impacts = Object.freeze(MATERIAL_CLASSES.flatMap((material, materialIndex) => props.slice(materialIndex * 4, materialIndex * 4 + 4).map((prop, index) => Object.freeze({
    id: `stress-impact-${material}-${index}`, x: prop.x, y: prop.y, angle: materialIndex * Math.PI / 3,
    essential: index === 0, response: Object.freeze({ material }),
  }))));
  const field = new EnvironmentInteractionField();
  const frame = field.update({ mapId, bounds, state, previous, materialImpacts: impacts, frameSeconds: 1 / 60, tier, effectsDensity, reducedMotion });
  return Object.freeze({ bounds, props, movers, impacts, frame, diagnostics: Object.freeze(field.diagnostics()) });
}
