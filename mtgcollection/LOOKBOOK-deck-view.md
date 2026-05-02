# Deck View Lookbook and Product Recommendations

Date: 2026-05-02

## Summary

The strongest deck-hosting sites treat a deck page as a focused workspace with a small number of prominent primary actions and a lot of progressive disclosure. The common top-level actions are usually:

- Switch view: visual, text/list, stats, playtest/sample hand.
- Add/edit/copy/export/download.
- Move between mainboard, sideboard, maybeboard, and sometimes commander/companion.

The fine-grained settings are usually not the main event. Grouping, sorting, card size, show price, show mana cost, printing choices, and export format tend to live in compact dropdowns, menus, tabs, or remembered preferences. Editing controls become more prominent in builder/editor mode, while public/read-only deck pages push controls out of the way so the deck itself starts high on the page.

For this app, the opportunity is not to clone Moxfield one-to-one. The wedge is a physical-collection-aware deck workspace: "this is the actual deckbox on my shelf, these are the actual printings I own, these are the swaps I am considering, this is what I need to pull/buy, and I can export it anywhere."

## Lookbook

### Moxfield

What it does well:

- Offers the expected board model: mainboard, sideboard, maybeboard.
- Supports grouping by type, color, mana value, rarity, and custom tags/categories.
- Supports text and image deck views, with optional mana cost and price display.
- Provides rich stats: type counts, total price, legality, mana curve, color-specific curve, color production vs card colors, average mana value with and without lands, opening-hand land averages, and on-curve percentages.
- Goes deep on playtesting: sample hands plus a sandbox with drag/drop movement, menus, tokens, counters, life/energy/poison, dice, and hotkeys.
- Makes primers a major part of deck communication with Markdown, preview, and table of contents.
- Tracks history and card-level printings/prices.

What it misses or risks:

- The richness can become dense. Newer or casual users can face a lot of modes and dropdowns.
- Board semantics can be confusing for Commander users who use sideboard/maybeboard as "considering" rather than literal sideboard.
- It is excellent for digital deck ownership, but less naturally physical-container-oriented.

UI pattern takeaways:

- Primary modes are discoverable.
- Detailed settings are tucked behind view controls.
- The deck can be both a public presentation and a private editing workspace.

Source: https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features

### Archidekt

What it does well:

- Leads with a visual, tactile deckbuilding metaphor.
- Lets users customize what cards are stacked by, how stacks are ordered, and where stacks appear.
- Provides text and spreadsheet views for dense work.
- Has a first-class playtester.
- Treats card organization as part of the craft of building the deck, not just a rendering afterthought.

What it misses or risks:

- Custom categories can make other people's decks harder to parse if every author uses a different taxonomy.
- Flexible stack layout can create cognitive overhead.
- The product is highly deckbuilding-centered, less physical-inventory-centered.

UI pattern takeaways:

- Visual stacks are excellent when modifying an existing deck.
- Dense modes are still necessary for scanning, copying, and auditing.
- User-defined categories are powerful but need defaults and escape hatches.

Source: https://archidekt.com/landing

### TappedOut

What it does well:

- Has long-standing board concepts: mainboard, sideboard, maybeboard, and acquireboard.
- Acquireboard is especially relevant to a physical collection workflow: it separates "I am considering this" from "I need to obtain this."
- Emphasizes title and description as ways to communicate deck goals, restrictions, budget, and desired feedback.
- Uses hubs/tags as a community-oriented way to describe deck archetypes.
- Has deck charts and playtest/deckcycle/feedback flows.

What it misses or risks:

- The UI model is older and more menu/page based.
- Some actions live in side menus, which can make the page feel less like a modern workspace.
- It is community/public-feedback oriented, which is not always what a personal collection manager needs.

UI pattern takeaways:

- Acquireboard is worth borrowing.
- Description should be treated as real product surface, not just metadata.
- Deck pages benefit from a clear "what kind of feedback or use is this deck for?" area.

Source: https://tappedout.net/help-desk/deck/

### MTGGoldfish

What it does well:

- Optimized for metagame/decklist consumption.
- Deck header quickly exposes price, tix, format, event, source, and date.
- Provides simple top actions: Deck Page, Visual View, Stream Popout, Edit, Copy, Download.
- Visual view is separate from the default text/stat deck page.
- Excellent at "I want to inspect/copy this competitive list quickly."

What it misses or risks:

- Less personal-workspace feeling.
- Less emphasis on editing flow, physical collection state, or "what am I considering?"
- Metadata is strongest for tournament source context, not personal notes.

UI pattern takeaways:

- Top-level deck metadata should be compact and high-signal.
- Copy/download deserves first-tier placement.
- A separate visual route/view can keep the main deck page clean.

