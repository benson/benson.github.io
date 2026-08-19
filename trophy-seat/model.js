export const SIMULATED_PICK_COUNT = 8;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const PACK_RARITY_ORDER = new Map([
  ['mythic', 0],
  ['rare', 1],
  ['uncommon', 2],
  ['common', 3],
]);

export function validateDataset(data) {
  if (!data || !Array.isArray(data.drafts) || data.drafts.length === 0) {
    throw new Error('No trophy drafts were found.');
  }
  if (!data.cards || typeof data.cards !== 'object') {
    throw new Error('Card details are missing.');
  }

  for (const draft of data.drafts) {
    if (!draft.id || !/^7-[012]$/.test(draft.record || '')) {
      throw new Error('A draft has an invalid trophy record.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) {
      throw new Error('A draft is missing its date.');
    }
    if (!Array.isArray(draft.picks) || draft.picks.length < SIMULATED_PICK_COUNT) {
      throw new Error('A draft does not contain eight picks.');
    }
    for (const pick of draft.picks.slice(0, SIMULATED_PICK_COUNT)) {
      if (!pick.choice || !Array.isArray(pick.cards) || !pick.cards.includes(pick.choice)) {
        throw new Error('A trophy pick is missing from its pack.');
      }
    }
  }
  return data;
}

export function scorePicks(userPicks, referencePicks) {
  return referencePicks.slice(0, SIMULATED_PICK_COUNT).reduce((score, pick, index) => (
    score + (userPicks[index] === pick.choice ? 1 : 0)
  ), 0);
}

export function comparisonStats(userPicks, referencePicks) {
  const picks = referencePicks.slice(0, SIMULATED_PICK_COUNT);
  const outcomes = picks.map((pick, index) => userPicks[index] === pick.choice);
  const firstSplitIndex = outcomes.findIndex(matched => !matched);

  return {
    total: outcomes.length,
    matches: outcomes.filter(Boolean).length,
    firstSplit: firstSplitIndex === -1 ? null : firstSplitIndex + 1,
    outcomes,
  };
}

export function formatDraftDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return 'date unavailable';
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName || Number(day) < 1 || Number(day) > 31) return 'date unavailable';
  return `${monthName} ${Number(day)}, ${year}`;
}

export function formatRank(value) {
  return String(value || 'rank unavailable').replaceAll('-', ' ');
}

export function sampleIntroCards(cards, draft, random = Math.random) {
  const draftedCards = new Set((draft?.picks || []).map(pick => pick.choice));
  const candidates = Object.entries(cards || {})
    .filter(([name, card]) => (
      name
      && !draftedCards.has(name)
      && !card?.basic
      && !/\bLand\b/i.test(card?.typeLine || '')
    ))
    .map(([name]) => name);

  for (let index = 0; index < Math.min(3, candidates.length); index += 1) {
    const swapIndex = index + Math.floor(random() * (candidates.length - index));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  return candidates.slice(0, 3);
}

export function resultCopy(score) {
  if (score === 8) return {
    title: 'you found their exact line.',
  };
  if (score >= 6) return {
    title: 'you read the seat almost the same way.',
  };
  if (score >= 3) return {
    title: 'you agreed on the signals, not the route.',
  };
  return {
    title: 'you saw a different deck in these packs.',
  };
}

export function shareText(outcomes, seatUrl) {
  const spellbook = outcomes.map(matched => matched ? '✦' : '↗').join('  ');
  return ['trophy seat', spellbook, `draft this seat: ${seatUrl}`].join('\n');
}

export function chooseDraft(drafts, seenIds = [], random = Math.random) {
  const unseen = drafts.filter(draft => !seenIds.includes(draft.id));
  const pool = unseen.length ? unseen : drafts;
  return pool[Math.floor(random() * pool.length)];
}

export function sortPackCards(cardNames, cards) {
  return cardNames
    .map((name, index) => ({ name, index, card: cards[name] || {} }))
    .sort((left, right) => {
      const leftRarity = left.card.basic ? 4 : (PACK_RARITY_ORDER.get(left.card.rarity) ?? 4);
      const rightRarity = right.card.basic ? 4 : (PACK_RARITY_ORDER.get(right.card.rarity) ?? 4);
      return leftRarity - rightRarity || left.index - right.index;
    })
    .map(entry => entry.name);
}

export function groupDeckCards(deck, cards) {
  const groups = [
    { id: 'early', label: '0—1', cards: [] },
    { id: 'two', label: '2', cards: [] },
    { id: 'three', label: '3', cards: [] },
    { id: 'four', label: '4', cards: [] },
    { id: 'five', label: '5', cards: [] },
    { id: 'late', label: '6+', cards: [] },
    { id: 'lands', label: 'lands', cards: [] },
  ];

  for (const entry of deck.main || []) {
    const card = cards[entry.name] || { name: entry.name, manaValue: 0, typeLine: '' };
    const copies = card.basic
      ? [{ ...card, name: entry.name, count: entry.count }]
      : Array.from({ length: entry.count }, () => ({ ...card, name: entry.name, count: 1 }));
    let groupIndex;
    if (card.basic || /\bLand\b/.test(card.typeLine || '')) groupIndex = 6;
    else if (card.manaValue <= 1) groupIndex = 0;
    else if (card.manaValue >= 6) groupIndex = 5;
    else groupIndex = Math.max(1, Math.min(4, Math.round(card.manaValue) - 1));
    groups[groupIndex].cards.push(...copies);
  }

  for (const group of groups) {
    group.cards.sort((left, right) => left.name.localeCompare(right.name));
  }
  return groups;
}

export function deckGroupCount(group) {
  return (group.cards || []).reduce((sum, card) => sum + (card.count || 1), 0);
}

export function deckCount(deck) {
  return (deck.main || []).reduce((sum, card) => sum + card.count, 0);
}
