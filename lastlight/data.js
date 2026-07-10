export const SPECIALISTS = {
  zuri: {
    id: "zuri", number: "01", name: "Zuri", role: "Gunner · ramping damage", tagline: "Faster is a kind of safer.",
    health: 1000, armor: 0, speed: 285, range: "Long", color: "#ff5c8a", sprite: "assets/sprites/zuri.png",
    passive: ["Hot Streak", "Seventy takedowns or one elite triggers a burst of weapon haste and stacking speed."],
    active: ["Rocket Bloom", "Fire nine explosive rockets in a wide cone."],
    ultimate: ["Curtain Call", "Launch a massive execution rocket that deals more damage to wounded targets."],
    signature: { name: "Pulse Carbine", evolve: "Overdrive Barrage", passive: "haste", glyph: "PC", icon: "assets/weapons/signature-zuri.webp" },
    cooldownE: 8, cooldownR: 50,
  },
  echo: {
    id: "echo", number: "02", name: "Echo", role: "Support · projectile echo", tagline: "Every signal deserves an encore.",
    health: 1000, armor: 0, speed: 275, range: "Long", color: "#66eee0", sprite: "assets/sprites/echo.png",
    passive: ["Resonance", "Every weapon projectile has a 25% chance to repeat after a short delay."],
    active: ["Surround Sound", "Shield nearby allies and double their movement speed while it holds."],
    ultimate: ["Perfect Frequency", "Make the squad invulnerable and lock every enemy in place."],
    signature: { name: "Sound Wave", evolve: "Anima Echo", passive: "projectiles", glyph: "SW", icon: "assets/weapons/signature-echo.webp" },
    cooldownE: 16, cooldownR: 90,
  },
  sola: {
    id: "sola", number: "03", name: "Sola", role: "Vanguard · armor scaling", tagline: "Be the wall that moves.",
    health: 1000, armor: 25, speed: 245, range: "Mid", color: "#f7c84b", sprite: "assets/sprites/sola.png",
    passive: ["Daybreak", "Armor, maximum health, and regeneration increase every attack's area."],
    active: ["Eclipse Guard", "Double your armor and gain a shield that detonates twice."],
    ultimate: ["Solar Lance", "Call down a huge flare that damages and stuns enemies."],
    signature: { name: "Shield Beam", evolve: "Lion's Light", passive: "armor", glyph: "SB", icon: "assets/weapons/signature-sola.webp" },
    cooldownE: 17, cooldownR: 80,
  },
  bront: {
    id: "bront", number: "04", name: "Bront", role: "Summoner · sustain zones", tagline: "The city remembers the tide.",
    health: 1500, armor: 15, speed: 235, range: "Mid", color: "#39d2cf", sprite: "assets/sprites/bront.png",
    passive: ["Deep Current", "Allies regenerate health faster near each of Bront's mechanical totems."],
    active: ["Totem Crash", "Slam forward, knock enemies up, and plant a healing totem."],
    ultimate: ["Groundswell", "Leap and create a shockwave, then massively accelerate every weapon."],
    signature: { name: "Tidal Hammer", evolve: "Grizzly Surge", passive: "duration", glyph: "TH", icon: "assets/weapons/signature-bront.webp" },
    cooldownE: 12, cooldownR: 90,
  },
  fang: {
    id: "fang", number: "05", name: "Fang", role: "Brawler · missing-health power", tagline: "Keep the safety off.",
    health: 1200, armor: 15, speed: 270, range: "Close", color: "#ef4b43", sprite: "assets/sprites/fang.png",
    passive: ["Survival Drive", "Missing health grants up to 60% damage and 100% movement speed."],
    active: ["Break Restraint", "Dash into a six-second frenzy, auto-chasing targets and healing on every swipe."],
    ultimate: ["Redline", "Dive to the cursor with invulnerability and detonate on arrival."],
    signature: { name: "Rending Swipe", evolve: "Savage Slice", passive: "maxHealth", glyph: "RS", icon: "assets/weapons/signature-fang.webp" },
    cooldownE: 17, cooldownR: 120,
  },
  gale: {
    id: "gale", number: "06", name: "Gale", role: "Duelist · critical flow", tagline: "Stand still and the storm wins.",
    health: 1000, armor: 10, speed: 280, range: "Mid", color: "#67d7ff", sprite: "assets/sprites/gale.png",
    passive: ["Wanderer's Edge", "Permanently gain 15% critical chance."],
    active: ["Slipstream", "Gain a shield, dash to the cursor, and cut through everything in the path."],
    ultimate: ["Windwall", "Raise a moving wall that destroys hostile shots and knocks enemies away."],
    signature: { name: "Steel Current", evolve: "Wandering Storms", passive: "crit", glyph: "SC", icon: "assets/weapons/signature-gale.webp" },
    cooldownE: 10, cooldownR: 25,
  },
  rift: {
    id: "rift", number: "07", name: "Rift", role: "Skirmisher · movement damage", tagline: "Momentum is ammunition.",
    health: 1000, armor: 20, speed: 300, range: "Close", color: "#e7c53e", sprite: "assets/sprites/rift.png",
    passive: ["Kinetic Edge", "Close-range damage is stronger; a portion of all damage becomes a short-lived shield."],
    active: ["Vector Dash", "Dash forward, blast the landing zone, and stun enemies."],
    ultimate: ["Break Limit", "Double movement speed, reset Vector Dash, and empower the signature weapon."],
    signature: { name: "Kinetic Crash", evolve: "Golden Overrun", passive: "move", glyph: "KC", icon: "assets/weapons/signature-rift.webp" },
    cooldownE: 8, cooldownR: 100,
  },
  nova: {
    id: "nova", number: "08", name: "Nova", role: "Spirit runner · hex detonation", tagline: "There is always another way through.",
    health: 1000, armor: 0, speed: 295, range: "Long", color: "#b68cff", sprite: "assets/sprites/nova.png",
    passive: ["Spirit Wake", "Every seven levels summons a trailing wisp that damages and hexes enemies."],
    active: ["Veilstep", "Dash with invulnerability and detonate every hexed enemy."],
    ultimate: ["Between Spaces", "Leap forward and unleash an expanding pulse that strikes every enemy."],
    signature: { name: "Guiding Hex", evolve: "Hopped-Up Hex", passive: "xp", glyph: "GH", icon: "assets/weapons/signature-nova.webp" },
    cooldownE: 15, cooldownR: 90,
  },
  vesper: {
    id: "vesper", number: "09", name: "Vesper", role: "Ranger · pickup offense", tagline: "Everything comes back sharper.",
    health: 1000, armor: 0, speed: 275, range: "Long", color: "#c05cff", sprite: "assets/sprites/vesper.png",
    passive: ["Magnetic Talons", "Massively increased pickup range; collected data motes damage enemies in flight."],
    active: ["Blade Recall", "Recall every dagger on the field through enemies."],
    ultimate: ["Bladestorm", "Become untargetable, accelerate, then release a radial storm of daggers."],
    signature: { name: "Winged Dagger", evolve: "Lover's Ricochet", passive: "pickup", glyph: "WD", icon: "assets/weapons/signature-vesper.webp" },
    cooldownE: 13, cooldownR: 90,
  },
};

