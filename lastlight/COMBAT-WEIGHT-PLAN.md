# Combat weight plan

## Goal

Make Lastlight feel planted, immediate, and causally connected without changing
damage, cooldowns, enemy timing, movement speed, collision, RNG, replay state, or
multiplayer protocol.

“Weight” is treated as a synchronized presentation chain:

`input → body commitment → attack release → contact → reaction → recovery`

Every stage must have a readable change in pose or force, and every change must
settle quickly enough for the next action.

## Audit findings

| Before | After | Why |
| --- | --- | --- |
| Target displacement ramps from zero after the contact hold. | Contact begins at full directional compression and displacement, holds for the authored hit-stop window, then settles with a fast ease-out. | A hit that slowly pushes the target reads as drift rather than impact. |
| Signature firing mostly adds a small rotational shear. | Every specialist gets a bounded, directional body kick synchronized to the existing `weaponFlash` clock. | The body must acknowledge the exact release frame even when the projectile hits later. |
| Authored enemy locomotion is layered with continuous sine bob and idle wobble. | Authored atlases own body motion; procedural motion is limited to fallback locomotion and short stun reactions. | Two unrelated motion clocks make enemies hover and prevent their feet from appearing planted. |
| Camera punch is limited to hits owned by or applied to the local player. | Nearby heavy and critical contacts contribute a strongly attenuated, budgeted camera impulse. | Visible large impacts need a shared spatial consequence, but ordinary bullet hits must remain quiet. |
| Start and stop feedback is mostly shadow deformation and a stop particle. | Starts receive one short stance compression; stops reuse the existing skid clock for a planted settle pose. | Fast response plus a brief planted pose reads as traction instead of sliding. |
| Recoil, target reaction, camera, VFX, audio, and haptics use related data but different envelopes. | One impact tier owns the contact hold, directional force, camera attenuation, VFX priority, audio duck, and haptic strength. | A single cause should produce one synchronized event, not several loosely timed effects. |

## Contracts

### 1. Player locomotion

- Simulation movement remains untouched.
- Start compression peaks inside 70 ms and is fully settled by 140 ms.
- Stop compression uses the existing 160 ms skid clock.
- No continuous procedural bob is added to authored specialist atlases.
- Reduced motion removes displacement, lean, compression, and camera movement.

### 2. Weapon release

- Signature recoil begins on the release frame, not the eventual hit frame.
- Recoil is directional and specialist-specific but capped at 5.6 world pixels.
- Recoil settles within the existing 90 ms muzzle-flash clock.
- Automatic weapons may retrigger recoil, so profiles stay subtle and do not
  add bounce or a second animation clock.

### 3. Contact

- Heavy and critical target reactions begin at their peak on the contact frame.
- Deformation is aligned to the incoming force axis.
- The contact pose is held only for the tier’s existing hit-stop duration.
- Recovery is monotonic and interruptible by the next impact.
- Ordinary repeated hits remain low-cost and never shake the camera at range.

### 4. Enemy bodies

- Authored atlas frames are authoritative for idle, locomotion, windup, contact,
  recovery, hurt, and death.
- Renderer sine waves cannot move an authored enemy body.
- Procedural fallback locomotion uses a small footfall envelope, not hovering.
- Stun jitter is short, bounded, and disabled by reduced motion.

### 5. Camera and density

- Local heavy impacts keep full authored camera force.
- Non-local heavy/critical impacts contribute only inside 640 world pixels and
  fall off quadratically.
- Crowded-state scaling and the existing impact intensity budget remain active.
- Camera displacement remains capped by the renderer’s existing spring.

### 6. Accessibility and performance

- Reduced motion preserves pose, flash silhouette, and combat information while
  removing body displacement, deformation, and camera force.
- Reduced flash continues to preserve non-color impact graphics.
- The pass adds no simulation entities and no unbounded particle collections.
- Runtime work is constant per visible actor or admitted impact.

## Validation

The release is acceptable only when:

1. Pure motion contracts pass deterministic unit tests.
2. The impact hierarchy, choreography, enemy-body, enemy-attack, combat-rhythm,
   specialist-motion, fixture, and soak gates pass.
3. Representative light, heavy, ranged, and specialist actions are inspected
   in live Canvas rendering at normal and reduced motion.
4. A dense fixture confirms ordinary impacts stay quiet while nearby heavy and
   critical contacts retain their punctuation.
5. The production build identity and cache graph match the shipped release.

