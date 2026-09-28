(() => {

  const W = 78, H = 17;
  const C = {
    ink: '#605040', mid: '#807060', soft: '#a09282', faint: '#c9bfb3', frame: '#8a7a6a',
    warm: '#c28a3e', water: '#6f8795', rain: '#aab4ba', leaf: '#7d8a5c', leaf2: '#98a270',
    rust: '#b5864a', rust2: '#a4623c', cloth: '#a8927e',
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  class Grid {
    constructor() { this.ch = new Array(W * H); this.co = new Array(W * H); this.clear(); }
    clear() { this.ch.fill(' '); this.co.fill(''); }
    set(x, y, ch, co = '') {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      this.ch[y * W + x] = ch; this.co[y * W + x] = co;
    }
    text(x, y, s, co) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ') this.set(x + i, y, s[i], co); }
    put(x, y, s, co) { for (let i = 0; i < s.length; i++) this.set(x + i, y, s[i], co); }
    html() {
      const esc = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
      let out = '', run = '', rc = null;
      const flush = () => { if (run) out += rc ? `<span style="color:${rc}">${run}</span>` : run; run = ''; };
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x, co = this.co[i], ch = this.ch[i];
          if (co !== rc && ch !== ' ') { flush(); rc = co; }
          run += esc[ch] || ch;
        }
        if (y < H - 1) run += '\n';
      }
      flush();
      return out;
    }
  }

  function hash3(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
    return lerp(
      lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
      lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w);
  }
  function fbm(x, y, z, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }

  // ---- drawing helpers ----
  const hline = (g, x0, x1, y, ch, co) => { for (let x = x0; x <= x1; x++) g.set(x, y, ch, co); };
  const vline = (g, x, y0, y1, ch, co) => { for (let y = y0; y <= y1; y++) g.set(x, y, ch, co); };
  function box(g, x0, y0, x1, y1, h = '-', v = '|', c = '+', co = C.frame) {
    hline(g, x0, x1, y0, h, co); hline(g, x0, x1, y1, h, co);
    vline(g, x0, y0, y1, v, co); vline(g, x1, y0, y1, v, co);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) g.set(x, y, c, co);
  }
  // the classic double frame; panes are x 2..75, y 2..14
  function sash(g, { vbar = true, hbar = true, co = C.frame } = {}) {
    box(g, 0, 0, W - 1, H - 1, '=', '|', '+', co);
    box(g, 1, 1, W - 2, H - 2, '-', '|', '+', co);
    if (vbar) for (const x of [38, 39]) { vline(g, x, 2, H - 3, '|', co); g.set(x, 1, '+', co); g.set(x, H - 2, '+', co); }
    if (hbar) for (const y of [8, 9]) { hline(g, 2, W - 3, y, '-', co); g.set(1, y, '+', co); g.set(W - 2, y, '+', co); }
    if (vbar && hbar) for (const x of [38, 39]) for (const y of [8, 9]) g.set(x, y, '+', co);
  }
  function rrect(g, x0, y0, x1, y1, co = C.frame) {
    hline(g, x0 + 2, x1 - 2, y0, '-', co); hline(g, x0 + 2, x1 - 2, y1, '-', co);
    g.set(x0 + 1, y0, '.', co); g.set(x1 - 1, y0, '.', co);
    g.set(x0, y0 + 1, '/', co); g.set(x1, y0 + 1, '\\', co);
    vline(g, x0, y0 + 2, y1 - 2, '|', co); vline(g, x1, y0 + 2, y1 - 2, '|', co);
    g.set(x0, y1 - 1, '\\', co); g.set(x1, y1 - 1, '/', co);
    g.set(x0 + 1, y1, "'", co); g.set(x1 - 1, y1, "'", co);
  }
  // a thin line at fractional height y (row r spans r..r+1)
  function plotY(g, x, y, co) {
    const r = Math.floor(y), f = y - r;
    if (f < 0.2) g.set(x, r - 1, '_', co); else if (f < 0.65) g.set(x, r, '-', co); else g.set(x, r, '_', co);
  }
  function flying(g, x, y, f, co = C.ink) { g.text(Math.round(x) - 1, y, ['\\v/', '-v-', '/v\\', '-v-'][f & 3], co); }
  function ridgeChar(l, r, c) { return r < c ? '/' : l < c ? '\\' : '_'; }

  // ---- murmuration ----
  function murmuration() {
    const B = [];
    for (let i = 0; i < 320; i++) B.push({ x: rnd(25, 50), y: rnd(6, 18), vx: rnd(-.5, .5), vy: rnd(-.3, .3) });
    const dens = new Uint8Array(W * H);
    const trees = []; for (let x = 0; x < W; x++) trees[x] = fbm(x * 0.18, 0, 3, 2);
    return (g, t, m) => {
      const s = t / 20;
      const ax = 38 + Math.sin(s * .21) * 15 + Math.sin(s * .57) * 6, ay = 10 + Math.sin(s * .33 + 1) * 3 + Math.sin(s * .8) * 1.5;
      const mx = m ? m.x : -99, my = m ? (m.y - 2) * 2 : -99;
      for (const b of B) {
        let n = 0, cx = 0, cy = 0, vx = 0, vy = 0, sx = 0, sy = 0;
        for (const o of B) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 20) { n++; cx += dx; cy += dy; vx += o.vx; vy += o.vy; if (d2 < 2.2) { sx -= dx / d2; sy -= dy / d2; } }
        }
        if (n) { b.vx += cx / n * .004 + (vx / n - b.vx) * .07 + sx * .012; b.vy += cy / n * .004 + (vy / n - b.vy) * .07 + sy * .012; }
        b.vx += (ax - b.x) * .0013; b.vy += (ay - b.y) * .002;
        if (b.x < 3) b.vx += .06; if (b.x > 74) b.vx -= .06; if (b.y < 1) b.vy += .06; if (b.y > 20) b.vy -= .06;
        const dx = b.x - mx, dy = b.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 70) { const d = Math.sqrt(d2) + .1; b.vx += dx / d * .3; b.vy += dy / d * .3; }
        const sp = Math.hypot(b.vx, b.vy) || 1, k = sp > 1 ? 1 / sp : sp < .35 ? .35 / sp : 1;
        b.vx *= k; b.vy *= k;
      }
      dens.fill(0);
      for (const b of B) {
        b.x += b.vx * .6; b.y += b.vy * .6;
        const x = Math.round(b.x), y = Math.round(2 + b.y / 2);
        if (x >= 2 && x <= 75 && y >= 2 && y <= 14) dens[y * W + x]++;
      }
      for (let x = 2; x <= 75; x++) {
        const h = trees[x];
        g.set(x, 14, h > .64 ? '^' : '_', C.faint);
        if (h > .74) g.set(x, 13, '^', C.faint);
      }
      for (let y = 2; y <= 14; y++) for (let x = 2; x <= 75; x++) {
        const n = dens[y * W + x]; if (!n) continue;
        g.set(x, y, n === 1 ? '.' : n === 2 ? ':' : n < 5 ? '*' : n < 8 ? '#' : '@', n === 1 ? C.soft : n < 4 ? C.mid : C.ink);
      }
      sash(g, { vbar: false, hbar: false });
    };
  }

  // ---- rain on glass over a city ----
  function rain() {
    const back = [];
    for (let x = 2; x <= 75;) { const w = Math.floor(rnd(3, 7)), h = Math.floor(rnd(5, 10)); for (let i = 0; i < w; i++) back[x++] = h; }
    const bld = [];
    for (let x = 1; x <= 76;) { const w = Math.floor(rnd(4, 9)), h = Math.floor(rnd(3, 8)); bld.push({ x0: x, x1: x + w - 1, top: 14 - h }); x += w + Math.floor(rnd(1, 4)); }
    const lit = new Map();
    for (const b of bld) for (let y = b.top + 2; y <= 13; y += 2) for (let x = b.x0 + 2; x < b.x1 - 1; x += 2) lit.set(y * W + x, Math.random() < .35);
    const keys = [...lit.keys()];
    const streaks = [...Array(28)].map(() => ({ x: rnd(2, 90), y: rnd(0, 15), v: rnd(.7, 1.1) }));
    const trail = new Float32Array(W * H);
    let beads = [], drops = [];
    return g => {
      if (Math.random() < .1) { const k = keys[Math.floor(Math.random() * keys.length)]; lit.set(k, !lit.get(k)); }
      for (let x = 2; x <= 75; x++) {
        const top = 14 - back[x]; g.set(x, top, '_', C.faint);
        const pt = 14 - (back[x - 1] ?? back[x]);
        if (pt !== top) vline(g, x, Math.min(pt, top) + 1, Math.max(pt, top), '|', C.faint);
      }
      for (const b of bld) {
        for (let y = b.top; y <= 14; y++) for (let x = b.x0; x <= b.x1; x++) g.set(x, y, ' ');
        hline(g, b.x0, b.x1, b.top, '_', C.mid);
        vline(g, b.x0, b.top + 1, 14, '|', C.mid); vline(g, b.x1, b.top + 1, 14, '|', C.mid);
      }
      for (const [k, on] of lit) g.set(k % W, Math.floor(k / W), on ? '#' : '.', on ? C.warm : C.faint);
      for (const r of streaks) {
        r.y += r.v; r.x -= r.v * .35;
        if (r.y > 15) { r.y = rnd(-3, 0); r.x = rnd(2, 92); }
        const rx = Math.round(r.x), ry = Math.round(r.y);
        if (rx >= 2 && rx <= 75 && ry >= 2 && ry <= 14 && g.ch[ry * W + rx] === ' ') g.set(rx, ry, '/', C.rain);
      }
      if (beads.length < 70 && Math.random() < .5) beads.push({ x: Math.floor(rnd(2, 76)), y: Math.floor(rnd(2, 15)), sz: rnd(0, .8) });
      for (const b of beads) { b.sz += Math.random() < .03 ? .02 : 0; if (b.sz > 1) { b.dead = 1; drops.push({ x: b.x, y: b.y, vy: 0 }); } }
      for (const d of drops) {
        d.vy = Math.min(.35, d.vy + .01); d.y += d.vy;
        if (Math.random() < .04) d.x += Math.random() < .5 ? -1 : 1;
        const xi = Math.round(d.x), yi = Math.round(d.y);
        if (yi <= 14 && xi >= 2 && xi <= 75) trail[yi * W + xi] = 1;
        for (const b of beads) if (!b.dead && b.x === xi && Math.abs(b.y - d.y) < 1) b.dead = 1;
        if (d.y > 14.5) d.dead = 1;
      }
      beads = beads.filter(b => !b.dead); drops = drops.filter(d => !d.dead);
      for (let i = 0; i < trail.length; i++) if (trail[i] > .08) { trail[i] *= .97; g.set(i % W, Math.floor(i / W), trail[i] > .45 ? ':' : '.', C.water); }
      for (const b of beads) g.set(b.x, b.y, b.sz < .45 ? '.' : b.sz < .8 ? ',' : 'o', C.water);
      for (const d of drops) g.set(d.x, d.y, 'o', C.ink);
      sash(g, { hbar: false });
    };
  }

  // ---- train window ----
  function train() {
    return (g, t) => {
      const s = t / 20, om = s * 1.2, oh = s * 6, of = s * 16, og = s * 26, op = s * 34;
      g.text(58, 4, '.-.', C.warm); g.text(57, 5, '(   )', C.warm); g.text(58, 6, "'-'", C.warm);
      const ym = wx => 4.5 + (1 - fbm(wx * .04, 0, 7, 3)) * 8;
      const yh = wx => 9.2 + (1 - fbm(wx * .08, 3, 1, 3)) * 5;
      for (let x = 3; x <= 74; x++) {
        const r = Math.round(ym(x + om));
        g.set(x, r, ridgeChar(Math.round(ym(x - 1 + om)), Math.round(ym(x + 1 + om)), r), C.soft);
        vline(g, x, r + 1, 14, ' ');
      }
      for (let x = 3; x <= 74; x++) {
        const wx = x + oh, r = Math.round(yh(wx));
        g.set(x, r, ridgeChar(Math.round(yh(wx - 1)), Math.round(yh(wx + 1)), r), C.mid);
        vline(g, x, r + 1, 14, ' ');
        if (hash3(Math.floor(wx), 9, 9) < .22) { g.set(x, r - 1, '^', C.leaf); if (hash3(Math.floor(wx), 3, 3) < .5) g.set(x, r - 2, '^', C.leaf); }
      }
      for (let x = 3; x <= 74; x++) {
        const wf = Math.floor(x + of), wg = Math.floor(x + og);
        g.set(x, 13, wf % 5 === 0 ? '+' : '-', C.mid);
        const h = hash3(wg, 1, 1);
        g.set(x, 14, h < .15 ? ',' : h < .3 ? '.' : h < .38 ? '`' : ' ', C.soft);
      }
      const k0 = Math.floor(op / 60) - 1;
      const poles = []; for (let k = k0; k <= k0 + 3; k++) poles.push(k * 60 - op + 30);
      for (let i = 0; i < poles.length - 1; i++) for (const off of [-2, 2]) {
        const xa = poles[i] + off, xb = poles[i + 1] + off;
        for (let x = Math.max(3, Math.ceil(xa)); x <= Math.min(74, xb); x++) { const u = (x - xa) / (xb - xa); plotY(g, x, 4.5 + 2.4 * 4 * u * (1 - u), C.ink); }
      }
      for (const px of poles) {
        const x = Math.round(px); if (x < 1 || x > 76) continue;
        for (let y = 5; y <= 14; y++) if (x >= 3 && x <= 74) g.set(x, y, '|', C.ink);
        [...'o-+-o'].forEach((c, i) => { if (x - 2 + i >= 3 && x - 2 + i <= 74) g.set(x - 2 + i, 4, c, C.ink); });
      }
      // tunnel sweeps through every ~45s
      for (let x = 3; x <= 74; x++) {
        const tw = (x + op + 600) % 1500;
        if (tw < 95) {
          vline(g, x, 2, 14, ':', C.soft);
          if (tw < 1.2 || tw > 93.8) vline(g, x, 2, 14, '|', C.ink);
          if (Math.floor(x + op) % 24 === 0) g.set(x, 3, '*', C.warm);
        }
      }
      rrect(g, 0, 0, W - 1, H - 1); rrect(g, 2, 1, W - 3, H - 2);
    };
  }

  // ---- day and night ----
  function daynight(ctx) {
    const stars = [...Array(45)].map(() => ({ x: Math.floor(rnd(2, 76)), y: Math.floor(rnd(2, 10)), p: rnd(0, 6) }));
    const ridge = []; for (let x = 0; x < W; x++) ridge[x] = x >= 50 && x <= 64 ? 13 : Math.min(13, Math.round(10.2 + fbm(x * .06, 5, 5, 3) * 4));
    const birds = [...Array(3)].map((_, i) => ({ x: i * 25 + rnd(0, 10), y: rnd(3, 7), ph: Math.floor(rnd(0, 4)) }));
    const house = ['  _||____', ' /       \\', '/_________\\', ' | []  []|'];
    let shoot = null;
    return (g, t) => {
      const s = t / 20, th = (s / 72 % 1) * Math.PI * 2 + .15, e = Math.sin(th);
      const night = clamp((-e + .12) / .32, 0, 1), dusk = clamp(1 - Math.abs(e) / .35, 0, 1);
      ctx.glass.style.background = mix(mix('#f3f4f1', '#f2dcc3', dusk), '#2f2d36', night);
      const ink = mix(C.ink, '#e8e0d0', night), soft = mix(C.soft, '#8d889a', night), faint = mix(C.faint, '#5a5664', night);
      if (night > .15) for (const st of stars) {
        const v = Math.sin(s * 2 + st.p * 7);
        g.set(st.x, st.y, v > .85 ? '*' : v > 0 ? '+' : '.', mix(faint, '#f3ead6', night * (v > 0 ? 1 : .5)));
      }
      if (night > .6 && !shoot && Math.random() < .006) shoot = { x: rnd(20, 70), y: 2, l: 0 };
      if (shoot) {
        shoot.l++; for (let i = 0; i < 4; i++) g.set(shoot.x - (shoot.l - i) * 1.4, shoot.y + (shoot.l - i) * .45, i === 0 ? '*' : '-', ink);
        if (shoot.l > 14) shoot = null;
      }
      const sx = 38 - Math.cos(th) * 34, sy = 11.5 - Math.sin(th) * 9.5;
      g.text(Math.round(sx) - 1, sy, '-O-', mix(C.warm, '#e0a060', dusk));
      g.set(76 - sx, 23 - sy, 'C', '#efe6d2');
      if (night < .4) for (const b of birds) {
        b.x += .22; if (b.x > 80) { b.x = -5; b.y = rnd(3, 7); }
        flying(g, b.x, b.y + Math.sin(s + b.ph) * .5, Math.floor(t / 3) + b.ph, ink);
      }
      for (let x = 2; x <= 75; x++) {
        const r = ridge[x]; vline(g, x, r, 14, ' ');
        g.set(x, r, ridgeChar(ridge[x - 1] ?? r, ridge[x + 1] ?? r, r), soft);
        for (let y = r + 1; y <= 14; y++) { const h = hash3(x, y, 4); if (h < .25) g.set(x, y, h < .1 ? ',' : "'", faint); }
      }
      house.forEach((row, i) => g.put(52, 10 + i, row, soft));
      for (const x of [55, 59]) g.text(x, 13, '[]', night > .45 ? C.warm : soft);
      sash(g);
    };
  }

  // ---- snow ----
  function snow() {
    const L = [{ n: 55, ch: '.', v: .07, co: C.faint }, { n: 28, ch: '+', v: .12, co: C.soft }, { n: 10, ch: '*', v: .2, co: C.mid }];
    const fl = [];
    L.forEach((l, i) => { for (let k = 0; k < l.n; k++) fl.push({ l: i, x: rnd(0, W), y: rnd(-2, 15), ph: rnd(0, 6), land: Math.random() < .5 }); });
    const hT = new Float32Array(W).fill(.2), hB = new Float32Array(W).fill(.3);
    const pane = x => (x >= 2 && x <= 37) || (x >= 40 && x <= 75);
    let smoke = [];
    const trees = [[6, 11], [13, 10], [28, 11], [44, 10]];
    const tree = ['  /\\', ' /  \\', '/____\\', '  ||'];
    function pile(g, h, base) {
      for (let x = 2; x <= 75; x++) {
        if (!pane(x)) continue;
        const e = base - h[x], r = Math.floor(e);
        for (let y = r + 1; y < base; y++) g.set(x, y, ' ');
        const sl = (h[x + 1] ?? h[x]) - (h[x - 1] ?? h[x]);
        if (Math.abs(sl) > .8) g.set(x, r, sl > 0 ? '/' : '\\', C.soft);
        else plotY(g, x, e, C.soft);
      }
    }
    function settle(h, cap) {
      for (let x = 2; x < 75; x++) { const d = h[x] - h[x + 1]; h[x] -= d * (Math.abs(d) > .5 ? .15 : .04); h[x + 1] += d * (Math.abs(d) > .5 ? .15 : .04); }
      for (let x = 0; x < W; x++) h[x] = Math.min(cap, h[x] * .99992);
    }
    return (g, t) => {
      const s = t / 20, wind = .12 + .22 * Math.sin(s * .15) + .2 * (noise3(s * .3, 0, 0) - .5);
      trees.forEach(([x0, y0]) => tree.forEach((row, i) => g.text(x0, y0 + i - 1, row, C.faint)));
      const hx = 56;
      ['    _||_', '  /      \\', ' /________\\', ' |  #   _ |', ' |      | ||'].forEach((row, i) => g.put(hx, 10 + i, row, C.soft));
      g.set(hx + 4, 13, '#', C.warm);
      if (t % 3 === 0) smoke.push({ x: hx + 6, y: 9, a: 0 });
      for (const p of smoke) { p.a++; p.y -= .08; p.x += wind * .35 + Math.sin(p.a * .2) * .05; }
      smoke = smoke.filter(p => p.a < 70 && p.y > 2);
      for (const p of smoke) g.set(p.x, p.y, p.a < 15 ? '(' : p.a < 35 ? (p.a & 4 ? ')' : '(') : '.', p.a < 30 ? C.soft : C.faint);
      for (const f of fl) {
        const l = L[f.l];
        f.x += wind * (.5 + f.l * .5) + Math.sin(s * 1.5 + f.ph) * .05; f.y += l.v;
        const xi = Math.round(f.x), yi = f.y;
        let landed = false;
        if (f.l > 0 && xi >= 0 && xi < W && pane(xi)) {
          if (f.land && yi < 8 && yi >= 8 - hT[xi] - .5) { hT[xi] += .2; landed = true; }
          else if (yi >= 15 - hB[xi] - .5) { hB[xi] += .15; landed = true; }
        }
        if (landed || f.y > 15 || f.x > W + 2 || f.x < -3) { f.y = rnd(-2, 0); f.x = rnd(-10, W); f.land = Math.random() < .5; }
        else g.set(f.x, f.y, l.ch, l.co);
      }
      settle(hT, 1.6); settle(hB, 2.8);
      pile(g, hT, 8); pile(g, hB, 15);
      sash(g);
    };
  }

  const PICKS = [murmuration, rain, train, daynight, snow];
  const win = document.getElementById('orbit-win'), pre = document.getElementById('orbit-strip');
  const glass = win.querySelector('.glass');
  const g = new Grid(), fn = PICKS[Math.floor(Math.random() * PICKS.length)]({ glass });
  let t = 0, mouse = null, visible = true;
  win.addEventListener('pointermove', e => { const r = win.getBoundingClientRect(); mouse = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; });
  win.addEventListener('pointerleave', () => { mouse = null; });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(win);
  for (let i = 0; i < 40; i++) { g.clear(); fn(g, t++, null); }
  const tick = () => { g.clear(); fn(g, t++, mouse); pre.innerHTML = g.html(); };
  tick();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let last = 0;
    (function loop(ts) { if (ts - last > 50 && visible && !document.hidden) { last = ts; tick(); } requestAnimationFrame(loop); })(0);
  }
})();
