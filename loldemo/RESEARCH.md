# League of Legends Swarm — implementation research

Research target: the original July 17–August 19, 2024 release of **Swarm | Operation: Anima Squad** in patch 14.14, not later fan summaries or unrelated uses of “swarm.” This document is a mechanical reference for the original game and a coverage record for the browser prototype.

## Sources and confidence

Primary sources:

- [Riot patch 14.14 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-14-notes/) — launch date, limited-time window, high-level loop.
- [Riot: Swarm, Arena, and the Value of Game Modes](https://www.riotgames.com/en/news/riot-game-modes-2024) — design intent, co-op emphasis, four-map campaign and difficulty goals.
- [Riot: The Tech Behind Swarm](https://www.riotgames.com/en/news/the-tech-behind-swarm) — server-authoritative architecture, hundreds of minions, data-authored wave parameters, player/difficulty scaling, flow-field pathfinding, buff batching.
- [Riot Legal Jibber Jabber](https://www.riotgames.com/en/legal) — publishing constraint: Riot expressly disallows using its characters, art, maps, icons, or other IP in an unauthorized game/app, even if the project is free.

Detailed secondary sources:

- [League of Legends Wiki: Swarm](https://leagueoflegends.fandom.com/wiki/Swarm_%28League_of_Legends%29) and its nine fighter subpages — exact roster stats, abilities, unlocks, passives, queue structure, maps, upgrades, revives, access cards, objectives, difficulty multipliers, boss timer, weapon summary, and augments.
- [League of Legends Wiki: Swarm weapons](https://leagueoflegends.fandom.com/wiki/Swarm_%28League_of_Legends%29/Weapons) — detailed level-by-level weapon values and evolutions.
- [Mobalytics map guide](https://mobalytics.gg/lol/guides/swarm-map-guide) — corroborating map layout/strategy and map-machine behavior.

The wiki is community-maintained rather than an official specification, but it preserves substantially more exact numeric data than Riot's public articles. Where exact authored wave tables were not published, this document says so rather than inventing precision.

## Core identity and controls

- Genre: 1–4 player co-op PvE “bullet heaven,” explicitly inspired by Vampire Survivors.
- Setting: Anima Squad fighters defend Final City from Primordians.
- Movement: WASD.
- Aim: cursor direction; C toggles automatic aim.
- Active inputs: E for a short/moderate-cooldown champion ability, unlocked at level 3; R for a long-cooldown ultimate, unlocked at level 6.
- Weapons attack automatically and separately from E/R abilities.
- No fog of war.
- Win condition: survive to 15:00 game time, then kill the map boss.
- Typical real duration: 20–25 minutes after selection pauses and the boss fight.
- Fighter level cap: 99.

## Queues, modes, progression

Queue types:

1. **Co-Op / XvE:** solo or a premade party of 2–4; party leader selects map and difficulty.
2. **Matchmade / 4vE:** any party size enters a four-player queue on a random map. Unlocks after all Story maps; always uses Hard difficulty.

Fighter selection is free-pick and duplicate fighters are allowed.

The campaign is one persistent line across three difficulty boards:

| Difficulty | Enemy health | Attack damage | Spell damage | Ally gold |
|---|---:|---:|---:|---:|
| Story | 1× | 1× | 1× | 1× |
| Hard | 3× | 2× | 1.5× | 1.5× |
| Extreme | 7× | 3× | 2× | 2.25× |

Enemy count, attack count, and some ability rates/speeds also increase with player count and difficulty. Story completion unlocks Hard; defeating all four maps on Hard unlocks Extreme. Defeating Extreme Aatrox with all nine fighters awarded the “Swarm Conqueror” title.

Objectives unlock maps, fighters, passive slots/types, weapons, augments, upgrade categories, and other rewards. Gold persists whether a run wins or loses and buys permanent starting-stat upgrades.

### Fighter unlocks

- Jinx and Seraphine: available by default.
- Leona: obtain Searing Shortbow level 2.
- Illaoi: obtain Radiant Field level 4.
- Briar: complete The Outskirts on Story.
- Yasuo: complete Subterranean Lab on Story.
- Riven: complete The Outskirts on Hard (or own the 2024 event pass shortcut).
- Aurora: defeat 25 elites on Hard.
- Xayah: complete 20 Bel'Veth trials on Hard.

## Run economy and selection rules

- Enemies drop EXP orbs. Leveling pauses game time and offers each player up to three random choices from weapons and passive stats.
- Players had 30 seconds to choose. The run resumed early once everybody locked in, with roughly a one-second slow resume.
- Every level-up awarded 10 gold.
- Passives are repeatable five-level stat upgrades. The initial passive-slot limit is three; objectives raise it to six.
- Fighters begin with a signature weapon and fill the remaining weapon slots with shared-pool weapons.
- A weapon normally reaches level 5, then evolves only when the player also owns its matching passive and collects an Access Card.
- Elites and mini-bosses drop Access Cards. A card gives every teammate a one-choice selection and can offer an eligible evolution.
- With nothing left to upgrade, card/level selections become either 25% team healing or 25 team gold.

### In-run passives

| Passive | Amount per level |
|---|---:|
| Ability Haste | +10 |
| Area Size | +11% |
| Armor | +8 |
| Critical Chance | +8% |
| Damage | +10% |
| Duration | +12% |
| EXP | +10% |
| Health Regen | +4 |
| Max Health | +150 |
| Move Speed | +9% |
| Pickup Radius | +35% |
| Projectile Count | levels grant +1 / +1 / +2 / +2 / +3 |

### Permanent lobby upgrades

| Upgrade | Increment | Max level |
|---|---:|---:|
| Damage | +10% | 8 |
| Armor | +5 | 5 |
| Max Health | +10% | 5 |
| Health Regen | +3 | 5 |
| Movement Speed | +5% | 4 |
| Pickup Radius | +25% | 3 |
| Area Size | +5% | 4 |
| Duration | +5% | 4 |
| Critical Chance | +5% | 4 |
| Ability Haste | +5 | 5 |
| EXP | +5% | 5 |
| Projectiles | +1 | 2 |
| Gold Multiplier | +15% | 3 |
| Battle Bunny Boon Duration | +25% | 2 |

## Nine original fighters

The “browser analogue” column records the mechanically equivalent original character in Lastlight. It is not a claim of Riot affiliation.

### Jinx → Zuri

- Base: 1000 health, 0 armor.
- Passive — Get Excited!: every 70 normal kills or one elite grants +150 haste for 8 seconds and stacking movement speed that decays over the buff.
- E — Fishbones! (8s): nine-plus-projectile-count rockets fan through a 90° cone; each explodes in a 300-radius; damage scales as 49 + 6 per level.
- R — Super Mega Death Rocket! (50s): 2000-range rocket, 600-radius explosion, true damage from 450 + 50/level up to 1500 + 30/level based on target missing health.
- Signature: Meow Meow, 3/4/5/6/7 bullet clusters every 2.5s. Ability Haste passive enables Battle Cat Barrage: 1.25s cycle and piercing follow-through damage.

### Seraphine → Echo

- Base: no special values listed on the archived fighter page; effectively the 1000-health/0-armor ranged baseline.
- Passive — Stage Presence: every weapon projectile has a 25% chance to repeat after 0.25s from Seraphine's new position.
- E — Surround Sound (16s): 800-radius team shield for 345 + 5/level; +100% movement while the three-second shield remains.
- R — The Perfect Note (90s): massive-radius effect, three seconds of team invulnerability; enemies are knocked down, rooted, and forced to dance for 2.5s.
- Signature: Sound Wave fires 1–5 piercing/slowing waves on a 3→2s cycle. Projectile Count enables Anima Echo: six waves that rebound toward Seraphine.

### Leona → Sola

- Base: 1000 health, 25 armor.
- Passive — Sunlight: Armor, max health, and regen add Area Size (0.03% per armor, 0.001% per health, 0.075% per regen).
- E — Eclipse (17s): doubles armor and grants a 25%-max-health shield for three seconds; it explodes for 160 + 15/level, refreshes, and lasts two more seconds.
- R — Solar Flare (80s): delayed targeted AoE, 180 + 20/level damage and a three-second stun.
- Signature: Shield Slam fires an armor-scaling cone beam every 2.75→1.75s. Armor enables Light of the Lion (1.5s), which marks targets with Sunlight for allied weapons to detonate.

### Illaoi → Bront

- Base: 1500 health, 15 armor.
- Passive — Primordian Resilience: allies near each tentacle gain +10 health regen per tentacle.
- E — Tentacle Smash: two stored charges, 12s recharge; forward 825-range slam deals 100 + 5/level, knocks up 1.5s, and creates a tentacle at its endpoint.
- R — Leap of Faith (90s): leap/slam for 490 + 10/level in an AoE and +150 haste for eight duration-scaled seconds.
- Signature: Tentacle Slam hits around an impact every 5→4s and places tentacles every 7/6/5/4/3 attacks. Duration enables Grizzly Smash, a stronger multi-slam tentacle pattern.

### Briar → Fang

- Base: 1200 health, 15 armor.
- Passive — Survival Instincts: missing health gives up to +60% damage and +100% movement.
- E — Fish Frenzy / Survival Scream (17s): initial dash, six duration-scaled seconds of forced pursuit and signature attacks, +250 signature haste, 25% damage reduction (50% below half health), and 10 + 5% missing-health healing per swipe; the ending scream damages/knocks back.
- R — Dive Bomb (120s): sends a gemstone anywhere on the map, then invulnerably dashes there and explodes for 140 + 10/level.
- Signature: Pillory Swipe makes two wide max-health-scaling arcs every 2→1.6s. Max Health enables Savage Slice, adding an eight-second bleed ticking every 0.25s.

### Yasuo → Gale

- Base: 1000 health, 10 armor.
- Passive — Way of the Wanderer: permanent +15% crit chance.
- E — Sweeping Blade: two charges, 10s recharge; gains a 150 + 10%-max-health shield, dashes 475, damages enemies crossed, then slices the landing area.
- R — Wind Wall (25s): a moving five-second wall; impassable to enemies, knocks them back, and destroys enemy projectiles from either side.
- Signature: Steel Tempest gains 25 Flow/second, 100 on dash, and 3 per critical hit. At 100 Flow it fires 1/3/3/5/5 whirlwinds. Critical Chance enables Wandering Storms, adding two perpendicular whirlwinds.

### Riven → Rift

- Base: 1000 health, 20 armor.
- Passive — Runic Blade: up to 15% damage based on closeness, scaled by Area Size; 25% of damage becomes a one-second shield with a per-instance cap.
- E — Valor (8s): 250 dash, landing blast for 135 + 15/level, two-second duration-scaled stun.
- R — Blade of the Exile / Wind Slash (100s): 15 duration-scaled seconds of +100% movement, resets Valor, and empowers the signature finisher.
- Signature: Bunny Hop gains 8 Charge per 25 units traveled and 5/10/15/20/25% movement. At 100 Charge, deals movement/area-scaling circular damage. Move Speed enables Carrot Crash with a second impact.

### Aurora → Nova

- Base: 1000 health, 0 armor.
- Passive — Spirit Abjuration: one trailing spirit every seven levels; spirits damage/slow nearby enemies and apply Hexed.
- E — Across the Veil (15s): 250 dash, brief cast lockout, 2.5 duration-scaled seconds of invulnerability and +25% total speed; purges all Hexed targets for bonus damage.
- R — Between Worlds (90s): untargetable leap, then an expanding energy pulse for 135 + 15/level.
- Signature: Guiding Hex fires 1/2/2/3/3 steerable radial bolts with repeat passes and Hexed. EXP enables Hopped-Up Hex with six-plus-projectile-count bolts.

### Xayah → Vesper

- Base: 1000 health, 0 armor.
- Passive — Battle Bat Engage: +1000 pickup radius; attracted EXP and gold act as damaging projectiles. Every 200 pickups triggers 15 duration-scaled seconds of +80 haste, +30% crit, and extra signature daggers.
- E — Bladecaller (13s): after 0.25s, recalls every dagger in a 3000-radius; each deals 54 + 6/level through enemies.
- R — Bladestorm (90s): two seconds untargetable/ghosted with +200% movement; lands with 12 + 3×projectile-count radial daggers, each dealing 55 + 5/level.
- Signature: Winged Dagger fires 1/1/2/2/2 plus projectile-count piercing daggers every 2.5→2s. Pickup Radius enables Lover's Ricochet and a gilded dagger that collects pickups and has infinite enemy pierce.

## Shared weapons and evolution pairs

The archived detailed weapon page lists these twenty shared-pool weapons (some launch-day articles said nineteen):

| Weapon | Base behavior | Evolution requirement | Evolution |
|---|---|---|---|
| Ani-Mines | Timed mines in a ring | Area Size | Jinx's Tri-Namite; primary blasts create secondary clusters |
| Anti-Shark Sea Mine | Bouncing mine | Damage | Neverending Mobstomper; keeps bouncing while targets exist |
| Battle Bunny Crossbow | Random-direction fan; crits pierce | Critical Chance | Bunny Prime Ballista; large knife fan |
| Blade-o-rang | Returning nearest-target blades | Move Speed | Quad-o-rang; splits/explodes into smaller blades |
| Bunny Mega-Blast | Random orbital strikes | Critical Chance | Rapid Rabbit Raindown; barrage ending in a huge strike |
| Cyclonic Slicers | Orbiting damage/knockback razors | Health Regen | Unceasing Cyclone; permanent orbit |
| Echoing Batblades | Terrain-bouncing piercing spikes | Projectile Count | Vayne's Chromablades; damage grows per bounce |
| Final City Transit | Periodic pet trains | Damage | FC Limited Express; explosions, knockups, gold chance |
| Gatling Bunny-Guns | Cone damage over time | Duration | Double Bun-Bun Barrage; slow then stun |
| Iceblast Armor | Blocks one hit then freezes nearby | Armor | Deep Freeze; shield plus freeze on gain and break |
| Lioness's Lament | Opposed horizontal crescents | Ability Haste | Enveloping Light; opposed light beams |
| Paw Print Poisoner | Poison trail while moving | Move Speed | Bearfoot Chem-Dispenser; speed stacks and damage-based shield |
| Radiant Field | Persistent close solar damage | Max Health | Explosive Embrace; enemies dying inside erupt |
| Searing Shortbow | Random scorched ground zones | Area Size | Evolved Embershot; zones grow in size/damage |
| Statikk Sword | Chain lightning prioritizing high health | Max Health | Prumbis's Electrocarver; struck targets create storms |
| T.I.B.B.E.R.S | Robo-bear pet prioritizing highest current health | Duration | B.E.E.G Edition; larger, faster, stronger pet |
| The Annihilator | Long-cooldown screen clear | EXP | Animapocalypse; bigger EXP and gold chance |
| UwU Blaster | Rapid nearest-target laser | Ability Haste | OwO Blaster; fires twice as fast |
| Vortex Glove | Clockwise rotating piercing-orb stream | Health Regen | Tempest's Gauntlet; second counter-clockwise stream |
| YuumiBot | Pet drone damages, knocks up, and gathers EXP | Pickup Radius | YuumiBot_Final_FINAL; drops healing after enough damage |

## Maps, machines, and bosses

Map order and unlock chain:

1. **Warehouse District** → Primordian Rek'Sai. Central Healing Fountain charges faster with more teammates and heals the entire team for 50% max health, then enters a long cooldown.
2. **The Outskirts** → Primordian Briar. Fuel Cells spawn around the map; carry one to the Ion Cannon to activate 30 seconds of large-area laser fire.
3. **Subterranean Lab** → Primordian Bel'Veth. Two freeze cores on opposite ends of the map charge while occupied and stun enemies in a large radius.
4. **The Beachhead** → Primordian Aatrox, two phases. Commander Fortune roams and attacks independently. After Aatrox phase one, the Primordian Ocean floods west until half the map is submerged; contact deals 50 damage every 0.165s.

At exactly 15:00, the boss replaces the normal objective. Five minutes after a boss spawns it enrages for 30 seconds at +20% damage; if still alive afterward it emits a lethal nova. Aatrox resets that five-minute clock for phase two.

## Environment, objectives, and co-op failure

### Pods

Destructible pods have 100 health and randomly drop:

- a small amount of gold;
- a team healing pack restoring 20% max health;
- a six-duration-scaled-second vacuum that gathers all EXP and gold on the map;
- a Sea Mine pickup that deals massive damage in a 600-radius.

### Spires

Randomly timed spires are captured faster with more teammates:

- **Commander Fortune boost:** simply capture; rewards a normally 15-second Battle Bunny Boon.
- **Assistant Yuumi quest:** capture, then complete a playful mini-game; rewards the whole squad a permanent run Augment, usually with an upside and downside.
- **Primordian Bel'Veth trial:** capture, then survive a negative battlefield effect or special wave and complete its combat task; rewards a huge EXP orb, gold, and multiple Access Cards.

Known Battle Bunny Boons: Cruise Control (movement), Fired Up (nearest-target fireballs), Health Back Healthpack (kill healing), Primordian Pickpocketing (periodic gold drops from kills), Squad Shield, Stopwaves (freezing shockwaves), and Ultra Rapid Fire-r (huge haste).

### Revival

- In co-op, lethal damage creates a ten-second downed window and a revival ring.
- A teammate stands in the ring to revive; the revived player receives four seconds of invulnerability and returns at 50% health.
- If the ring expires, automatic respawn starts at 15 seconds, adding nine seconds per death up to 60 seconds on death five and later.
- If every teammate is downed simultaneously, the run ends.

## All 33 Yuumi-quest Augments

An asterisk marks augments the wiki records as available by default.

1. **Armor Up:** taking a damage instance grants +5 armor for seven seconds, stacking to ten (+40 maximum as recorded) and refreshing; all stacks fall together.
2. **Bite Sized\*:** −30% size, −20% total health, +20% move speed, +36 haste.
3. **Bullet-Mania:** −15% damage; +1 projectile every six later level-ups.
4. **Card Collector\*:** every later Access Card grants +5% damage.
5. **Celebration!:** eight seconds after level-up: +50% damage/speed, +60% area, +50 haste.
6. **Circle of Stats:** cycles every eight seconds through +30% speed, +40 haste, +60% area, +3 projectiles, +40 regen.
7. **Critical Expansion:** critical damage instances grant +1% area for five seconds, up to 100 stacks.
8. **Cross Country:** every 20,000 units traveled gives +3% damage, max health, and area.
9. **Death and Taxes\*:** kills have a 2% chance to explode in 200 radius and drop gold.
10. **Ebb And Flow\*:** oscillates between −50 and +125 haste at about 22 haste per two seconds.
11. **Elite Bomber:** +30% elite damage; slain elites leave a delayed massive bomb.
12. **Emotional Support Pet:** pets gain +50% damage.
13. **Experienced Fighter:** +10% EXP; each orb grants stacking +2% damage/speed for four seconds.
14. **Gathering Speed\*:** −15% total speed, then +3% speed per later level-up.
15. **Glass Cannon\*:** +40% damage, −30% max health.
16. **Heavy Hitter\*:** +50% damage, −30 haste.
17. **Hoarder\*:** each gold picked up heals 0.5% max health.
18. **Immobile Immolation:** every 0.5s standing still costs increasing health and grants 20 haste; moving removes the bonus.
19. **Juggernaut:** +10 armor; every armor grants +0.5% damage.
20. **Larger Than Life\*:** +30% size/regen/max health, −15% total speed.
21. **Long Range\*:** up to +30% damage at long distance.
22. **Metabolic Overdrive\*:** heal 20% max health each second, but lose 60% max health.
23. **Mission Critical:** +10% crit and +25% critical damage; non-crits deal 20% less.
24. **Pescatarian\*:** kills have a 25% chance to drop healing.
25. **Pick-Me-Up\*:** lose pickup radius, gain +15% EXP, vacuum the map every 60 seconds.
26. **Point Blank\*:** up to +20% damage at close range.
27. **Ramming Runner\*:** +10% speed; each later 1% bonus speed adds 0.5% damage (and reverses when speed is lost).
28. **Regenerative Tissue:** healing packs permanently grant +5 regen.
29. **Size Scrambler:** each cast gets random −20% to +60% area; the modifier cycles over time.
30. **Spray and Pray:** +4 projectiles, −35% damage.
31. **Ultimate Speed-Up\*:** ultimate gets +100 haste.
32. **Uptime Upgrade\*:** +60% duration.
33. **With Haste\*:** every two haste grants +1% speed.

## What is and is not known about wave progression

Riot confirms that waves were authored as data controlling spawn/despawn time, enemy identity, count, frequency, position, and formation; most parameters could scale by player count and difficulty. The detailed public wiki only states that waves begin immediately and increase in enemy count and tier. I did not find a reliable public minute-by-minute table of the shipped wave data. Claims that invent exact universal minute marks beyond elite/quest anecdotes are therefore lower confidence.

For the prototype, the normalized progression is:

- contact: basic melee enemies;
- pressure: fast rushers;
- pincer: heavy enemies and first elite;
- heavy signal: ranged threats;
- breach: bombers and first mini-boss;
- black tide: dense mixed waves and second objective;
- last stand: maximum mixed density;
- apex: map boss, projectile patterns, enrage clock, and Beachhead phase-two flood.

The 4-minute Field Test preserves those proportions; Original Pacing runs the same progression over 15 minutes.

## Prototype coverage

| System | Current browser build |
|---|---|
| 1–4 player room-code co-op | Implemented with host-authoritative WebSocket relay |
| Solo / premade lobby | Implemented |
| Matchmade random-map queue | Not implemented; room code is the demo target |
| Nine mechanically distinct fighters | Implemented as original-IP analogues |
| E at level 3 / R at level 6 | Implemented |
| Auto/manual aim toggle | Implemented |
| Shared selection pause | Implemented; team-shared EXP for demo simplicity |
| Five-level weapons + passive-gated Access Card evolution | Implemented |
| Full shared weapon pool | Twelve representative weapons implemented; remaining eight documented |
| Passive slots / exact passive increments | Implemented in run choices |
| Permanent meta-upgrade shop | Not yet; gold is tracked for the next feedback pass |
| Yuumi quests / augments | Objective/boon skeleton implemented; full 33-augment selection not yet wired |
| Bel'Veth trials | Implemented as optional survival spires with EXP/gold/cards |
| Pods and four drop classes | Implemented |
| Map machines | Implemented in normalized form; Outskirts fuel carrying is simplified to capture charging |
| All four bosses | Four identities and distinct patterns implemented; original boss move scripts are simplified |
| Beachhead two-phase flood | Implemented |
| Downed/revive/respawn | Implemented with original timers |
| Story/Hard/Extreme numeric multipliers | Implemented |
| 15:00 survival and 5:00+0:30 boss enrage | Implemented; optional 4:00 field-test pacing added |

## Publishing/IP decision

Riot's current Legal Jibber Jabber grants broad room for free fan creations but separately says not to use Riot IP in a game or app and specifically lists character appearance, abilities, maps, icons, and items. Because this demo is public and interactive, the shipped game uses original character names, artwork, map names, enemy visuals, and UI. The research document retains the real names as factual commentary. No Riot art is bundled.
