const fs = require('fs');
const path = require('path');

const UPCOMING_WINDOW_DAYS = 90; // include sets releasing within 90 days even without config yet

// Pre-play-era sets that pass the retail-booster bar but aren't (yet) in the booster-data index.
// The booster-data index otherwise serves as the allowlist for every set we ship. Keep this list
// small and explicit — don't dump novelty/promo junk in here.
const LEGACY_EXTRAS = new Set([
  'mat', // March of the Machine: The Aftermath (2023-05-12)
  'dbl', // Innistrad: Double Feature (2022-01-28)
]);

/**
 * Pure filter: given raw Scryfall sets, the booster-data index, and today's date,
 * return the filtered/sorted list ready for serialization.
 *
 * Rule: a set ships iff it produces a retail booster pack consumers can open.
 *  - In the booster-data index -> ship it.
 *  - In the legacy extras allowlist -> ship it.
 *  - Upcoming main release (no parent_set_code, releasing within UPCOMING_WINDOW_DAYS
 *    of `today`) -> ship it so the dropdown shows it early; the config lands before release.
 *  - Digital-only -> drop.
 *  - Sub-products with parent_set_code (tokens, commander decks, bonus sheets) -> drop
 *    unless explicitly in the booster-data index (e.g. j25 Foundations Jumpstart).
 */
function filterSets(scryfallSets, boosterIndex, today) {
  const boosterSets = new Set(Object.keys(boosterIndex.boosters));
  const todayDate = new Date(today);
  const upcomingCutoff = new Date(todayDate);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + UPCOMING_WINDOW_DAYS);

  const filtered = scryfallSets.filter(s => {
    if (s.digital) return false;
    if (boosterSets.has(s.code)) return true;
    if (LEGACY_EXTRAS.has(s.code)) return true;
    if (s.parent_set_code) return false;
    const released = new Date(s.released_at);
    if (released > todayDate && released <= upcomingCutoff) return true;
    return false;
  });

  filtered.sort((a, b) => new Date(b.released_at) - new Date(a.released_at));

  return filtered.map(s => ({
    code: s.code,
    name: s.name,
    released: s.released_at,
  }));
}

async function fetchScryfallSets() {
  const res = await fetch('https://api.scryfall.com/sets');
  if (!res.ok) throw new Error(`Scryfall API error: ${res.status}`);
  const data = await res.json();
  return data.data;
}

async function fetchBoosterDataIndex() {
  const res = await fetch('https://bensonperry.com/booster-data/index.json');
  if (!res.ok) throw new Error(`booster-data index fetch error: ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Fetching Scryfall sets...');
  const sets = await fetchScryfallSets();

  console.log('Fetching booster-data index...');
  const boosterIndex = await fetchBoosterDataIndex();

  const output = filterSets(sets, boosterIndex, new Date());

  const outPath = path.join(__dirname, '..', 'shared', 'sets.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${output.length} sets to shared/sets.json`);
}

module.exports = { filterSets };

if (require.main === module) {
  main().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
