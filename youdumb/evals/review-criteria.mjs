// Versioned human judgments, using the existing rubric without changing the scorer.
export const REVIEW_CRITERIA_VERSION = 'criteria-v1';
export const CRITERION_KEYS = {
  causal: ['alternative', 'comparison', 'discriminates', 'limitations'],
  updating: ['usesNewEvidence', 'shiftsTowardHours', 'remainingUncertainty', 'furtherEvidence', 'usesRateEvidence', 'retractsDesignClaim', 'explainsTraffic', 'identifyingEvidence'],
  deduction: ['relevant', 'answersAna', 'validReasoning', 'coversBothPlacements'],
  estimation: ['numericEstimate', 'twoAssumptions', 'coherentChain', 'sensitivity'],
  communication: ['understandable', 'reasonsConnected', 'conciseAndCalibrated'],
};

export function normalizeCriteria(judgments) {
  if (!judgments || typeof judgments !== 'object' || Array.isArray(judgments)) throw new Error('Answer every criterion or mark the dimension uncertain.');
  return Object.fromEntries(Object.entries(CRITERION_KEYS).map(([dimension, keys]) => {
    if (!Object.hasOwn(judgments, dimension)) throw new Error(`Finish the ${dimension} checklist.`);
    const values = judgments[dimension];
    if (values === null) return [dimension, null];
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length !== keys.length || keys.some(key => !Object.hasOwn(values, key) || typeof values[key] !== 'boolean')) {
      throw new Error(`Choose yes or no for every ${dimension} criterion, or mark it uncertain.`);
    }
    return [dimension, Object.fromEntries(keys.map(key => [key, values[key]]))];
  }));
}

export function ratingsFromCriteria(judgments) {
  const criteria = normalizeCriteria(judgments);
  return Object.fromEntries(Object.entries(criteria).map(([dimension, values]) => {
    if (values === null) return [dimension, null];
    const count = Object.values(values).filter(Boolean).length;
    const rating = dimension === 'deduction'
      ? !values.relevant ? 0 : !values.answersAna ? 25 : !values.validReasoning ? 50 : values.coversBothPlacements ? 100 : 75
      : dimension === 'communication' ? [0, 50, 75, 100][count]
        : count * (dimension === 'updating' ? 12.5 : 25);
    return [dimension, rating];
  }));
}
