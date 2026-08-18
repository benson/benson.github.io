# trophy seat

Replay the first eight picks from a real anonymous 7-win MTG Arena Premier Draft, then compare choices, inspect the final recorded deck, and continue through the original drafter's remaining picks.

The first eight picks are exact reproductions. From pick nine onward the app deliberately switches to a replay: a user's different earlier choices could affect a pack once it circles the table.

## data

The shipped sample contains 32 Secrets of Strixhaven trophy drafts built from the 17Lands public `draft_data` and `game_data` datasets. Eligible runs finished 7-0, 7-1, or 7-2. Card metadata and images come from Scryfall.

17Lands public data is used under the [Creative Commons Attribution 4.0 license](https://creativecommons.org/licenses/by/4.0/).

To rebuild the static client dataset:

```sh
node scripts/build-data.mjs --limit 32
```

Downloaded source files and the Scryfall response cache stay in `.cache/` and are not committed.