Sources:
- https://mtggoldfish.com/archetype/standard-dimir-control-mid
- https://www.mtggoldfish.com/deck/visual/6348213

### AetherHub

What it does well:

- Offers four deck viewing modes: Visual, CMC, Compact, and Gallery.
- Remembers the user's preferred deck view.
- Provides exports for Arena, MTGO, text, embeds, decklist printing, copying to account, and importing into the builder.
- Provides sample hand simulation plus deeper probability simulation for land counts.
- Includes mana calculator, color/CMC/rarity breakdowns, and hypergeometric calculator.
- Has both a visual deck builder and a traditional deck editor.
- In editor/search flows, lets users choose Main, Side, or Maybeboard via a toggle.

What it misses or risks:

- The distinction between builder, editor, public deck, and tools can feel fragmented.
- Some Commander conventions are idiosyncratic, such as using sideboard/commander behavior for advanced checks.

UI pattern takeaways:

- View preference persistence is a small but high-value feature.
- Export/import should be treated as a core deck-page affordance.
- "Gallery" or shareable visual view is useful, but should not crowd the daily editing view.

Sources:
- https://aetherhub.com/Docs/About
- https://aetherhub.com/Docs/DeckBuilder
- https://aetherhub.com/Docs/DeckEditor

### Deckstats

What it does well:

- Positions itself around building, analyzing, sample hands, collection tracking, and probabilities.
- Explicitly combines deckbuilding with collection management.
- Makes mana curve, type distribution, card probabilities, and sample hands central.
- Mentions visual and text input modes, price comparison, import/export, and collection-aware building.

What it misses or risks:

- The UI is more utilitarian than expressive.
- It is likely less delightful for visual browsing than Moxfield/Archidekt.

UI pattern takeaways:

- Probability tools and collection-aware deckbuilding are a strong fit for this app.
- The app should eventually answer "can I build this from my collection?" and "what am I missing?"

Sources:
- https://deckstats.net/index.php
- https://deckstats.net/deckbuilder/en/

### TopDecked

What it does well:

- Mobile-first mental model with cross-device sync.
- Supports moving cards between main, sideboard, and maybe board.
- Includes deck charts for CMC, colors, and mana curve.
- Has a deck simulator that lets users visualize hands and move cards around.
- Has notes and strategy, including sideboard notes and game-result tracking.
- Has tournament-oriented print decklist/decksheet tooling.

What it misses or risks:

- More app-like and account-sync oriented than a lightweight local web tool.
- The broad product scope can become less focused for personal collection workflows.

UI pattern takeaways:

- Notes/strategy and sideboard guide deserve a place in deck view.
- Mobile deck workflows should emphasize quick add, move, sample hand, and notes.
- Tournament print/export is a practical feature, not just a nice-to-have.

Sources:
- https://play.google.com/store/apps/details?id=com.maritlabs.topdecked.mtg
- https://www.topdecked.com/articles/tour/deck-tools-and-utilities/

## Cross-Site Pattern Synthesis

### 1. Board concepts are stable, but semantics vary

Common:

- Mainboard
- Sideboard
- Maybeboard/considering

Also useful:

- Commander/partner/companion as special slots.
- Acquireboard/wantboard for cards needed to complete a deck.

Recommendation for this app:

- Keep Main, Side, Maybe.
- Add Commander/Partner as actual linked card slots, not only text metadata.
- Add Acquireboard later because it matches physical collection/selling/buying workflows unusually well.

### 2. View settings are usually split into two tiers

Prominent tier:

- Visual/List/Text
- Stats
- Sample Hand/Playtest
- Copy/Export
- Edit/Add

Hidden or compact tier:

- Group by
- Sort by
- Card size
- Show/hide prices
- Show/hide set codes
- Show/hide mana costs
- Preferred printing
- Include/exclude sections in export

Answer to the user's specific question:

Most sites make the existence of view modes prominent, but hide the detailed settings. "Visual View" or "Deck Page" is a top-level link; "group by type/color/CMC", "show price", "sort", and similar settings are usually compact dropdown/menu concerns. Our current deck UI makes too many editing/settings controls prominent at once.

### 3. Stats are expected, but not always first-scroll content

Common stats:

- Mana curve
- Average mana value
- Type breakdown
- Color breakdown
- Land/nonland counts
- Price/value
- Legality

Advanced stats:

- Mana sources vs mana requirements
- Opening hand land probabilities
- On-curve play percentages
- Hypergeometric/probability tools
- Tokens generated/needed

Recommendation:

- Show a compact "deck health strip" near the header.
- Put detailed charts behind a Stats tab or collapsible dashboard.

