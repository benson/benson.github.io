import { getThemeAsset } from "./themes/lastlight.js?v=20260711.8";
import { BALANCE_CONFIG } from "./balance-config.js?v=20260712.8";

// One vitality point is one readable unit of player health. Standard specialists
// are balanced around 10; every hostile hit can therefore be discussed in hits-to-down.
export const BASE_VITALITY = BALANCE_CONFIG.core.baseVitality;

export const SPECIALISTS = {
  zuri: {
    id: "zuri", number: "01", name: "Zuri", role: "Gunner · ramping damage", tagline: "Faster is a kind of safer.",
    ...BALANCE_CONFIG.specialists.zuri, range: "Long", color: "#ff5c8a", sprite: getThemeAsset("specialists.zuri"),
    passive: ["Hot Streak", "Seventy kills or one elite triggers a burst of weapon haste and stacking speed."],
    active: ["Rocket Bloom", "Fire nine explosive rockets in a wide cone."],
    ultimate: ["Curtain Call", "Launch a massive execution rocket that deals more damage to wounded targets."],
    signature: { name: "Pulse Carbine", evolve: "Overdrive Barrage", passive: "haste", glyph: "PC", icon: getThemeAsset("weapons.signatures.zuri") },
  },
  echo: {
    id: "echo", number: "02", name: "Echo", role: "Support · projectile echo", tagline: "Every signal deserves an encore.",
    ...BALANCE_CONFIG.specialists.echo, range: "Long", color: "#66eee0", sprite: getThemeAsset("specialists.echo"),
    passive: ["Resonance", "Every weapon projectile has a 25% chance to repeat after a short delay."],
    active: ["Surround Sound", "Shield nearby allies and double their movement speed while it holds."],
    ultimate: ["Perfect Frequency", "Make the squad invulnerable and lock every enemy in place."],
    signature: { name: "Sound Wave", evolve: "Anima Echo", passive: "projectiles", glyph: "SW", icon: getThemeAsset("weapons.signatures.echo") },
  },
  sola: {
    id: "sola", number: "03", name: "Sola", role: "Vanguard · armor scaling", tagline: "Be the wall that moves.",
    ...BALANCE_CONFIG.specialists.sola, range: "Mid", color: "#f7c84b", sprite: getThemeAsset("specialists.sola"),
    passive: ["Daybreak", "Armor, maximum health, and regeneration increase every attack's area."],
    active: ["Eclipse Guard", "Double your armor and gain a shield that detonates twice."],
    ultimate: ["Solar Lance", "Call down a huge flare that damages and stuns enemies."],
    signature: { name: "Shield Beam", evolve: "Lion's Light", passive: "armor", glyph: "SB", icon: getThemeAsset("weapons.signatures.sola") },
  },
  bront: {
    id: "bront", number: "04", name: "Bront", role: "Summoner · sustain zones", tagline: "The city remembers the tide.",
    ...BALANCE_CONFIG.specialists.bront, range: "Mid", color: "#39d2cf", sprite: getThemeAsset("specialists.bront"),
    passive: ["Deep Current", "Allies regenerate health faster near each of Bront's mechanical totems."],
    active: ["Totem Crash", "Slam forward, knock enemies up, and plant a healing totem."],
    ultimate: ["Groundswell", "Leap and create a shockwave, then massively accelerate every weapon."],
    signature: { name: "Tidal Hammer", evolve: "Grizzly Surge", passive: "duration", glyph: "TH", icon: getThemeAsset("weapons.signatures.bront") },
  },
  fang: {
    id: "fang", number: "05", name: "Fang", role: "Brawler · missing-health power", tagline: "Keep the safety off.",
    ...BALANCE_CONFIG.specialists.fang, range: "Close", color: "#ef4b43", sprite: getThemeAsset("specialists.fang"),
    passive: ["Survival Drive", "Missing health grants up to 60% damage and 100% movement speed."],
    active: ["Break Restraint", "Dash into a six-second frenzy, auto-chasing targets and healing on every swipe."],
    ultimate: ["Redline", "Dive to the cursor with invulnerability and detonate on arrival."],
    signature: { name: "Rending Swipe", evolve: "Savage Slice", passive: "maxHealth", glyph: "RS", icon: getThemeAsset("weapons.signatures.fang") },
  },
  gale: {
    id: "gale", number: "06", name: "Gale", role: "Duelist · critical flow", tagline: "Stand still and the storm wins.",
    ...BALANCE_CONFIG.specialists.gale, range: "Mid", color: "#67d7ff", sprite: getThemeAsset("specialists.gale"),
    passive: ["Wanderer's Edge", "Permanently gain 15% critical chance."],
    active: ["Slipstream", "Gain a shield, dash to the cursor, and cut through everything in the path."],
    ultimate: ["Windwall", "Raise a moving wall that destroys hostile shots and knocks enemies away."],
    signature: { name: "Steel Current", evolve: "Wandering Storms", passive: "crit", glyph: "SC", icon: getThemeAsset("weapons.signatures.gale") },
  },
  rift: {
    id: "rift", number: "07", name: "Rift", role: "Skirmisher · movement damage", tagline: "Momentum is ammunition.",
    ...BALANCE_CONFIG.specialists.rift, range: "Close", color: "#e7c53e", sprite: getThemeAsset("specialists.rift"),
    passive: ["Kinetic Edge", "Close-range damage is stronger; a portion of all damage becomes a short-lived shield."],
    active: ["Vector Dash", "Dash forward, blast the landing zone, and stun enemies."],
    ultimate: ["Break Limit", "Double movement speed, reset Vector Dash, and empower the signature weapon."],
    signature: { name: "Kinetic Crash", evolve: "Golden Overrun", passive: "move", glyph: "KC", icon: getThemeAsset("weapons.signatures.rift") },
  },
  nova: {
    id: "nova", number: "08", name: "Nova", role: "Spirit runner · hex detonation", tagline: "There is always another way through.",
    ...BALANCE_CONFIG.specialists.nova, range: "Long", color: "#b68cff", sprite: getThemeAsset("specialists.nova"),
    passive: ["Spirit Wake", "Every seven levels summons a trailing wisp that damages and hexes enemies."],
    active: ["Veilstep", "Dash with invulnerability and detonate every hexed enemy."],
    ultimate: ["Between Spaces", "Leap forward and unleash an expanding pulse that strikes every enemy."],
    signature: { name: "Guiding Hex", evolve: "Hopped-Up Hex", passive: "xp", glyph: "GH", icon: getThemeAsset("weapons.signatures.nova") },
  },
  vesper: {
    id: "vesper", number: "09", name: "Vesper", role: "Ranger · pickup offense", tagline: "Everything comes back sharper.",
    ...BALANCE_CONFIG.specialists.vesper, range: "Long", color: "#c05cff", sprite: getThemeAsset("specialists.vesper"),
    passive: ["Magnetic Talons", "Massively increased pickup range; collected data motes damage enemies in flight."],
    active: ["Blade Recall", "Recall every dagger on the field through enemies."],
    ultimate: ["Bladestorm", "Become untargetable, accelerate, then release a radial storm of daggers."],
    signature: { name: "Winged Dagger", evolve: "Lover's Ricochet", passive: "pickup", glyph: "WD", icon: getThemeAsset("weapons.signatures.vesper") },
  },
};

