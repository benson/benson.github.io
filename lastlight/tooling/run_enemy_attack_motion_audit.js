import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENEMY_ATTACK_AUDIT_CASES, ENEMY_ATTACK_AUDIT_FRAMES, ENEMY_ATTACK_AUDIT_MODES,
  assertEnemyAttackMotionAuditMetadata, buildEnemyAttackMotionAuditMetadata,
} from "../enemy-attack-motion-audit.js";

const TAU = Math.PI * 2, CELL_W = 260, CELL_H = 210;
const fmt = (value) => Number(value.toFixed(2));
const polar = (radius, angle) => [fmt(Math.cos(angle) * radius), fmt(Math.sin(angle) * radius)];
const arc = (radius, start, end) => {
  const [x1, y1] = polar(radius, start), [x2, y2] = polar(radius, end);
  return `M ${x1} ${y1} A ${fmt(radius)} ${fmt(radius)} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
};
const path = (d, attrs = "") => `<path d="${d}" ${attrs}/>`;
const line = (x1, y1, x2, y2, attrs = "") => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" ${attrs}/>`;
const circle = (radius, attrs = "") => `<circle r="${fmt(radius)}" ${attrs}/>`;

function baseGeometry(plan) {
  const g = plan.authoritativeGeometry;
  if (plan.family === "charge") return `<rect x="${g.start}" y="${-g.halfWidth}" width="${g.range - g.start}" height="${g.halfWidth * 2}" fill="rgba(255,70,103,.09)" stroke="#ff4667" stroke-width="3" stroke-dasharray="13 8"/>`;
  return `${circle(g.radius, 'fill="rgba(255,70,103,.09)" stroke="#02070d" stroke-width="8"')}${circle(g.radius, 'fill="none" stroke="#ff4667" stroke-width="3" stroke-dasharray="10 7"')}`;
}

function windupAccents(plan) {
  const g = plan.authoritativeGeometry, a = plan.accents, pieces = [];
  if (plan.family === "charge") {
    const span = g.range - g.start;
    for (let i = 0; i < a.chevrons; i++) {
      const x = g.start + span * (((i + .45) / a.chevrons + a.travel / a.chevrons) % 1);
      pieces.push(path(`M ${fmt(x - 10)} -7 L ${fmt(x)} 0 L ${fmt(x - 10)} 7`, 'fill="none" stroke="#fff4f1" stroke-width="2"'));
    }
    for (let i = 0; i < a.endpointTeeth; i++) {
      const y = (i - (a.endpointTeeth - 1) / 2) * 9;
      pieces.push(path(`M ${g.range - 10} ${y - 4} L ${g.range} ${y} L ${g.range - 10} ${y + 4} Z`, 'fill="#fff4f1"'));
    }
    for (const side of [-1, 1]) {
      const y = side * Math.max(3, g.halfWidth - a.railInset);
      pieces.push(line(g.start, y, g.range, y, 'stroke="#ff8ca0" stroke-opacity=".52" stroke-width="2"'));
    }
    for (let i = 0; i < a.launchArcs; i++) pieces.push(path(arc(g.start + 8 + i * 7, -.52, .52), 'fill="none" stroke="#ff8ca0" stroke-opacity=".45" stroke-width="2"'));
  } else if (plan.family === "slam") {
    for (let ring = 0; ring < a.brokenRings; ring++) {
      const radius = g.radius * Math.max(.18, .38 + ring * .18 - a.compression * .35);
      for (let segment = 0; segment < 4; segment++) pieces.push(path(arc(radius, a.rotation + segment * TAU / 4 + ring * .2, a.rotation + segment * TAU / 4 + ring * .2 + .7), 'fill="none" stroke="#fff4f1" stroke-width="2.5"'));
    }
    for (let i = 0; i < a.fractures; i++) {
      const angle = i * TAU / a.fractures + a.rotation, inner = g.radius * (.24 + (i % 2) * .08), outer = g.radius * (.52 + a.compression);
      pieces.push(line(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle + .04) * outer, Math.sin(angle + .04) * outer, 'stroke="#ff8ca0" stroke-width="2"'));
    }
  } else {
    const step = TAU / a.fuseSegments;
    for (let i = 0; i < a.fuseSegments; i++) pieces.push(path(arc(g.radius * .72, -Math.PI / 2 + i * step + a.unstableRotation, -Math.PI / 2 + i * step + a.unstableRotation + step * .55), `fill="none" stroke="${i < a.litSegments ? "#fff4f1" : "#ff4667"}" stroke-opacity="${i < a.litSegments ? .9 : .3}" stroke-width="5"`));
    const points = Array.from({ length: 6 }, (_, i) => polar(g.radius * a.coreScale, i * TAU / 6 - Math.PI / 2 + a.unstableRotation).join(",")).join(" ");
    pieces.push(`<polygon points="${points}" fill="rgba(255,70,103,.25)"/>`);
    for (let i = 0; i < a.spokes; i++) {
      const angle = i * TAU / a.spokes + a.unstableRotation;
      pieces.push(line(Math.cos(angle) * g.radius * .28, Math.sin(angle) * g.radius * .28, Math.cos(angle) * g.radius * .56, Math.sin(angle) * g.radius * .56, 'stroke="#ff8ca0" stroke-opacity=".55" stroke-width="2"'));
    }
  }
  return pieces.join("");
}

