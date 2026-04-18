const fs = require('fs');
const path = require('path');

const PLAY_BOOSTER_START = '2024-02-09';
const UPCOMING_WINDOW_DAYS = 90; // include sets releasing within 90 days even without config yet

// Tight whitelist: only set types that actually produce openable boosters for the dropdown
const VALID_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'funny']);

// Set-code prefixes that signal promo/non-consumer products we never want in the dropdown
const BLACKLIST_PREFIXES = ['ph', 'pz', 'p'];

// Set types that leak through VALID_TYPES but aren't consumer products
const PROMO_NAME_HINTS = [
  /heroes of the realm/i,
  /judge rewards/i,
  /promo pack/i,
  /prerelease/i,
  /box topper/i,
];

// Explicit overrides. These set codes appear on Scryfall but were never retail boosters.
const BLACKLIST = new Set([
  // List + store-exclusive sheets
  'plst', 'ulst',
  // Promo/judge/DCI collections
  'pmei', 'pmh2', 'ptg', 'past', 'pgpx', 'pdci',
  // Funny/novelty products that aren't openable boosters
  'unk', 'cmb1', 'cmb2', 'und', 'h17', 'hho',
  // Foreign-language reprints & misprints
  'rin', 'ren', 'sum',
]);

function isConsumerProduct(s) {
  if (BLACKLIST.has(s.code)) return false;
  if (PROMO_NAME_HINTS.some(re => re.test(s.name))) return false;
  // "p" + two-letter code is almost always a promo set (e.g. pmkm, pdsk) but there are
  // legitimate core sets like "p01" — so only strip 4-letter p-codes starting with "p" + letter.
  if (/^p[a-z]{2,}/i.test(s.code) && s.code !== 'plc' && s.code !== 'pls' && s.code !== 'pcy') return false;
  return true;
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
  const boosterSets = new Set(Object.keys(boosterIndex.boosters));

  const now = new Date();
  const shortCutoff = new Date(now);
  shortCutoff.setDate(shortCutoff.getDate() + 14);
  const upcomingCutoff = new Date(now);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + UPCOMING_WINDOW_DAYS);

  const filtered = sets.filter(s => {
    if (!VALID_TYPES.has(s.set_type)) return false;
    if (s.digital) return false;
    if (!isConsumerProduct(s)) return false;
    // Sub-products (bonus sheets, timeshifts, etc.) have parent_set_code. Allow only if
    // booster-data indexes them as their own product (e.g. j25 Foundations Jumpstart).
    if (s.parent_set_code && !boosterSets.has(s.code)) return false;
    const released = new Date(s.released_at);
    if (released > upcomingCutoff) return false;

    // Play-booster-era sets: require config if released, but allow upcoming sets through
    // so the dropdown shows them early (users can pre-browse; data fills in once configs land)
    if (s.released_at >= PLAY_BOOSTER_START && released <= shortCutoff && !boosterSets.has(s.code)) {
      console.log(`  Skipping ${s.code} (${s.name}) — released without booster-data config`);
      return false;
    }

    return true;
  });

  // Sort by release date descending
  filtered.sort((a, b) => new Date(b.released_at) - new Date(a.released_at));

  const output = filtered.map(s => ({
    code: s.code,
    name: s.name,
    released: s.released_at,
  }));

  const outPath = path.join(__dirname, '..', 'shared', 'sets.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${output.length} sets to shared/sets.json`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
