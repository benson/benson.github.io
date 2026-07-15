import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENEMY_BODY_AUDIT_CASES, ENEMY_BODY_AUDIT_MODES,
  assertEnemyBodyMotionAuditMetadata, buildEnemyBodyMotionAuditMetadata, enemyBodyAuditTimeline,
} from "../enemy-body-motion-audit.js";
import { getThemeEnemyAnimation } from "../themes/lastlight.js";

function browserPayload() {
  return ENEMY_BODY_AUDIT_CASES.map((attack) => {
    const rig = getThemeEnemyAnimation(attack.type), totalTicks = attack.windupTicks + attack.activeTicks + attack.recoveryTicks + (attack.type === "bomber" ? 30 : 0);
    const modes = Object.fromEntries(ENEMY_BODY_AUDIT_MODES.map((mode) => [mode.id, Array.from({ length: totalTicks + 1 }, (_, tick) => enemyBodyAuditTimeline(attack, tick, mode))]));
    return { ...attack, totalTicks, rig: { atlas: rig.atlas, grid: rig.grid, anchor: rig.anchor, drawSize: rig.drawSize, groundY: rig.groundY }, modes };
  });
}

export function enemyBodyMotionAuditHtml(report) {
  const payload = JSON.stringify(browserPayload()).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lastlight enemy body motion audit</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#02070d;color:#f4eee2}*{box-sizing:border-box}body{margin:0;padding:24px;background:radial-gradient(circle at 50% -30%,#17283a,#02070d 48%)}main{max-width:1120px;margin:auto}.eyebrow{color:#7fe2d7;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{margin:6px 0 4px;font-size:28px}.sub{color:#8ea6ba;margin:0 0 18px}.panel{border:1px solid #263b50;background:#07111be8;padding:14px;box-shadow:0 18px 60px #0009}canvas{display:block;width:100%;height:auto;background:#030a11;border:1px solid #1d3043}.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}button,select{background:#0b1a28;color:#f4eee2;border:1px solid #35516b;padding:8px 11px;font:700 13px inherit}button[aria-pressed=true]{border-color:#7fe2d7;color:#7fe2d7}button:hover{border-color:#f7d76a}.timeline{position:relative;height:18px;border:1px solid #35516b;background:#02070d;cursor:pointer}.fill{height:100%;background:#26465e}.contact{position:absolute;top:-5px;width:3px;height:26px;background:#ff5575;box-shadow:0 0 8px #ff5575}.meta{display:flex;justify-content:space-between;gap:12px;color:#9ab0c3;font-size:12px;margin-top:8px}.legend{display:flex;gap:18px;margin-top:12px;color:#9ab0c3;font-size:12px}.swatch{display:inline-block;width:11px;height:11px;margin-right:5px;vertical-align:-1px}.note{margin-top:14px;padding:10px 12px;border-left:3px solid #f7d76a;background:#f7d76a0d;color:#c9d5df;font-size:13px}
</style></head><body><main><div class="eyebrow">Motion synchronization review</div><h1>Enemy body-to-impact audit</h1><p class="sub">Actual normalized atlases and runtime rig frames · ${report.metadataSha256.slice(0, 16)}</p><section class="panel"><canvas width="1060" height="560"></canvas><div class="controls"><select id="enemy"></select><select id="mode"><option value="normal">Normal motion</option><option value="reduced-motion">Reduced motion</option></select><button data-speed=".25">0.25×</button><button data-speed=".5">0.5×</button><button data-speed="1" aria-pressed="true">1×</button><button id="pause">Pause</button><button id="prev">− Frame</button><button id="next">+ Frame</button></div><div class="timeline"><div class="fill"></div><div class="contact" title="Authoritative contact tick"></div></div><div class="meta"><span id="status"></span><span id="tick"></span></div><div class="legend"><span><i class="swatch" style="background:#ff5575"></i>authoritative threat</span><span><i class="swatch" style="background:#f7d76a"></i>contact tick</span><span><i class="swatch" style="background:#7fe2d7"></i>body anchor</span></div><p class="note">Bomber intentionally has no post-removal body animation: its last live windup frame reaches maximum compression, then the real detonation effect owns contact as the body disappears.</p></section></main>
<script>
const cases=${payload}, canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),enemySelect=document.querySelector('#enemy'),modeSelect=document.querySelector('#mode'),statusEl=document.querySelector('#status'),tickEl=document.querySelector('#tick'),fill=document.querySelector('.fill'),contact=document.querySelector('.contact');
for(const item of cases){const o=document.createElement('option');o.value=item.type;o.textContent=item.name;enemySelect.append(o)}
const images=new Map(cases.map(item=>{const image=new Image();image.src='../../'+item.rig.atlas.src;return[item.type,image]}));let index=0,tick=0,speed=1,paused=false,last=performance.now();
const selected=()=>cases[index], sequence=()=>selected().modes[modeSelect.value];
function line(x1,y1,x2,y2,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function threat(item,frame,cx,cy){const g=item.geometry,p=Math.min(1,frame.tick/item.windupTicks);ctx.save();ctx.translate(cx,cy);ctx.fillStyle='rgba(255,55,90,.12)';ctx.strokeStyle='#ff5575';ctx.lineWidth=3;ctx.setLineDash([12,8]);if(g.family==='charge'||g.family==='line'){ctx.fillRect(15,-g.halfWidth,g.range,g.halfWidth*2);ctx.strokeRect(15,-g.halfWidth,g.range,g.halfWidth*2);for(let x=38;x<g.range;x+=34)line(x-8,-6,x,0,'rgba(244,238,226,'+(.25+p*.55)+')');}else{ctx.beginPath();ctx.arc(0,0,g.radius,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.setLineDash([]);if(frame.tick<item.windupTicks){ctx.strokeStyle='#f7d76a';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,Math.max(18,g.radius*(1-p)),0,Math.PI*2);ctx.stroke()}else{const cp=frame.contactProgress;ctx.globalAlpha=1-cp*.8;ctx.strokeStyle='#fff4e8';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,Math.max(16,g.radius*(.22+cp*.78)),0,Math.PI*2);ctx.stroke()}ctx.restore()}
function body(item,frame,cx,cy){if(!frame.bodyVisible)return;const image=images.get(item.type),f=frame.frame;if(!image.complete||!image.naturalWidth||!f)return;const cw=image.naturalWidth/item.rig.grid.columns,ch=image.naturalHeight/item.rig.grid.rows,[w,h]=item.rig.drawSize,[ax,ay]=item.rig.anchor;ctx.save();ctx.translate(cx+(f.offsetX||0),cy+(f.offsetY||0));ctx.rotate(f.rotation||0);ctx.scale(f.scaleX||1,f.scaleY||1);ctx.drawImage(image,3*cw,f.row*ch,cw,ch,-w*ax,item.rig.groundY-h*ay,w,h);ctx.restore();ctx.fillStyle='#7fe2d7';ctx.fillRect(cx-3,cy+item.rig.groundY-3,6,6)}
function draw(){const item=selected(),seq=sequence(),frame=seq[Math.max(0,Math.min(seq.length-1,Math.floor(tick)))],cx=340,cy=300;ctx.clearRect(0,0,canvas.width,canvas.height);const grad=ctx.createLinearGradient(0,0,0,560);grad.addColorStop(0,'#0b1824');grad.addColorStop(1,'#02070d');ctx.fillStyle=grad;ctx.fillRect(0,0,1060,560);ctx.strokeStyle='#152b3e';for(let y=80;y<560;y+=48)line(0,y,1060,y,'#102437',1);threat(item,frame,cx,cy);body(item,frame,cx,cy);ctx.fillStyle='#f4eee2';ctx.font='800 24px Inter,system-ui';ctx.fillText(item.name,34,44);ctx.fillStyle='#8ea6ba';ctx.font='13px Inter,system-ui';ctx.fillText(frame.plan.state+' · '+(frame.plan.authoritative?'tick-aligned':'presentation fallback'),34,67);ctx.fillStyle='#f7d76a';ctx.font='800 13px Inter,system-ui';ctx.fillText('AUTHORITATIVE CONTACT',720,44);line(720,55,1018,55,'#f7d76a',2);const percent=(frame.tick/item.totalTicks)*100,cp=(item.windupTicks/item.totalTicks)*100;fill.style.width=percent+'%';contact.style.left='calc('+cp+'% - 1px)';statusEl.textContent=frame.bodyVisible?'BODY '+frame.plan.state.toUpperCase():'BODY REMOVED · CONTACT EFFECT';tickEl.textContent='tick '+frame.tick+' / '+item.totalTicks+' · contact '+item.windupTicks;}
function loop(now){const dt=Math.min(100,now-last);last=now;if(!paused){tick+=dt/1000*60*speed;const max=selected().totalTicks;if(tick>max)tick=0}draw();requestAnimationFrame(loop)}
enemySelect.onchange=()=>{index=cases.findIndex(x=>x.type===enemySelect.value);tick=0};modeSelect.onchange=()=>{tick=Math.min(tick,selected().totalTicks)};document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});document.querySelector('#pause').onclick=e=>{paused=!paused;e.currentTarget.textContent=paused?'Play':'Pause'};document.querySelector('#prev').onclick=()=>{paused=true;document.querySelector('#pause').textContent='Play';tick=Math.max(0,Math.floor(tick)-1)};document.querySelector('#next').onclick=()=>{paused=true;document.querySelector('#pause').textContent='Play';tick=Math.min(selected().totalTicks,Math.floor(tick)+1)};document.querySelector('.timeline').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();tick=Math.round((e.clientX-r.left)/r.width*selected().totalTicks)};requestAnimationFrame(loop);
</script></body></html>`;
}

const report = buildEnemyBodyMotionAuditMetadata(), errors = assertEnemyBodyMotionAuditMetadata(report), command = process.argv[2] || "verify";
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else if (command === "report") {
  const out = resolve("artifacts", "enemy-body-motion-audit");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "metadata.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(out, "index.html"), enemyBodyMotionAuditHtml(report));
  process.stdout.write(`${out}\n`);
} else if (command === "verify") process.stdout.write(`verified ${report.coverage.frames} enemy body motion frames - ${report.metadataSha256}\n`);
else { console.error("usage: node tooling/run_enemy_body_motion_audit.js [verify|report]"); process.exitCode = 2; }
