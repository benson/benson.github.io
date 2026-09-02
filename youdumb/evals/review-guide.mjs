// Instructions for the existing rubric, not new scoring rules or case answers.
// Examples are independent of the frozen holdout transcripts and expectations.

export const REVIEW_GUIDE = {
  causal: {
    title: 'causal reasoning', questions: [1], scope: 'Answer 1 · the café’s original sales drop',
    rule: 'Choose yes if the answer demonstrates the criterion, and no if it does not. Judge each independently; the app handles the score.',
    criteria: [
      'An alternative cause: offers a plausible explanation other than the menu, such as shorter opening hours.',
      'A concrete comparison: says what to compare or observe, not just “get more data.”',
      'Different predictions: explains which possible result would favor which explanation.',
      'A limitation: recognizes uncertainty, mixed causes, or something the comparison cannot settle.',
    ],
    examples: [
      ['25 · one criterion', '“A nearby competitor might have opened.” This offers an alternative, but no comparison, competing predictions, or limitation.'],
      ['50 · two criteria', '“Maybe a competitor opened. Compare sales at similar cafés near and far from it.” This adds a concrete comparison, but does not explain the outcomes or limitations.'],
      ['100 · four criteria', 'Add: “A drop concentrated near the competitor favors competition; a drop only at our café favors a café-specific change. Different local customer trends could still confound that comparison.” All four criteria are now present.'],
    ],
  },
  updating: {
    title: 'updating a belief', questions: [2, 3], scope: 'Answers 2 and 3 · café evidence AND checkout evidence',
    rule: 'Check the café AND checkout answers. Each has four criteria. Choose no when a criterion is absent; do not assume a skill shown in one answer was shown in the other.',
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
    examples: [
      ['50 · four of eight criteria', 'If all four café criteria are shown but none of the checkout criteria are, the combined score is 4 × 12.5 = 50. Two from each answer also earns 50.'],
      ['75 · six of eight criteria', 'If both answers use the new evidence and revise the claim, and also supply two of the remaining criteria, the score is 6 × 12.5 = 75.'],
      ['What counts as updating?', 'In a separate example: “I blamed a bus timetable change for fewer riders. Now I know the main road was closed, so the closure is a better explanation; the timetable might still have a smaller effect.” Naming new evidence, changing the explanation, and leaving a concrete uncertainty are different pieces of reasoning.'],
    ],
  },
  deduction: {
    title: 'deduction', questions: [4], scope: 'Answer 4 · who must enter the room first?',
    rule: 'Check the final conclusion and the proof actually offered. A short elimination proof counts just as much as listing every valid order. The app applies the rubric’s dependency rules.',
    criteria: [
      'Relevant attempt: tries to answer the entry-order problem, even if the answer is wrong.',
      'Correct conclusion: the final answer is that Ana must enter first.',
      'Valid reasoning: offers reasoning that actually follows from the stated constraints, not just a guess.',
      'Complete proof: accounts for every valid order, by considering both Cara–Dev placements or an equivalent elimination proof.',
    ],
    examples: [
      ['50 · correct answer alone', '“Ana.” A correct conclusion is evidence, but it does not demonstrate the proof.'],
      ['75 · partial proof', '“Ana. Cara cannot be first and Ben has to come after Ana.” Those constraints are valid, but the explanation does not yet rule out Dev being first.'],
      ['100 · complete short proof', '“Not Ben, because Ana is earlier; not Cara, by the rule; not Dev, because Cara is earlier. That leaves Ana.” No enumeration is needed.'],
    ],
  },
  estimation: {
    title: 'estimation', questions: [5], scope: 'Answer 5 · weekday café coffee sales',
    rule: 'There is no preferred final number. Check the assumptions and arithmetic, not whether the total matches your intuition. Mark each criterion yes or no.',
    criteria: [
      'A number: gives a rough numerical estimate for the requested total.',
      'Two quantitative assumptions: gives at least two numerical assumptions, not just “people like coffee.”',
      'Coherent arithmetic: the stated assumptions actually produce the estimate; ordinary rounding is fine.',
      'Sensitivity: gives a range, varies an assumption, or identifies the assumption creating the most uncertainty.',
    ],
    examples: [
      ['Practice example · a different town', 'Suppose the question were about a town of 20,000 residents. These examples are not answers from the review set.'],
      ['25 · estimate only', '“About 3,000 cups.” This supplies a number but no assumptions, calculation, or uncertainty.'],
      ['75 · transparent calculation', '“Assume 10% buy café coffee and each buys 1.5 cups: 20,000 × 0.10 × 1.5 = 3,000 cups.” Number, two assumptions, and coherent arithmetic are present.'],
      ['100 · adds sensitivity', 'Add: “The buying share is the biggest uncertainty; at 5–15%, that gives 1,500–4,500 cups.”'],
    ],
  },
  communication: {
    title: 'communication', questions: [1, 2, 3, 4, 5], scope: 'All five answers together · not five separate scores',
    rule: 'Judge these three features across all five answers together. Do not penalize spelling, dialect, or a reasoning mistake again just because the conclusion is wrong.',
    criteria: [
      'Understandable: you can follow what they mean despite spelling, grammar, dialect, or non-native phrasing.',
      'Reasons connected: conclusions are generally connected to stated evidence or assumptions.',
      'Concise AND calibrated: avoids irrelevant padding and distinguishes what is known from what is uncertain.',
    ],
    examples: [
      ['Clarity is not correctness', 'A wrong conclusion can still be understandable and connected to an explicit reason. Score the reasoning mistake in the relevant dimension; do not automatically make every communication feature false.'],
      ['Polish is not the criterion', '“rain prob cut turnout; compare dry days, still not sure” can communicate evidence and uncertainty. Formal vocabulary is not required. Judge the whole transcript, not this one line alone.'],
    ],
  },
};

export function reviewResponsesFor(dimension, reviewCase) {
  return REVIEW_GUIDE[dimension].questions.map((number) => ({
    number,
    question: reviewCase.questions[number - 1] ?? 'Question unavailable.',
    answer: reviewCase.answers[number - 1] ?? 'No response provided.',
  }));
}
