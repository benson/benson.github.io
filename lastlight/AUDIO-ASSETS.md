# Audio architecture and provenance

Lastlight uses a hybrid audio system:

- `audio-assets.js` maps gameplay cues to a compact bank of local CC0 recordings.
- `music-director.js` streams one current and one incoming music track through equal-power-style crossfades.
- `audio-cues.js` retains the project-authored oscillator registry as a signature layer and permanent fallback.
- `audio-mix.js` routes effects, ambience, music, UI, and critical information through separate gain buses with protected headroom.

No audio is requested before a browser audio gesture. After sound unlocks, the small effects bank is decoded in the background; music is streamed only when its state becomes active. A missing, undecodable, or blocked recording falls back to the generated cue instead of becoming silent.

## Adaptive score

The score follows the eight authored waves rather than elapsed seconds, so it has the same dramatic shape in four- and fifteen-minute levels:

| State | Waves | Track |
| --- | --- | --- |
| Home / lobby | — | `home-airy.ogg` |
| Containment | 1–2 | `combat-sector.ogg` |
| Pressure | 3–5 | `combat-pulse.ogg` |
| Breach | 6–8 | `combat-urgent.ogg` |
| Apex | Apex encounter | `apex-space-boss.ogg` |
| Victory | Results transition | `victory.ogg` |

Normal state changes crossfade over 3.2 seconds. Pause lowers the score without stopping it, preserving musical continuity. Critical cues duck music, ambience, and friendly combat chatter before the limiter.

## Effects grammar

Important sounds combine a recorded transient with a quieter synthesized identity:

- Weapons: laser or physical attack transient plus the specialist/weapon oscillator signature.
- Materials: metal, concrete, organic, liquid, energy, glass, and void recordings selected by impact grammar.
- Enemies: body, projectile, explosion, and apex layers selected by authored archetype.
- World: distinct healing, ion cannon, freeze, freight, cryo, and undertow sounds.
- Interface: restrained selection, confirmation, error, pickup, and reward transients.

Variant selection is deterministic cosmetic variation and never consumes gameplay randomness. Spatial cues retain bounded stereo panning. Dense-wave category caps still reserve capacity for damage, hostile, objective, danger, apex, ultimate, and outcome feedback.

## Voice

Browser text-to-speech and the comic “pew pew pew” callout have been removed. Lastlight ships no synthesized speech, bundled voice model, or recorded dialogue.

## Licensing

Every shipped recording is CC0. Exact sources, creators, local mappings, and modification history are recorded in `assets/audio/LICENSES.md`; file size and SHA-256 integrity data live in `assets/audio/asset-manifest.json`.

Do not add an audio file without updating both records. Third-party assets with custom EULAs, non-commercial clauses, attribution requirements, or unclear provenance require an explicit licensing decision before they enter the repository.
