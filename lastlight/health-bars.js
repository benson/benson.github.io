/**
 * Shared health-bar segmentation math for Canvas and DOM HUD adapters.
 *
 * A layout is expressed in normalized positions so every renderer can align
 * health, delayed loss, shield, and divider layers without duplicating rules.
 */

const NICE_MULTIPLIERS = [1, 2, 5];

export function niceSegmentUnit(maxValue, { minSegments = 5, maxSegments = 10, targetSegments = 8 } = {}) {
  const maximum = Math.max(Number.EPSILON, Number(maxValue) || 1);
  const target = Math.max(1, Number(targetSegments) || 8);
  const exponent = Math.floor(Math.log10(maximum / target));
  const candidates = [];

  for (let power = exponent - 1; power <= exponent + 2; power += 1) {
    const magnitude = 10 ** power;
    for (const multiplier of NICE_MULTIPLIERS) {
      const unit = multiplier * magnitude;
      const count = Math.ceil(maximum / unit);
      const inRange = count >= minSegments && count <= maxSegments;
      const rangePenalty = inRange ? 0 : Math.min(Math.abs(count - minSegments), Math.abs(count - maxSegments)) * 20;
      candidates.push({ unit, count, score: rangePenalty + Math.abs(count - target) });
    }
  }

  candidates.sort((a, b) => a.score - b.score || Math.abs(a.count - target) - Math.abs(b.count - target) || a.unit - b.unit);
  return candidates[0].unit;
}

export function healthSegmentLayout(maxValue, {
  unit,
  minSegments = 5,
  maxSegments = 10,
  targetSegments = 8,
  majorSections = 0,
} = {}) {
  const maximum = Math.max(Number.EPSILON, Number(maxValue) || 1);
  const segmentUnit = Number.isFinite(unit) && unit > 0
    ? unit
    : niceSegmentUnit(maximum, { minSegments, maxSegments, targetSegments });
  const segmentCount = Math.max(1, Math.ceil(maximum / segmentUnit));
  const majorEvery = majorSections > 1 ? Math.max(1, Math.round(segmentCount / majorSections)) : 0;
  const dividers = [];

  for (let index = 1; index < segmentCount; index += 1) {
    const value = index * segmentUnit;
    if (value >= maximum) break;
    dividers.push({
      index,
      value,
      position: value / maximum,
      major: Boolean(majorEvery && index % majorEvery === 0),
    });
  }

  return Object.freeze({
    maxValue: maximum,
    unit: segmentUnit,
    segmentCount,
    finalSegmentFraction: (maximum - segmentUnit * (segmentCount - 1)) / segmentUnit,
    majorEvery,
    dividers: Object.freeze(dividers.map((divider) => Object.freeze(divider))),
  });
}

export function playerHealthSegments(maxValue) {
  return healthSegmentLayout(maxValue, { unit: 1 });
}

export function enemyHealthSegments(maxValue, options = {}) {
  return healthSegmentLayout(maxValue, { minSegments: 5, maxSegments: 10, targetSegments: 8, ...options });
}

export function bossHealthSegments(maxValue) {
  return enemyHealthSegments(maxValue, { majorSections: 5 });
}

export const LASTLIGHT_HEALTH_BARS = Object.freeze({
  niceSegmentUnit,
  healthSegmentLayout,
  playerHealthSegments,
  enemyHealthSegments,
  bossHealthSegments,
});

if (typeof globalThis !== "undefined") globalThis.LastlightHealthBars = LASTLIGHT_HEALTH_BARS;
