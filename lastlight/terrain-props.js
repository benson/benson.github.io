import { alphaMaskCollider } from "./collision-geometry.js?v=20260718.9";
import { ENVIRONMENT_COLLISION_MASKS } from "./environment-collision-masks.js?v=20260718.9";
import { TERRAIN_PROP_SLOTS } from "./terrain-prop-slots.js?v=20260718.9";

export const TERRAIN_PROP_SCHEMA = "lastlight.terrain-props.v1";
const BARRICADE_MASK = ENVIRONMENT_COLLISION_MASKS.props.blastBarricade;
const BARRICADE_ASPECT = BARRICADE_MASK.width / BARRICADE_MASK.height;

function validateSlot(slot, index) {
  if (!Array.isArray(slot) || slot.length !== 4 || slot.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`Invalid terrain prop slot ${index}`);
  }
}

// MAP_OBSTACLES is retained only as a deterministic placement envelope. It is
// never collision geometry. Every visible barricade instance owns an alpha
// collider transformed from the exact image drawn by the renderer.
export function terrainPropsForSlots(slots = TERRAIN_PROP_SLOTS) {
  const props = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex];
    validateSlot(slot, slotIndex);
    const [left, top, width, height] = slot;
    const drawHeight = Math.min(164, height + 74);
    const drawWidth = drawHeight * BARRICADE_ASPECT;
    const count = Math.max(1, Math.ceil(width / 150));
    for (let instance = 0; instance < count; instance++) {
      const id = `terrain-prop:barricade:${slotIndex}:${instance}`;
      const prop = {
        schema: TERRAIN_PROP_SCHEMA,
        id,
        kind: "blast-barricade",
        slotIndex,
        x: left + width * (instance + .5) / count,
        y: top + height,
        width: drawWidth,
        height: drawHeight,
        anchor: Object.freeze([.5, 1]),
      };
      prop.collider = alphaMaskCollider(id, BARRICADE_MASK, {
        x: prop.x,
        y: prop.y,
        width: prop.width,
        height: prop.height,
        anchor: prop.anchor,
      });
      props.push(Object.freeze(prop));
    }
  }
  return Object.freeze(props);
}

export const TERRAIN_PROPS = terrainPropsForSlots();
export const TERRAIN_PROP_COLLIDERS = Object.freeze(TERRAIN_PROPS.map(({ collider }) => collider));
