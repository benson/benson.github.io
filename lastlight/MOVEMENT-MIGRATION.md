# Movement contract migration

`2026.07.11-movement.2` intentionally replaces the baseline direct-position movement contract and carries the vitality-scaled active-shield correction shipped in the same release.

- Replay manifests written by this build use `lastlight.replay.v3`. The compact eight-field input tuple and multiplayer protocol are unchanged. Validators still accept v1 and v2 manifests for inspection, but their old balance identity is not silently replayed through the new physics.
- Deterministic players now include velocity, input-direction, locomotion-facing, movement-mode, speed-ratio, and dash-recovery state. Recovery exports remain version 1 because they already serialize the complete player record and enforce the current balance identity.
- Fixture goldens were regenerated only after the new shared host/prediction integrator passed rate, role, facing, dash, recovery, and protocol tests. Changes to canonical state hashes are expected; structural budgets remain release gates.
- Reduced motion changes only lean, ground offset, and shadow presentation. It never changes movement, facing, dash recovery, replay state, or network input.
