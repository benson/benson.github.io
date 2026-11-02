# Trophy Seat — visual simplification and current formats

Requested 2026-11-02: match Pack Cracker's quieter style, restore current draft formats, ship.

## Decisions

- Benson approved a small header, modest existing intro, unboxed set/details/start controls, and flat card previews. Drafting retains the pack grid and picks sidebar.
- Preserve existing copy, functionality, historical seats and shared links. No additional user-facing features.
- Discover released Premier Draft formats from 17Lands and Scryfall. Default to newest verified available format. Publish only exact seven-win source logs.

## Parallel ownership

- Visual/client pass: style.css, index.html, app.js. Simplify intro, draft, results and dialog decoration; revalidate the catalog on load.
- Data pass: builder, datasets, focused tests, README and daily refresh workflow. Add Reality Fracture and preserve published seats while filling underfull formats.
- Integration/review: browser flows on desktop/mobile, independent visual review, independent adversarial Claude data review, one deployment.

## Acceptance and review

- All catalog entries validate with complete source packs, recorded choices/decks, seven-win records, and direct 17Lands source links.
- New formats are discovered without editing a hardcoded list; future/unavailable formats cannot displace valid data. Dataset URLs are content-versioned.
- Desktop/browser checks cover set switching, reroll, existing shared seats, eight picks, results, final deck, later-pick replay, share dialog and theme. Narrow screens checked at 320, 390 and 768px.
- Independent visual review found undersized buttons and deck-section inset. Both corrected.
- Independent data review found underfull formats freezing and empty new formats blocking later imports. Both addressed with append-only enrichment and a specific empty-format skip.
- Reality Fracture Scryfall image CDN URLs timed out despite valid metadata. Use the exact corresponding image URLs supplied by verified 17Lands logs; do not construct or substitute artwork.

## Publication

Work began at 15:55 ET. Ready for publication after 20 focused tests, browser verification including actual Reality Fracture images, preservation of all 132 previously published seats, and the review fixes above. The homepage deployment run records the live completion time.

The shipped catalog has 182 seats: FRA 50, HOB 32, MSH 50, SOS 50. HOB top-up was deferred when the source rate-limited requests; its existing data remains unchanged. The daily workflow persists individual source logs across failures so acquisition can resume without repeatedly fetching completed work. Bad individual candidates are rejected; network/provider errors stop publication.