export const SPECIALIST_ORDER = Object.keys(SPECIALISTS);

export const PASSIVES = {
  damage: { id: "damage", name: "Output", glyph: "DMG", amount: "+10% damage", max: BALANCE_CONFIG.passives.damage.max, color: "#ff6d56", icon: getThemeAsset("guide.passives.damage") },
  haste: { id: "haste", name: "Cycle Rate", glyph: "AH", amount: "+10 ability haste", max: BALANCE_CONFIG.passives.haste.max, color: "#63f2df", icon: getThemeAsset("guide.passives.haste") },
  maxHealth: { id: "maxHealth", name: "Hull", glyph: "HP", amount: "+1.5 max health", max: BALANCE_CONFIG.passives.maxHealth.max, color: "#ff6684", icon: getThemeAsset("guide.passives.maxHealth") },
  armor: { id: "armor", name: "Plating", glyph: "AR", amount: "+8 armor", max: BALANCE_CONFIG.passives.armor.max, color: "#f7d76a", icon: getThemeAsset("guide.passives.armor") },
  move: { id: "move", name: "Thrusters", glyph: "MS", amount: "+9% movement speed", max: BALANCE_CONFIG.passives.move.max, color: "#7be5ff", icon: getThemeAsset("guide.passives.move") },
  area: { id: "area", name: "Field Size", glyph: "AOE", amount: "+11% area size", max: BALANCE_CONFIG.passives.area.max, color: "#b68cff", icon: getThemeAsset("guide.passives.area") },
  crit: { id: "crit", name: "Critical Link", glyph: "CR", amount: "+8% critical chance", max: BALANCE_CONFIG.passives.crit.max, color: "#ffd265", icon: getThemeAsset("guide.passives.crit") },
  duration: { id: "duration", name: "Persistence", glyph: "DUR", amount: "+12% duration", max: BALANCE_CONFIG.passives.duration.max, color: "#66d5ff", icon: getThemeAsset("guide.passives.duration") },
  projectiles: { id: "projectiles", name: "Multishot", glyph: "+1", amount: "+1 projectile", max: BALANCE_CONFIG.passives.projectiles.max, color: "#e899ff", icon: getThemeAsset("guide.passives.projectiles") },
  xp: { id: "xp", name: "Data Gain", glyph: "XP", amount: "+10% experience", max: BALANCE_CONFIG.passives.xp.max, color: "#63f2df", icon: getThemeAsset("guide.passives.xp") },
  pickup: { id: "pickup", name: "Magnetics", glyph: "MAG", amount: "+35% pickup radius", max: BALANCE_CONFIG.passives.pickup.max, color: "#9bdcff", icon: getThemeAsset("guide.passives.pickup") },
  regen: { id: "regen", name: "Repair", glyph: "REG", amount: "+0.04 health per second", max: BALANCE_CONFIG.passives.regen.max, color: "#75efa2", icon: getThemeAsset("guide.passives.regen") },
};

