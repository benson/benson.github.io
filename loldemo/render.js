import { SPECIALISTS, MAPS, ENEMY_TYPES, clamp } from "./data.js";
import { WORLD } from "./engine.js";

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
    this.playerVisuals = new Map();
    this.prevMaps = {};
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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = map.floor; ctx.fillRect(0, 0, this.width, this.height);
    this.drawFloor(map, state.time || 0);

    ctx.save();
    ctx.translate(this.width / 2 - this.camera.x, this.height / 2 - this.camera.y);
    this.drawWorldBorder(map);
    this.drawMapDecor(map);
    this.drawMachine(state, map);
    this.drawPods(state.pods || []);
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
    const ctx = this.ctx;
    ctx.fillStyle = map.deco; ctx.globalAlpha = .45;
    const blocks = [
      [-1450,-840,360,140],[-1040,-1040,170,260],[-540,-920,310,90],[620,-1050,420,150],[1250,-760,220,330],
      [-1570,650,300,220],[-950,880,430,105],[-220,1030,280,110],[580,850,180,260],[1130,790,390,130],
      [-1640,-170,180,300],[1480,-130,150,360],[-640,280,220,80],[720,-300,260,86],
    ];
    for (const [x,y,w,h] of blocks) { ctx.fillRect(x,y,w,h); ctx.strokeStyle = `${map.accent}22`; ctx.strokeRect(x,y,w,h); }
    ctx.globalAlpha = 1;
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
      ctx.save(); ctx.translate(pod.x, pod.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#1a3541"; ctx.strokeStyle = "#6cc4ce"; ctx.lineWidth = 2; ctx.fillRect(-18,-18,36,36); ctx.strokeRect(-18,-18,36,36);
      ctx.fillStyle = "#89f5e5"; ctx.fillRect(-4,-4,8,8); ctx.restore();
    }
  }

  drawObjectives(objectives, map) {
    const ctx = this.ctx;
    for (const objective of objectives) {
      ctx.save(); ctx.translate(objective.x, objective.y);
      ctx.setLineDash([9, 7]); ctx.lineWidth = 3; ctx.strokeStyle = objective.kind === "trial" ? "#ff5f70" : map.accent;
      ctx.beginPath(); ctx.arc(0,0,objective.radius,0,TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .18; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(0,0,objective.radius * clamp(objective.progress,0,1),0,TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "800 10px Inter"; ctx.fillText(objective.kind === "trial" ? "TRIAL" : "UPLINK",0,4); ctx.restore();
    }
  }

  drawDrops(drops) {
    const ctx = this.ctx;
    for (const drop of drops) {
      ctx.save(); ctx.translate(drop.x, drop.y); const pulse = 1 + Math.sin(performance.now()*.007 + drop.x)*.1; ctx.scale(pulse,pulse);
      if (drop.type === "card") { ctx.rotate(Math.PI/4); ctx.fillStyle="#f8d85c"; ctx.shadowColor="#f8d85c"; ctx.shadowBlur=16; ctx.fillRect(-11,-11,22,22); ctx.fillStyle="#301f12";ctx.fillRect(-4,-4,8,8); }
      else { ctx.fillStyle = drop.type === "heal" ? "#6dff9e" : drop.type === "vacuum" ? "#71eaff" : drop.type === "mine" ? "#ff744f" : "#ffd662"; ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,drop.radius,0,TAU);ctx.fill(); }
      ctx.restore();
    }
  }

  drawOrbs(orbs) {
    const ctx = this.ctx;
    for (const orb of orbs) { ctx.fillStyle=orb.color;ctx.shadowColor=orb.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(orb.x,orb.y,orb.radius,0,TAU);ctx.fill(); }
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
        ctx.fillStyle=e.color;ctx.globalAlpha=.32;ctx.fillRect(-120,-35,240,70);ctx.strokeStyle="#fff";ctx.globalAlpha=.75;ctx.strokeRect(-110,-29,220,58);ctx.restore();continue;
      }
      if (e.kind === "windwall") {
        ctx.strokeStyle=e.color;ctx.lineWidth=18;ctx.globalAlpha=.36;ctx.beginPath();ctx.moveTo(0,-e.radius);ctx.bezierCurveTo(35,-e.radius/2,-30,e.radius/2,0,e.radius);ctx.stroke();ctx.restore();continue;
      }
      if (e.kind === "totem") {
        ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(0,0,260,0,TAU);ctx.stroke();ctx.fillStyle=e.color;ctx.globalAlpha=.8;ctx.fillRect(-9,-25,18,50);ctx.beginPath();ctx.arc(0,-25,19,0,TAU);ctx.fill();ctx.restore();continue;
      }
      const delayed = e.delayed && e.life > 0;
      ctx.globalAlpha = delayed ? .16 + progress*.22 : .48 * (1-progress);
      ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed ? .45+progress*.55 : progress),0,TAU);ctx.fill();
      ctx.globalAlpha = delayed ? .75 : .6*(1-progress);ctx.strokeStyle=e.color;ctx.lineWidth=delayed?3:5;ctx.beginPath();ctx.arc(0,0,e.radius*(delayed?1:.35+progress*.65),0,TAU);ctx.stroke();
      if(delayed){ctx.setLineDash([8,7]);ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(0,0,e.radius*.82,0,TAU);ctx.stroke();}
      ctx.restore();
    }
    ctx.globalAlpha=1;ctx.setLineDash([]);ctx.shadowBlur=0;
  }

  drawProjectiles(projectiles, hostile) {
    const ctx=this.ctx;
    for(const b of projectiles){
      ctx.save();ctx.translate(b.x,b.y);ctx.fillStyle=b.color || (hostile?"#ff5575":"#fff");ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=hostile?12:8;
      if(b.dagger){ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillRect(-10,-2,20,4);}
      else if(b.wave){ctx.rotate(Math.atan2(b.vy,b.vx));ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,b.radius*2,-1,1);ctx.stroke();}
      else if(b.tornado){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU*1.5);ctx.stroke();}
      else {ctx.beginPath();ctx.arc(0,0,b.radius,0,TAU);ctx.fill();}
      ctx.restore();
    }ctx.shadowBlur=0;
  }

  drawEnemies(enemies, previous, t, map) {
    const ctx=this.ctx;
    for(const raw of enemies){
      const e=this.position(raw,previous?.enemies,t);ctx.save();ctx.translate(e.x,e.y);
      ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(4,e.radius*.7,e.radius*.9,e.radius*.45,0,0,TAU);ctx.fill();
      if(e.elite||e.boss){ctx.strokeStyle=e.boss?map.accent:"#ffe073";ctx.globalAlpha=.45;ctx.lineWidth=e.boss?8:4;ctx.beginPath();ctx.arc(0,0,e.radius+10+Math.sin(performance.now()*.005)*3,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillStyle=e.hitFlash>0?"#fff":e.color;ctx.shadowColor=e.color;ctx.shadowBlur=e.boss?28:e.elite?18:5;
      const sides=e.boss?7:(ENEMY_TYPES[e.type]?.shape||5);ctx.beginPath();
      for(let i=0;i<sides;i++){const a=i*TAU/sides-.5*Math.PI;const r=e.radius*(i%2? .82:1);const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
      ctx.fillStyle="#07111b";ctx.beginPath();ctx.arc(-e.radius*.23,-e.radius*.1,Math.max(2,e.radius*.11),0,TAU);ctx.arc(e.radius*.23,-e.radius*.1,Math.max(2,e.radius*.11),0,TAU);ctx.fill();
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
        ctx.save();ctx.translate(0,bob);ctx.rotate(moving?Math.cos(visual.stride)*.025:0);
        ctx.transform(visual.turn,0,-Math.sin(visual.facing)*.045,1,0,0);
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
  }

  drawOffscreenMarkers(state,map,localPlayerId){
    const targets=[...(state.objectives||[]).map(o=>({...o,label:o.kind==="trial"?"TRIAL":"UPLINK",color:o.kind==="trial"?"#ff6274":map.accent})),...(state.enemies||[]).filter(e=>e.boss).map(e=>({...e,label:"APEX",color:map.accent}))];
    const p=state.players.find(x=>x.id===localPlayerId)||state.players[0];if(!p)return;const ctx=this.ctx;
    for(const target of targets){const sx=target.x-this.camera.x+this.width/2,sy=target.y-this.camera.y+this.height/2;if(sx>45&&sx<this.width-45&&sy>80&&sy<this.height-55)continue;const a=Math.atan2(target.y-p.y,target.x-p.x);const margin=65,x=clamp(this.width/2+Math.cos(a)*this.width*.42,margin,this.width-margin),y=clamp(this.height/2+Math.sin(a)*this.height*.38,95,this.height-margin);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=target.color;ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-7,-7);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.rotate(-a);ctx.fillStyle="#fff";ctx.font="800 8px Inter";ctx.textAlign="center";ctx.fillText(target.label,0,22);ctx.restore();}
  }
}