export const SPECIALIST_ORDER = Object.keys(SPECIALISTS);

export const PASSIVES = {
  damage: { id: "damage", name: "Output", glyph: "DMG", amount: "+10% damage", max: 5, color: "#ff6d56" },
  haste: { id: "haste", name: "Cycle Rate", glyph: "AH", amount: "+10 ability haste", max: 5, color: "#63f2df" },
  maxHealth: { id: "maxHealth", name: "Hull", glyph: "HP", amount: "+150 max health", max: 5, color: "#ff6684" },
  armor: { id: "armor", name: "Plating", glyph: "AR", amount: "+8 armor", max: 5, color: "#f7d76a" },
  move: { id: "move", name: "Thrusters", glyph: "MS", amount: "+9% movement speed", max: 5, color: "#7be5ff" },
  area: { id: "area", name: "Field Size", glyph: "AOE", amount: "+11% area size", max: 5, color: "#b68cff" },
  crit: { id: "crit", name: "Critical Link", glyph: "CR", amount: "+8% critical chance", max: 5, color: "#ffd265" },
  duration: { id: "duration", name: "Persistence", glyph: "DUR", amount: "+12% duration", max: 5, color: "#66d5ff" },
  projectiles: { id: "projectiles", name: "Multishot", glyph: "+1", amount: "+1 projectile", max: 5, color: "#e899ff" },
  xp: { id: "xp", name: "Data Gain", glyph: "XP", amount: "+10% experience", max: 5, color: "#63f2df" },
  pickup: { id: "pickup", name: "Magnetics", glyph: "MAG", amount: "+35% pickup radius", max: 5, color: "#9bdcff" },
  regen: { id: "regen", name: "Repair", glyph: "REG", amount: "+4 health per second", max: 5, color: "#75efa2" },
};