export const WEAPONS = {
  uwu: { id: "uwu", name: "Needle Blaster", evolve: "Twin Needle Array", passive: "haste", glyph: "NB", icon: getThemeAsset("weapons.universal.uwu"), max: 5, copy: "Rapidly fires laser needles. Twin Needle redirects the same shot once toward a nearby unhit enemy for 70% damage." },
  slicers: { id: "slicers", name: "Cyclonic Slicers", evolve: "Unceasing Cyclone", passive: "regen", glyph: "CS", icon: getThemeAsset("weapons.universal.slicers"), max: 5, copy: "Orbiting razors damage and knock enemies back." },
  aura: { id: "aura", name: "Radiant Field", evolve: "Explosive Embrace", passive: "maxHealth", glyph: "RF", icon: getThemeAsset("weapons.universal.aura"), max: 5, copy: "A solar field continuously damages nearby enemies. Explosive Embrace erupts after eight occupied pulses." },
  mines: { id: "mines", name: "Arc Mines", evolve: "Tri-Mine Grid", passive: "area", glyph: "AM", icon: getThemeAsset("weapons.universal.mines"), max: 5, copy: "Deploy timed explosives in a ring. Tri-Mine Grid chains them in groups of up to three." },
  crossbow: { id: "crossbow", name: "Scatter Bow", evolve: "Prime Ballista", passive: "crit", glyph: "SB", icon: getThemeAsset("weapons.universal.crossbow"), max: 5, copy: "Fires a fan of piercing bolts. Prime Ballista finds the densest lane; its center bolt guarantees critical hits after three penetrations." },
  boomerang: { id: "boomerang", name: "Blade-o-rang", evolve: "Quad-o-rang", passive: "move", glyph: "BR", icon: getThemeAsset("weapons.universal.boomerang"), max: 5, copy: "Returning blades seek the nearest threat. Quad-o-rang can hit once per phase and gains up to 30% return damage from movement." },
  rail: { id: "rail", name: "Lioness Rails", evolve: "Enveloping Light", passive: "haste", glyph: "LR", icon: getThemeAsset("weapons.universal.rail"), max: 5, copy: "Fires paired horizontal crescents. Enveloping Light rotates the same opposing lanes to your current aim." },
  glove: { id: "glove", name: "Vortex Glove", evolve: "Tempest Gauntlet", passive: "regen", glyph: "VG", icon: getThemeAsset("weapons.universal.glove"), max: 5, copy: "A rotating stream of orbs cuts across the arena." },
  transit: { id: "transit", name: "Final City Transit", evolve: "Limited Express", passive: "damage", glyph: "FC", icon: getThemeAsset("weapons.universal.transit"), max: 5, copy: "Calls a high-speed train. Limited Express selects the densest horizontal lane and pushes non-boss targets forward into cover." },
  ice: { id: "ice", name: "Iceblast Armor", evolve: "Deep Freeze", passive: "armor", glyph: "IA", icon: getThemeAsset("weapons.universal.ice"), max: 5, copy: "Blocks one hit, then freezes nearby enemies." },
  annihilator: { id: "annihilator", name: "Annihilator", evolve: "Animapocalypse", passive: "xp", glyph: "AX", icon: getThemeAsset("weapons.universal.annihilator"), max: 5, copy: "Periodically clears a vast area." },
  drone: { id: "drone", name: "Yuum.AI Drone", evolve: "Yuum.AI Final", passive: "pickup", glyph: "AI", icon: getThemeAsset("weapons.universal.drone"), max: 5, copy: "A roaming drone attacks, gathers data, and drops repairs. Final converts every five gathered motes into an ally repair or a three-target chain protocol." },
};