### 4. Sample hand is common; full playtester is not required for v1

Common:

- Draw 7
- Mulligan/redraw
- Show opening hand

Advanced:

- Library/hand/battlefield/graveyard zones
- Drag/drop card movement
- Counters/tokens/life/poison
- Hotkeys

Recommendation:

- Keep sample hands lightweight for now.
- Make the simulator feel more like a tool: show land count, redraw, London mulligan state, and next-card peek.
- Do not build a full game sandbox yet.

### 5. Export is a first-class deck-page action

Common export/copy targets:

- Plain text
- MTG Arena
- MTGO
- Moxfield/Archidekt-ish text
- CSV
- Printable decksheet
- Embed/share

Recommendation:

- Replace "copy list" as a single action with "Export" as a dropdown.
- Include presets and checkboxes for Main/Side/Maybe/Commander.

### 6. Description/primer/notes should be readable before editable

Moxfield and TappedOut both reinforce that text about the deck matters. TopDecked's notes/strategy shows the private version of the same need.

Recommendation:

- Render description/notes as reading content.
- Hide edit fields behind an "Edit details" button.
- Add private notes and sideboard notes later.

### 7. Card-level controls are usually contextual

Common:

- Click card for details.
- Hover or overflow menu for move/cut/change printing.
- Drag/drop in visual builder modes.
- Bulk edit for many-card operations.

Recommendation:

- Remove always-visible board `<select>` controls from every card.
- Replace with hover/focus actions and a card action menu.
- Add multi-select/bulk move later.

## Our Current Deck UI

Current strengths:

- Deck mode hides the collection side panels, which matches the deck-workspace model.
- Deck containers now have metadata.
- Main, sideboard, and maybeboard are first-class board states.
- Export text preserves board sections.
- The page includes a deck header, description, stats, sample hand, mainboard, sideboard, maybeboard, and text list.
- The underlying data model accounts for board membership in `collectionKey`, so main vs sideboard copies do not collapse together.

Current weaknesses:

- Metadata editing is always visible. This makes the top of the deck page feel like an admin form rather than a deck page.
- Every visual card has an always-visible board dropdown. This is functional but noisy and not very Moxfield/Archidekt-like.
- Stats, sample hand, text list, boards, and metadata are all stacked into one page. There is no hierarchy or task mode.
- The old deck action row still owns group-by and summary, while the new workspace owns most of the deck page. That creates two competing control zones.
- The sample hand is technically present but not yet product-grade: no land count summary, no London mulligan model, no hand history, and no clear empty/short-deck handling.
- Commander/partner are strings in metadata, not linked to real collection entries.
- There is no deck-local "add card" flow after hiding the right panel.
- Export is too simple for a portability-focused app.
- No per-deck view preference. Group-by is global.
- No acquireboard/wantboard, which is likely important for a physical collection manager.

Relevant current implementation:

- Deck boards: `collection.js`
- Deck rendering: `view.js`
- Deck workspace CSS: `index.html`
- Deck stats/sample hand helpers: `stats.js`

## Proposed Changes

### Phase 1: Make The Deck Page Feel Like A Deck Page

Priority: high.

Changes:

- Replace the always-visible metadata form with a read-first header.
- Add an "Edit details" button that opens an inline drawer/modal for title, format, commander, partner, and description.
- Keep the hero compact: title, format, commander, total count, main/side/maybe count, value, legality.
- Move group-by into a compact "View settings" menu.
- Keep top actions visible: Add card, Export, Sample hand, View settings.

Why:

- This matches the cross-site pattern: primary actions visible, secondary settings hidden.
- It gets the actual deck higher on the page.
- It makes the page feel less like a settings screen.

### Phase 2: Add Deck View Modes

Priority: high.

Recommended top-level mode control:

- Visual
- Text
- Stats
- Hands
- Notes

Behavior:

- Visual is default for deck/binder-like browsing.
- Text is compact and copy-friendly.
- Stats is a full analysis page.
- Hands is the sample-hand tool.
- Notes is deck description, primer, private notes, and sideboard guide.

Keep board filters separate:

- All
- Main
- Side
- Maybe
- Acquire later

Why:

- Other sites expose mode switching prominently.
- This avoids one giant scroll page.
- It helps mobile, where stacked dashboards become painful.

### Phase 3: Replace Card Board Dropdowns With Contextual Actions

Priority: high.

Changes:

- Remove always-visible board dropdowns from cards.
- Add card hover/focus affordance: small menu button.
- Card menu actions:
  - Open details
  - Move to main
  - Move to sideboard
  - Move to maybeboard
  - Change printing
  - Remove from deck
- Add bulk selection later:
  - Move selected
  - Tag selected
  - Export selected

