# Specialist identity contract

`specialist-identity.js` is the versioned, immutable design contract for all nine specialists. It describes mechanical intent—not selection-screen copy—and is pinned to balance version `2026.07.12-cover.1`.

Every entry has the same strict shape: role and specialization, effective range, mobility, durability, damage cadence and delivery, scaling, safety, control, support, objective value, failure modes, and intended breakpoints. Validation rejects unknown fields, missing specialists, invalid vocabulary, duplicate identifiers, and drift from base stats, movement profiles, unlock levels, cooldowns, ranges, or evolution passives.

| Specialist | Mechanical identity | Intended payoff | Principal failure mode |
| --- | --- | --- | --- |
| Zuri | Long-range ramping gunner | Converts kill tempo into an 8-second haste/damage window | No reset when enemies cross her range |
| Echo | Long-range squad support | Shields and accelerates allies; ultimate protects the squad and globally stuns | Long cooldown windows and ally-spacing requirement |
| Sola | Mid-range armor-scaling vanguard | Defensive investment adds area and signature damage | Slow rotation; weak return from builds that ignore defensive scaling |
| Bront | Mid-range sustain-zone controller | Holds ground with the largest raw body and stacking totem regeneration | Totems lose value when the squad relocates |
| Fang | Close-range missing-health brawler | Trades health margin for speed/damage, with frenzy mitigation and healing | Must maintain dangerous contact to deal damage and recover |
| Gale | Mid-range flow-gated duelist | A long dash refills high-crit piercing volleys | Signature stops while flow is below 100 |
| Rift | Close-range movement skirmisher | Turns speed, distance, and repeated dash entries into area pressure | Loses identity while stationary or trapped in a bad commitment |
| Nova | Long-range hex setup/cashout caster | Levels add wisps; Veilstep remotely detonates prepared hexes | Lowest raw durability outside invulnerability windows |
| Vesper | Long-range pickup/recall ranger | Converts wide XP collection and stored feathers into damage lanes | Recall produces nothing without live feathers |

## Breakpoints

- Level 3 unlocks each active; level 6 unlocks each ultimate.
- Signature rank 5 is the authored cap and enables evolution with the paired passive.
- Additional engine gates are explicit for Zuri (70 kills or one elite), Fang (missing-health curve), Gale (100 flow), Rift (120 units traveled), Nova (one wisp per seven levels), and Vesper (live stored feathers).
- Objective ratings are indirect. Every living specialist contributes equally to capture, relay-ball, and machine charge; identities add rotation, survival, control, or collection value, never a direct capture multiplier.

## Catalog/engine mismatches resolved during the audit

The first contract pass exposed five promises that the simulation did not execute. Build `2026.07.12.2` closes them and guards each behavior with regression coverage:

- Echo repeats compatible signature and universal-weapon projectiles at the authored 25% rate.
- Gale's Windwall destroys hostile shots and pushes enemies away while it travels.
- Rift converts a bounded portion of dealt damage into its short-lived shield.
- Zuri's Hot Streak stacks add movement speed, and Curtain Call scales against wounded targets.
- Sola doubles current armor and every delayed shield grant remains inside the shared active-shield cap.
