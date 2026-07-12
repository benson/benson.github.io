# Specialist benchmark harness

The specialist benchmark is a deterministic audit surface for the current immutable balance
contract. It runs actual `Simulation` updates, casts, upgrades, weapon logic, enemy behavior,
pickups, and objectives. It does not duplicate damage formulas or change gameplay state outside
its isolated benchmark simulations.

## Commands

```powershell
npm run benchmarks:specialists
npm run benchmarks:specialists:verify
npm run benchmarks:specialists:update
```

- The default command runs the matrix and prints leading rankings and flagged outliers.
- `verify` regenerates the report in memory and byte-compares it with both committed artifacts.
- `update` rewrites the committed JSON and Markdown after an intentional balance or harness change.

Reports contain no wall-clock timestamp or machine-dependent timing. Fixed seeds, scenario order,
metrics, structural budgets, final state hashes, rankings, and Markdown are byte-repeatable. Runtime
milliseconds are advisory CLI output only.

## Matrix

Every specialist runs through ten fixed-seed cases:

1. level-1 single-target damage and actual TTK;
2. the first E unlock against a durable pack;
3. the full E/R kit at ultimate unlock;
4. an evolved signature with a standardized mature loadout;
5. travel and escape with the real movement/cast APIs;
6. measured pickup reach and objective participation;
7. durable hard-mode solo pressure;
8. an actual elite duel;
9. an actual apex duel;
10. four-player contribution beside three standardized mature allies.

The harness records DPS, damage sources, TTK, effective vitality, survival and damage taken,
travel/escape, combat and ability uptime, enemy-control seconds, direct shield/invulnerability
cast deltas, attributable Bront repair, pickup reach, experience, and objective progress.

## Interpretation

This is an audit instrument, not an automatic balance authority. Scripted inputs and fixed geometry
make comparisons repeatable while intentionally exposing range, burst, piercing, radial, mobility,
and support breakpoints. Read the limitations in the report before proposing tuning. Any accepted
tuning still belongs in a new immutable balance version with fixture migration and full release QA.

## Starting-signature breakpoint matrix

`signature-breakpoint-benchmark.js` isolates each starting signature at rank 1, rank 3,
rank 5, rank 5 plus its paired passive, and evolved rank 5. Every state uses paired fixed
seeds across single-target, frontal-area, first-activation burst, and clear-lane range probes.
The report records the exact finite differences for rank scaling, the paired passive, and
evolution without applying any balance changes.

```powershell
npm run benchmarks:signatures
npm run benchmarks:signatures:verify
npm run benchmarks:signatures:update
```

Committed artifacts live at `benchmarks/reports/signature-breakpoints.json` and
`benchmarks/reports/signature-breakpoints.md`. The JSON schema is strict and versioned;
unknown metrics, stale balance identity, malformed deltas, and structural budget drift fail CI.
