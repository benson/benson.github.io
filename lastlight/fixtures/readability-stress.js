import { READABILITY_CATEGORIES, readabilityPlan } from "../readability.js?v=20260711.8";

export function createReadabilityStressFixture() {
  const profiles = [
    { id: "high", qualityTier: "high", reducedMotion: false, reducedFlash: false },
    { id: "reduced", qualityTier: "reduced", reducedMotion: true, reducedFlash: true },
    { id: "minimal", qualityTier: "minimal", reducedMotion: true, reducedFlash: true },
  ];
  return Object.freeze(profiles.flatMap((profile) => READABILITY_CATEGORIES.map((category) => Object.freeze({
    id: `${profile.id}:${category}`,
    profile: profile.id,
    category,
    plan: readabilityPlan(category, profile),
  }))));
}
