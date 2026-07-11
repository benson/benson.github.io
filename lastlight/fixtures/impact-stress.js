import { SIGNATURE_IMPACT_GRAMMAR, UNIVERSAL_IMPACT_GRAMMAR, getWeaponImpactGrammar, impactRenderPlan } from "../impact-grammar.js";

/** Renderer-only stress hook. These are identity-free visual plans, not
 * simulation entities, so using them cannot change damage, RNG, or replay state. */
export function createImpactStressFixture({ reducedMotion = false, density = 1 } = {}) {
  const cases = [];
  let index = 0;
  const add = (sourceId, specialistId, evolved) => {
    const owner = `slot-${index}`;
    const player = { id: owner, specialist: specialistId || "zuri", weapons: { signature: { evolved }, ...(sourceId !== "signature" ? { [sourceId]: { evolved } } : {}) } };
    const entity = { id: `impact-${index++}`, owner, sourceId, x: index % 7 * 120, y: Math.floor(index / 7) * 100, radius: 8, vx: 600, vy: 0 };
    cases.push({ sourceId, specialistId, evolved, entity: Object.freeze(entity), player: Object.freeze(player), grammar: getWeaponImpactGrammar(sourceId, { specialistId, evolved }), plan: impactRenderPlan(entity, { players: [player] }, { reducedMotion, density }) });
  };
  for (const specialistId of Object.keys(SIGNATURE_IMPACT_GRAMMAR)) { add("signature", specialistId, false); add("signature", specialistId, true); }
  for (const sourceId of Object.keys(UNIVERSAL_IMPACT_GRAMMAR)) { add(sourceId, undefined, false); add(sourceId, undefined, true); }
  return Object.freeze(cases);
}
