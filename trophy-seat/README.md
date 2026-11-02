# trophy seat

Replay the first eight picks from a real anonymous 7-win MTG Arena draft, then compare choices, inspect the final recorded deck, and continue through the original drafter's remaining picks.

The first eight picks are exact reproductions. From pick nine onward the app deliberately switches to a replay: a user's different earlier choices could affect a pack once it circles the table.

## data

The catalog includes Reality Fracture alongside The Hobbit, Marvel Super Heroes, and Secrets of Strixhaven. Eligible runs finished 7-0, 7-1, or 7-2. Existing individually verified logs are preserved; new formats receive up to 50 fully verified seats and are never padded with synthetic data.

For sets available in the licensed [17Lands public datasets](https://www.17lands.com/public_datasets), the builder uses the bulk data only to discover trophy draft IDs. It then validates every candidate against that exact draft's individual log and event preview, including all packs, choices, record, date, rank, and final recorded deck. Every shipped seat carries a direct `17lands.com/draft/<id>` source link. Nothing in a seat is generated or inferred.

Card metadata and card links come from Scryfall. New imports use the exact card image URLs supplied by their 17Lands draft/event logs, with Scryfall image metadata as a fallback; older published image mappings remain stable. The production app reads static local JSON and makes no live draft or card-metadata API requests. Card images still load from their image CDNs.

Sets whose published logs omit the opening pack are deliberately excluded. A set is never padded with reconstructed, inferred, or synthetic seats just to reach a target count.

To rebuild the static client dataset:

```sh
npm run build:data
```

The daily `Update Trophy Seats` workflow discovers released Premier Draft formats from 17Lands and Scryfall, starting at the oldest format already in the catalog. It only imports a new format when the official public draft dataset is available and exact trophy logs pass validation. Future releases, Alchemy, and formats without Premier Draft are excluded. Existing published seats remain stable so shared seat links continue to work; sets below 50 seats are topped up with newly verified unique drafts. A public dataset without complete usable seats is skipped until a later daily run, without blocking other new formats. The newest available set becomes the default.

`--sets FRA` limits which new formats to import without dropping existing catalog entries. The data URLs are content-versioned, and a run with no changes leaves the catalog timestamp unchanged. Discovery or validation failures stop publication and leave the live catalog intact. Missing public datasets are retried on the next daily run. The workflow validates the catalog before committing and explicitly starts the homepage deployment after an update.

Downloaded draft logs and the Scryfall response cache stay in `.cache/` and are not committed.
