# Display quality and accessibility

Lastlight's quality controls are renderer-only. They never change simulation
steps, random-number generation, entity state, collision, damage, network
messages, or replay data.

## Presets

- **Auto** starts at High and moves down one tier after a sustained slow-frame
  window. It recovers only after a substantially longer stable window.
- **High** uses up to 2× device pixel ratio and the largest visual budgets.
- **Reduced** lowers canvas resolution and cosmetic entity/effect budgets while
  preserving enemy telegraphs, bosses, elites, and hostile projectiles.
- **Minimal** uses 1× resolution, removes footfall particles and shake, reduces
  motion, and keeps only the most important health bars by default.
- Changing a granular control creates a persistent **Tuned** profile.

Settings are stored locally under `lastlight:quality:v1`. Fresh sessions honor
the operating system's `prefers-reduced-motion` preference.

## Adaptive behavior

The renderer maintains an exponential moving average of visual frame duration.
Auto waits for 150 sustained slow samples before reducing one tier, then applies
a cooldown. Recovery requires 600 sustained fast samples and also changes only
one tier. Entity/effect budgets ease toward the new tier over time, and cosmetic
sampling uses stable entity IDs so individual effects do not flicker in and out.

Priority gameplay information is exempt from cosmetic density sampling:
hostile telegraphs, delayed damage fields, bosses, elites, minibosses, event
targets, and boss projectiles are retained before ordinary visuals.

## Integration contract

`quality-settings.js` owns persistence, preset normalization, renderer profiles,
and adaptive hysteresis. `Renderer.setQualitySettings(settings)` applies a
profile, while `Renderer.getQualityStatus()` exposes the active Auto tier and
frame average for UI and diagnostics.

When adding a new visual list, cap it only in `render.js`; never truncate arrays
inside `engine.js`. Exempt anything the player must see to make a combat or
movement decision.