function contactAccents(plan) {
  const g = plan.authoritativeGeometry, c = plan.contact, pieces = [], r = g.radius * (.22 + c.progress * .78), color = c.brightCore ? "#fff4f1" : "#ff8ca0";
  if (!c.alpha) return "";
  if (plan.family === "charge") {
    pieces.push(path(arc(r, -.72, .72), `fill="none" stroke="${color}" stroke-width="4"`));
    for (let i = -2; i <= 2; i++) pieces.push(line(Math.cos(i * .24) * g.radius * .2, Math.sin(i * .24) * g.radius * .2, Math.cos(i * .24) * g.radius * (.5 + c.travel * .5), Math.sin(i * .24) * g.radius * (.5 + c.travel * .5), `stroke="${color}" stroke-width="3"`));
  } else {
    pieces.push(circle(r, `fill="none" stroke="${color}" stroke-width="4"`));
    const count = plan.family === "slam" ? plan.accents.fractures : plan.accents.spokes;
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count, outer = g.radius * (plan.family === "slam" ? .48 + c.progress * .42 : .42 + c.travel * .54);
      pieces.push(line(Math.cos(angle) * g.radius * .16, Math.sin(angle) * g.radius * .16, Math.cos(angle) * outer, Math.sin(angle) * outer, `stroke="${color}" stroke-width="2.5"`));
    }
  }
  return `<g opacity="${fmt(c.alpha)}">${pieces.join("")}</g>`;
}

function renderSheet(report) {
  const width = ENEMY_ATTACK_AUDIT_FRAMES.length * CELL_W, rows = ENEMY_ATTACK_AUDIT_CASES.length * ENEMY_ATTACK_AUDIT_MODES.length, height = rows * CELL_H + 54;
  const cells = [];
  ENEMY_ATTACK_AUDIT_CASES.forEach((attack, attackIndex) => ENEMY_ATTACK_AUDIT_MODES.forEach((mode, modeIndex) => {
    const row = attackIndex * ENEMY_ATTACK_AUDIT_MODES.length + modeIndex;
    ENEMY_ATTACK_AUDIT_FRAMES.forEach((frame, column) => {
      const entry = report.frames.find((item) => item.attackId === attack.id && item.mode === mode.id && item.frameId === frame.id), plan = entry.plan;
      const x = column * CELL_W, y = 54 + row * CELL_H, scale = plan.family === "charge" ? .9 : plan.family === "slam" ? .67 : .48;
      const tx = plan.family === "charge" ? x + 28 : x + CELL_W / 2, ty = y + 111;
      cells.push(`<g><rect x="${x + 2}" y="${y + 2}" width="${CELL_W - 4}" height="${CELL_H - 4}" fill="#07111b" stroke="#203246"/><text x="${x + 12}" y="${y + 20}" fill="#7d9bb5" font-size="11">${attack.id} / ${mode.id}</text><text x="${x + 12}" y="${y + 37}" fill="#f7d76a" font-size="12" font-weight="700">${frame.id}</text><g transform="translate(${tx} ${ty}) scale(${scale})">${frame.stage === "windup" ? baseGeometry(plan) + windupAccents(plan) : contactAccents(plan)}</g></g>`);
    });
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#02070d"/><text x="18" y="30" fill="#f4eee2" font-family="Inter, sans-serif" font-size="20" font-weight="800">LASTLIGHT - ENEMY ATTACK MOTION AUDIT</text><text x="18" y="47" fill="#7d9bb5" font-family="Inter, sans-serif" font-size="11">authoritative boundary + windup / contact / recovery - ${report.metadataSha256.slice(0, 12)}</text><g font-family="Inter, sans-serif">${cells.join("")}</g></svg>`;
}

const report = buildEnemyAttackMotionAuditMetadata(), errors = assertEnemyAttackMotionAuditMetadata(report), command = process.argv[2] || "verify";
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else if (command === "report") {
  const out = resolve("artifacts", "enemy-attack-motion-audit");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "metadata.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(out, "contact-sheet.svg"), renderSheet(report));
  writeFileSync(resolve(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Lastlight enemy attack motion audit</title><style>html,body{margin:0;background:#02070d;color:#f4eee2;font:14px Inter,sans-serif}object{display:block;width:100%;height:100vh}</style><object data="contact-sheet.svg" type="image/svg+xml"></object>`);
  process.stdout.write(`${out}\n`);
} else if (command === "verify") {
  process.stdout.write(`verified ${report.coverage.frames} enemy attack motion frames - ${report.metadataSha256}\n`);
} else {
  console.error("usage: node tooling/run_enemy_attack_motion_audit.js [verify|report]"); process.exitCode = 2;
}
