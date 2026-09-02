// Instructions for the existing rubric, not new scoring rules or case answers.
// Examples are independent of the frozen holdout transcripts and expectations.
const countedOptions = (count, points) => Array.from({ length: count + 1 }, (_, n) => [n * points, `${n * points} — ${n} of ${count} criteria shown`]);

export const REVIEW_GUIDE = {
  causal: {
    title: 'causal reasoning', questions: [1], scope: 'Answer 1 · the café’s original sales drop',
    rule: 'Add 25 points for each criterion the answer demonstrates. The criteria are independent: any two earn 50. No relevant attempt earns 0.',
    criteria: [
      'An alternative cause: offers a plausible explanation other than the menu, such as shorter opening hours.',
      'A concrete comparison: says what to compare or observe, not just “get more data.”',
      'Different predictions: explains which possible result would favor which explanation.',
      'A limitation: recognizes uncertainty, mixed causes, or something the comparison cannot settle.',
    ],
    options: countedOptions(4, 25),
    examples: [
      ['25 · one criterion', '“A nearby competitor might have opened.” This offers an alternative, but no comparison, competing predictions, or limitation.'],
      ['50 · two criteria', '“Maybe a competitor opened. Compare sales at similar cafés near and far from it.” This adds a concrete comparison, but does not explain the outcomes or limitations.'],
      ['100 · four criteria', 'Add: “A drop concentrated near the competitor favors competition; a drop only at our café favors a café-specific change. Different local customer trends could still confound that comparison.” All four criteria are now present.'],
    ],
  },
  updating: {
    title: 'updating a belief', questions: [2, 3], scope: 'Answers 2 and 3 · café evidence AND checkout evidence',
    rule: 'Count all eight criteria below, then multiply by 12.5. Do not grade only the café answer. If one answer makes no relevant attempt, it earns none of its four points.',
    criteria: [
      'Café: uses the unchanged lunchtime sales and/or the lost sales after 7 p.m.',
      'Café: shifts support toward shorter hours as a cause of the drop.',
      'Café: names a concrete remaining uncertainty, such as a menu effect or an unusual week.',
      'Café: names further evidence that would separate an hours effect from a menu effect.',
      'Checkout: uses the unchanged order-completion rate per visitor, not just the total order count.',
      'Checkout: weakens or withdraws the claim that the redesign caused the rise.',
      'Checkout: identifies increased traffic as a sufficient or more plausible explanation for more orders.',
      'Checkout: names evidence for a real design effect, such as comparing conversion rates in a randomized old-versus-new checkout test.',
    ],
    options: countedOptions(8, 12.5),
    examples: [
      ['50 · four of eight criteria', 'If all four café criteria are shown but none of the checkout criteria are, the combined score is 4 × 12.5 = 50. Two from each answer also earns 50.'],
      ['75 · six of eight criteria', 'If both answers use the new evidence and revise the claim, and also supply two of the remaining criteria, the score is 6 × 12.5 = 75.'],
      ['What counts as updating?', 'In a separate example: “I blamed a bus timetable change for fewer riders. Now I know the main road was closed, so the closure is a better explanation; the timetable might still have a smaller effect.” Naming new evidence, changing the explanation, and leaving a concrete uncertainty are different pieces of reasoning.'],
    ],
  },
  deduction: {
    title: 'deduction', questions: [4], scope: 'Answer 4 · who must enter the room first?',
    rule: 'Choose one level below; do not add points. Judge the final conclusion and the proof offered for it.',
    criteria: [
      '0: no relevant attempt at the entry-order problem.',
      '25: attempts it, but the final answer is not Ana.',
      '50: answers Ana, but gives no valid reasoning for that answer.',
      '75: answers Ana with some valid reasoning, but leaves a possible order unaccounted for.',
      '100: answers Ana and gives a proof that covers every valid order. A short elimination proof counts just as much as listing orders.',
    ],
    options: [[0, '0 — no relevant attempt'], [25, '25 — incorrect final answer'], [50, '50 — Ana, no valid reasoning'], [75, '75 — Ana, incomplete valid proof'], [100, '100 — Ana, complete proof']],
    examples: [
      ['50 · correct answer alone', '“Ana.” A correct conclusion is evidence, but it does not demonstrate the proof.'],
      ['75 · partial proof', '“Ana. Cara cannot be first and Ben has to come after Ana.” Those constraints are valid, but the explanation does not yet rule out Dev being first.'],
      ['100 · complete short proof', '“Not Ben, because Ana is earlier; not Cara, by the rule; not Dev, because Cara is earlier. That leaves Ana.” No enumeration is needed.'],
    ],
  },
  estimation: {
    title: 'estimation', questions: [5], scope: 'Answer 5 · weekday café coffee sales',
    rule: 'Add 25 points for each criterion shown. There is no preferred final number: check the assumptions and arithmetic, not whether the total matches your intuition.',
    criteria: [
      'A number: gives a rough numerical estimate for the requested total.',
      'Two quantitative assumptions: gives at least two numerical assumptions, not just “people like coffee.”',
      'Coherent arithmetic: the stated assumptions actually produce the estimate; ordinary rounding is fine.',
      'Sensitivity: gives a range, varies an assumption, or identifies the assumption creating the most uncertainty.',
    ],
    options: countedOptions(4, 25),
    examples: [
      ['Practice example · a different town', 'Suppose the question were about a town of 20,000 residents. These examples are not answers from the review set.'],
      ['25 · estimate only', '“About 3,000 cups.” This supplies a number but no assumptions, calculation, or uncertainty.'],
      ['75 · transparent calculation', '“Assume 10% buy café coffee and each buys 1.5 cups: 20,000 × 0.10 × 1.5 = 3,000 cups.” Number, two assumptions, and coherent arithmetic are present.'],
      ['100 · adds sensitivity', 'Add: “The buying share is the biggest uncertainty; at 5–15%, that gives 1,500–4,500 cups.”'],
    ],
  },
  communication: {
    title: 'communication', questions: [1, 2, 3, 4, 5], scope: 'All five answers together · not five separate scores',
    rule: 'Count these three features across the transcript: none = 0; one = 50; two = 75; all three = 100. This dimension has no 25-point level.',
    criteria: [
      'Understandable: you can follow what they mean despite spelling, grammar, dialect, or non-native phrasing.',
      'Reasons connected: conclusions are generally connected to stated evidence or assumptions.',
      'Concise AND calibrated: avoids irrelevant padding and distinguishes what is known from what is uncertain.',
    ],
    options: [[0, '0 — none of the three features'], [50, '50 — one feature'], [75, '75 — two features'], [100, '100 — all three features']],
    examples: [
      ['Clarity is not correctness', 'A wrong conclusion can still be understandable and connected to an explicit reason. Score the reasoning mistake in the relevant dimension; do not automatically make every communication feature false.'],
      ['Polish is not the criterion', '“rain prob cut turnout; compare dry days, still not sure” can communicate evidence and uncertainty. Formal vocabulary is not required. Judge the whole transcript, not this one line alone.'],
    ],
  },
};

export function ratingOptions(dimension) {
  return [['', 'choose a rating'], ['uncertain', 'uncertain — cannot judge reliably'], ...REVIEW_GUIDE[dimension].options.map(([value, label]) => [String(value), label])];
}
