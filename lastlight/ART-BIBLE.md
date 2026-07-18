# Lastlight art and branding bible

Version: `lastlight.brand.v1`  
Machine contract: `brand-contract.js`  
Status: canonical for build `2026.07.13.21`

## The promise

Lastlight is a desperate, readable defense of Final City: industrial machinery at the edge of failure, operated by people with enough personality to make the end of the world worth surviving. The brand line is **Outrun the end.** The product promise is **Hold the line until Final City gets another sunrise.**

Every decision follows five rules:

1. Industrial, never generic. Square-cut frames, exposed rails, battered plate, signal glass, freight markings, and operational language belong here; soft lifestyle UI and anonymous sci-fi chrome do not.
2. Clarity before spectacle. Threat, objective, support, cooldown, selection, and failure state remain readable when color, motion, flash, particles, or audio are reduced.
3. Salvage with purpose. Wear communicates use and history, not random noise. A clean keyline or bright signal should sit against restrained, imperfect machinery.
4. Humanity inside machinery. Specialist names, sharp taglines, absurd weapon names, and a little gallows humor keep the tactical shell from becoming sterile.
5. State is never color alone. Shape, pattern, label, position, timing, or sound must repeat every consequential color signal.

## Mark and naming

The primary wordmark is `LASTLIGHT`, paired with the square `L` mark. It is uppercase, compact, and operational. The product name is written **Lastlight** in prose and `LASTLIGHT` only in display or in-world system contexts. The campaign line is **OUTRUN THE END.** Preserve the period when the line stands alone.

The mark must remain recognizable at 16 px, in one color, and against `ink`. Do not add gradients, glow, beveling, perspective, or an enclosing circle. The favicon, manifest, social preview, browser title, in-product wordmark, and release badge are one family; changes require all of them to be reviewed together.

## Color

The canonical authored palette lives in `brand-contract.js` and is mirrored by CSS variables.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Night field | `ink` | `#070d18` | page and arena surround |
| Working panel | `panel` | `#0b1524` | modal and operational surfaces |
| Raised panel | `panelRaised` | `#101c2d` | selected or nested structure |
| Primary text | `paper` | `#edf7f4` | titles and critical values |
| Secondary text | `muted` | `#8ba2ad` | explanation and metadata |
| Friendly signal | `signal` | `#63f2df` | focus, selection, player systems |
| Breach/action | `breach` | `#ff5c35` | calls to action and aggressive emphasis |
| Objective | `objective` | `#f7d76a` | mission state and authored rewards |
| Danger | `danger` | `#ff4667` | hostile and destructive state |
| Void | `void` | `#b68cff` | corruption and spatial anomaly |

`signal`, `objective`, and `danger` are semantic, not decoration. Specialist and map accents may extend the palette, but never replace these state roles. Color-vision profiles may transform the canvas; labels, silhouettes, patterns, and keylines remain authoritative. High contrast strengthens edges and text without inventing a new hierarchy.

## Typography and voice

Barlow Condensed is the display face for names, headlines, countdowns, large numbers, and short operational states. Inter is the body face for controls, explanations, tables, diagnostics, and long-form reading. Impact and system-ui are the required offline fallbacks. The interface must remain usable when web fonts fail.

Uppercase is reserved for short operational labels, callsigns, names, and state. Sentences, help, errors, and accessibility copy use normal sentence case. Do not uppercase a paragraph to make it feel important.

Voice is short, specific, and actionable. “Authority lost — retrying room” is Lastlight; “Something went wrong” is not. Flavor may be wry, but rules must remain literal. Avoid generic fantasy language, unexplained acronyms, color-only instructions, or certainty the system cannot prove.

## Geometry, layers, and iconography

Frames are square-cut with one-pixel keylines. Small rounding is reserved for radial objects such as pings, health segments, reactors, and world-space signals—not generic cards. Selection uses brackets, rails, corner cuts, or a labeled ribbon. Objectives use broken rings. Danger uses toothed perimeters and directional chevrons. Support uses a four-corner cross. Inspection uses a dashed focus ring.

Icons are silhouettes first. At the smallest runtime size, a user should distinguish the family before reading color or detail. Text labels accompany unfamiliar or consequential icons. A glyph may abbreviate a known weapon or stat; it may not be the only accessible name.

Layer priority is fixed by `readability.js`: decorative ground, obstacle ground, pickups, player attacks, actors, hostile projectiles, objective overlays, lethal telegraphs, teammate-critical state, damage feedback, then inspection. Brand polish may not reorder that contract.

## Materials and effects

The six materials are metal, concrete, liquid, organic, energy, and void. Each has authored particle geometry, decal shape, flash, generated audio family, and non-color fallback in `material-impacts.js`.

- Metal is angular, bright, and brief: sparks, ricochet notches, hard transients.
- Concrete breaks outward in square chips and fractures with weight.
- Liquid and ice use diamonds and ripples, not generic blue sparks.
- Organic impacts are rounded and soft-edged without becoming gore.
- Energy discharges in short arcs and broken hexes.
- Void collapses inward through motes and broken spirals.

Effects inherit the weapon family, then the target material. Evolution preserves the base silhouette and adds one mechanically truthful transformation. Particle volume is cosmetic and bounded. Reduced-flash removes flash; reduced-motion replaces travel or pulsing with static state change; essential state remains visible.

## Motion

Movement feels immediate, heavy enough to belong to machinery, and interruptible. The canonical curves are strong ease-out for response and strong ease-in-out for motion already on screen. Press feedback is 120 ms, micro transitions 150 ms, and panels at most 240 ms. Keyboard-triggered operations are instant.

Animate transform and opacity where possible. Never animate from scale zero. Tooltips originate near their trigger; modals remain centered. High-frequency controls avoid decorative movement. Reduced motion keeps opacity and color transitions that explain state while removing position, camera, bob, and decorative travel. Reduced flash removes nonessential bright transitions independently.

