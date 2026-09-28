(() => {
  // a window onto brooklyn: skyline, time of day and weather follow the real sky there
  const W = 78, H = 17;
  const C = {
    ink: '#605040', mid: '#807060', soft: '#a09282', faint: '#c9bfb3', frame: '#8a7a6a',
    warm: '#c28a3e', water: '#6f8795', rain: '#aab4ba',
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join(''); };

  class Grid {
    constructor() { this.ch = new Array(W * H); this.co = new Array(W * H); this.clear(); }
    clear() { this.ch.fill(' '); this.co.fill(''); }
    set(x, y, ch, co = '') {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      this.ch[y * W + x] = ch; this.co[y * W + x] = co;
    }
    blank(x, y) { return this.ch[Math.round(y) * W + Math.round(x)] === ' '; }
    text(x, y, s, co) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ') this.set(x + i, y, s[i], co); }
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

  const hline = (g, x0, x1, y, ch, co) => { for (let x = x0; x <= x1; x++) g.set(x, y, ch, co); };
  const vline = (g, x, y0, y1, ch, co) => { for (let y = y0; y <= y1; y++) g.set(x, y, ch, co); };
  function box(g, x0, y0, x1, y1, h, v, c, co) {
    hline(g, x0, x1, y0, h, co); hline(g, x0, x1, y1, h, co);
    vline(g, x0, y0, y1, v, co); vline(g, x1, y0, y1, v, co);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) g.set(x, y, c, co);
  }
  function frame(g) {
    const co = C.frame;
    box(g, 0, 0, W - 1, H - 1, '=', '|', '+', co);
    box(g, 1, 1, W - 2, H - 2, '-', '|', '+', co);
    for (const x of [38, 39]) { vline(g, x, 2, H - 3, '|', co); g.set(x, 1, '+', co); g.set(x, H - 2, '+', co); }
  }
  // a thin line at fractional height y (row r spans r..r+1)
  function plotY(g, x, y, co) {
    const r = Math.floor(y), f = y - r;
    if (f < 0.2) g.set(x, r - 1, '_', co); else if (f < 0.65) g.set(x, r, '-', co); else g.set(x, r, '_', co);
  }

  // ---- sky state: targets come from the weather, cur eases toward them ----
  const target = { night: 0, dusk: 0, cloud: .3, rain: 0, snow: 0, fog: 0, storm: 0, wind: 6 };
  const cur = { ...target };
  let sun = { sr: 405, ss: 1140 };
  let caption = '';

  const WMO = {
    0: ['clear'], 1: ['mostly clear'], 2: ['partly cloudy'], 3: ['overcast'],
    45: ['fog', 0, 0, 0, 1], 48: ['freezing fog', 0, 0, 0, 1],
    51: ['light drizzle', .2], 53: ['drizzle', .3], 55: ['heavy drizzle', .4], 56: ['freezing drizzle', .3], 57: ['freezing drizzle', .4],
    61: ['light rain', .45], 63: ['rain', .7], 65: ['heavy rain', 1], 66: ['freezing rain', .5], 67: ['freezing rain', .8],
    71: ['light snow', 0, .35], 73: ['snow', 0, .65], 75: ['heavy snow', 0, 1], 77: ['snow grains', 0, .25],
    80: ['showers', .55], 81: ['showers', .75], 82: ['downpour', 1], 85: ['snow showers', 0, .55], 86: ['heavy snow showers', 0, .9],
    95: ['thunderstorm', .85, 0, 1], 96: ['thunderstorm with hail', .9, 0, 1], 99: ['thunderstorm with hail', 1, 0, 1],
  };
  function applyCode(code, cloudPct, wind) {
    const [label = '', rain = 0, snow = 0, storm = 0, fog = 0] = WMO[code] || [];
    Object.assign(target, { rain, snow, storm, fog, wind, cloud: Math.max(cloudPct / 100, rain || snow || fog ? .8 : 0) });
    return label;
  }
  const nyMinutes = () => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const get = k => +p.find(x => x.type === k).value;
    return (get('hour') % 24) * 60 + get('minute');
  };
  function setLight(m) {
    const { sr, ss } = sun;
    target.night = 1 - clamp((m - sr + 30) / 60, 0, 1) * clamp((ss + 30 - m) / 60, 0, 1);
    target.dusk = Math.max(0, 1 - Math.abs(m - sr) / 45, 1 - Math.abs(m - ss) / 45);
    target.m = m;
  }

  // ?sky=rain,night etc. previews a condition instead of the live weather
  const override = new URLSearchParams(location.search).get('sky');
  function applyOverride() {
    const tok = override.split(/[ ,]+/);
    const code = { clear: 0, cloudy: 2, overcast: 3, fog: 45, drizzle: 53, rain: 63, heavy: 65, snow: 73, blizzard: 75, storm: 95 };
    let label = 'clear';
    for (const t of tok) if (t in code) label = applyCode(code[t], t === 'clear' ? 0 : t === 'cloudy' ? 50 : 100, t === 'storm' || t === 'blizzard' ? 25 : 8);
    const m = tok.includes('night') ? 23 * 60 : tok.includes('dusk') ? sun.ss : tok.includes('dawn') ? sun.sr : 13 * 60;
    setLight(m);
    caption = `brooklyn · preview · ${label}`;
  }
  async function fetchWeather() {
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.6782&longitude=-73.9442' +
        '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m&daily=sunrise,sunset' +
        '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=1');
      const d = await r.json(), c = d.current;
      const hm = s => +s.slice(11, 13) * 60 + +s.slice(14, 16);
      sun = { sr: hm(d.daily.sunrise[0]), ss: hm(d.daily.sunset[0]) };
      const label = applyCode(c.weather_code, c.cloud_cover, c.wind_speed_10m);
      caption = `brooklyn · ${Math.round(c.temperature_2m)}° · ${label}`;
    } catch { /* keep the clock-only sky */ }
    setLight(nyMinutes());
  }

  // ---- the scene ----
  const back = [];
  for (let x = 2; x <= 75;) { const w = Math.floor(rnd(3, 7)), h = Math.floor(rnd(5, 10)); for (let i = 0; i < w; i++) back[x++] = h; }
  const bld = [];
  for (let x = 1; x <= 76;) {
    const w = Math.floor(rnd(4, 9)), h = Math.floor(rnd(3, 10)), top = 14 - h;
    bld.push({ x0: x, x1: x + w - 1, top, tower: w >= 6 && top >= 5 && Math.random() < .45 ? x + 1 + Math.floor(rnd(0, w - 5)) : 0 });
    x += w + Math.floor(rnd(1, 4));
  }
  const roofAt = x => { for (const b of bld) if (x >= b.x0 && x <= b.x1) return b.tower && x >= b.tower && x <= b.tower + 3 ? b.top - 3 : b.top; return 14; };
  const wins = [];
  for (const b of bld) for (let y = b.top + 2; y <= 13; y += 2) for (let x = b.x0 + 2; x < b.x1 - 1; x += 2) wins.push({ x, y, r: Math.random() });
  const stars = [...Array(40)].map(() => ({ x: Math.floor(rnd(2, 76)), y: Math.floor(rnd(2, 9)), p: rnd(0, 6), r: Math.random() }));
  const streaks = [...Array(55)].map((_, i) => ({ x: rnd(2, 95), y: rnd(0, 15), v: rnd(.7, 1.1), r: i / 55 }));
  const flakes = [];
  [[.07, '.'], [.12, '+'], [.2, '*']].forEach(([v, ch], l) => { for (let k = 0; k < [55, 28, 10][l]; k++) flakes.push({ l, v, ch, x: rnd(0, W), y: rnd(-2, 15), ph: rnd(0, 6), r: Math.random() }); });
  const pile = new Float32Array(W);
  const trail = new Float32Array(W * H);
  let beads = [], drops = [], bolt = null;

  const moonPhase = () => (((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588) % 1 + 1) % 1;
  const moonChar = p => p < .03 || p > .97 ? '' : p < .19 ? ')' : p < .31 ? 'D' : p < .69 ? 'O' : p < .81 ? 'C' : '(';

  // 4x4 ordered dither: tone 0..1 becomes a stipple of '.' and ':'
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
  const stip = (x, y, tone) => tone > BAYER[(y & 3) * 4 + (x & 3)] ? (tone > .6 ? ':' : '.') : '';
  let pigeons = null, nextPigeons = 200;

  function step(g, t) {
    for (const k in cur) if (k !== 'm') cur[k] += (target[k] - cur[k]) * .01;
    const s = t / 20, n = cur.night, m = target.m ?? 720, dk = cur.dusk;
    const wet = Math.max(cur.rain, cur.snow * .6);
    const flash = bolt && (bolt.f < 2 || bolt.f === 3);
    const fogged = c => mix(c, '#f8f7f4', cur.fog * .6);
    const faint = C.faint, soft = C.soft, mid = fogged(C.mid);
    const skyInk = mix(mix(C.faint, '#b9b3bf', n), '#dcae7a', dk * .8);

    // sky tone: stipple darkens toward the top at night, the city glows near the rooftops
    const th = .74 - cur.cloud * .42, strata = clamp((cur.cloud - .5) * 2, 0, 1);
    for (let y = 2; y <= 12; y++) for (let x = 2; x <= 75; x++) {
      const d = fbm(x * lerp(.05, .025, strata) + s * (.015 + cur.wind * .003), y * lerp(.2, .45, strata), s * .01, 3) + (y - 2) * .012;
      const c = clamp((d - th) / .08, 0, 1);
      let tone = n * (.28 - (y - 2) * .018) + wet * .1 + dk * (1 - n) * clamp((y - 6) / 6, 0, 1) * .22;
      tone = lerp(tone, n * .05 + wet * .14, c);
      if (flash) tone = 0;
      const ch = stip(x, y, tone);
      if (ch) g.set(x, y, ch, skyInk);
      const e = d - th;
      if (e > 0 && e < .07 && hash3(x, y, 2) > n * .7) g.set(x, y, e < .035 ? '.' : strata > .5 ? '-' : '~', wet > .3 ? soft : faint);
    }
    if (n > .3 && !flash) for (const st of stars) {
      if (st.r < cur.cloud * 1.15) continue;
      const v = Math.sin(s * 2 + st.p * 7);
      g.set(st.x, st.y, v > .85 ? '*' : v > 0 ? '+' : ' ', C.mid);
    }
    const dayFrac = (m - sun.sr) / (sun.ss - sun.sr);
    if (n < .85 && cur.cloud < .85 && dayFrac > 0 && dayFrac < 1)
      g.text(Math.round(5 + dayFrac * 67) - 1, 7.5 - Math.sin(dayFrac * Math.PI) * 5, '-O-', mix(C.warm, '#d0703a', dk));
    const mc = moonChar(moonPhase());
    if (n > .3 && mc && cur.cloud < .85) {
      const nf = (((m - sun.ss) % 1440 + 1440) % 1440) / (1440 - (sun.ss - sun.sr));
      if (nf < 1) {
        const mx = Math.round(5 + nf * 67), my = Math.round(7.5 - Math.sin(nf * Math.PI) * 5);
        g.set(mx - 1, my, ' '); g.set(mx + 1, my, ' '); g.set(mx, my, mc, C.ink);
      }
    }

    // pigeons in fair daylight
    if (!pigeons && n < .4 && wet < .1 && cur.fog < .3 && --nextPigeons <= 0)
      pigeons = { x: -6, y: rnd(3, 7), birds: [...Array(Math.floor(rnd(3, 6)))].map(() => [rnd(-7, 0), rnd(-1.2, 1.2), Math.floor(rnd(0, 4))]) };
    if (pigeons) {
      pigeons.x += .35 + cur.wind * .01;
      for (const [dx, dy, ph] of pigeons.birds)
        g.text(Math.round(pigeons.x + dx) - 1, pigeons.y + dy + Math.sin(s * 2 + ph) * .3, ['\\v/', '-v-', '/v\\', '-v-'][(Math.floor(t / 2) + ph) & 3], C.ink);
      if (pigeons.x > 88) { pigeons = null; nextPigeons = Math.floor(rnd(400, 1200)); }
    }

    // skyline: outlines by day, hatched with lit windows by night
    if (cur.fog < .6) for (let x = 2; x <= 75; x++) {
      const top = 14 - back[x], co = fogged(faint);
      g.set(x, top, '_', co);
      const pt = 14 - (back[x - 1] ?? back[x]);
      if (pt !== top) vline(g, x, Math.min(pt, top) + 1, Math.max(pt, top), '|', co);
      if (n > .2) for (let y = top + 1; y <= 14; y++) g.set(x, y, stip(x, y, n * .35) || ' ', co);
    }
    const hatch = mix(C.soft, C.mid, n), fillTone = flash ? .1 : n * .88 * (1 - cur.fog * .5);
    for (const b of bld) {
      for (let y = b.top; y <= 14; y++) for (let x = b.x0; x <= b.x1; x++) g.set(x, y, stip(x, y, fillTone) || ' ', fogged(hatch));
      hline(g, b.x0, b.x1, b.top, '_', mid);
      vline(g, b.x0, b.top + 1, 14, '|', mid); vline(g, b.x1, b.top + 1, 14, '|', mid);
      // rooftop water tower: cap, barrel tank, legs standing on the roof line
      if (b.tower) [' /\\ ', '|  |', '|__|', '/||\\'].forEach((row, i) => {
        for (let k = 0; k < 4; k++) if (i || row[k] !== ' ') g.set(b.tower + k, b.top - 3 + i, row[k], mid);
      });
    }
    if (Math.random() < .08) wins[Math.floor(Math.random() * wins.length)].r = Math.random();
    const litFrac = .05 + .42 * n + .1 * dk;
    for (const w of wins) {
      if (w.r < litFrac) g.set(w.x, w.y, n > .4 ? '#' : '"', fogged(C.warm));
      else if (n < .5) g.set(w.x, w.y, '.', fogged(faint));
    }

    if (cur.fog > .05) for (let y = 4; y <= 14; y++) for (let x = 2; x <= 75; x++) {
      const v = fbm(x * .035 - s * .05, y * .5, 9, 2);
      if (v > .62 - cur.fog * .1 && hash3(x, y, 5) < .4) g.set(x, y, '-', faint);
    }

    // rain behind the glass
    const slant = clamp(.18 + cur.wind / 35, .18, .9), rainInk = mix('#9eabb3', '#7f8d96', n);
    for (const r of streaks) {
      r.y += r.v; r.x -= r.v * slant;
      if (r.y > 15) { r.y = rnd(-3, 0); r.x = rnd(2, 80 + 15 * slant); }
      if (r.r < cur.rain && r.x >= 2 && r.x <= 75 && r.y >= 2 && ' .:'.includes(g.ch[Math.round(r.y) * W + Math.round(r.x)])) g.set(r.x, r.y, '/', rainInk);
    }
    // lightning
    if (!bolt && cur.storm > .5 && Math.random() < .005) {
      let x = rnd(12, 64); const pts = [];
      for (let y = 2; y < roofAt(Math.round(x)); y++) { const dx = Math.floor(rnd(-1, 2)); pts.push([x, y, dx < 0 ? '/' : dx > 0 ? '\\' : '|']); x += dx; }
      bolt = { f: 0, pts };
    }
    if (bolt) { if (bolt.f < 5) for (const [x, y, ch] of bolt.pts) g.set(x, y, ch, bolt.f < 3 ? C.ink : C.warm); if (++bolt.f > 60) bolt = null; }

    // snow: at night each flake clears a little white hole in the stipple
    for (const f of flakes) {
      f.x += cur.wind / 40 * (.5 + f.l * .5) + Math.sin(s * 1.5 + f.ph) * .05; f.y += f.v;
      const xi = Math.round(f.x);
      if (f.l > 0 && xi >= 2 && xi <= 75 && f.y >= 15 - pile[xi] - .5 && f.r < cur.snow) { pile[xi] += .12; f.y = 99; }
      if (f.y > 15 || f.x > W + 2) { f.y = rnd(-2, 0); f.x = rnd(-12, W); continue; }
      if (f.r >= cur.snow || f.x < 2 || f.x > 75 || f.y < 2) continue;
      if (n > .4) { g.set(f.x - 1, f.y, ' '); g.set(f.x + 1, f.y, ' '); }
      g.set(f.x, f.y, f.ch, n > .4 ? [C.soft, C.mid, C.ink][f.l] : [faint, soft, C.mid][f.l]);
    }
    for (let x = 2; x < 75; x++) { const d = pile[x] - pile[x + 1]; pile[x] -= d * .06; pile[x + 1] += d * .06; }
    for (let x = 0; x < W; x++) pile[x] = Math.min(2.6, pile[x] * (cur.snow > .05 ? .99995 : .999));
    for (let x = 2; x <= 75; x++) {
      if (pile[x] < .15 || x === 38 || x === 39) continue;
      const e = 15 - pile[x];
      for (let y = Math.floor(e) + 1; y < 15; y++) g.set(x, y, ' ');
      plotY(g, x, e, C.soft);
    }

    // drops on the glass
    const water = C.water;
    if (cur.rain > .05 && beads.length < 10 + cur.rain * 60 && Math.random() < cur.rain * .6)
      beads.push({ x: Math.floor(rnd(2, 76)), y: Math.floor(rnd(2, 15)), sz: rnd(0, .8) });
    for (const b of beads) {
      if (cur.rain > .05) { b.sz += Math.random() < .03 ? .02 : 0; if (b.sz > 1) { b.dead = 1; drops.push({ x: b.x, y: b.y, vy: 0 }); } }
      else if ((b.sz -= .002) < 0) b.dead = 1;
    }
    for (const d of drops) {
      d.vy = Math.min(.35, d.vy + .01); d.y += d.vy;
      if (Math.random() < .04) d.x += Math.random() < .5 ? -1 : 1;
      const xi = Math.round(d.x), yi = Math.round(d.y);
      if (yi <= 14 && xi >= 2 && xi <= 75) trail[yi * W + xi] = 1;
      for (const b of beads) if (!b.dead && b.x === xi && Math.abs(b.y - d.y) < 1) b.dead = 1;
      if (d.y > 14.5) d.dead = 1;
    }
    beads = beads.filter(b => !b.dead); drops = drops.filter(d => !d.dead);
    for (let i = 0; i < trail.length; i++) if (trail[i] > .08) { trail[i] *= .97; g.set(i % W, Math.floor(i / W), trail[i] > .45 ? ':' : '.', water); }
    for (const b of beads) g.set(b.x, b.y, b.sz < .45 ? '.' : b.sz < .8 ? ',' : 'o', water);
    for (const d of drops) g.set(d.x, d.y, 'o', C.ink);

    frame(g);
  }

  const win = document.getElementById('orbit-win'), pre = document.getElementById('orbit-strip');
  const cap = document.getElementById('orbit-caption');
  const g = new Grid();
  let t = 0, visible = true, started = false, held = false;
  // freeze while the text is being selected, so it can be dragged over and copied
  win.addEventListener('pointerdown', () => { held = true; });
  addEventListener('pointerup', () => { held = false; });
  const selecting = () => { const s = getSelection(); return held || (s && !s.isCollapsed && s.containsNode(pre, true)); };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(win);
  const tick = () => {
    g.clear(); step(g, t++); pre.innerHTML = g.html();
    if (cap && cap.textContent !== caption) cap.textContent = caption;
  };
  function start() {
    if (started) return; started = true;
    Object.assign(cur, target);
    for (let i = 0; i < 60; i++) { g.clear(); step(g, t++); }
    tick();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = 0;
    (function loop(ts) { if (ts - last > 50 && visible && !document.hidden && !selecting()) { last = ts; tick(); } requestAnimationFrame(loop); })(0);
  }
  if (override) { applyOverride(); start(); }
  else {
    setLight(nyMinutes());
    fetchWeather().then(start);
    setTimeout(start, 1500);
    setInterval(fetchWeather, 15 * 60 * 1000);
    setInterval(() => setLight(nyMinutes()), 60 * 1000);
  }
})();
