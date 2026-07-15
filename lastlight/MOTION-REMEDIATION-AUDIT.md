# Specialist motion remediation audit

This review uses the BEN-908 contact sheets and transition previews as evidence,
then follows each finding into the runtime selection path. Static direction,
transparent bleed, anchor stability, and reduced-motion transforms passed for
all nine specialists. The table below records the defects and deliberate gaps
that remained after that baseline review.

## Findings

| Before | After | Why |
| --- | --- | --- |
| Moving auto-aim forced every body toward `movementFacing`, bypassing the simulation's authored aim/contact/hybrid policy. | `specialistFacingTarget` now consumes authoritative `entity.facing`; dash retains its explicit travel override (`motion.js:93`). The audit's moving nearest-threat scenario asserts the target-facing column (`motion-audit.js:128`, `tests/motion-audit.test.js:54`). | Nova, Echo, Zuri, and Gale are aim-facing specialists. Their sprites could look west while their attacks tracked east, which is the reproduced BEN-899 failure. |
| Zuri alone loaded a 1256-by-1255 prototype atlas with a five-row runtime contract. | The legacy source is deterministically promoted into `assets/motion-normalized/specialists/zuri.webp`; all nine specialists now use the validated four-by-six runtime contract (`themes/lastlight.js:197`, `tooling/motion_atlas_tool.py:99`). | One-off atlas geometry made Zuri easier to mis-wire and excluded her from the production normalization gate. Explicit source-row remaps preserve the existing art without inventing poses. |
| Revive and victory remain synthesized from existing physical poses for the whole roster. | No false upgrade: both logical clips remain `authored: false` (`themes/lastlight.js:215`). | The audit makes this visible, but fixing it honestly requires new authored character art. Metadata-only motion should not be labeled as completed animation. |
| `castE` and `castR` share each specialist's single action pose. | Kept as a documented physical-atlas limitation; the logical bindings remain stable. | Separating active and ultimate silhouettes requires new pose rows or a schema/art expansion. Changing timing alone would not create a meaningfully distinct read. |

## Verdict

### Feel-breaking regressions

The auto-aim facing override was a blocker because it made the character body
contradict the target and attack direction during ordinary movement. The fix is
policy-driven and covered by a moving runtime audit scenario rather than a
static image assertion.

### Origin, physicality, and cohesion

Zuri's prototype path was the only roster-level wiring exception. Promotion to
the shared runtime grid removes that exception while retaining the authored
silhouette, direction, and foot anchor.

### Accessibility

Reduced-motion continues to select the same semantic cells while removing
decorative translation, rotation, and squash. No simulation or facing behavior
changes under the accessibility setting.

**Decision: Approve the runtime wiring remediation after the deterministic
audit, atlas verification, and full test suite pass.** New revive, victory, and
separate E/R pose art remains a future art-authoring pass, not an unresolved
runtime defect.
