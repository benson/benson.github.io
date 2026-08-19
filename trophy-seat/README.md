# trophy seat

Replay the first eight picks from a real anonymous 7-win MTG Arena Premier Draft, then compare choices, inspect the final recorded deck, and continue through the original drafter's remaining picks.

The first eight picks are exact reproductions. From pick nine onward the app deliberately switches to a replay: a user's different earlier choices could affect a pack once it circles the table.

## data

The shipped sample contains 32 The Hobbit (HOB) trophy drafts built from individual public draft logs linked on the 17Lands Trophy Decks page. Eligible runs finished 7-0, 7-1, or 7-2. Card metadata and images come from Scryfall.

The selected public draft IDs are fixed in the build script. Rebuilding reads each individual draft and final deck once, then ships a static cache; the production app does not request live data from 17Lands.

To rebuild the static client dataset:

```sh
node scripts/build-data.mjs --limit 32
```

Downloaded draft logs and the Scryfall response cache stay in `.cache/` and are not committed.
