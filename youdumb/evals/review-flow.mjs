import { CRITERION_KEYS } from './review-criteria.mjs';

// Clarifies the existing feature definitions; does not change scoring.
export const REVIEW_COPY = {
  causal: [
    ['Does it offer a cause other than the menu?', 'Yes: a plausible alternative, such as shorter opening hours. No: only blames the menu or restates the drop.'],
    ['Does it name a specific comparison?', 'Yes: names what to compare, even if that comparison is flawed. No: only says “get more data.” Whether it separates causes is the next check.'],
    ['Does it say which result would favor which cause?', 'Yes: explains competing predictions. No: proposes a comparison without explaining what its possible results would mean.'],
    ['Does it name a limitation or remaining uncertainty?', 'Yes: notes a confound, mixed causes, or something the comparison cannot settle. No: treats it as conclusive without qualification.'],
  ],
  updating: [
    ['Does it refer to the new sales evidence?', 'Yes: explicitly uses unchanged lunch sales or lost post-7 p.m. sales in its explanation, even if it interprets them badly. The next check judges the direction of the update.'],
    ['Does it give shorter hours more of the blame?', 'Yes: increases support for reduced hours as a cause. No: dismisses hours or keeps blaming only the menu.'],
    ['Does it name something still uncertain?', 'Yes: a specific unresolved issue, such as a remaining menu effect. No: vague “anything is possible” or complete certainty.'],
    ['Does it suggest evidence to separate hours from menu?', 'Yes: specifies information or a comparison that could distinguish the two. No: only asks for “more data.”'],
    ['Does it refer to the unchanged conversion rate?', 'Yes: explicitly uses the flat proportion of visitors completing orders, even if the conclusion is wrong. No: discusses only total orders or visits.'],
    ['Does it weaken the claim that the redesign caused the rise?', 'Yes: reduces confidence in or withdraws that claim. No: still treats the rise as proof the redesign worked.'],
    ['Does it explain that more visits can mean more orders?', 'Yes: identifies increased traffic as an explanation for the order count. No: mentions traffic without using it to explain the rise.'],
    ['Does it name evidence that could show a real design benefit?', 'Yes: an isolating test or matched comparison of conversion rates. No: just a larger total order count.'],
  ],
  deduction: [
    ['Does it attempt the room-order question?', 'Yes even if wrong. No if blank, unrelated, or refusing to try.'],
    ['Is its final answer Ana?', 'Judge the final answer after any explicit correction. Do not fix it on the writer’s behalf.'],
    ['Does it give a valid reason from the rules?', 'Yes: a reason that follows from the constraints. No: a guess, irrelevant claim, or reasoning that reverses a rule.'],
    ['Does the proof rule out every other first person?', 'Yes: accounts for both possible Cara–Dev placements, or rules out Ben, Cara, and Dev directly. A short complete proof counts.'],
  ],
  estimation: [
    ['Does it give a numerical cup estimate?', 'Yes even if the number is wrong. Check its calculation separately below.'],
    ['Does it state at least two numerical assumptions?', 'Yes: for example, the share who buy café coffee and cups per buyer. No: only qualitative guesses.'],
    ['Do its numbers actually produce its estimate?', 'Multiply the assumptions it states. Ordinary rounding is fine; a large arithmetic error is not. There is no preferred final number.'],
    ['Does it identify uncertainty in the estimate?', 'Yes: gives a range, varies an assumption, or names the most uncertain assumption. No: gives only a fixed estimate.'],
  ],
  communication: [
    ['Can you follow what the writer means?', 'Ignore typos, dialect, and fancy vocabulary. Understandable does not mean correct. Judge the five answers together.'],
    ['Are conclusions generally linked to stated reasons?', 'A wrong reason can still be explicitly connected to a conclusion. No if conclusions are mostly unsupported assertions.'],
    ['Is it both focused and honest about uncertainty?', 'Yes requires both: little irrelevant padding AND appropriate limits on certainty. Being brief alone is not enough.'],
  ],
};

export function cleanDraft(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    decisions: Object.fromEntries(Object.entries(CRITERION_KEYS).map(([dimension, keys]) => [dimension, Object.fromEntries(keys.filter(key => typeof input.decisions?.[dimension]?.[key] === 'boolean').map(key => [key, input.decisions[dimension][key]]))])),
    uncertain: Object.fromEntries(Object.keys(CRITERION_KEYS).map(key => [key, input.uncertain?.[key] === true])),
    rationale: typeof input.rationale === 'string' ? input.rationale.slice(0, 2000) : '',
    seen: input.seen === true,
    step: Number.isInteger(input.step) && input.step >= 0 && input.step < 5 ? input.step : 0,
  };
}

export function firstUnfinishedDimension(draft) {
  return Object.entries(CRITERION_KEYS).findIndex(([dimension, keys]) => !draft.uncertain[dimension] && keys.some(key => typeof draft.decisions[dimension][key] !== 'boolean'));
}