export const WEAPONS = {
  uwu: { id: "uwu", name: "Needle Blaster", evolve: "Twin Needle Array", passive: "haste", glyph: "NB", icon: "assets/weapons/uwu.webp", max: 5, copy: "Rapidly fires laser needles at the nearest target." },
  slicers: { id: "slicers", name: "Cyclonic Slicers", evolve: "Unceasing Cyclone", passive: "regen", glyph: "CS", icon: "assets/weapons/slicers.webp", max: 5, copy: "Orbiting razors damage and knock enemies back." },
  aura: { id: "aura", name: "Radiant Field", evolve: "Explosive Embrace", passive: "maxHealth", glyph: "RF", icon: "assets/weapons/aura.webp", max: 5, copy: "A solar field continuously damages nearby enemies." },
  mines: { id: "mines", name: "Arc Mines", evolve: "Tri-Mine Grid", passive: "area", glyph: "AM", icon: "assets/weapons/mines.webp", max: 5, copy: "Deploy timed explosives in a ring." },
  crossbow: { id: "crossbow", name: "Scatter Bow", evolve: "Prime Ballista", passive: "crit", glyph: "SB", icon: "assets/weapons/crossbow.webp", max: 5, copy: "Fires a fan of piercing bolts in a random direction." },
  boomerang: { id: "boomerang", name: "Blade-o-rang", evolve: "Quad-o-rang", passive: "move", glyph: "BR", icon: "assets/weapons/boomerang.webp", max: 5, copy: "Returning blades seek the nearest threat." },
  rail: { id: "rail", name: "Lioness Rails", evolve: "Enveloping Light", passive: "haste", glyph: "LR", icon: "assets/weapons/rail.webp", max: 5, copy: "Fires paired horizontal crescents through the horde." },
  glove: { id: "glove", name: "Vortex Glove", evolve: "Tempest Gauntlet", passive: "regen", glyph: "VG", icon: "assets/weapons/glove.webp", max: 5, copy: "A rotating stream of orbs cuts across the arena." },
  transit: { id: "transit", name: "Final City Transit", evolve: "Limited Express", passive: "damage", glyph: "FC", icon: "assets/weapons/transit.webp", max: 5, copy: "Calls a high-speed train through the battlefield." },
  ice: { id: "ice", name: "Iceblast Armor", evolve: "Deep Freeze", passive: "armor", glyph: "IA", icon: "assets/weapons/ice.webp", max: 5, copy: "Blocks one hit, then freezes nearby enemies." },
  annihilator: { id: "annihilator", name: "Annihilator", evolve: "Animapocalypse", passive: "xp", glyph: "AX", icon: "assets/weapons/annihilator.webp", max: 5, copy: "Periodically clears a vast area." },
  drone: { id: "drone", name: "Yuum.AI Drone", evolve: "Yuum.AI Final", passive: "pickup", glyph: "AI", icon: "assets/weapons/drone.webp", max: 5, copy: "A roaming drone attacks, gathers data, and drops repairs." },
};

export const MAPS = {
  warehouse: {
    id: "warehouse", name: "Iron District", original: "Warehouse District", boss: "TUNNELMAW", mechanic: "Healing relay", 
    floor: "#101f2c", grid: "#183342", accent: "#50d9d1", edge: "#07121c", deco: "#173848",
    texture: "assets/environments/warehouse.webp",
  },
  outskirts: {
    id: "outskirts", name: "Ash Outskirts", original: "The Outskirts", boss: "RED HUNGER", mechanic: "Ion cannon",
    floor: "#27251f", grid: "#3c382b", accent: "#ffc56a", edge: "#14130f", deco: "#4e4938",
    texture: "assets/environments/outskirts.webp",
  },
  lab: {
    id: "lab", name: "Subzero Lab", original: "Subterranean Lab", boss: "VOID EMPRESS", mechanic: "Freeze cores",
    floor: "#101b2c", grid: "#192f49", accent: "#8ccfff", edge: "#070e19", deco: "#1e4160",
    texture: "assets/environments/lab.webp",
  },
  beachhead: {
    id: "beachhead", name: "The Beachhead", original: "The Beachhead", boss: "ABYSS BLADE", mechanic: "Rising ocean",
    floor: "#27202d", grid: "#443047", accent: "#f66a77", edge: "#130d17", deco: "#57334c",
    texture: "assets/environments/beachhead.webp",
  },
};