Motion atlases use south, west, north, east order, normalized 256 px cells, gutters, and canonical foot anchors. Hurt, down, revive, and victory are semantic states, not spare action poses.

## Character and threat identity

The strict identity map is in `brand-contract.js`; the authored gameplay tradeoffs remain in `specialist-identity.js` and `enemy-archetypes.js`.

All nine specialists need a distinct silhouette, material cue, accent signal, role sentence, tagline, signature weapon, and base/evolved shape family. No specialist may be distinguished only by hue. Zuri is forward barrage; Echo repeats concentric signal; Sola is shield and lance; Bront is hammer and totem; Fang is broken restraint; Gale is split current; Rift is impact momentum; Nova is wisp and hex; Vesper is wing and recall.

Their canonical role labels are: Zuri, ramping gunner; Echo, projectile support; Sola, armor vanguard; Bront, sustain summoner; Fang, missing-health brawler; Gale, critical duelist; Rift, movement skirmisher; Nova, hex spirit runner; and Vesper, pickup ranger.

The six hostile roles must read at first contact: Skitter low and bladed, Rusher wedge-fast, Spitter orb-and-muzzle, Brute broad and heavy, Bomber an unstable reactor, Siegebreaker a horned fortress. The four apexes extend their map rather than looking imported from another theme.

The apex identities are Tunnelmaw in Iron District, Red Hunger in Ash Outskirts, Void Empress in Subzero Lab, and Abyss Blade at The Beachhead.

## Maps and environment

Each map owns a navigation texture, material mix, atmosphere, accent, mechanic, environmental chunks, and apex language.

- Iron District: freight grid, steel/concrete, cool cyan relays, constrained industrial lanes.
- Ash Outskirts: open ion lanes, ash/brass, amber cannon signals, exposed pressure.
- Subzero Lab: cryo cells, ice/glass, blue-violet freeze cores, clinical containment failure.
- The Beachhead: flooded causeway, void water/plate, coral tide teeth, advancing loss of ground.

Environment art may enrich clear space but cannot counterfeit collision, pickups, objectives, or telegraphs. Authored chunks obey gameplay clearances and decode budgets. Texture is atmosphere; geometry is authority.

## Audio identity

The default audio combines a compact, documented CC0 recording bank with project-authored runtime synthesis. Adaptive music follows home, containment, pressure, breach, apex, and victory states; weapon, hostile, material, UI, objective, danger, apex, and outcome cues layer physical transients beneath authored signatures. Browser text-to-speech is not part of the game. Routing follows `audio-assets.js`, `music-director.js`, `audio-cues.js`, and `audio-mix.js`. Critical warnings keep protected headroom. Directional modes may strengthen pan or collapse to mono without changing cue priority. Every critical cue has a visual equivalent.

Future sampled audio requires source URL, creator, license, modification history, local fallback, and a failure path back to generated cues. Silence is not an acceptable missing-theme fallback.

## Surface audit

| Surface | Primary job | Required brand cue | Failure to avoid |
| --- | --- | --- | --- |
| Home | promise and deployment | wordmark, breach orange, campaign line | generic landing-page polish |
| Lobby/select | squad and identity | specialist silhouette, numbered operational cards | color-only identity |
| Game HUD | survival decisions | high-priority rails, segmented state, restrained panels | ornamental competition with arena |
| Draft | build consequence | weapon/passive family, exact before/after language | rarity spectacle hiding rules |
| Pause/settings | safe control | plain hierarchy, local-setting disclosure | decorative motion or buried exits |
| Results/archive | evidence and memory | terminal-report voice, signed facts, earned accents | victory art replacing data |
| Replay/practice | inspection and learning | laboratory/record framing, exact controls | implying campaign rewards |
| Recovery/migration | trust under failure | centered authority card, explicit steps | vague spinner-only state |
| Report | repair loop | actionable copy, privacy disclosure | blame or identity leakage |

Desktop, mobile, 200% interface scale, high contrast, all color-vision profiles, reduced motion, reduced flash, touch, keyboard, and standard gamepad are first-class presentations of the same brand.

## Asset inventory and provenance

The machine contract lists ten runtime families: branding, specialist cutouts, motion, weapons, enemies, environments, guide, archive, effects, and audio. Their canonical source/runtime roots and constraints are validated in tests. Existing generated art is project-authored and curated; `assets/enemies/GENERATION.md` preserves exact enemy prompts, and the motion/environment toolchain preserves source and output hashes. Runtime-generated audio provenance is documented in `AUDIO-ASSETS.md`.

No external visual or audio asset may ship without creator, source, license, modification history, and a compatible fallback. Generated source is not self-justifying: it still requires art-direction review, silhouette QA, edge cleanup, technical validation, and project ownership.

## Production checklist

1. Start from an existing identity contract; do not invent a disconnected style in one surface.
2. Verify smallest runtime silhouette, transparent edges, crop, anchor, and authored direction.
3. Verify state without color, then in every color profile, high contrast, reduced motion, and reduced flash.
4. Verify font failure, 200% scale, 375 px reflow, focus order, visible focus, and 44 px touch targets.
5. Verify asset path, source/runtime relationship, provenance, license, dimensions, decoded size, and cache key.
6. Run brand, readability, theme, motion, audio, sprite, fixture, benchmark, soak, and browser gates.
7. Confirm presentation changes do not enter simulation, replay, recovery, multiplayer, reports, archives, or telemetry identity.
8. Update this bible and `brand-contract.js` together; changing only one is a contract failure.

Intentional exceptions must be documented next to the owning contract. “It looked better” is not an exception record; name the user need, surface, constraint, and preserved fallback.
