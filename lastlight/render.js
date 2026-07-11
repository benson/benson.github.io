import { SPECIALISTS, MAPS, ENEMY_TYPES, MAP_OBSTACLES, clamp } from "./data.js?v=20260711.5";
import { WORLD } from "./engine.js?v=20260711.5";
import { getThemeAnimation, getThemeAsset, getThemeEnemyAnimation } from "./themes/lastlight.js?v=20260711.5";
import { animationFrame, directionColumn, springCamera } from "./feel.js?v=20260711.5";
import { bossHealthSegments, enemyHealthSegments, playerHealthSegments } from "./health-bars.js?v=20260711.5";
import { AdaptiveQualityController, settingsForPreset } from "./quality-settings.js?v=20260711.5";
import { impactRenderPlan } from "./impact-grammar.js?v=20260711.5";

const TAU = Math.PI * 2;
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.camera = { x: 0, y: 0, vx: 0, vy: 0 };
    this.sprites = {};
    this.environments = {};
    this.effectSprites = {};
    this.enemySprites = {};
    this.animationAtlases = {};
    this.playerVisuals = new Map();
    this.enemyVisuals = new Map();
    this.groundParticles = [];
    this.visualFreeze = 0;
    this.lastLocalHurt = 0;
    this.previousIndexes = new WeakMap();
    this.enemyHealthBarMode = "important";
    this.hoveredEntity = null;
    this.lastInspection = { at: -Infinity, state: null, result: null };
    this.prevMaps = {};
    this.systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
    this.qualityController = new AdaptiveQualityController(settingsForPreset("auto", this.systemReducedMotion));
    this.qualityProfile = this.qualityController.profile();
    this.renderBudgets = { ...this.qualityProfile };
    this.reducedMotion = this.systemReducedMotion || this.qualityProfile.reducedMotion;
    this.loadSprites();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.canvas);
  }

  loadSprites() {
    for (const spec of Object.values(SPECIALISTS)) {
      const image = new Image(); image.src = spec.sprite; this.sprites[spec.id] = image;
      const animation = getThemeAnimation(spec.id);
      if (animation?.atlas) { const atlas = new Image(); atlas.src = animation.atlas; this.animationAtlases[spec.id] = atlas; }
    }
    for (const map of Object.values(MAPS)) {
      if (!map.texture) continue;
      const image = new Image(); image.src = map.texture; this.environments[map.id] = image;
    }
    for (const type of Object.keys(ENEMY_TYPES)) {
      const image = new Image(); image.src = getThemeAsset(`enemies.${type}`); this.enemySprites[type] = image;
    }
    for (const [name, src] of Object.entries({
      xpShard: getThemeAsset("effects.xpShard"),
      hostileBolt: getThemeAsset("effects.hostileBolt"),
      barricade: getThemeAsset("effects.barricade"),
      drone: getThemeAsset("weapons.universal.drone"),
    })) {
      const image = new Image(); image.src = src; this.effectSprites[name] = image;
    }
  }

  resetCamera() {
    this.camera.x = 0; this.camera.y = 0; this.camera.vx = 0; this.camera.vy = 0;
    this.playerVisuals.clear(); this.enemyVisuals.clear(); this.groundParticles = []; this.visualFreeze = 0; this.lastLocalHurt = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(this.qualityProfile?.dpr || 2, window.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // UI integration: renderer.setEnemyHealthBarsVisible(preferences.enemyHealthBars)
  setEnemyHealthBarsVisible(visible) {
    this.enemyHealthBarMode = visible ? "all" : "off";
  }

  setEnemyHealthBarMode(mode = "important") {
    this.enemyHealthBarMode = ["off", "important", "all"].includes(mode) ? mode : "important";
  }

  setQualitySettings(settings) {
    const previousDpr = this.qualityProfile?.dpr;
    this.qualityProfile = this.qualityController.setSettings(settings);
    this.reducedMotion = this.systemReducedMotion || this.qualityProfile.reducedMotion;
    this.setEnemyHealthBarMode(this.qualityProfile.healthBars);
    if (previousDpr !== this.qualityProfile.dpr) this.resize();
    return this.getQualityStatus();
  }

  getQualityStatus() { return { ...this.qualityController.status(), profile: { ...this.qualityProfile } }; }

  updateQuality(frameSeconds) {
    const previousTier = this.qualityProfile.tier;
    this.qualityProfile = this.qualityController.sample(frameSeconds * 1000);
    this.reducedMotion = this.systemReducedMotion || this.qualityProfile.reducedMotion;
    if (previousTier !== this.qualityProfile.tier) this.resize();
    // Adaptive changes are rare and move one tier at a time. Ease visual budgets
    // toward the new target so an effect-heavy frame never visibly "pops" empty.
    const blend = 1 - Math.exp(-Math.max(0, frameSeconds) * 2.2);
    for (const key of ["enemies", "projectiles", "hostileProjectiles", "effects", "orbs", "particles"]) {
      this.renderBudgets[key] += (this.qualityProfile[key] - this.renderBudgets[key]) * blend;
    }
  }

  budget(list, maximum, priority = () => false) {
    const cap = Math.max(0, Math.round(maximum));
    if (!Array.isArray(list) || list.length <= cap) return list || [];
    const important = list.filter(priority), ordinary = list.filter((entry) => !priority(entry));
    return important.slice(0, cap).concat(ordinary.slice(0, Math.max(0, cap - important.length)));
  }

  densityAllows(entity, density = this.qualityProfile.effectsDensity) {
    if (density >= 1) return true;
    const value = String(entity?.id ?? `${entity?.x || 0}:${entity?.y || 0}:${entity?.kind || "effect"}`);
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0) / 4294967296 < density;
  }

  clearInspection() {
    this.hoveredEntity = null;
    this.lastInspection = { at: -Infinity, state: null, result: null };
  }

  previousEntity(list, entityId) {
    if (!list) return null;
    let index = this.previousIndexes.get(list);
    if (!index) {
      index = new Map(list.map((entry) => [entry.id, entry]));
      this.previousIndexes.set(list, index);
    }
    return index.get(entityId) || null;
  }

  isWorldVisible(entity, padding = 100) {
    const radius = entity.radius || 0;
    return entity.x + radius >= this.camera.x - this.width / 2 - padding
      && entity.x - radius <= this.camera.x + this.width / 2 + padding
      && entity.y + radius >= this.camera.y - this.height / 2 - padding
      && entity.y - radius <= this.camera.y + this.height / 2 + padding;
  }

  // UI integration: call with PointerEvent.clientX/clientY and the current
  // Simulation/snapshot; render the returned name/description/stats as desired.
  inspectAt(clientX, clientY, state) {
    if (!state) { this.clearInspection(); return null; }
    const inspectionNow = performance.now();
    // Pointermove can fire faster than paint. Coalesce inspection work to one
    // pass per frame even if the UI binds this method directly.
    if (this.lastInspection.state === state && inspectionNow - this.lastInspection.at < 15) return this.lastInspection.result;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { this.clearInspection(); return null; }
    const worldX = (clientX - rect.left) * (this.width / rect.width) + this.camera.x - this.width / 2;
    const worldY = (clientY - rect.top) * (this.height / rect.height) + this.camera.y - this.height / 2;
    const map = typeof state.map === "string" ? MAPS[state.map] : state.map;
    let best = null, bestScore = Infinity;
    const consider = (entity, radius, info, priority = 0) => {
      const dx = worldX - entity.x, dy = worldY - entity.y, hitRadius = Math.max(12, radius);
      if (Math.abs(dx) > hitRadius || Math.abs(dy) > hitRadius) return;
      const score = Math.hypot(dx, dy) / hitRadius - priority;
      if (score > 1 || score >= bestScore) return;
      bestScore = score;
      best = { id: entity.id, ...info, world: { x: entity.x, y: entity.y } };
    };

    for (const enemy of state.enemies || []) {
      const data = ENEMY_TYPES[enemy.type] || {};
      const name = enemy.boss ? (map?.boss || "Apex") : enemy.eventType === "treasure" ? "Treasure Runner" : `${enemy.elite ? "Elite " : ""}${data.name || "Enemy"}`;
      consider(enemy, enemy.radius + 12, {
        type: "enemy", name,
        description: enemy.eventType === "treasure" ? "Chase it down before its timer expires to recover bonus loot." : enemy.boss ? "The operation's apex target." : data.ranged ? "A ranged enemy that fires hostile bolts." : "A hostile contact that attacks at close range.",
        stats: { Health: `${Math.max(0, Math.ceil(enemy.hp))} / ${Math.ceil(enemy.maxHp)}`, Damage: Math.round(enemy.damage || 0), Speed: Math.round(enemy.speed || 0) },
      }, .24);
    }
    const pickupNames = {
      card: ["Elite Access Card", "Evolves an eligible level-five weapon or upgrades the squad."],
      heal: ["Repair Kit", "Restores health to the whole squad."], vacuum: ["Data Vacuum", "Collects every loose data mote."],
      mine: ["Sea Mine", "Damages every non-apex enemy."], gold: ["Gold Cache", "Adds bonus operation gold."],
    };
    for (const drop of state.drops || []) {
      const [name, description] = pickupNames[drop.type] || ["Pickup", "Collect for an immediate squad benefit."];
      consider(drop, drop.radius + 10, { type: "pickup", name, description, stats: { Effect: drop.type, Source: drop.source === "drone" ? "Yuum.AI Drone" : "Field drop" } }, .2);
    }
    for (const orb of state.orbs || []) consider(orb, orb.radius + 12, { type: "pickup", name: "Combat Data", description: "Collect this mote to advance the squad's next upgrade.", stats: { Data: Math.round(orb.value || 0) } }, .2);
    for (const pod of state.pods || []) consider(pod, pod.radius + 10, { type: "cache", name: "Breakable Supply Cache", description: "Shoot it open to reveal a random pickup. It does not block movement.", stats: { Integrity: `${Math.max(0, Math.ceil(pod.hp))} / 100` } }, .16);
    for (const objective of state.objectives || []) consider(objective, objective.radius, { type: "objective", name: objective.kind === "trial" ? "Breach Trial" : "Uplink", description: objective.kind === "trial" ? "Hold the marked zone while the breach intensifies." : "Stand inside the ring to capture the uplink.", stats: { Progress: `${Math.round((objective.progress || 0) * 100)}%`, Time: `${Math.max(0, Math.ceil(objective.life || 0))}s` } }, .08);
    for (const ball of state.relayBalls || []) consider(ball, ball.radius + 10, { type: "objective", name: "Relay Ball", description: "Make contact to push the core into its marked destination ring.", stats: { Time: `${Math.max(0, Math.ceil(ball.life || 0))}s`, Goal: `${Math.round(Math.hypot(ball.x - ball.targetX, ball.y - ball.targetY))}m` } }, .12);
    for (const drone of state.drones || []) consider(drone, drone.radius + 12, { type: "ally", name: drone.evolved ? "Yuum.AI Final" : "Yuum.AI Drone", description: "An autonomous wingmate that attacks, gathers data, and periodically drops repairs.", stats: { Level: drone.level, Repair: `${Math.max(0, Math.ceil(drone.repairClock || 0))}s` } }, .18);
    for (const projectile of state.projectiles || []) consider(projectile, projectile.radius + 9, { type: "projectile", name: projectile.droneBolt ? "Drone Pulse" : "Friendly Projectile", description: projectile.droneBolt ? "An autonomous Yuum.AI shot." : "A specialist weapon projectile.", stats: { Damage: Math.round(projectile.damage || 0), Speed: Math.round(Math.hypot(projectile.vx || 0, projectile.vy || 0)), Pierce: Math.max(0, projectile.pierce || 0) } }, .3);
    for (const projectile of state.hostile || []) consider(projectile, projectile.radius + 10, { type: "projectile", name: projectile.bossShot ? "Apex Projectile" : "Hostile Projectile", description: projectile.bossShot ? "A lethal apex arrow. A clean hit removes at least one third of base health before shields." : "Enemy fire. Evade it or use a defensive ability.", stats: { Damage: projectile.bossShot ? "36%+ max HP" : Math.round(projectile.damage || 0), Speed: Math.round(Math.hypot(projectile.vx || 0, projectile.vy || 0)), Time: `${Math.max(0, Number(projectile.life || 0)).toFixed(1)}s` } }, .32);
    for (const effect of state.effects || []) {
      if (!(effect.owner === "enemy" || effect.kind === "danger" || effect.kind === "bossCast")) continue;
      consider(effect, effect.radius, { type: "hazard", name: "Enemy Telegraph", description: "A hostile attack is about to resolve inside this marked area.", stats: { Radius: Math.round(effect.radius || 0), Time: `${Math.max(0, Number(effect.life || 0)).toFixed(1)}s` } }, .02);
    }
    for (let index = 0; index < MAP_OBSTACLES.length; index++) {
      const [x,y,w,h] = MAP_OBSTACLES[index];
      if (worldX < x || worldX > x + w || worldY < y || worldY > y + h) continue;
      const obstacle = { id: `obstacle-${index}`, x: x + w / 2, y: y + h / 2 };
      consider(obstacle, Math.max(w, h), { type: "obstacle", name: "Raised Cover", description: "Solid environmental cover. Specialists cannot move or dash through it.", stats: { Width: Math.round(w), Height: Math.round(h), Collision: "Solid" } }, -.2);
    }
    const machine = { id: "machine", x: 0, y: 0, radius: 77 };
    consider(machine, 77, { type: "objective", name: map?.mechanic || "Field Device", description: "Stand nearby to charge this operation-specific field device.", stats: { Charge: `${Math.round(((state.machine?.charge || 0) / 2.4) * 100)}%`, Cooldown: `${Math.max(0, Math.ceil(state.machine?.cooldown || 0))}s` } }, .04);

    this.hoveredEntity = best ? { id: best.id, type: best.type } : null;
    this.lastInspection = { at: inspectionNow, state, result: best };
    return best;
  }

  draw(state, localPlayerId, previous = null, interpolation = 1, frameSeconds = 1 / 60) {
    if (!state?.players) return;
    this.updateQuality(frameSeconds);
    // The renderer is constructed while the game screen is display:none. Some
    // browsers therefore report a 0x0 canvas until the first run begins. Never
    // let that 1x1 fallback be stretched across the viewport.
    if (Math.abs(this.canvas.clientWidth - this.width) > 1 || Math.abs(this.canvas.clientHeight - this.height) > 1) this.resize();
    const ctx = this.ctx;
    const map = typeof state.map === "string" ? MAPS[state.map] : state.map;
    const current = state.players.find((p) => p.id === localPlayerId) || state.players[0] || { x: 0, y: 0 };
    const pos = this.position(current, previous?.players, interpolation);
    const lookAngle = Number.isFinite(current.aimFacing) ? current.aimFacing : current.facing || 0;
    const lookDistance = this.reducedMotion ? 0 : current.moving ? 44 : 25;
    springCamera(this.camera, { x: pos.x + Math.cos(lookAngle) * lookDistance, y: pos.y + Math.sin(lookAngle) * lookDistance }, frameSeconds);
    const hurt = this.reducedMotion ? 0 : clamp((current.hurtFlash || 0) / .24, 0, 1) * this.qualityProfile.hitFlashes;
    if (hurt > this.lastLocalHurt + .35 && !this.reducedMotion) this.visualFreeze = Math.max(this.visualFreeze, .045);
    this.lastLocalHurt = hurt;
    const visualDt = this.visualFreeze > 0 ? 0 : frameSeconds;
    this.visualFreeze = Math.max(0, this.visualFreeze - frameSeconds);
    const shakeX = Math.sin(performance.now() * .09) * hurt * 7 * this.qualityProfile.shake, shakeY = Math.cos(performance.now() * .073) * hurt * 5 * this.qualityProfile.shake;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = map.floor; ctx.fillRect(0, 0, this.width, this.height);
    this.drawFloor(map, state.time || 0);

    ctx.save();
    ctx.translate(this.width / 2 - this.camera.x + shakeX, this.height / 2 - this.camera.y + shakeY);
    this.drawWorldBorder(map);
    this.drawMapGuides(map);
    this.drawMachine(state, map);
    this.drawRelayBalls(state.relayBalls || [], map);
    this.drawObjectives(state.objectives || [], map);
    this.drawDrops(state.drops || []);
    this.drawOrbs(this.budget(state.orbs || [], this.renderBudgets.orbs));
    this.drawEffects(state.effects || [], map, previous, interpolation, false, state);
    this.drawFeathers(state.feathers || []);
    this.drawProjectiles(this.budget(state.projectiles || [], this.renderBudgets.projectiles), false, state);
    this.drawProjectiles(this.budget(state.hostile || [], this.renderBudgets.hostileProjectiles, (shot) => shot.bossShot), true, state);
    this.drawGroundParticles(visualDt);
    this.drawGroundedQueue(state, previous, interpolation, map, localPlayerId, visualDt);
    this.drawEffects(state.effects || [], map, previous, interpolation, true, state);
    this.drawHovered(state, map);
    ctx.restore();
    this.drawVignette(state, current);
    this.drawOffscreenMarkers(state, map, localPlayerId);
  }

  position(entity, previousList, t) {
    if (entity?.predicted || !previousList || t >= 1) return entity;
    const before = this.previousEntity(previousList, entity.id);
    if (!before) return entity;
    return { ...entity, x: before.x + (entity.x - before.x) * t, y: before.y + (entity.y - before.y) * t };
  }

  drawFloor(map, time) {
    const ctx = this.ctx, spacing = 120, texture = this.environments[map.id];
    if (texture?.complete && texture.naturalWidth) {
      // Mirror alternating tiles. Adjacent edges then use the exact same pixels,
      // hiding seams even when generated source art is only approximately tileable.
      const tile = 1024;
      const originX = this.width / 2 - this.camera.x;
      const originY = this.height / 2 - this.camera.y;
      const minCol = Math.floor((-originX) / tile) - 1;
      const maxCol = Math.ceil((this.width - originX) / tile) + 1;
      const minRow = Math.floor((-originY) / tile) - 1;
      const maxRow = Math.ceil((this.height - originY) / tile) + 1;
      ctx.save(); ctx.globalAlpha = .72;
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const flipX = Math.abs(col) % 2 === 1, flipY = Math.abs(row) % 2 === 1;
          const x = originX + col * tile, y = originY + row * tile;
          ctx.save(); ctx.translate(x + (flipX ? tile : 0), y + (flipY ? tile : 0));
          ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1); ctx.drawImage(texture, 0, 0, tile, tile); ctx.restore();
        }
      }
      ctx.globalAlpha = .34; ctx.fillStyle = map.floor; ctx.fillRect(0, 0, this.width, this.height); ctx.restore();
    }
    const ox = ((-this.camera.x + this.width / 2) % spacing + spacing) % spacing;
    const oy = ((-this.camera.y + this.height / 2) % spacing + spacing) % spacing;
    ctx.strokeStyle = map.grid; ctx.globalAlpha = texture?.complete ? .2 : .45; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < this.width; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, this.height); }
    for (let y = oy; y < this.height; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(this.width, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    const glowX = this.width * .5 + Math.sin(time * .08) * 80;
    const glow = ctx.createRadialGradient(glowX, this.height * .45, 0, glowX, this.height * .45, 600);
    glow.addColorStop(0, `${map.accent}10`); glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
  }

  drawWorldBorder(map) {
    const ctx = this.ctx;
    ctx.fillStyle = map.edge;
    ctx.fillRect(-WORLD.width / 2 - 500, -WORLD.height / 2 - 500, WORLD.width + 1000, 500);
    ctx.fillRect(-WORLD.width / 2 - 500, WORLD.height / 2, WORLD.width + 1000, 500);
    ctx.fillRect(-WORLD.width / 2 - 500, -WORLD.height / 2, 500, WORLD.height);
    ctx.fillRect(WORLD.width / 2, -WORLD.height / 2, 500, WORLD.height);
    ctx.strokeStyle = map.accent; ctx.globalAlpha = .35; ctx.lineWidth = 3;
    ctx.strokeRect(-WORLD.width / 2, -WORLD.height / 2, WORLD.width, WORLD.height); ctx.globalAlpha = 1;
  }

  drawMapGuides(map) {
    const ctx = this.ctx;
    ctx.strokeStyle = `${map.accent}25`; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(-WORLD.width/2, -390); ctx.lineTo(WORLD.width/2, -390); ctx.moveTo(-WORLD.width/2, 420); ctx.lineTo(WORLD.width/2, 420); ctx.stroke();
  }

  drawCover(map, block) {
    const ctx = this.ctx, texture = this.effectSprites.barricade, [x,y,w,h] = block;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.fillRect(x + 10, y + 12, w, h);
    ctx.fillStyle = map.deco; ctx.globalAlpha = .74; ctx.fillRect(x, y, w, h);
    if (texture?.complete && texture.naturalWidth) {
      ctx.globalAlpha = .64; ctx.drawImage(texture, 0, 0, texture.naturalWidth, texture.naturalHeight, x, y, w, h);
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(1,5,10,.82)"; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = `${map.accent}78`; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.strokeStyle = "rgba(255,255,255,.23)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + w - 8, y + 8); ctx.stroke();
    const bandY = y + h - 15, segment = 17;
    for (let sx = x + 12, i = 0; sx < x + Math.min(w - 12, 116); sx += segment, i++) {
      ctx.fillStyle = i % 2 ? "#f3e4c0" : "#e35f32"; ctx.globalAlpha = .72;
      ctx.beginPath(); ctx.moveTo(sx, bandY + 10); ctx.lineTo(sx + 8, bandY); ctx.lineTo(sx + 15, bandY); ctx.lineTo(sx + 7, bandY + 10); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawGroundedQueue(state, previous, t, map, localPlayerId, visualDt) {
    const items = [];
    if (this.enemyVisuals.size > (state.enemies?.length || 0) + 32) {
      const livingEnemyIds = new Set((state.enemies || []).map((enemy) => enemy.id));
      for (const enemyId of this.enemyVisuals.keys()) if (!livingEnemyIds.has(enemyId)) this.enemyVisuals.delete(enemyId);
    }
    for (const block of MAP_OBSTACLES) items.push({ type: "cover", value: block, sortY: block[1] + block[3] });
    for (const pod of state.pods || []) items.push({ type: "pod", value: pod, sortY: pod.y + (pod.radius || 0) });
    for (const enemy of this.budget(state.enemies || [], this.renderBudgets.enemies, (entry) => entry.boss || entry.elite || entry.miniboss || entry.eventType)) {
      const position = this.position(enemy, previous?.enemies, t);
      items.push({ type: "enemy", value: enemy, sortY: position.y + (enemy.radius || 0) * .45 });
    }
    for (const drone of state.drones || []) {
      const position = this.position(drone, previous?.drones, t);
      items.push({ type: "drone", value: drone, sortY: position.y + 10 });
    }
    for (const player of state.players || []) {
      const position = this.position(player, previous?.players, t);
      items.push({ type: "player", value: player, sortY: position.y + 18 });
    }
    items.sort((a, b) => a.sortY - b.sortY || a.type.localeCompare(b.type));
    for (const item of items) {
      if (item.type === "cover") this.drawCover(map, item.value);
      else if (item.type === "pod") this.drawPods([item.value]);
      else if (item.type === "enemy") this.drawEnemies([item.value], previous, t, map);
      else if (item.type === "drone") this.drawDrones([item.value], state.players, previous, t);
      else this.drawPlayers([item.value], previous, t, localPlayerId, visualDt);
    }
  }

  drawGroundParticles(frameSeconds) {
    const ctx = this.ctx, dt = Math.min(.05, Math.max(0, frameSeconds || 0));
    for (const particle of this.groundParticles) particle.life -= dt;
    this.groundParticles = this.groundParticles.filter((particle) => particle.life > 0);
    for (const particle of this.groundParticles) {
      const progress = 1 - particle.life / particle.maxLife;
      ctx.save(); ctx.translate(particle.x + particle.vx * progress, particle.y + particle.vy * progress);
      ctx.globalAlpha = (1 - progress) * particle.alpha; ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.ellipse(0, 0, particle.size * (1 + progress * 1.7), particle.size * .45, particle.rotation, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  emitFootfall(player, visual, color, skid = false) {
    const particleBudget = Math.round(this.renderBudgets.particles);
    if (this.reducedMotion || !particleBudget || !this.densityAllows(player) || this.groundParticles.length >= particleBudget) return;
    const count = skid ? 5 : 2;
    for (let index = 0; index < count; index++) {
      if (this.groundParticles.length >= particleBudget) break;
      const spread = (index - (count - 1) / 2) * .55;
      this.groundParticles.push({
        x: player.x - Math.cos(visual.facing) * 13, y: player.y + 19 - Math.sin(visual.facing) * 7,
        vx: -Math.cos(visual.facing + spread) * (skid ? 20 : 11), vy: -Math.sin(visual.facing + spread) * (skid ? 12 : 7),
        life: skid ? .3 : .22, maxLife: skid ? .3 : .22, size: skid ? 7 : 4,
        alpha: skid ? .2 : .13, color, rotation: visual.facing,
      });
    }
  }

  drawMachine(state, map) {
    const ctx = this.ctx, m = state.machine || { charge: 0, cooldown: 0, active: 0 };
    ctx.save(); ctx.translate(0, 0);
    ctx.fillStyle = "rgba(2,7,13,.72)"; ctx.strokeStyle = m.cooldown <= 0 ? map.accent : "#52616a"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 77, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = map.accent; ctx.globalAlpha = .3 + (m.active > 0 ? .5 : 0); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 0, 58, -.5*Math.PI, -.5*Math.PI + TAU * clamp((m.charge || 0)/2.4,0,1)); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = map.accent; ctx.font = "700 11px Inter"; ctx.textAlign = "center"; ctx.fillText(m.cooldown > 0 ? `${Math.ceil(m.cooldown)}s` : map.mechanic.toUpperCase(), 0, 4);
    ctx.restore();
  }

  drawPods(pods) {
    const ctx = this.ctx, texture = this.effectSprites.barricade;
    for (const pod of pods) {
      if (!this.isWorldVisible(pod, 45)) continue;
      const health = clamp((pod.hp ?? 100) / 100, 0, 1), damage = 1 - health;
      ctx.save(); ctx.translate(pod.x, pod.y);

      // These are shoot-to-open supply caches, not pickups or collision props.
      // Keep them low, still, and tightly matched to their projectile hit radius.
      ctx.fillStyle = "rgba(0,0,0,.46)"; ctx.beginPath(); ctx.ellipse(3, 18, 27, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#071019"; ctx.fillRect(-25, -17, 50, 34);
      ctx.fillStyle = "#152936"; ctx.fillRect(-22, -14, 44, 24);
      if (texture?.complete && texture.naturalWidth) {
        ctx.save(); ctx.beginPath(); ctx.rect(-22, -14, 44, 24); ctx.clip();
        ctx.globalAlpha = .42; ctx.drawImage(texture, 55, 55, 400, 260, -22, -14, 44, 28); ctx.restore();
      }
      ctx.fillStyle = "rgba(2,8,13,.6)"; ctx.fillRect(-22, -14, 44, 24);
      ctx.strokeStyle = "rgba(255,255,255,.19)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-20, -12); ctx.lineTo(20, -12); ctx.stroke();

      // Safety-orange framing and an explicit verb communicate destructibility
      // without the glow, bob, or spin language used by collectible objects.
      const warning = health < .35 ? "#ff4f45" : "#ff7955";
      ctx.strokeStyle = warning; ctx.lineWidth = 2; ctx.strokeRect(-24, -16, 48, 32);
      ctx.fillStyle = warning;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(side * 18, 10); ctx.rotate(side * -.32);
        ctx.fillRect(-5, -2, 3, 4); ctx.fillRect(1, -2, 3, 4); ctx.restore();
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(2,8,13,.88)"; ctx.fillRect(-19, -7, 38, 14);
      ctx.fillStyle = "#f7f4e8"; ctx.font = "900 8px Inter"; ctx.fillText("BREAK", 0, 0);

      // Persistent armor rail plus progressively revealed cracks gives immediate
      // and continuous feedback that shots are damaging the cache.
      ctx.fillStyle = "rgba(0,0,0,.78)"; ctx.fillRect(-22, 12, 44, 4);
      ctx.fillStyle = warning; ctx.fillRect(-21, 13, 42 * health, 2);
      if (damage > .01) {
        ctx.strokeStyle = `rgba(255,225,203,${.32 + damage * .58})`; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(2, -8); ctx.lineTo(7, -3); ctx.lineTo(1, 3); ctx.stroke();
        if (damage > .48) { ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(-10, -9); ctx.lineTo(-14, -4); ctx.lineTo(-7, 1); ctx.stroke(); }
      }
      ctx.restore();
    }
  }

  drawObjectives(objectives, map) {
    const ctx = this.ctx, now = performance.now();
    for (const objective of objectives) {
      if (!this.isWorldVisible(objective, 90)) continue;
      const trial = objective.kind === "trial", color = trial ? "#ff4f66" : map.accent;
      ctx.save(); ctx.translate(objective.x, objective.y);
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(7, 12, objective.radius * 1.05, objective.radius * .54, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = .12; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, objective.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.setLineDash(trial ? [3, 6] : [13, 8]); ctx.lineDashOffset = this.reducedMotion ? 0 : -now * (trial ? .038 : .02);
      ctx.lineWidth = trial ? 5 : 3; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 0, objective.radius + Math.sin(now * .004) * 3, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
      if (trial) {
        // Four inward teeth are readable even when the red hue is not.
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4; ctx.save(); ctx.rotate(a); ctx.translate(objective.radius - 10, 0);
          ctx.fillStyle = "#ff4f66"; ctx.beginPath(); ctx.moveTo(-16, -9); ctx.lineTo(4, 0); ctx.lineTo(-16, 9); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4, r = objective.radius - 9, x = Math.cos(a) * r, y = Math.sin(a) * r;
          ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
        }
      }
      const progress = clamp(objective.progress, 0, 1);
      ctx.strokeStyle = "#fff"; ctx.globalAlpha = .88; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, Math.max(18, objective.radius * .38), -.5 * Math.PI, -.5 * Math.PI + TAU * progress); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = "rgba(2,7,13,.9)"; ctx.fillRect(-31, -10, 62, 20); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(-31, -10, 62, 20);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "800 10px Inter"; ctx.fillText(trial ? "TRIAL" : "UPLINK", 0, 4); ctx.restore();
    }
  }

  drawRelayBalls(balls, map) {
    const ctx = this.ctx;
    for (const ball of balls) {
      if (!this.isWorldVisible(ball, 130) && !this.isWorldVisible({ x: ball.targetX, y: ball.targetY, radius: 82 }, 90)) continue;
      ctx.save();
      ctx.translate(ball.targetX, ball.targetY); ctx.setLineDash([10, 8]); ctx.lineDashOffset = this.reducedMotion ? 0 : -performance.now() * .03; ctx.lineWidth = 4; ctx.strokeStyle = "#f7d76a"; ctx.globalAlpha = .75;
      ctx.beginPath(); ctx.arc(0, 0, 82 + Math.sin(performance.now() * .005) * 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.globalAlpha = .12; ctx.fillStyle = "#f7d76a"; ctx.beginPath(); ctx.arc(0, 0, 78, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "800 9px Inter"; ctx.fillText("RELAY GOAL", 0, 4); ctx.restore();
      ctx.save(); ctx.strokeStyle = "rgba(247,215,106,.22)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.targetX, ball.targetY); ctx.stroke();
      ctx.translate(ball.x, ball.y); ctx.shadowColor = "#f7d76a"; ctx.shadowBlur = 22;
      const glow = ctx.createRadialGradient(-12, -14, 3, 0, 0, ball.radius); glow.addColorStop(0, "#fff6bd"); glow.addColorStop(.35, "#f7d76a"); glow.addColorStop(1, "#8d5b20");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, ball.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = map.accent; ctx.lineWidth = 3; ctx.rotate(this.reducedMotion ? 0 : performance.now() * .0015); ctx.beginPath(); ctx.arc(0, 0, ball.radius * .62, .2, TAU * .72); ctx.stroke(); ctx.rotate(this.reducedMotion ? 0 : -performance.now() * .0015);
      ctx.fillStyle = "#fff"; ctx.font = "800 9px Inter"; ctx.textAlign = "center"; ctx.fillText(`${Math.max(0, Math.ceil(ball.life))}s`, 0, 4); ctx.restore();
    }
  }

  drawDrops(drops) {
    const ctx = this.ctx, now = performance.now();
    for (const drop of drops) {
      if (!this.isWorldVisible(drop, 45)) continue;
      const bob = this.reducedMotion ? 0 : Math.sin(now * .004 + drop.x) * 3, pulse = 1 + Math.sin(now * .007 + drop.x) * .07;
      ctx.save(); ctx.translate(drop.x, drop.y + bob);
      ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.beginPath(); ctx.ellipse(3, drop.radius * .78, drop.radius * .95, drop.radius * .4, 0, 0, TAU); ctx.fill();
      ctx.scale(pulse, pulse); ctx.lineJoin = "round";
      if (drop.type === "card") {
        ctx.rotate(Math.PI / 4 + (this.reducedMotion ? 0 : now * .0007)); ctx.shadowColor = "#f8d85c"; ctx.shadowBlur = 13;
        ctx.fillStyle = "#f8d85c"; ctx.strokeStyle = "#fff4b0"; ctx.lineWidth = 2; ctx.fillRect(-12, -12, 24, 24); ctx.strokeRect(-12, -12, 24, 24);
        ctx.shadowBlur = 0; ctx.fillStyle = "#271b12"; ctx.fillRect(-6, -2, 12, 4); ctx.fillRect(-2, -6, 4, 12);
      } else if (drop.type === "heal") {
        ctx.shadowColor = "#55f59b"; ctx.shadowBlur = 14; ctx.strokeStyle = "#092719"; ctx.lineWidth = 5; ctx.fillStyle = "#6dff9e";
        ctx.beginPath(); ctx.moveTo(-5,-15); ctx.lineTo(5,-15); ctx.lineTo(5,-5); ctx.lineTo(15,-5); ctx.lineTo(15,5); ctx.lineTo(5,5); ctx.lineTo(5,15); ctx.lineTo(-5,15); ctx.lineTo(-5,5); ctx.lineTo(-15,5); ctx.lineTo(-15,-5); ctx.lineTo(-5,-5); ctx.closePath(); ctx.stroke(); ctx.fill();
      } else if (drop.type === "vacuum") {
        ctx.shadowColor = "#71eaff"; ctx.shadowBlur = 14; ctx.strokeStyle = "#71eaff"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, -1, 12, .05 * Math.PI, .95 * Math.PI, true); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.fillRect(-17, 5, 8, 9); ctx.fillRect(9, 5, 8, 9); ctx.fillStyle = "#06222a"; ctx.beginPath(); ctx.arc(0, -1, 5, 0, TAU); ctx.fill();
      } else if (drop.type === "mine") {
        ctx.shadowColor = "#ff744f"; ctx.shadowBlur = 14; ctx.fillStyle = "#ff744f"; ctx.strokeStyle = "#45150d"; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16 - Math.PI / 2, r = i % 2 ? 10 : 18; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
        ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#fff0b8"; ctx.beginPath(); ctx.arc(0,0,5,0,TAU); ctx.fill();
      } else {
        ctx.rotate(this.reducedMotion ? 0 : now * .001); ctx.shadowColor = "#ffd662"; ctx.shadowBlur = 12; ctx.fillStyle = "#ffd662"; ctx.strokeStyle = "#fff4b0"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const x = Math.cos(a) * 12, y = Math.sin(a) * 12; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = "#5c3d10"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(5,0); ctx.lineTo(-4,6); ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawOrbs(orbs) {
    const ctx = this.ctx, now = performance.now(), image = this.effectSprites.xpShard;
    for (const orb of orbs) {
      if (!this.isWorldVisible(orb, 35)) continue;
      const pulse = 1 + Math.sin(now * .009 + orb.x * .03) * .1, size = Math.max(16, orb.radius * 3.25) * pulse;
      ctx.save(); ctx.translate(orb.x, orb.y + (this.reducedMotion ? 0 : Math.sin(now * .004 + orb.y) * 1.8));
      ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(2, orb.radius * .8, size * .32, size * .14, 0, 0, TAU); ctx.fill();
      ctx.shadowColor = "#56f4ed"; ctx.shadowBlur = 8;
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, -size / 2, -size / 2, size, size);
      else {
        ctx.fillStyle = "#62f2e6"; ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0,-size*.5); ctx.lineTo(size*.42,0); ctx.lineTo(0,size*.5); ctx.lineTo(-size*.42,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (orb.radius >= 9) { ctx.strokeStyle = "rgba(255,255,255,.68)"; ctx.lineWidth = 1.5; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.arc(0,0,size*.61,0,TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
    }
    ctx.shadowBlur=0;
  }

  drawFeathers(feathers) {
    const ctx=this.ctx;
    for(const f of feathers){if(!this.isWorldVisible(f,30))continue;ctx.save();ctx.translate(f.x,f.y);ctx.rotate(.7);ctx.fillStyle=f.color;ctx.globalAlpha=clamp(f.life/2,0,1);ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(7,-4);ctx.lineTo(12,0);ctx.lineTo(7,4);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.globalAlpha=1;
  }

  drawEffects(effects, map, previous, t, numbersOnly = false, state = {}) {
    const ctx = this.ctx;
    const relevant = effects.filter((raw) => (raw.kind === "number") === numbersOnly);
    const rendered = this.budget(relevant, this.renderBudgets.effects, (effect) => effect.owner === "enemy" || effect.kind === "danger" || effect.kind === "bossCast" || effect.delayed);
    for (const raw of rendered) {
      if ((raw.kind === "number") !== numbersOnly || !this.isWorldVisible(raw, Math.max(40, raw.radius || 0))) continue;
      const essential = raw.owner === "enemy" || raw.kind === "danger" || raw.kind === "bossCast" || raw.delayed;
      if (!essential && !this.densityAllows(raw)) continue;
      let e = this.position(raw, previous?.effects, t);
      const plan = impactRenderPlan(raw, state, { reducedMotion: this.reducedMotion, density: this.qualityProfile.effectsDensity });
      if (plan) e = { ...e, color: plan.colors.body };
      const progress = 1 - clamp(e.life / (e.maxLife || 1), 0, 1);
      ctx.save(); ctx.translate(e.x,e.y);
      if (e.kind === "number") {
        ctx.globalAlpha=clamp(e.life/.35,0,1);ctx.fillStyle=e.color;ctx.font=`800 ${e.critical?18:13}px ${e.critical?"Barlow Condensed":"Inter"}`;ctx.textAlign="center";ctx.fillText(`${e.critical?"✦ ":""}${e.damage}`,0,-progress*34);ctx.restore();continue;
      }
      if (e.kind === "train") {
        ctx.fillStyle=e.color;ctx.globalAlpha=.3;ctx.fillRect(-120,-35,240,70);ctx.strokeStyle="#fff";ctx.globalAlpha=.82;ctx.lineWidth=3;ctx.strokeRect(-110,-29,220,58);
        ctx.fillStyle="#fff";ctx.globalAlpha=.72;for(let x=-58;x<=58;x+=58){ctx.beginPath();ctx.moveTo(x+18,0);ctx.lineTo(x-5,-12);ctx.lineTo(x-5,12);ctx.closePath();ctx.fill();}ctx.restore();continue;
      }
      if (e.kind === "windwall") {
        ctx.strokeStyle=e.color;ctx.lineWidth=18;ctx.globalAlpha=.36;ctx.beginPath();ctx.moveTo(0,-e.radius);ctx.bezierCurveTo(35,-e.radius/2,-30,e.radius/2,0,e.radius);ctx.stroke();ctx.restore();continue;
      }
      if (e.kind === "totem") {
        ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(0,0,260,0,TAU);ctx.stroke();ctx.fillStyle=e.color;ctx.globalAlpha=.8;ctx.fillRect(-9,-25,18,50);ctx.beginPath();ctx.arc(0,-25,19,0,TAU);ctx.fill();ctx.restore();continue;
      }
      if (e.kind === "hurt") {
        ctx.rotate(e.angle || 0); ctx.strokeStyle=e.color; ctx.lineWidth=5; ctx.globalAlpha=.9*(1-progress);
        ctx.beginPath();ctx.arc(0,0,e.radius*(.35+progress*.65),-.85,.85);ctx.stroke();
        for(let i=-2;i<=2;i++){const a=i*.28,len=e.radius*(.65+progress*.75);ctx.beginPath();ctx.moveTo(Math.cos(a)*12,Math.sin(a)*12);ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();}
        ctx.restore();continue;
      }
      if (e.kind === "pickup") {
        ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineWidth=3;ctx.globalAlpha=1-progress;
        ctx.beginPath();ctx.arc(0,0,e.radius*(.25+progress*.75),0,TAU);ctx.stroke();
        for(let i=0;i<6;i++){const a=i*TAU/6+progress;const r=e.radius*(.25+progress*.8);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,2.5*(1-progress)+1,0,TAU);ctx.fill();}
        ctx.restore();continue;
      }
      if (e.kind === "pop") {
        ctx.fillStyle=e.color;ctx.strokeStyle=e.color;ctx.globalAlpha=1-progress;
        for(let i=0;i<9;i++){const a=i*TAU/9+(e.x+e.y)*.01,r=e.radius*progress;ctx.save();ctx.rotate(a);ctx.translate(r,0);ctx.rotate(progress*2);ctx.fillRect(-4,-2,8+progress*10,4);ctx.restore();}
        ctx.globalAlpha=.45*(1-progress);ctx.beginPath();ctx.arc(0,0,e.radius*progress,0,TAU);ctx.fill();ctx.restore();continue;
      }
      const hostileTelegraph = e.owner === "enemy" || e.kind === "danger" || e.kind === "bossCast";
      if (hostileTelegraph) {
        // Enemy ground damage owns a fixed red/black warning language: solid
        // perimeter, inward teeth, and a closing white timing ring.
        ctx.fillStyle = "rgba(93,4,18,.28)"; ctx.beginPath(); ctx.arc(0,0,e.radius,0,TAU); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.84)"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0,0,e.radius,0,TAU); ctx.stroke();
        ctx.strokeStyle = "#ff3857"; ctx.shadowColor = "#ff3857"; ctx.shadowBlur = 8; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0,0,e.radius,0,TAU); ctx.stroke(); ctx.shadowBlur = 0;
        for (let i = 0; i < 6; i++) {
          const a=i*TAU/6;ctx.save();ctx.rotate(a);ctx.translate(e.radius-7,0);ctx.fillStyle=i%2?"#ff3857":"#ff9a54";ctx.beginPath();ctx.moveTo(-18,-7);ctx.lineTo(1,0);ctx.lineTo(-18,7);ctx.closePath();ctx.fill();ctx.restore();
        }
        ctx.strokeStyle="#fff4e8";ctx.globalAlpha=.82;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.radius*(.18+progress*.72),0,TAU);ctx.stroke();
        ctx.globalAlpha=.26;ctx.strokeStyle="#ff9a54";ctx.lineWidth=2;for(let a=0;a<TAU;a+=Math.PI/3){ctx.beginPath();ctx.moveTo(Math.cos(a)*e.radius*.22,Math.sin(a)*e.radius*.22);ctx.lineTo(Math.cos(a)*e.radius*.72,Math.sin(a)*e.radius*.72);ctx.stroke();}
        ctx.restore();continue;
      }
      const delayed = e.delayed && e.life > 0;
      if (plan && plan.decal !== "none") this.drawImpactDecal(e, plan, progress);
      if (plan) { ctx.shadowColor = plan.colors.body; ctx.shadowBlur = ({ none: 0, low: 3, medium: 7, high: 11 }[plan.flash] || 0) * this.qualityProfile.flashIntensity; }
      ctx.globalAlpha = delayed ? .16 + progress*.22 : .48 * (1-progress);
      ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed ? .45+progress*.55 : progress),0,TAU);ctx.fill();
      ctx.globalAlpha = delayed ? .75 : .6*(1-progress);ctx.strokeStyle=e.color;ctx.lineWidth=delayed?3:5;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed?1:.35+progress*.65),0,TAU);ctx.stroke();
      if(delayed){ctx.setLineDash([8,7]);ctx.globalAlpha=.52;ctx.beginPath();ctx.arc(0,0,e.radius*.82,0,TAU);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.save();ctx.rotate(a);ctx.translate(e.radius*.58,0);ctx.fillStyle=e.color;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();}}
      ctx.restore();
    }
    ctx.globalAlpha=1;ctx.setLineDash([]);ctx.shadowBlur=0;
  }

  drawImpactDecal(effect, plan, progress) {
    const ctx = this.ctx, radius = Math.max(12, effect.radius || 12), alpha = .16 * (1 - progress);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = plan.colors.core; ctx.lineWidth = 1.5;
    if (/grid|track|lane|cuts|skid/.test(plan.decal)) {
      const count = /tri|three/.test(plan.decal) ? 3 : 2;
      for (let index = 0; index < count; index++) { const offset = (index - (count - 1) / 2) * radius * .28; ctx.beginPath(); ctx.moveTo(-radius, offset); ctx.lineTo(radius, offset); ctx.stroke(); }
    } else if (/hex|diamond|reticle|snowflake|sun|ring|spiral|mark|scorch|glyph/.test(plan.decal)) {
      const points = /hex/.test(plan.decal) ? 6 : /diamond/.test(plan.decal) ? 4 : 8;
      ctx.beginPath();
      for (let index = 0; index < points; index++) { const angle = index * TAU / points - Math.PI / 2, x = Math.cos(angle) * radius * .72, y = Math.sin(angle) * radius * .72; index ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
      ctx.closePath(); ctx.stroke();
      if (/reticle|sun|snowflake/.test(plan.decal)) for (let index = 0; index < 4; index++) { const angle = index * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(angle)*radius*.25,Math.sin(angle)*radius*.25); ctx.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawImpactTrail(projectile, plan) {
    if (!plan || plan.trail.style === "none" || plan.trail.length <= 0) return;
    const ctx = this.ctx, length = plan.trail.length, width = Math.max(1, plan.trail.width), style = plan.trail.style;
    ctx.save(); ctx.lineCap = "round";
    if (/motes|data|segmented|shards/.test(style)) {
      for (let index = 1; index <= 3; index++) { ctx.globalAlpha = .62 / index; ctx.fillStyle = index % 2 ? plan.colors.body : plan.colors.core; ctx.beginPath(); ctx.arc(-length * index / 3, (index % 2 ? -1 : 1) * width, Math.max(1, width * .65), 0, TAU); ctx.fill(); }
    } else {
      ctx.strokeStyle = plan.colors.keyline; ctx.globalAlpha = .58; ctx.lineWidth = width + 3; ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(-length,0); ctx.stroke();
      ctx.strokeStyle = plan.colors.body; ctx.globalAlpha = .72; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(-2,0); ctx.lineTo(-length,0); ctx.stroke();
      if (/double|ribbon|corkscrew|lane|wake|link|return|slash|radial/.test(style)) { ctx.strokeStyle = plan.colors.core; ctx.globalAlpha = .55; ctx.lineWidth = Math.max(1, width * .45); ctx.beginPath(); ctx.moveTo(-2,-width); ctx.lineTo(-length,width); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawProjectiles(projectiles, hostile, state = {}) {
    const ctx=this.ctx, hostileImage=this.effectSprites.hostileBolt;
    for(const b of projectiles){
      if(!this.isWorldVisible(b,60))continue;
      const plan = hostile ? null : impactRenderPlan(b, state, { reducedMotion: this.reducedMotion, density: this.qualityProfile.effectsDensity });
      const silhouette = plan?.silhouette || "", speed=Math.hypot(b.vx||0,b.vy||0), angle=Math.atan2(b.vy||0,b.vx||0), color=plan?.colors.body||b.color||"#8cefff";
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(angle);ctx.lineJoin="round";ctx.lineCap="round";
      if(hostile){
        // Hostile shots are always winged arrowheads with a long hot tail. The
        // silhouette stays dangerous even when their source enemy is teal.
        if(speed>20){ctx.strokeStyle="rgba(0,0,0,.72)";ctx.lineWidth=Math.max(7,b.radius*.8);ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-37,0);ctx.stroke();ctx.strokeStyle="#ff3857";ctx.lineWidth=Math.max(3,b.radius*.34);ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-38,0);ctx.stroke();ctx.strokeStyle="#ffcf7a";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-25,0);ctx.stroke();}
        const size=Math.max(31,b.radius*3.5);
        if(hostileImage?.complete&&hostileImage.naturalWidth){ctx.save();ctx.filter="brightness(1.7) saturate(2.1)";ctx.drawImage(hostileImage,-size/2,-size/2,size,size);ctx.restore();}
        ctx.shadowColor="#ff3857";ctx.shadowBlur=10;ctx.strokeStyle="#ff4a5f";ctx.fillStyle="#fff6d7";ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(b.radius*1.25,0);ctx.lineTo(-b.radius*.55,-b.radius*.72);ctx.lineTo(-b.radius*.16,0);ctx.lineTo(-b.radius*.55,b.radius*.72);ctx.closePath();ctx.stroke();
        ctx.beginPath();ctx.moveTo(b.radius*.82,0);ctx.lineTo(-b.radius*.16,-b.radius*.25);ctx.lineTo(-b.radius*.02,0);ctx.lineTo(-b.radius*.16,b.radius*.25);ctx.closePath();ctx.fill();
        if(b.radius>=12){ctx.shadowBlur=0;ctx.strokeStyle="#ff9a54";ctx.globalAlpha=.75;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-b.radius*1.12);ctx.lineTo(b.radius*1.12,0);ctx.lineTo(0,b.radius*1.12);ctx.lineTo(-b.radius*1.12,0);ctx.closePath();ctx.stroke();}
        ctx.restore();continue;
      }

      // Friendly fire uses a dark keyline plus white core, and each weapon
      // family keeps its own silhouette instead of becoming another glow dot.
      if(plan) this.drawImpactTrail(b, plan);
      else if(speed>20&&!b.wave&&!b.tornado){ctx.strokeStyle="rgba(1,6,12,.55)";ctx.lineWidth=Math.max(5,b.radius*.8);ctx.beginPath();ctx.moveTo(-b.radius*.3,0);ctx.lineTo(-20-b.radius,0);ctx.stroke();ctx.strokeStyle=color;ctx.globalAlpha=.5;ctx.lineWidth=Math.max(2,b.radius*.36);ctx.beginPath();ctx.moveTo(-b.radius*.2,0);ctx.lineTo(-18-b.radius,0);ctx.stroke();ctx.globalAlpha=1;}
      ctx.shadowColor=color;ctx.shadowBlur=plan ? ({ none: 0, low: 3, medium: 7, high: 11 }[plan.flash] || 0) * this.qualityProfile.flashIntensity : 7;ctx.strokeStyle=color;ctx.fillStyle=plan?.colors.core||"#f8feff";
      if(b.droneBolt||silhouette.includes("drone-dart")){
        ctx.strokeStyle="#06111b";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.stroke();ctx.strokeStyle="#77efcf";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(10,0);ctx.stroke();
        ctx.fillStyle="#effff9";ctx.strokeStyle="#77efcf";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(1,-7);ctx.lineTo(-3,0);ctx.lineTo(1,7);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(-7,0,5,0,TAU);ctx.stroke();ctx.globalAlpha=1;
      } else if(b.dagger||silhouette.includes("dagger")){
        ctx.strokeStyle="#06111b";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(11,0);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(11,0);ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(5,-3);ctx.lineTo(5,3);ctx.closePath();ctx.fill();
      } else if(b.wave||["crescent","double-crescent"].includes(silhouette)){
        ctx.lineWidth=7;ctx.strokeStyle="rgba(2,8,15,.8)";ctx.beginPath();ctx.arc(0,0,b.radius*2,-1,1);ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,b.radius*2,-1,1);ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle="#fff";ctx.beginPath();ctx.arc(0,0,b.radius*1.65,-.85,.85);ctx.stroke();
      } else if(b.tornado||silhouette.includes("spiral")){
        ctx.rotate(-angle);ctx.strokeStyle="rgba(2,8,15,.8)";ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU*1.55);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU*1.55);ctx.stroke();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,b.radius*.52,.2,TAU*1.4);ctx.stroke();
      } else if(b.hex||silhouette.includes("hex")){
        ctx.strokeStyle="#07111b";ctx.lineWidth=5;ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6,x=Math.cos(a)*b.radius,y=Math.sin(a)*b.radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,0,Math.max(2,b.radius*.28),0,TAU);ctx.fill();
      } else if(b.boomerang||silhouette.includes("boomerang")){
        ctx.strokeStyle="#07111b";ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,b.radius*1.2,-1.15,1.15);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,b.radius*1.2,-1.15,1.15);ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(b.radius*1.25,0);ctx.lineTo(b.radius*.55,-4);ctx.lineTo(b.radius*.55,4);ctx.closePath();ctx.fill();
      } else if(silhouette.includes("orb")) {
        const r=b.radius;ctx.strokeStyle=plan.colors.keyline;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();ctx.fillStyle=color;ctx.fill();ctx.fillStyle=plan.colors.core;ctx.beginPath();ctx.arc(r*.2,-r*.2,Math.max(1.5,r*.3),0,TAU);ctx.fill();
      } else if(silhouette.includes("prism")) {
        const r=b.radius;ctx.strokeStyle=plan.colors.keyline;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(r*1.2,0);ctx.lineTo(0,-r);ctx.lineTo(-r*1.2,0);ctx.lineTo(0,r);ctx.closePath();ctx.stroke();ctx.fillStyle=color;ctx.fill();ctx.fillStyle=plan.colors.core;ctx.beginPath();ctx.moveTo(r*.55,0);ctx.lineTo(0,-r*.34);ctx.lineTo(-r*.2,0);ctx.lineTo(0,r*.34);ctx.closePath();ctx.fill();
      } else {
        const r=b.radius;ctx.strokeStyle=plan?.colors.keyline||"#06111b";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(r*1.4,0);ctx.lineTo(-r*.45,-r*.72);ctx.lineTo(-r*.85,0);ctx.lineTo(-r*.45,r*.72);ctx.closePath();ctx.stroke();ctx.fillStyle=color;ctx.fill();ctx.fillStyle=plan?.colors.core||"#fff";ctx.beginPath();ctx.moveTo(r*.9,0);ctx.lineTo(-r*.28,-Math.max(1.5,r*.22));ctx.lineTo(-r*.05,0);ctx.lineTo(-r*.28,Math.max(1.5,r*.22));ctx.closePath();ctx.fill();
        if(b.crit){ctx.shadowBlur=0;ctx.strokeStyle="#ffe67a";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-r*1.15);ctx.lineTo(r*1.15,0);ctx.lineTo(0,r*1.15);ctx.lineTo(-r*1.15,0);ctx.closePath();ctx.stroke();}
      }
      ctx.restore();
    }ctx.shadowBlur=0;
  }

  drawSegmentedHealthBar({
    x, y, width, height, value, maxValue, trail = value, shield = 0, layout,
    color = "#62ebae", trailColor = "#ff9a5b", shieldColor = "#72d8ff",
  }) {
    const ctx = this.ctx, maximum = Math.max(Number.EPSILON, maxValue || 1);
    const valueRatio = clamp((value || 0) / maximum, 0, 1);
    const trailRatio = clamp((trail || 0) / maximum, 0, 1);
    const shieldRatio = clamp((shield || 0) / maximum, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(2,7,13,.88)"; ctx.fillRect(x, y, width, height);
    if (trailRatio > 0) { ctx.fillStyle = trailColor; ctx.fillRect(x, y, width * trailRatio, height); }
    if (valueRatio > 0) { ctx.fillStyle = color; ctx.fillRect(x, y, width * valueRatio, height); }
    if (shieldRatio > 0) {
      ctx.fillStyle = "rgba(2,7,13,.88)"; ctx.fillRect(x, y - 3, width, 2);
      ctx.fillStyle = shieldColor; ctx.fillRect(x, y - 3, width * shieldRatio, 2);
    }
    for (const divider of layout.dividers) {
      const dividerWidth = divider.major ? 2 : 1;
      const dividerX = x + width * divider.position - dividerWidth / 2;
      ctx.fillStyle = divider.major ? "rgba(2,7,13,.88)" : "rgba(2,7,13,.62)";
      ctx.fillRect(dividerX, y, dividerWidth, height);
      if (shieldRatio > 0) ctx.fillRect(dividerX, y - 3, dividerWidth, 2);
    }
    ctx.strokeStyle = "rgba(235,255,250,.22)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
    ctx.restore();
  }

  drawEnemies(enemies, previous, t, map) {
    const ctx = this.ctx, now = performance.now();
    for (const raw of enemies) {
      if (!this.isWorldVisible(raw, 110)) continue;
      const e = this.position(raw, previous?.enemies, t);
      const before = this.previousEntity(previous?.enemies, raw.id);
      const dx = before ? raw.x - before.x : 0, dy = before ? raw.y - before.y : 0;
      const speed = Math.hypot(dx, dy), animation = getThemeEnemyAnimation(e.type);
      const image = this.enemySprites[e.type], spriteReady = image?.complete && image.naturalWidth;
      const phase = Array.from(String(e.id)).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 628 / 100;
      const visual = this.enemyVisuals.get(e.id) || { facing: dx < 0 ? -1 : 1, stride: phase };
      if (Math.abs(dx) > .12) visual.facing = dx < 0 ? -1 : 1;
      visual.stride += speed > .12 ? .16 : .035;
      this.enemyVisuals.set(e.id, visual);

      const spawn = clamp((e.spawnLife || 0) / .24, 0, 1);
      const attack = clamp((e.attackFlash || 0) / .2, 0, 1) * this.qualityProfile.hitFlashes;
      const hitFlash = (e.hitFlash || 0) * this.qualityProfile.hitFlashes;
      const groundY = animation?.groundY ?? e.radius * .7;
      const shadow = animation?.shadow || [e.radius * .9, e.radius * .45];
      const wobble = this.reducedMotion ? 0 : Math.sin(now * .006 + e.x * .02 + e.y * .01) * .026;
      const step = this.reducedMotion ? 0 : Math.sin(visual.stride) * (animation?.stride || 1.5) * clamp(speed * .75, .18, 1);

      ctx.save(); ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - spawn * .55;
      ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.beginPath(); ctx.ellipse(4, groundY, shadow[0], shadow[1], 0, 0, TAU); ctx.fill();
      if (e.elite || e.boss) {
        ctx.strokeStyle = e.boss ? map.accent : "#ffe073"; ctx.globalAlpha = .45; ctx.lineWidth = e.boss ? 8 : 4;
        ctx.beginPath(); ctx.arc(0, 0, e.radius + 10 + Math.sin(now * .005) * 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1 - spawn * .55;
      }

      ctx.save();
      ctx.translate(0, step);
      ctx.rotate(wobble * (e.stun > 0 ? .35 : 1));
      ctx.scale((1 - spawn * .42) * (1 + attack * .16), (1 - spawn * .42) * (1 - attack * .08));
      ctx.shadowColor = attack > 0 ? "#ff5a43" : e.color;
      ctx.shadowBlur = (attack > 0 ? 30 : e.boss ? 28 : e.elite ? 18 : 5) * this.qualityProfile.flashIntensity;
      if (spriteReady && animation) {
        const [width, height] = animation.drawSize, anchor = animation.anchor || [.5, .78];
        ctx.scale(visual.facing, 1);
        if (hitFlash > 0) ctx.filter = `brightness(${1 + clamp(hitFlash / .12, 0, 1) * 2.2 * this.qualityProfile.flashIntensity}) saturate(.45)`;
        else if (attack > 0) ctx.filter = `brightness(${1 + attack * .75 * this.qualityProfile.flashIntensity}) saturate(${1 + attack * .3})`;
        ctx.drawImage(image, -width * anchor[0], groundY - height * anchor[1], width, height);
      } else {
        ctx.fillStyle = hitFlash > 0 ? "#fff" : attack > 0 ? "#fff0c4" : e.color;
        const sides = e.boss ? 7 : (ENEMY_TYPES[e.type]?.shape || 5); ctx.beginPath();
        for (let i = 0; i < sides; i += 1) {
          const angle = i * TAU / sides - .5 * Math.PI, radius = e.radius * (i % 2 ? .82 : 1);
          const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#07111b"; ctx.beginPath();
        ctx.arc(-e.radius * .23, -e.radius * .1, Math.max(2, e.radius * .11), 0, TAU);
        ctx.arc(e.radius * .23, -e.radius * .1, Math.max(2, e.radius * .11), 0, TAU); ctx.fill();
      }
      ctx.restore();

      if (hitFlash > 0) {
        ctx.save(); ctx.rotate(e.hitAngle || 0); ctx.strokeStyle = "#fff"; ctx.globalAlpha = clamp(e.hitFlash / .1, 0, 1); ctx.lineWidth = 3;
        for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(e.radius * .25, i * 7); ctx.lineTo(e.radius * 1.25, i * 12); ctx.stroke(); }
        ctx.restore();
      }
      if (attack > 0) {
        ctx.strokeStyle = "#ff5a43"; ctx.globalAlpha = attack; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, e.radius + 8 + attack * 10, -.65, .65); ctx.stroke(); ctx.globalAlpha = 1;
      }

      const anchor = animation?.anchor || [.5, .5], spriteHeight = animation?.drawSize?.[1] || e.radius * 2;
      const barY = Math.min(-e.radius - 20, groundY - spriteHeight * anchor[1] - 11);
      if (e.eventType === "treasure") {
        ctx.fillStyle = "#fff2a8"; ctx.font = "900 15px Inter"; ctx.textAlign = "center"; ctx.fillText("$", 0, -2);
        ctx.fillStyle = "#f7d76a"; ctx.font = "800 9px Inter"; ctx.fillText(`TREASURE · ${Math.max(0, Math.ceil(e.life))}s`, 0, barY - 9);
      }
      const important = e.elite || e.miniboss || e.boss;
      if (this.enemyHealthBarMode === "all" || (this.enemyHealthBarMode === "important" && important)) {
        const width = e.boss ? 180 : important ? Math.max(56, e.radius * 2) : Math.max(34, e.radius * 1.65);
        this.drawSegmentedHealthBar({
          x: -width / 2, y: barY, width, height: e.boss ? 8 : 6,
          value: e.hp, maxValue: e.maxHp,
          layout: e.boss ? bossHealthSegments(e.maxHp) : enemyHealthSegments(e.maxHp),
          color: e.boss ? map.accent : important ? "#ffcf64" : "#ff6759",
          trailColor: e.boss ? map.accent : important ? "#ffcf64" : "#ff6759",
        });
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  drawDrones(drones, players, previous, t) {
    const ctx = this.ctx, image = this.effectSprites.drone, now = performance.now();
    for (const raw of drones) {
      if (!this.isWorldVisible(raw, 70)) continue;
      const drone = this.position(raw, previous?.drones, t);
      const owner = players.find((player) => player.id === drone.owner);
      ctx.save();
      if (owner) {
        ctx.strokeStyle = "rgba(119,239,207,.18)"; ctx.lineWidth = 1; ctx.setLineDash([3,6]);
        ctx.beginPath(); ctx.moveTo(owner.x, owner.y); ctx.lineTo(drone.x, drone.y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.translate(drone.x, drone.y);
      const bob = this.reducedMotion ? 0 : Math.sin(now * .007 + drone.orbitAngle) * 3;
      ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.beginPath(); ctx.ellipse(3, 22, 22, 8, 0, 0, TAU); ctx.fill();
      ctx.translate(0, bob); ctx.rotate(drone.facing || 0);
      if (drone.fireFlash > 0) {
        const flash = clamp(drone.fireFlash / .18, 0, 1);
        ctx.strokeStyle = `rgba(217,255,244,${flash})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(16,0); ctx.lineTo(35 + flash * 15,0); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(35 + flash * 15,0); ctx.lineTo(27,-5); ctx.lineTo(27,5); ctx.closePath(); ctx.fill();
      }
      ctx.rotate(-(drone.facing || 0));
      ctx.shadowColor = drone.evolved ? "#fff4a8" : "#77efcf"; ctx.shadowBlur = drone.evolved ? 18 : 10;
      ctx.fillStyle = "#06131b"; ctx.strokeStyle = drone.evolved ? "#ffe77a" : "#77efcf"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,-21); ctx.lineTo(22,-5); ctx.lineTo(17,18); ctx.lineTo(-17,18); ctx.lineTo(-22,-5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (image?.complete && image.naturalWidth) {
        ctx.save(); ctx.beginPath(); ctx.arc(0,-1,15,0,TAU); ctx.clip(); ctx.drawImage(image,-18,-19,36,36); ctx.restore();
      } else {
        ctx.fillStyle = "#77efcf"; ctx.font = "900 11px Inter"; ctx.textAlign = "center"; ctx.fillText("AI",0,3);
      }
      ctx.shadowBlur = 0;
      if (drone.collectFlash > 0) {
        const pulse = 1 - clamp(drone.collectFlash / .24, 0, 1);
        ctx.strokeStyle = "#7bfbff"; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0,24 + pulse * 25,0,TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (drone.repairFlash > 0) {
        const pulse = clamp(drone.repairFlash / .7, 0, 1);
        ctx.strokeStyle = "#75efa2"; ctx.lineWidth = 4; ctx.globalAlpha = pulse;
        ctx.beginPath(); ctx.moveTo(-8,-30); ctx.lineTo(8,-30); ctx.moveTo(0,-38); ctx.lineTo(0,-22); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(2,8,13,.86)"; ctx.fillRect(-25,23,50,12);
      ctx.fillStyle = "#dffdf5"; ctx.font = "900 7px Inter"; ctx.textAlign = "center"; ctx.fillText("YUUM.AI",0,31);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i < drone.level ? "#77efcf" : "#243a42"; ctx.fillRect(-13 + i * 6,38,4,2); }
      ctx.restore();
    }
  }

  drawHovered(state, map) {
    if (!this.hoveredEntity) return;
    const ctx = this.ctx, hoveredId = this.hoveredEntity.id;
    if (hoveredId.startsWith("obstacle-")) {
      const block = MAP_OBSTACLES[Number(hoveredId.split("-")[1])];
      if (!block) return;
      const [x,y,w,h] = block; ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.strokeRect(x-5,y-5,w+10,h+10); ctx.strokeStyle = map.accent; ctx.lineWidth = 2; ctx.setLineDash([8,6]); ctx.strokeRect(x-9,y-9,w+18,h+18); ctx.restore(); return;
    }
    let entity = null;
    if (hoveredId === "machine") entity = { x: 0, y: 0, radius: 77 };
    for (const list of [state.enemies, state.drops, state.orbs, state.pods, state.objectives, state.relayBalls, state.drones, state.projectiles, state.hostile, state.effects]) {
      entity ||= list?.find((entry) => entry.id === hoveredId);
    }
    if (!entity) return;
    const radius = Math.max(15, entity.radius || 15) + 8;
    ctx.save(); ctx.translate(entity.x, entity.y); ctx.fillStyle = "rgba(255,255,255,.055)"; ctx.beginPath(); ctx.arc(0,0,radius,0,TAU); ctx.fill();
    ctx.strokeStyle = "rgba(2,8,13,.92)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0,0,radius,0,TAU); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([7,5]); ctx.lineDashOffset = this.reducedMotion ? 0 : -performance.now() * .025; ctx.beginPath(); ctx.arc(0,0,radius,0,TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.restore();
  }

  drawPlayers(players, previous, t, localPlayerId, visualDt = 1 / 60) {
    const ctx = this.ctx;
    for (const raw of players) {
      const p = this.position(raw, previous?.players, t), spec = SPECIALISTS[p.specialist];
      if (!spec || !this.isWorldVisible(p, 100)) continue;
      const before = this.previousEntity(previous?.players, raw.id);
      const dx = before ? raw.x - before.x : 0, dy = before ? raw.y - before.y : 0;
      const inferredMoving = Math.hypot(dx, dy) > .15, moving = Boolean(raw.moving ?? inferredMoving) && !p.dead && !p.downed;
      const attackFacing = Number.isFinite(raw.aimFacing) && ((raw.animTime || 0) > 0 || (raw.weaponFlash || 0) > 0);
      const targetFacing = attackFacing ? raw.aimFacing : Number.isFinite(raw.facing) ? raw.facing : inferredMoving ? Math.atan2(dy, dx) : 0;
      const now = performance.now();
      const visual = this.playerVisuals.get(p.id) || {
        facing: targetFacing, turn: Math.cos(targetFacing) >= 0 ? 1 : -1, stride: 0,
        animation: "idle", animationTime: 0, displayHp: p.hp, trailHp: p.hp,
        previousFootRow: null, wasSkidding: false, updatedAt: now,
      };
      const frameTime = Math.min(.05, Math.max(0, visualDt || (now - visual.updatedAt) / 1000));
      const facingDelta = Math.atan2(Math.sin(targetFacing - visual.facing), Math.cos(targetFacing - visual.facing));
      visual.facing += facingDelta * (1 - Math.exp(-18 * Math.max(frameTime, 1 / 120)));
      const targetTurn = Math.cos(visual.facing) >= 0 ? 1 : -1;
      visual.turn += (targetTurn - visual.turn) * (1 - Math.exp(-16 * Math.max(frameTime, 1 / 120)));
      visual.stride += moving ? frameTime * 10 : 0;

      const hurt = clamp((p.hurtFlash || 0) / .24, 0, 1) * this.qualityProfile.hitFlashes;
      const animation = p.dead || p.downed ? "down" : hurt > .03 ? "hurt" : (raw.animTime || 0) > 0 ? (raw.animState || "idle") : moving ? "run" : "idle";
      if (visual.animation !== animation) {
        visual.animation = animation; visual.animationTime = 0; visual.previousFootRow = null;
      } else visual.animationTime += frameTime * (this.reducedMotion ? .4 : 1);
      const animationConfig = getThemeAnimation(p.specialist);
      const atlasFrame = animationFrame(animationConfig, animation, visual.animationTime);
      if (animation === "run" && atlasFrame && atlasFrame.row !== visual.previousFootRow && atlasFrame.row === 1) this.emitFootfall(p, visual, "#829296");
      visual.previousFootRow = atlasFrame?.row ?? visual.previousFootRow;
      if ((p.skidTime || 0) > .01 && !visual.wasSkidding) this.emitFootfall(p, visual, spec.color, true);
      visual.wasSkidding = (p.skidTime || 0) > .01;
      if (p.hp >= visual.displayHp) { visual.displayHp += (p.hp - visual.displayHp) * (1 - Math.exp(-18 * frameTime)); visual.trailHp = Math.max(visual.trailHp, visual.displayHp); }
      else visual.displayHp += (p.hp - visual.displayHp) * (1 - Math.exp(-28 * frameTime));
      visual.trailHp += (visual.displayHp - visual.trailHp) * (1 - Math.exp(-4.5 * frameTime));
      visual.updatedAt = now;
      this.playerVisuals.set(p.id, visual);

      const groundY = animationConfig?.groundY ?? 24;
      ctx.save(); ctx.translate(p.x, p.y);
      const shadow = animationConfig?.shadow || [35, 14];
      ctx.fillStyle = p.dead || p.downed ? "rgba(0,0,0,.2)" : "rgba(0,0,0,.38)";
      ctx.beginPath(); ctx.ellipse(2, groundY, shadow[0] * (moving ? 1.08 : 1), shadow[1] * (moving ? .9 : 1), 0, 0, TAU); ctx.fill();
      if (p.id === localPlayerId) {
        ctx.strokeStyle = spec.color; ctx.globalAlpha = .66; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, groundY - 2, 39, 17, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (p.invuln > 0 || p.shield > 0) {
        ctx.strokeStyle = p.invuln > 0 ? "#fff" : spec.color; ctx.globalAlpha = .55; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(0, -4, 43 + Math.sin(now * .008) * 2, 49, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (hurt > 0) {
        ctx.save(); ctx.rotate(p.hurtAngle || 0); ctx.strokeStyle = "#ff5870"; ctx.lineWidth = 4; ctx.globalAlpha = hurt;
        ctx.beginPath(); ctx.arc(0, 0, 45 + hurt * 9, -.9, .9); ctx.stroke(); ctx.restore();
      }

      const atlas = this.animationAtlases[p.specialist];
      if (animationConfig && atlasFrame && atlas?.complete && atlas.naturalWidth) {
        const cellWidth = atlas.naturalWidth / animationConfig.grid.columns, cellHeight = atlas.naturalHeight / animationConfig.grid.rows;
        const width = animationConfig.drawSize[0], height = animationConfig.drawSize[1], anchor = animationConfig.anchor || [.5, .82];
        const column = directionColumn(visual.facing), row = atlasFrame.row;
        ctx.save();
        ctx.translate(this.reducedMotion ? 0 : Math.sin(now * .08) * hurt * 3, atlasFrame.offsetY || 0);
        ctx.rotate((atlasFrame.rotation || 0) + Math.sin(p.hurtAngle || 0) * hurt * .06);
        ctx.scale(atlasFrame.scaleX || 1, atlasFrame.scaleY || 1);
        if (hurt > 0) ctx.filter = `brightness(${1 + hurt * 2.2}) saturate(${1 - hurt * .5}) sepia(${hurt * .4})`;
        if (p.dead || p.downed) ctx.globalAlpha = .45;
        ctx.drawImage(atlas, column * cellWidth, row * cellHeight, cellWidth, cellHeight, -width * anchor[0], groundY - height * anchor[1], width, height);
        ctx.restore();
      } else {
        const image = this.sprites[p.specialist];
        if (image?.complete) {
          const size = p.specialist === "sola" ? 118 : 104;
          const step = Math.sin(visual.stride), bob = moving ? Math.abs(step) * -3 : Math.sin(now * .002 + p.x) * .7;
          ctx.save(); ctx.translate(this.reducedMotion ? 0 : Math.sin(now * .08) * hurt * 3, bob - hurt * 2);
          ctx.rotate((moving ? Math.cos(visual.stride) * .025 : 0) + Math.sin(p.hurtAngle || 0) * hurt * .09);
          ctx.transform(visual.turn, 0, -Math.sin(visual.facing) * .045, 1, 0, 0);
          if (hurt > 0) ctx.filter = `brightness(${1 + hurt * 2.4}) saturate(${1 - hurt * .55}) sepia(${hurt * .45})`;
          if (p.dead || p.downed) ctx.globalAlpha = .35;
          ctx.drawImage(image, -size / 2, groundY - size * .82, size, size); ctx.restore();
        } else { ctx.fillStyle = spec.color; ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fill(); }
      }

      if ((p.weaponFlash || 0) > 0 && !p.dead && !p.downed) {
        const flash = clamp(p.weaponFlash / .09, 0, 1), angle = Number.isFinite(p.recoilAngle) ? p.recoilAngle : visual.facing;
        const muzzle = animationConfig?.sockets?.muzzle;
        const distance = muzzle?.distance ?? animationConfig?.muzzleDistance ?? 47, x = Math.cos(angle) * distance, y = Math.sin(angle) * distance + (muzzle?.vertical ?? -8);
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = flash * this.qualityProfile.flashIntensity; ctx.shadowColor = "#ff5c91"; ctx.shadowBlur = 16 * this.qualityProfile.flashIntensity;
        ctx.fillStyle = "#fff4c7"; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-6, -7); ctx.lineTo(-1, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
      }

      const barW = 74, maxHp = Math.max(1, p.maxHp || 1), barY = -64;
      this.drawSegmentedHealthBar({
        x: -barW / 2, y: barY, width: barW, height: 7,
        value: visual.displayHp, trail: visual.trailHp, shield: p.shield, maxValue: maxHp,
        layout: playerHealthSegments(maxHp),
        color: p.hp / maxHp < .3 ? "#ff4b68" : "#62ebae",
      });
      ctx.fillStyle = "#fff"; ctx.font = "700 9px Inter"; ctx.textAlign = "center"; ctx.shadowColor = "#000"; ctx.shadowBlur = 3; ctx.fillText(p.name, 0, barY - 7);
      if (p.dead || p.downed) {
        ctx.globalAlpha = 1; ctx.fillStyle = "rgba(2,7,13,.82)"; ctx.fillRect(-46, 11, 92, 22);
        ctx.fillStyle = "#ff7184"; ctx.font = "800 11px Inter"; ctx.fillText(p.dead ? `${Math.ceil(p.respawnTimer)}s` : `REVIVE ${Math.ceil(p.downTimer)}s`, 0, 26);
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  drawVignette(state, current) {
    const ctx=this.ctx;const hp=current.maxHp?current.hp/current.maxHp:1;
    const vignette=ctx.createRadialGradient(this.width/2,this.height/2,Math.min(this.width,this.height)*.28,this.width/2,this.height/2,Math.max(this.width,this.height)*.72);
    vignette.addColorStop(0,"transparent");vignette.addColorStop(1,hp<.3?`rgba(120,0,15,${.52-hp})`:"rgba(0,3,8,.42)");ctx.fillStyle=vignette;ctx.fillRect(0,0,this.width,this.height);
    const hurt=clamp((current.hurtFlash||0)/.24,0,1)*this.qualityProfile.hitFlashes*this.qualityProfile.flashIntensity;if(hurt>0){ctx.fillStyle=`rgba(255,45,72,${hurt*.13})`;ctx.fillRect(0,0,this.width,this.height);ctx.strokeStyle=`rgba(255,95,115,${hurt*.65})`;ctx.lineWidth=8+hurt*8;ctx.strokeRect(0,0,this.width,this.height);}
  }

  drawOffscreenMarkers(state,map,localPlayerId){
    const targets=[...(state.objectives||[]).map(o=>({...o,label:o.kind==="trial"?"TRIAL":"UPLINK",color:o.kind==="trial"?"#ff6274":map.accent})),...(state.relayBalls||[]).map(ball=>({x:ball.targetX,y:ball.targetY,label:"RELAY",color:"#f7d76a"})),...(state.enemies||[]).filter(e=>e.boss||e.eventType==="treasure").map(e=>({...e,label:e.boss?"APEX":"LOOT",color:e.boss?map.accent:"#f7d76a"}))];
    const p=state.players.find(x=>x.id===localPlayerId)||state.players[0];if(!p)return;const ctx=this.ctx;
    for(const target of targets){const sx=target.x-this.camera.x+this.width/2,sy=target.y-this.camera.y+this.height/2;if(sx>45&&sx<this.width-45&&sy>80&&sy<this.height-55)continue;const a=Math.atan2(target.y-p.y,target.x-p.x);const margin=65,x=clamp(this.width/2+Math.cos(a)*this.width*.42,margin,this.width-margin),y=clamp(this.height/2+Math.sin(a)*this.height*.38,95,this.height-margin);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=target.color;ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.rotate(-a);ctx.fillStyle="#fff";ctx.font="800 8px Inter";ctx.textAlign="center";ctx.fillText(target.label,0,22);ctx.restore();}
  }
}
