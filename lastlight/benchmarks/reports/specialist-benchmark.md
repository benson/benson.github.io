# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2960.234 | 10 | 2.05s | 13.3s | 0.133s | 26.017s | 0.201 | 0 | 80 |
| Echo | 30.756 | 3671.473 | 10 | 1.1s | 45s | 1.533s | 77.583s | 0.12 | 33.673 | 80 |
| Sola | 24.041 | 3197.108 | 13.75 | 2.4s | 45s | 6.767s | 49.05s | 0.088 | 0 | 80 |
| Bront | 24.27 | 3080.573 | 17.25 | 1.15s | 45s | 3.183s | 37.717s | 0.147 | 2.56 | 80 |
| Fang | 33.113 | 4461.535 | 13.8 | 0.017s | 45s | 2.683s | 15.667s | 0.756 | 0 | 80 |
| Gale | 23.092 | 2109.961 | 10.45 | 0.417s | 45s | 10.683s | 26.217s | 0.211 | 0 | 80 |
| Rift | 51.904 | 3867.052 | 12 | 0.383s | 45s | 16.35s | 61.917s | 0.195 | 0 | 80 |
| Nova | 32.919 | 2320.823 | 9 | 0.017s | 45s | 11.033s | 51.633s | 0.113 | 0 | 80 |
| Vesper | 30.789 | 2165.433 | 9.5 | 1.1s | 12.5s | 9.867s | 39.4s | 0.065 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (4461.535) · 2. Rift (3867.052) · 3. Echo (3671.473) · 4. Sola (3197.108) · 5. Bront (3080.573) · 6. Zuri (2960.234) · 7. Nova (2320.823) · 8. Vesper (2165.433) · 9. Gale (2109.961)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Echo (45) · 3. Fang (45) · 4. Gale (45) · 5. Nova (45) · 6. Rift (45) · 7. Sola (45) · 8. Zuri (13.3) · 9. Vesper (12.5)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.533) · 3. Fang (2.683) · 4. Bront (3.183) · 5. Sola (6.767) · 6. Vesper (9.867) · 7. Gale (10.683) · 8. Nova (11.033) · 9. Rift (16.35)
- **Apex time-to-kill:** 1. Fang (15.667) · 2. Zuri (26.017) · 3. Gale (26.217) · 4. Bront (37.717) · 5. Vesper (39.4) · 6. Sola (49.05) · 7. Nova (51.633) · 8. Rift (61.917) · 9. Echo (77.583)
- **Four-player damage share:** 1. Fang (0.756) · 2. Gale (0.211) · 3. Zuri (0.201) · 4. Rift (0.195) · 5. Bront (0.147) · 6. Echo (0.12) · 7. Nova (0.113) · 8. Sola (0.088) · 9. Vesper (0.065)
- **Four-player support score:** 1. Echo (33.673) · 2. Bront (2.56) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Echo: apexTtkSeconds is high at 1.969× median (77.583).
- Fang: apexTtkSeconds is low at 0.398× median (15.667).
- Rift: apexTtkSeconds is high at 1.571× median (61.917).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.47× median (3.183).
- Echo: eliteTtkSeconds is low at 0.227× median (1.533).
- Fang: eliteTtkSeconds is low at 0.396× median (2.683).
- Gale: eliteTtkSeconds is high at 1.579× median (10.683).
- Nova: eliteTtkSeconds is high at 1.63× median (11.033).
- Rift: eliteTtkSeconds is high at 2.416× median (16.35).
- Vesper: eliteTtkSeconds is high at 1.458× median (9.867).
- Zuri: eliteTtkSeconds is low at 0.02× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 1.448× median (4461.535).
- Vesper: pickupReach is high at 5× median (400).
- Vesper: soloSurvivalSeconds is low at 0.278× median (12.5).
- Zuri: soloSurvivalSeconds is low at 0.296× median (13.3).
- Fang: squadDamageShare is high at 5.143× median (0.756).
- Gale: squadDamageShare is high at 1.435× median (0.211).
- Sola: squadDamageShare is low at 0.599× median (0.088).
- Vesper: squadDamageShare is low at 0.442× median (0.065).
- Zuri: squadDamageShare is high at 1.367× median (0.201).

## Scenario matrix

- **Level 1 single target:** level 1, 1 player, 30s cap; singleTargetDps, ttkSeconds, effectiveVitality.
- **First ability unlock:** level 3, 1 player, 20s cap; areaDps, shieldGranted, controlEnemySeconds.
- **Ultimate unlock:** level 6, 1 player, 20s cap; areaDps, abilityDamage, abilityUptimeSeconds.
- **Mature signature and loadout:** level 20, 1 player, 30s cap; areaDps, signatureDamage, peakEffectiveVitality.
- **Travel and escape:** level 6, 1 player, 8s cap; travelDistance, escapeTimeSeconds.
- **Pickup and objective value:** level 20, 1 player, 6s cap; pickupReach, xpPickedUp, objectiveProgress.
- **Solo pressure:** level 20, 1 player, 45s cap; survivalSeconds, damageTaken, combatUptime.
- **Elite duel:** level 20, 1 player, 60s cap; ttkSeconds, damagePerSecond, survivalSeconds.
- **Apex duel:** level 20, 1 player, 90s cap; ttkSeconds, damagePerSecond, damageTaken.
- **Four-player contribution:** level 20, 4 players, 45s cap; teamDamageShare, shieldGranted, repairAllies.

## Limitations

- Fixed seeds and scripted inputs are deterministic comparisons, not confidence intervals or substitutes for human playtests.
- Stationary single-target and radial pack geometry deliberately isolate mechanics and can favor piercing, radial, or close-range damage shapes differently.
- Four-player contribution holds three allies to standardized mature loadouts and lets only the candidate cast abilities, improving attribution at the cost of realistic coordination.
- Shield and invulnerability contribution use immediate cast deltas; repair uses net positive health movement and can undercount healing that lands on the same tick as damage.
- Objective participation is intentionally identical when no specialist mechanic modifies capture rate; it documents the current lack of objective-specific differentiation.
- The report is diagnostic only. It does not approve balance changes or replace the immutable balance-version and fixture-migration process.
