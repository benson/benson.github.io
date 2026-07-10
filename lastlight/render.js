import { SPECIALISTS, MAPS, ENEMY_TYPES, clamp } from "./data.js?v=20260710.1";
import { WORLD } from "./engine.js?v=20260710.1";
import { getThemeAsset } from "./themes/lastlight.js?v=20260710.1";

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.camera = { x: 0, y: 0 };
    this.sprites = {};
    this.environments = {};
    this.effectSprites = {};
    this.playerVisuals = new Map();
    this.prevMaps = {};
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
    this.loadSprites();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.canvas);
  }

  loadSprites() {
    for (const spec of Object.values(SPECIALISTS)) {
      const image = new Image(); image.src = spec.sprite; this.sprites[spec.id] = image;
    }
    for (const map of Object.values(MAPS)) {
      if (!map.texture) continue;
      const image = new Image(); image.src = map.texture; this.environments[map.id] = image;
    }
    for (const [name, src] of Object.entries({
      xpShard: getThemeAsset("effects.xpShard"),
      hostileBolt: getThemeAsset("effects.hostileBolt"),
      barricade: getThemeAsset("effects.barricade"),
    })) {
      const image = new Image(); image.src = src; this.effectSprites[name] = image;
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(state, localPlayerId, previous = null, interpolation = 1) {
    if (!state?.players) return;
    // The renderer is constructed while the game screen is display:none. Some
    // browsers therefore report a 0x0 canvas until the first run begins. Never
    // let that 1x1 fallback be stretched across the viewport.
    if (Math.abs(this.canvas.clientWidth - this.width) > 1 || Math.abs(this.canvas.clientHeight - this.height) > 1) this.resize();
    const ctx = this.ctx;
    const map = typeof state.map === "string" ? MAPS[state.map] : state.map;
    const current = state.players.find((p) => p.id === localPlayerId) || state.players[0] || { x: 0, y: 0 };
    const pos = this.position(current, previous?.players, interpolation);
    this.camera.x += (pos.x - this.camera.x) * .14;
    this.camera.y += (pos.y - this.camera.y) * .14;
    const hurt = this.reducedMotion ? 0 : clamp((current.hurtFlash || 0) / .24, 0, 1);
    const shakeX = Math.sin(performance.now() * .09) * hurt * 7, shakeY = Math.cos(performance.now() * .073) * hurt * 5;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = map.floor; ctx.fillRect(0, 0, this.width, this.height);
    this.drawFloor(map, state.time || 0);

    ctx.save();
    ctx.translate(this.width / 2 - this.camera.x + shakeX, this.height / 2 - this.camera.y + shakeY);
    this.drawWorldBorder(map);
    this.drawMapDecor(map);
    this.drawMachine(state, map);
    this.drawPods(state.pods || []);
    this.drawRelayBalls(state.relayBalls || [], map);
    this.drawObjectives(state.objectives || [], map);
    this.drawDrops(state.drops || []);
    this.drawOrbs(state.orbs || []);
    this.drawEffects((state.effects || []).filter((e) => e.kind !== "number"), map, previous, interpolation);
    this.drawFeathers(state.feathers || []);
    this.drawProjectiles(state.projectiles || [], false);
    this.drawProjectiles(state.hostile || [], true);
    this.drawEnemies(state.enemies || [], previous, interpolation, map);
    this.drawPlayers(state.players, previous, interpolation, localPlayerId);
    this.drawEffects((state.effects || []).filter((e) => e.kind === "number"), map, previous, interpolation);
    ctx.restore();
    this.drawVignette(state, current);
    this.drawOffscreenMarkers(state, map, localPlayerId);
  }

  position(entity, previousList, t) {
    if (!previousList || t >= 1) return entity;
    const before = previousList.find((item) => item.id === entity.id);
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

  drawMapDecor(map) {
    const ctx = this.ctx, texture = this.effectSprites.barricade;
    const blocks = [
      [-1450,-840,360,140],[-1040,-1040,170,260],[-540,-920,310,90],[620,-1050,420,150],[1250,-760,220,330],
      [-1570,650,300,220],[-950,880,430,105],[-220,1030,280,110],[580,850,180,260],[1130,790,390,130],
      [-1640,-170,180,300],[1480,-130,150,360],[-640,280,220,80],[720,-300,260,86],
    ];
    for (const [x,y,w,h] of blocks) {
      ctx.save();
      // The offset foot and bright top edge make these read as raised cover,
      // not as another flat damage telegraph painted on the floor.
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
    ctx.strokeStyle = `${map.accent}25`; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(-WORLD.width/2, -390); ctx.lineTo(WORLD.width/2, -390); ctx.moveTo(-WORLD.width/2, 420); ctx.lineTo(WORLD.width/2, 420); ctx.stroke();
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
    const ctx = this.ctx;
    for (const pod of pods) {
      const pulse = .75 + Math.sin(performance.now() * .004 + pod.x) * .25;
      ctx.save(); ctx.translate(pod.x, pod.y + Math.sin(performance.now() * .002 + pod.y) * 2); ctx.rotate(Math.PI / 4 + (this.reducedMotion ? 0 : performance.now() * .00018));
      ctx.fillStyle = "#1a3541"; ctx.strokeStyle = "#6cc4ce"; ctx.lineWidth = 2; ctx.fillRect(-18,-18,36,36); ctx.strokeRect(-18,-18,36,36);
      ctx.shadowColor = "#89f5e5"; ctx.shadowBlur = 10 * pulse; ctx.fillStyle = "#89f5e5"; ctx.fillRect(-4,-4,8,8); ctx.restore();
    }
  }

  drawObjectives(objectives, map) {
    const ctx = this.ctx, now = performance.now();
    for (const objective of objectives) {
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
    for(const f of feathers){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(.7);ctx.fillStyle=f.color;ctx.globalAlpha=clamp(f.life/2,0,1);ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(7,-4);ctx.lineTo(12,0);ctx.lineTo(7,4);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.globalAlpha=1;
  }

  drawEffects(effects, map, previous, t) {
    const ctx = this.ctx;
    for (const raw of effects) {
      const e = this.position(raw, previous?.effects, t), progress = 1 - clamp(e.life / (e.maxLife || 1), 0, 1);
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
      ctx.globalAlpha = delayed ? .16 + progress*.22 : .48 * (1-progress);
      ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed ? .45+progress*.55 : progress),0,TAU);ctx.fill();
      ctx.globalAlpha = delayed ? .75 : .6*(1-progress);ctx.strokeStyle=e.color;ctx.lineWidth=delayed?3:5;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed?1:.35+progress*.65),0,TAU);ctx.stroke();
      if(delayed){ctx.setLineDash([8,7]);ctx.globalAlpha=.52;ctx.beginPath();ctx.arc(0,0,e.radius*.82,0,TAU);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.save();ctx.rotate(a);ctx.translate(e.radius*.58,0);ctx.fillStyle=e.color;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();}}
      ctx.restore();
    }
    ctx.globalAlpha=1;ctx.setLineDash([]);ctx.shadowBlur=0;
  }

  drawProjectiles(projectiles, hostile) {
    const ctx=this.ctx, hostileImage=this.effectSprites.hostileBolt;
    for(const b of projectiles){
      const speed=Math.hypot(b.vx||0,b.vy||0), angle=Math.atan2(b.vy||0,b.vx||0), color=b.color||"#8cefff";
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
      if(speed>20&&!b.wave&&!b.tornado){ctx.strokeStyle="rgba(1,6,12,.55)";ctx.lineWidth=Math.max(5,b.radius*.8);ctx.beginPath();ctx.moveTo(-b.radius*.3,0);ctx.lineTo(-20-b.radius,0);ctx.stroke();ctx.strokeStyle=color;ctx.globalAlpha=.5;ctx.lineWidth=Math.max(2,b.radius*.36);ctx.beginPath();ctx.moveTo(-b.radius*.2,0);ctx.lineTo(-18-b.radius,0);ctx.stroke();ctx.globalAlpha=1;}
      ctx.shadowColor=color;ctx.shadowBlur=7;ctx.strokeStyle=color;ctx.fillStyle="#f8feff";
      if(b.dagger){
        ctx.strokeStyle="#06111b";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(11,0);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(11,0);ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(5,-3);ctx.lineTo(5,3);ctx.closePath();ctx.fill();
      } else if(b.wave){
        ctx.lineWidth=7;ctx.strokeStyle="rgba(2,8,15,.8)";ctx.beginPath();ctx.arc(0,0,b.radius*2,-1,1);ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,b.radius*2,-1,1);ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle="#fff";ctx.beginPath();ctx.arc(0,0,b.radius*1.65,-.85,.85);ctx.stroke();
      } else if(b.tornado){
        ctx.rotate(-angle);ctx.strokeStyle="rgba(2,8,15,.8)";ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU*1.55);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU*1.55);ctx.stroke();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,b.radius*.52,.2,TAU*1.4);ctx.stroke();
      } else if(b.hex){
        ctx.strokeStyle="#07111b";ctx.lineWidth=5;ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6,x=Math.cos(a)*b.radius,y=Math.sin(a)*b.radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,0,Math.max(2,b.radius*.28),0,TAU);ctx.fill();
      } else if(b.boomerang){
        ctx.strokeStyle="#07111b";ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,b.radius*1.2,-1.15,1.15);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,b.radius*1.2,-1.15,1.15);ctx.stroke();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(b.radius*1.25,0);ctx.lineTo(b.radius*.55,-4);ctx.lineTo(b.radius*.55,4);ctx.closePath();ctx.fill();
      } else {
        const r=b.radius;ctx.strokeStyle="#06111b";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(r*1.4,0);ctx.lineTo(-r*.45,-r*.72);ctx.lineTo(-r*.85,0);ctx.lineTo(-r*.45,r*.72);ctx.closePath();ctx.stroke();ctx.fillStyle=color;ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(r*.9,0);ctx.lineTo(-r*.28,-Math.max(1.5,r*.22));ctx.lineTo(-r*.05,0);ctx.lineTo(-r*.28,Math.max(1.5,r*.22));ctx.closePath();ctx.fill();
        if(b.crit){ctx.shadowBlur=0;ctx.strokeStyle="#ffe67a";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-r*1.15);ctx.lineTo(r*1.15,0);ctx.lineTo(0,r*1.15);ctx.lineTo(-r*1.15,0);ctx.closePath();ctx.stroke();}
      }
      ctx.restore();
    }ctx.shadowBlur=0;
  }

  drawEnemies(enemies, previous, t, map) {
    const ctx=this.ctx;
    for(const raw of enemies){
      const e=this.position(raw,previous?.enemies,t),now=performance.now();ctx.save();ctx.translate(e.x,e.y);
      const spawn=clamp((e.spawnLife||0)/.24,0,1),attack=clamp((e.attackFlash||0)/.2,0,1),wobble=this.reducedMotion?0:Math.sin(now*.006+e.x*.02+e.y*.01)*.035;
      ctx.rotate(wobble*(e.stun>0?.35:1));ctx.scale((1-spawn*.42)*(1+attack*.16),(1-spawn*.42)*(1-attack*.08));ctx.globalAlpha=1-spawn*.55;
      ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(4,e.radius*.7,e.radius*.9,e.radius*.45,0,0,TAU);ctx.fill();
      if(e.elite||e.boss){ctx.strokeStyle=e.boss?map.accent:"#ffe073";ctx.globalAlpha=.45;ctx.lineWidth=e.boss?8:4;ctx.beginPath();ctx.arc(0,0,e.radius+10+Math.sin(performance.now()*.005)*3,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillStyle=e.hitFlash>0?"#fff":e.attackFlash>0?"#fff0c4":e.color;ctx.shadowColor=e.attackFlash>0?"#ff5a43":e.color;ctx.shadowBlur=e.attackFlash>0?30:e.boss?28:e.elite?18:5;
      const sides=e.boss?7:(ENEMY_TYPES[e.type]?.shape||5);ctx.beginPath();
      for(let i=0;i<sides;i++){const a=i*TAU/sides-.5*Math.PI;const r=e.radius*(i%2? .82:1);const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
      ctx.fillStyle="#07111b";ctx.beginPath();ctx.arc(-e.radius*.23,-e.radius*.1,Math.max(2,e.radius*.11),0,TAU);ctx.arc(e.radius*.23,-e.radius*.1,Math.max(2,e.radius*.11),0,TAU);ctx.fill();
      if(e.hitFlash>0){ctx.rotate(e.hitAngle||0);ctx.strokeStyle="#fff";ctx.globalAlpha=clamp(e.hitFlash/.1,0,1);ctx.lineWidth=3;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(e.radius*.25,i*7);ctx.lineTo(e.radius*1.25,i*12);ctx.stroke();}ctx.rotate(-(e.hitAngle||0));ctx.globalAlpha=1;}
      if(e.attackFlash>0){ctx.strokeStyle="#ff5a43";ctx.globalAlpha=attack;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,e.radius+8+attack*10,-.65,.65);ctx.stroke();ctx.globalAlpha=1;}
      if(e.eventType==="treasure"){ctx.fillStyle="#fff2a8";ctx.font="900 15px Inter";ctx.textAlign="center";ctx.fillText("$",0,5);ctx.fillStyle="#f7d76a";ctx.font="800 9px Inter";ctx.fillText(`TREASURE · ${Math.max(0,Math.ceil(e.life))}s`,0,-e.radius-30);}
      if(e.elite||e.miniboss||e.boss){const w=e.boss?180:Math.max(56,e.radius*2);ctx.fillStyle="rgba(2,7,13,.8)";ctx.fillRect(-w/2,-e.radius-20,w,6);ctx.fillStyle=e.boss?map.accent:"#ffcf64";ctx.fillRect(-w/2,-e.radius-20,w*clamp(e.hp/e.maxHp,0,1),6);}
      ctx.restore();
    }ctx.shadowBlur=0;
  }

  drawPlayers(players, previous, t, localPlayerId) {
    const ctx=this.ctx;
    for(const raw of players){
      const p=this.position(raw,previous?.players,t),spec=SPECIALISTS[p.specialist];ctx.save();ctx.translate(p.x,p.y);
      if(p.dead||p.downed){ctx.globalAlpha=.32;ctx.strokeStyle="#ff5575";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,78,0,TAU);ctx.stroke();ctx.fillStyle="#fff";ctx.font="800 12px Inter";ctx.textAlign="center";ctx.fillText(p.dead?`${Math.ceil(p.respawnTimer)}s`:`REVIVE ${Math.ceil(p.downTimer)}s`,0,5);ctx.restore();continue;}
      ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.ellipse(0,24,35,16,0,0,TAU);ctx.fill();
      if(p.id===localPlayerId){ctx.strokeStyle=spec.color;ctx.globalAlpha=.65;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,39,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      if(p.invuln>0||p.shield>0){ctx.strokeStyle=p.invuln>0?"#fff":spec.color;ctx.globalAlpha=.55;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,43+Math.sin(performance.now()*.008)*2,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      const hurt=clamp((p.hurtFlash||0)/.24,0,1);
      if(hurt>0){ctx.save();ctx.rotate(p.hurtAngle||0);ctx.strokeStyle="#ff5870";ctx.lineWidth=4;ctx.globalAlpha=hurt;ctx.beginPath();ctx.arc(0,0,45+hurt*9,-.9,.9);ctx.stroke();ctx.restore();}
      const before=previous?.players?.find((item)=>item.id===raw.id);
      const dx=before?raw.x-before.x:0,dy=before?raw.y-before.y:0;
      const inferredMoving=Math.hypot(dx,dy)>.15;
      const targetFacing=Number.isFinite(raw.facing)?raw.facing:(inferredMoving?Math.atan2(dy,dx):0);
      const now=performance.now();
      const visual=this.playerVisuals.get(p.id)||{facing:targetFacing,turn:Math.cos(targetFacing)>=0?1:-1,stride:0,updatedAt:now};
      const facingDelta=Math.atan2(Math.sin(targetFacing-visual.facing),Math.cos(targetFacing-visual.facing));
      visual.facing+=facingDelta*.22;
      const targetTurn=Math.cos(visual.facing)>=0?1:-1;
      visual.turn+=(targetTurn-visual.turn)*.2;
      const moving=raw.moving??inferredMoving;
      const frameTime=Math.min(.05,Math.max(0,(now-visual.updatedAt)/1000));
      visual.stride+=moving?frameTime*10:0;visual.updatedAt=now;
      this.playerVisuals.set(p.id,visual);
      const step=Math.sin(visual.stride),bob=moving?Math.abs(Math.sin(visual.stride))*-3:Math.sin(performance.now()*.002+p.x)*.7;
      if(moving){ctx.save();ctx.globalAlpha=.14+.08*Math.abs(step);ctx.fillStyle=spec.color;ctx.beginPath();ctx.ellipse(-Math.cos(visual.facing)*15,25-Math.sin(visual.facing)*8,18,7,visual.facing,0,TAU);ctx.fill();ctx.restore();}
      const image=this.sprites[p.specialist];if(image?.complete){
        const size=p.specialist==="sola"?118:104;
        ctx.save();ctx.translate((this.reducedMotion?0:Math.sin(performance.now()*.08)*hurt*3),bob-hurt*2);ctx.rotate((moving?Math.cos(visual.stride)*.025:0)+Math.sin(p.hurtAngle||0)*hurt*.09);
        ctx.transform(visual.turn,0,-Math.sin(visual.facing)*.045,1,0,0);
        if(hurt>0)ctx.filter=`brightness(${1+hurt*2.4}) saturate(${1-hurt*.55}) sepia(${hurt*.45})`;
        ctx.drawImage(image,-size/2,-size*.62,size,size);ctx.restore();
      }
      else{ctx.fillStyle=spec.color;ctx.beginPath();ctx.arc(0,0,28,0,TAU);ctx.fill();}
      const barW=74;ctx.fillStyle="rgba(2,7,13,.82)";ctx.fillRect(-barW/2,-58,barW,7);ctx.fillStyle=p.hp/p.maxHp<.3?"#ff4b68":"#62ebae";ctx.fillRect(-barW/2,-58,barW*clamp(p.hp/p.maxHp,0,1),7);if(p.shield>0){ctx.fillStyle="#72d8ff";ctx.fillRect(-barW/2,-61,barW*clamp(p.shield/p.maxHp,0,1),2);}
      ctx.fillStyle="#fff";ctx.font="700 9px Inter";ctx.textAlign="center";ctx.shadowColor="#000";ctx.shadowBlur=3;ctx.fillText(p.name,0,-65);ctx.restore();
    }ctx.shadowBlur=0;
  }

  drawVignette(state, current) {
    const ctx=this.ctx;const hp=current.maxHp?current.hp/current.maxHp:1;
    const vignette=ctx.createRadialGradient(this.width/2,this.height/2,Math.min(this.width,this.height)*.28,this.width/2,this.height/2,Math.max(this.width,this.height)*.72);
    vignette.addColorStop(0,"transparent");vignette.addColorStop(1,hp<.3?`rgba(120,0,15,${.52-hp})`:"rgba(0,3,8,.42)");ctx.fillStyle=vignette;ctx.fillRect(0,0,this.width,this.height);
    const hurt=clamp((current.hurtFlash||0)/.24,0,1);if(hurt>0){ctx.fillStyle=`rgba(255,45,72,${hurt*.13})`;ctx.fillRect(0,0,this.width,this.height);ctx.strokeStyle=`rgba(255,95,115,${hurt*.65})`;ctx.lineWidth=8+hurt*8;ctx.strokeRect(0,0,this.width,this.height);}
  }

  drawOffscreenMarkers(state,map,localPlayerId){
    const targets=[...(state.objectives||[]).map(o=>({...o,label:o.kind==="trial"?"TRIAL":"UPLINK",color:o.kind==="trial"?"#ff6274":map.accent})),...(state.relayBalls||[]).map(ball=>({x:ball.targetX,y:ball.targetY,label:"RELAY",color:"#f7d76a"})),...(state.enemies||[]).filter(e=>e.boss||e.eventType==="treasure").map(e=>({...e,label:e.boss?"APEX":"LOOT",color:e.boss?map.accent:"#f7d76a"}))];
    const p=state.players.find(x=>x.id===localPlayerId)||state.players[0];if(!p)return;const ctx=this.ctx;
    for(const target of targets){const sx=target.x-this.camera.x+this.width/2,sy=target.y-this.camera.y+this.height/2;if(sx>45&&sx<this.width-45&&sy>80&&sy<this.height-55)continue;const a=Math.atan2(target.y-p.y,target.x-p.x);const margin=65,x=clamp(this.width/2+Math.cos(a)*this.width*.42,margin,this.width-margin),y=clamp(this.height/2+Math.sin(a)*this.height*.38,95,this.height-margin);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=target.color;ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.rotate(-a);ctx.fillStyle="#fff";ctx.font="800 8px Inter";ctx.textAlign="center";ctx.fillText(target.label,0,22);ctx.restore();}
  }
}