for (const weapon of Object.values(WEAPONS)) weapon.max = BALANCE_CONFIG.core.maxWeaponLevel;

export const MAPS = {
  warehouse: {
    id: "warehouse", name: "Iron District", original: "Warehouse District", boss: "TUNNELMAW", mechanic: "Healing relay", 
    floor: "#101f2c", grid: "#183342", accent: "#50d9d1", edge: "#07121c", deco: "#173848",
    texture: getThemeAsset("environments.warehouse"),
  },
  outskirts: {
    id: "outskirts", name: "Ash Outskirts", original: "The Outskirts", boss: "RED HUNGER", mechanic: "Ion cannon",
    floor: "#27251f", grid: "#3c382b", accent: "#ffc56a", edge: "#14130f", deco: "#4e4938",
    texture: getThemeAsset("environments.outskirts"),
  },
  lab: {
    id: "lab", name: "Subzero Lab", original: "Subterranean Lab", boss: "VOID EMPRESS", mechanic: "Freeze cores",
    floor: "#101b2c", grid: "#192f49", accent: "#8ccfff", edge: "#070e19", deco: "#1e4160",
    texture: getThemeAsset("environments.lab"),
  },
  beachhead: {
    id: "beachhead", name: "The Beachhead", original: "The Beachhead", boss: "ABYSS BLADE", mechanic: "Rising ocean",
    floor: "#27202d", grid: "#443047", accent: "#f66a77", edge: "#130d17", deco: "#57334c",
    texture: getThemeAsset("environments.beachhead"),
  },
};

export const DIFFICULTIES = Object.fromEntries(Object.entries(BALANCE_CONFIG.difficulties).map(([id, tuning]) => [id, {
  id, name: id[0].toUpperCase() + id.slice(1), ...tuning,
}]));

export const ENEMY_TYPES = {
  mite: { id: "mite", name: "Skitter", ...BALANCE_CONFIG.enemies.mite, color: "#ff7658", shape: 3, icon: getThemeAsset("guide.enemies.mite") },
  hound: { id: "hound", name: "Rusher", ...BALANCE_CONFIG.enemies.hound, color: "#ffad53", shape: 4, icon: getThemeAsset("guide.enemies.hound") },
  spitter: { id: "spitter", name: "Spitter", ...BALANCE_CONFIG.enemies.spitter, color: "#c36cff", shape: 6, ranged: true, icon: getThemeAsset("guide.enemies.spitter") },
  brute: { id: "brute", name: "Brute", ...BALANCE_CONFIG.enemies.brute, color: "#e84a67", shape: 6, icon: getThemeAsset("guide.enemies.brute") },
  bomber: { id: "bomber", name: "Bomber", ...BALANCE_CONFIG.enemies.bomber, color: "#ffd45d", shape: 5, bomber: true, icon: getThemeAsset("guide.enemies.bomber") },
  shark: { id: "shark", name: "Siegebreaker", ...BALANCE_CONFIG.enemies.shark, color: "#ff5575", shape: 5, miniboss: true, icon: getThemeAsset("guide.enemies.shark") },
};

