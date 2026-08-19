# trophy seat

Replay the first eight picks from a real anonymous 7-win MTG Arena draft, then compare choices, inspect the final recorded deck, and continue through the original drafter's remaining picks.

The first eight picks are exact reproductions. From pick nine onward the app deliberately switches to a replay: a user's different earlier choices could affect a pack once it circles the table.

## data

The catalog contains 132 exact trophy drafts from three sets: 32 The Hobbit seats and 50 seats each from Marvel Super Heroes and Secrets of Strixhaven. Eligible runs finished 7-0, 7-1, or 7-2. The Hobbit count remains at 32 because its bulk public dataset is not available yet; the existing individually verified logs are preserved instead of filling the gap with synthetic data.

For sets available in the licensed [17Lands public datasets](https://www.17lands.com/public_datasets), the builder uses the bulk data only to discover trophy draft IDs. It then validates every candidate against that exact draft's individual log and event preview, including all packs, choices, record, date, rank, and final recorded deck. Every shipped seat carries a direct `17lands.com/draft/<id>` source link. Nothing in a seat is generated or inferred.

Card metadata and images come from Scryfall. The production app reads static local JSON and makes no live requests to 17Lands or Scryfall.

Sets whose published logs omit the opening pack are deliberately excluded. A set is never padded with reconstructed, inferred, or synthetic seats just to reach a target count.

To rebuild the static client dataset:

```sh
npm run build:data
```

Downloaded draft logs and the Scryfall response cache stay in `.cache/` and are not committed.