export const DIFFICULTIES = {
  story: { id: "story", name: "Story", health: 1.2, attack: 1.15, spell: 1.1, gold: 1, spawn: 1.12 },
  hard: { id: "hard", name: "Hard", health: 3, attack: 2, spell: 1.5, gold: 1.5, spawn: 1.35 },
  extreme: { id: "extreme", name: "Extreme", health: 7, attack: 3, spell: 2, gold: 2.25, spawn: 1.68 },
};

export const ENEMY_TYPES = {
  mite: { id: "mite", name: "Skitter", radius: 19, health: 42, speed: 92, damage: 11, xp: 6, color: "#ff7658", shape: 3 },
  hound: { id: "hound", name: "Rusher", radius: 24, health: 88, speed: 132, damage: 18, xp: 9, color: "#ffad53", shape: 4 },
  spitter: { id: "spitter", name: "Spitter", radius: 25, health: 120, speed: 62, damage: 16, xp: 12, color: "#c36cff", shape: 6, ranged: true },
  brute: { id: "brute", name: "Brute", radius: 36, health: 390, speed: 47, damage: 32, xp: 26, color: "#e84a67", shape: 6 },
  bomber: { id: "bomber", name: "Bomber", radius: 28, health: 170, speed: 76, damage: 65, xp: 18, color: "#ffd45d", shape: 5, bomber: true },
  shark: { id: "shark", name: "Siegebreaker", radius: 55, health: 1800, speed: 42, damage: 50, xp: 100, color: "#ff5575", shape: 5, miniboss: true },
};

export const WAVE_NAMES = [
  "Contact", "Pressure", "Pincer", "Heavy signal", "Breach", "Black tide", "Last stand", "Apex",
];

export const BOONS = [
  { name: "Cruise Control", copy: "Massive movement speed for 15 seconds." },
  { name: "Fired Up", copy: "Strong fireballs hunt the nearest enemy." },
  { name: "Healthback", copy: "Every takedown restores a little health." },
  { name: "Squad Shield", copy: "The whole squad gains a massive shield." },
  { name: "Stopwaves", copy: "Periodic shockwaves freeze nearby enemies." },
  { name: "Ultra Rapid Fire-r", copy: "Massively increased weapon and ability haste." },
];

export const AUGMENTS = [
  { id: "glass", name: "Glass Cannon", copy: "+40% damage, −30% maximum health." },
  { id: "bullet", name: "Bullet Mania", copy: "−15% damage; gain a projectile every six levels." },
  { id: "collector", name: "Card Collector", copy: "Each access key grants +5% damage." },
  { id: "celebration", name: "Celebration!", copy: "Level-ups trigger eight seconds of extreme stats." },
  { id: "crosscountry", name: "Cross Country", copy: "Distance traveled permanently raises damage, health, and area." },
  { id: "deathTax", name: "Death & Taxes", copy: "Takedowns can explode and drop bonus gold." },
  { id: "elite", name: "Elite Bomber", copy: "+30% elite damage; slain elites leave a massive bomb." },
  { id: "experienced", name: "Experienced Fighter", copy: "+10% data gain; pickups grant brief damage and speed." },
  { id: "larger", name: "Larger Than Life", copy: "+30% size, repair, and health; −15% movement speed." },
  { id: "long", name: "Long Range", copy: "Deal up to 30% more damage at long distance." },
  { id: "metabolic", name: "Metabolic Overdrive", copy: "Heal 20% health each second, but lose 60% max health." },
  { id: "critical", name: "Mission Critical", copy: "+10% crit and +25% crit damage; weak non-crits." },
  { id: "spray", name: "Spray & Pray", copy: "+4 projectiles, −35% damage." },
  { id: "uptime", name: "Uptime Upgrade", copy: "+60% duration." },
  { id: "withhaste", name: "With Haste", copy: "Every two ability haste grants 1% movement speed." },
];

export function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
