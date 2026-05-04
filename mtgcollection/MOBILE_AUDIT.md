# MTG Collection Mobile Audit

Date: 2026-05-04

## Goal

Prepare MTG Collection for real mobile use without turning the stylesheet into one-off breakpoint patches. Mobile should support quick collection lookup, adding cards after events, editing a card in hand, checking a deck or storage container, and light in-person trading/selling workflows.

Desktop can stay the primary dense inventory surface. Mobile should be simpler, sheet-driven, and touch-friendly.

## Current Audit Snapshot

Audited with Playwright against local test data at `390x844` phone and `768x1024` tablet portrait.

### Shell

- The responsive layer exists, but it currently collapses the desktop frame instead of defining a clean mobile shell.
- `body.view-binder .app-shell` and `body.view-locations .app-shell` are more specific than the generic mobile `.app-shell` rule, so storage and binder keep a desktop `200px 1fr 0` grid on mobile.
- Result: storage home and binder content are squeezed into a roughly `200px` center column at both phone and tablet widths.
- Collection view still shows the right add sidebar inline below the main content on mobile, because the mobile rule explicitly restores `body.view-list .app-right`.
- The left sidebar remains visible as a large inline filter/history block before content on collection, storage, and binder. This makes mobile feel like the desktop app stacked vertically, not a phone workflow.
- The header wraps into a tall block: roughly `100-140px` on phone and `102-178px` on tablet depending on route.
- The bottom totals strip works conceptually, but it needs safe-area spacing and coordination with floating actions.

### Collection

- Phone collection at `390px` measured horizontal document overflow: `scrollWidth 679`.
- The likely cause is the table/list surface plus inline right sidebar. A phone should not render the dense desktop table as the default mobile browsing surface.
- Search and filters are still sidebar-first; they should become search-first plus a filters sheet.
- Add should open a full-screen or bottom-sheet flow, not an inline right column.

### Add Flow

- The add panel is reachable from the FAB, but on mobile it appears as inline page content rather than a modal/sheet workflow.
- The workflow itself has the right ingredients: name search, printing picker, preview image, finish radios, location pills, tags, add actions.
- Mobile should promote the search and selected card image, then keep the final add action sticky at the bottom of the sheet.
- The printing picker can remain below the image/identity once a card is selected; during search it should not crowd the first screen.

### Detail Drawer

- Detail drawer is in better shape than the add panel. At `390px` it measured as full-width and full-height, with card image and form fitting inside the viewport.
- It still needs touch polish: sticky save/cancel actions, larger tap targets, and a more compact printing picker.
- This can become the mobile pattern for add/edit sheets.

### Deck View

- Deck view is the strongest mobile surface right now.
- At `390px`, deck mode defaulted to visual/all and did not overflow.
- Compact read header was about `187px`; edit mode expanded to about `511px`.
- Next issue is density: tabs, board filters, ownership toggle, group controls, and card size controls need a sticky/touch-friendly ordering.
- Inline deck editing works, but commander/partner pickers need enough vertical room and should not push the deck list too far down for casual browsing.

### Binder View

- Binder view has the right skeuomorphic direction, but mobile layout is currently blocked by the shell bug.
- At `390px`, the binder center measured about `200px`, with the binder surface around `176px`; this makes the binder page too tiny.
- At `768px`, the same `200px` center issue persists.
- Once the shell is fixed, binder should use the full available width, preserve page aspect ratio, and paginate/swipe cleanly.

### Storage Home

- Storage now has the correct scoped search/history/filter behavior, but the shell squeezes it into the same `200px` center column.
- The storage create form and container cards are good candidates for a simple single-column mobile layout.
- Storage history should be collapsed or sheeted by default on phones.

## Pass 1 Implementation Status

Implemented in the first mobile shell pass:

- Mobile route layout now resolves to one full-width center column for collection, binder, storage home, decks home, deck, and box shapes.
- Left filters/history are hidden by default on mobile and open as a sheet from a `filters` FAB.
- The add/import panel is hidden by default on mobile and opens as a full-width overlay sheet from the `add` FAB.
- Collection list/table overflow is contained inside the list scroller instead of widening the document.
- Binder now uses the available mobile width instead of the previous `200px` center column.

Re-checked with Playwright:

- `390x844`: storage, binder, collection, add sheet, filters sheet, and deck all reported no document overflow.
- `390x844`: binder center width increased from about `200px` to `390px`; binder surface increased from about `176px` to `364px`.
- `768x1024`: storage, binder, collection, and deck all reported no document overflow; binder surface increased to about `740px`.

## Proposed Implementation Sequence

### Pass 1: Mobile Shell Foundation

Fix the structural layout first.

- Define one mobile shell rule that wins for all app shapes: collection, deck, binder, storage home, decks home, box.
- Remove the mobile behavior that restores `.app-right` inline for list view.
- Hide `.app-left` by default on mobile and expose filters/history through a button or sheet.
- Treat `.app-right` as an add/import sheet on mobile: fixed, full-height or nearly full-height, full-width, with backdrop.
- Keep detail drawer full-screen on mobile and use it as the reference pattern.
- Ensure no route has document horizontal overflow at `390px`, `430px`, or `768px`.
- Add `safe-area-inset-bottom` spacing for totals/footer/FAB.

### Pass 2: Mobile Add And Detail Workflows

Make the highest-value mobile workflow feel intentional.

- Add flow opens as a focused sheet with search at top.
- After a card is selected, show the card image/identity near the top, then printing picker, finish/condition/language, tags, location, and sticky add/cancel actions.
- Keep printing search usable with one thumb: input stays above list, rows have larger touch targets.
- Detail drawer gets sticky save/cancel/delete actions and touch-sized finish/location/tag controls.
- Detail and add should share as much sheet/form styling as possible.

### Pass 3: Mobile Browsing Surfaces

Tune each view once the shell and sheets are solid.

- Collection defaults to a mobile card/grid surface; dense list/table is secondary or transformed into row cards.
- Filters open as a sheet with the existing multiselects.
- Deck view gets sticky tabs and a tighter control hierarchy: mode tabs, board tabs, then visual-only settings.
- Binder view uses full width, aspect-ratio pages, page controls large enough for touch, and optional swipe later.
- Storage/decks homes become simple search-first lists/cards with create controls below search.

### Pass 4: Mobile QA And Guardrails

Add repeatable checks so this does not regress.

- Playwright smoke at `390x844`, `430x932`, and `768x1024`.
- Assert `document.documentElement.scrollWidth <= window.innerWidth + 1` for core routes.
- Assert add sheet opens and closes on collection and binder.
- Assert detail drawer opens from collection/binder and fits viewport.
- Assert storage and binder center content width is not stuck at `200px`.
- Assert deck visual/all default remains intact.

## Acceptance Criteria

- No horizontal document overflow on phone or tablet for collection, deck, binder, storage home, decks home, or detail drawer.
- Mobile collection does not show the left filters or right add panel inline by default.
- Add and detail flows feel like intentional mobile sheets.
- Storage and binder use the full available mobile width.
- Deck view remains functional and readable without the left/right desktop panels.
- Desktop layout remains visually unchanged except where shared improvements are deliberate.

## Open Product Questions

- Should mobile collection default to grid/card view even if desktop is in list mode?
- Should history live inside the filters sheet, a separate activity sheet, or stay hidden until needed?
- Should the mobile add flow prioritize scanner/voice controls once those features arrive?
- Should binder pages eventually support horizontal swipe between pages?