export const MAP_OBSTACLES = [
  [-1450,-840,360,140],[-1040,-1040,170,260],[-540,-920,310,90],[620,-1050,420,150],[1250,-760,220,330],
  [-1570,650,300,220],[-950,880,430,105],[-220,1030,280,110],[580,850,180,260],[1130,790,390,130],
  [-1640,-170,180,300],[1480,-130,150,360],[-640,280,220,80],[720,-300,260,86],
];

export const WAVE_NAMES = BALANCE_CONFIG.waves.names;

export const BOONS = [
  { name: "Cruise Control", copy: "Massive movement speed for 15 seconds.", icon: getThemeAsset("archive.boons.cruiseControl") },
  { name: "Fired Up", copy: "Strong fireballs hunt the nearest enemy.", icon: getThemeAsset("archive.boons.firedUp") },
  { name: "Healthback", copy: "Every kill restores a little health.", icon: getThemeAsset("archive.boons.healthback") },
  { name: "Squad Shield", copy: "The whole squad gains a massive shield.", icon: getThemeAsset("archive.boons.squadShield") },
  { name: "Stopwaves", copy: "Periodic shockwaves freeze nearby enemies.", icon: getThemeAsset("archive.boons.stopwaves") },
  { name: "Ultra Rapid Fire-r", copy: "Massively increased weapon and ability haste.", icon: getThemeAsset("archive.boons.ultraRapidFire") },
];

export const AUGMENTS = [
  { id: "glass", name: "Glass Cannon", copy: "+40% damage, −30% maximum health.", icon: getThemeAsset("archive.augments.glassCannon") },
  { id: "bullet", name: "Bullet Mania", copy: "−15% damage; gain a projectile every six levels.", icon: getThemeAsset("archive.augments.bulletMania") },
  { id: "collector", name: "Card Collector", copy: "Each access key grants +5% damage.", icon: getThemeAsset("archive.augments.cardCollector") },
  { id: "celebration", name: "Celebration!", copy: "Level-ups trigger eight seconds of extreme stats.", icon: getThemeAsset("archive.augments.celebration") },
  { id: "crosscountry", name: "Cross Country", copy: "Distance traveled permanently raises damage, health, and area.", icon: getThemeAsset("archive.augments.crossCountry") },
  { id: "deathTax", name: "Death & Taxes", copy: "Kills can explode and drop bonus gold.", icon: getThemeAsset("archive.augments.deathAndTaxes") },
  { id: "elite", name: "Elite Bomber", copy: "+30% elite damage; slain elites leave a massive bomb.", icon: getThemeAsset("archive.augments.eliteBomber") },
  { id: "experienced", name: "Experienced Fighter", copy: "+10% data gain; pickups grant brief damage and speed.", icon: getThemeAsset("archive.augments.experiencedFighter") },
  { id: "larger", name: "Larger Than Life", copy: "+30% size, repair, and health; −15% movement speed.", icon: getThemeAsset("archive.augments.largerThanLife") },
  { id: "long", name: "Long Range", copy: "Deal up to 30% more damage at long distance.", icon: getThemeAsset("archive.augments.longRange") },
  { id: "metabolic", name: "Metabolic Overdrive", copy: "Heal 20% health each second, but lose 60% max health.", icon: getThemeAsset("archive.augments.metabolicOverdrive") },
  { id: "critical", name: "Mission Critical", copy: "+10% crit and +25% crit damage; weak non-crits.", icon: getThemeAsset("archive.augments.missionCritical") },
  { id: "spray", name: "Spray & Pray", copy: "+4 projectiles, −35% damage.", icon: getThemeAsset("archive.augments.sprayAndPray") },
  { id: "uptime", name: "Uptime Upgrade", copy: "+60% duration.", icon: getThemeAsset("archive.augments.uptimeUpgrade") },
  { id: "withhaste", name: "With Haste", copy: "Every two ability haste grants 1% movement speed.", icon: getThemeAsset("archive.augments.withHaste") },
];

export function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