Why:

- Per-card visible selects make the visual deck look like a form.
- Contextual controls are the dominant pattern in visual deck builders.
- It keeps the deck inspectable and calmer.

### Phase 4: Build A Real Export Menu

Priority: high for this app's portability promise.

Export dropdown:

- Copy plain decklist
- Copy Moxfield-ish text
- Copy Arena
- Copy MTGO
- Download CSV
- Download deck JSON

Options:

- Include commander
- Include mainboard
- Include sideboard
- Include maybeboard
- Include set codes/collector numbers
- Include finish markers
- Include tags

Why:

- AetherHub, MTGGoldfish, and Deckstats all treat export/import as a first-class feature.
- Portability is one of this app's core trust-building promises.

### Phase 5: Improve Stats Into A Deck Health Panel

Priority: medium-high.

Compact header stats:

- Legal/illegal
- Count target status: 100 Commander, 60/15 Constructed, etc.
- Lands
- Average mana value
- Value
- Missing cards, later

Detailed stats tab:

- Mana curve
- Type breakdown
- Rarity/value
- Color identity
- Mana pips vs mana sources
- Land-opening odds
- On-curve estimates later
- Tokens required later

Why:

- Stats should help users make decisions, not only describe the list.
- Mana source vs spell color is a common advanced differentiator.

### Phase 6: Make Sample Hands Useful But Still Lightweight

Priority: medium.

Changes:

- Draw 7 from mainboard.
- Show land count and nonland count in the hand.
- Add redraw and London mulligan flow:
  - draw 7
  - mulligan count
  - choose bottom cards later
- Show next 3-6 cards as optional peek.
- Add "copy hand" or "save hand note" later.

Do not build yet:

- Full battlefield sandbox.
- Opponent simulation.
- Life/counter/token systems.

Why:

- This is enough to answer "does this deck open well?"
- It aligns with Deckbox/AetherHub/Deckstats without becoming Moxfield's full playtester.

### Phase 7: Add Deck-Local Add Card Flow

Priority: medium.

Changes:

- Add an "Add card" button in deck header.
- Open a deck-local add drawer/search.
- Default destination to current board filter.
- Let user choose Main, Side, Maybe, Acquire.
- Reuse existing card add/import logic where possible.

Why:

- Hiding the global right panel is correct, but deck mode still needs a way to modify the deck.
- Mobile deck workflows will depend heavily on quick add.

### Phase 8: Link Commander/Partner To Actual Cards

Priority: medium.

Changes:

- Store commander references as collection entry keys or deck-specific card references, not only strings.
- Render Commander/Partner as pinned card sections.
- Validate Commander legality/color identity later.

Why:

- Metadata strings are good for v1 but will drift from the actual deck contents.
- Commander is a deck zone, not only a label.

### Phase 9: Add Acquireboard

Priority: medium-low, but strategically important.

Changes:

- Add an `acquire` board or `need` board.
- Distinguish:
  - Maybe: I am considering this card.
  - Acquire: I need to obtain/pull this card.
  - Sideboard: this card is physically with the deck or registered sideboard.

Why:

- This is where the app can differ from pure deck-hosting sites.
- It bridges collecting, selling, and deck maintenance.

### Phase 10: Mobile Deck Mode

Priority: medium.

Mobile default:

- Header summary
- Board selector
- Visual/list toggle
- Add card
- Sample hand

Avoid on mobile:

- Full always-visible stats dashboard.
- Wide metadata form.
- Multi-column card stacks unless card size is carefully controlled.

Why:

- Mobile is likely for adding cards, checking a deck, trading, or sample hands, not deep inventory filtering.

## Recommended Next Implementation Order

1. Replace always-visible metadata form with read-first header plus Edit Details modal/drawer.
2. Replace card board selects with a compact card action menu.
3. Add deck mode tabs: Visual, Text, Stats, Hands, Notes.
4. Move group/sort/card-size/show-price into View Settings.
5. Upgrade Export into a dropdown with format presets.
6. Add deck-local Add Card.
7. Improve sample hand with land counts and mulligan state.
8. Add mana-source-vs-pips stats.
9. Link commander metadata to actual card entries.
10. Add acquireboard.

## Product Principle

The deck page should make the deck itself feel primary. Controls should appear exactly when they help:

- Reading a deck: low chrome, strong summary, easy board navigation.
- Tweaking a deck: visible add/move/export, contextual card actions.
- Diagnosing a deck: stats tab and sample hands.
- Maintaining a physical deck: missing/acquire state, actual printings, locations, collection ownership.

The phrase to optimize for is: "I can see my real deckbox, understand it quickly, make one or two changes, and export or carry that knowledge elsewhere."

