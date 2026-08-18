export const SIMULATED_PICK_COUNT = 8;

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

export function resultCopy(score) {
  if (score === 8) return {
    eyebrow: 'same seat, same eight',
    title: 'you found their exact line.',
    body: 'Eight decisions, no daylight between you and the trophy drafter.',
  };
  if (score >= 6) return {
    eyebrow: 'nearly in lockstep',
    title: 'you read the seat almost the same way.',
    body: 'A couple forks in the road, but the shape of the draft was shared.',
  };
  if (score >= 3) return {
    eyebrow: 'same seat, different map',
    title: 'you agreed on the signals, not the route.',
    body: 'The overlap is real. So are the places where your draft became your own.',
  };
  return {
    eyebrow: 'another draft entirely',
    title: 'you saw a different deck in these packs.',
    body: 'That is the point: the trophy is proof a line worked, not proof it was the only line.',
  };
}

export function chooseDraft(drafts, seenIds = [], random = Math.random) {
  const unseen = drafts.filter(draft => !seenIds.includes(draft.id));
  const pool = unseen.length ? unseen : drafts;
  return pool[Math.floor(random() * pool.length)];
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
    const copies = Array.from({ length: entry.count }, () => ({ ...card, name: entry.name }));
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

export function deckCount(deck) {
  return (deck.main || []).reduce((sum, card) => sum + card.count, 0);
}
