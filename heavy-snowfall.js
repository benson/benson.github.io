(() => {
  const LIGHT_PALETTE = {
    bg: '#FAFAFA',
    inkRGB: [12, 13, 15],
  };

  const DARK_PALETTE = {
    bg: '#111112',
    inkRGB: [232, 234, 238],
  };

  function getActivePalette() {
    return document.documentElement.dataset.theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  }

  function mountHeavySnowfall(mount, canvas) {
    if (!mount || !canvas) return () => {};
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return () => {};

    const initialPalette = getActivePalette();

    // Baked-in configuration: FINE density, DEEP ink, 1.0x speed, Light mode default
    const CONFIG = {
      cellW: 5.4,
      cellH: 7.4,
      fontSize: 7.6,
      bg: initialPalette.bg,
      inkRGB: initialPalette.inkRGB,
      deepInk: true,
      speed: 1.0,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    };

    // Character banks
    const GLYPHS = ' .,:;-~=+*#%@&$WM8QHB0/\\|()[]{}^`\'_!iIl?1vnmrxc';
    const G_IDX = {};
    for (let i = 0; i < GLYPHS.length; i++) G_IDX[GLYPHS[i]] = i;

    const PINE_DARK  = '#@%WM8QHB&';
    const PINE_MID   = '=*+xnmv#%';
    const PINE_EDGE  = '/\\|,:;~^*';
    const TRUNK_BANK = '|IH[]!l';
    const MIST_BANK  = ' .,:;~-`\'';
    const SNOW_FAR   = '.,`\'';
    const SNOW_MID   = '.:*+';
    const SNOW_NEAR  = '*o@+';

    const LEVELS = 16;

    // Deterministic hash & 2D value/fBM noise
    function hash2(x, y) {
      let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    function hash1(x) {
      let n = Math.imul(x, 374761393) ^ 0x5bf03635;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    function smoothstep(t) { return t * t * (3 - 2 * t); }

    function vnoise2(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
      const a = hash2(ix, iy);
      const b = hash2(ix + 1, iy);
      const c = hash2(ix, iy + 1);
      const d = hash2(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }

    function fbm2(x, y, oct = 3) {
      let v = 0, amp = 0.5, freq = 1;
      for (let i = 0; i < oct; i++) {
        v += amp * vnoise2(x * freq, y * freq);
        freq *= 2.03;
        amp *= 0.5;
      }
      return v;
    }

    function pick(bank, wx, wy, salt = 0) {
      const h = hash2(wx + salt * 31, wy - salt * 17);
      return bank[Math.floor(h * bank.length)];
    }

    // Dual-weight HiDPI offscreen glyph atlas
    // Rows 0..LEVELS-1 = weight 400 (sky, fog, distant ridges, snow)
    // Rows LEVELS..2*LEVELS-1 = weight 700 (foreground bold ink)
    let atlas = null;
    let atlasCellW = 0;
    let atlasCellH = 0;
    let dpr = 1;

    function buildAtlas() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      atlasCellW = Math.ceil(CONFIG.cellW * dpr);
      atlasCellH = Math.ceil(CONFIG.cellH * dpr);

      atlas = document.createElement('canvas');
      atlas.width = GLYPHS.length * atlasCellW;
      atlas.height = LEVELS * 2 * atlasCellH;
      const actx = atlas.getContext('2d');
      actx.textAlign = 'center';
      actx.textBaseline = 'middle';

      const [r, g, b] = CONFIG.inkRGB;
      const fontPx = CONFIG.fontSize * dpr;

      for (let bold = 0; bold < 2; bold++) {
        const weight = bold ? 700 : 400;
        actx.font = `${weight} ${fontPx}px ${CONFIG.fontFamily}`;
        for (let lvl = 0; lvl < LEVELS; lvl++) {
          // DEEP ink curve: steeper ramp into near-black for woodblock punch
          const t = lvl / (LEVELS - 1);
          const alpha = CONFIG.deepInk
            ? Math.min(1, Math.pow(t, 0.78) * 1.05)
            : Math.min(1, Math.pow(t, 1.0) * 0.92);
          actx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          const py = (bold * LEVELS + lvl) * atlasCellH + atlasCellH * 0.54;
          for (let gi = 0; gi < GLYPHS.length; gi++) {
            const ch = GLYPHS[gi];
            if (ch === ' ') continue;
            const px = gi * atlasCellW + atlasCellW * 0.5;
            actx.fillText(ch, px, py);
          }
        }
      }
    }

    // Deterministic world-space tree generator
    // Layers: 0 = far timberline, 1 = mid forest, 2 = foreground hero spruces
    const LAYER_SPECS = [
      { id: 0, spacing: 7,  minH: 11, maxH: 20, minW: 3.4, maxW: 5.8, baseY: 6,  inkMin: 0.22, inkMax: 0.42, bold: 0, sway: 0.15 },
      { id: 1, spacing: 11, minH: 16, maxH: 28, minW: 4.8, maxW: 8.5, baseY: 2,  inkMin: 0.48, inkMax: 0.76, bold: 1, sway: 0.35 },
      { id: 2, spacing: 17, minH: 20, maxH: 35, minW: 6.5, maxW: 11.2, baseY: 0, inkMin: 0.80, inkMax: 1.00, bold: 1, sway: 0.55 },
    ];

    // Cache trees per world slot so resizing reveals new trees seamlessly without shifting existing ones
    const treeCache = new Map();

    function getTree(layerId, slot) {
      const key = `${layerId}:${slot}`;
      if (treeCache.has(key)) return treeCache.get(key);

      const spec = LAYER_SPECS[layerId];
      const seed = slot * 131 + layerId * 9973;
      const r0 = hash1(seed);
      const r1 = hash1(seed + 1);
      const r2 = hash1(seed + 2);
      const r3 = hash1(seed + 3);
      const r4 = hash1(seed + 4);

      // Occasional natural clearing gap
      if (r0 < (layerId === 2 ? 0.22 : 0.12)) {
        treeCache.set(key, null);
        return null;
      }

      const cx = slot * spec.spacing + (r1 - 0.5) * spec.spacing * 0.72;
      const height = Math.round(spec.minH + r2 * (spec.maxH - spec.minH));
      const maxRadius = spec.minW + r3 * (spec.maxW - spec.minW);
      const baseY = spec.baseY + Math.floor(r4 * 2);
      const tiers = Math.max(4, Math.floor(height / (layerId === 2 ? 3.5 : 3.1)));
      const stiffness = 0.65 + hash1(seed + 5) * 0.7;
      const asym = (hash1(seed + 6) - 0.5) * 0.28;

      const tree = { cx, height, maxRadius, baseY, tiers, stiffness, asym, seed, layerId };
      treeCache.set(key, tree);
      return tree;
    }

    // Evaluate a single tree at world coordinate (wx, wy) with optional crown gust offset
    // Returns null (transparent), { snow: true } (opaque white snow pillow), or { ch, lvl, bold }
    function sampleTree(tree, wx, wy, gustDx) {
      const dy = wy - tree.baseY;
      if (dy < 0 || dy > tree.height) return null;

      const hNorm = dy / tree.height; // 0 = base, 1 = tip
      // Grounded physics: lower 58% of tree is completely anchored; only upper crown flexes
      const flex = hNorm > 0.58 ? Math.pow((hNorm - 0.58) / 0.42, 1.8) * gustDx * tree.stiffness : 0;
      const dx = (wx - tree.cx) - flex;

      const spec = LAYER_SPECS[tree.layerId];
      const trunkH = Math.max(2, Math.floor(tree.height * 0.14));

      // Trunk
      if (dy < trunkH) {
        const trunkW = tree.layerId === 2 ? 1.15 : 0.65;
        if (Math.abs(dx) <= trunkW) {
          const ch = pick(TRUNK_BANK, Math.round(wx), wy, tree.seed);
          const lvl = Math.min(LEVELS - 1, Math.floor((spec.inkMin + 0.18) * (LEVELS - 1)));
          return { ch, lvl, bold: spec.bold };
        }
        return null;
      }

      // Tiered conifer silhouette with drooping boughs
      const foliageNorm = (dy - trunkH) / (tree.height - trunkH); // 0 bottom bough -> 1 spire tip
      const tierPos = foliageNorm * tree.tiers;
      const tierIdx = Math.floor(tierPos);
      const inTier = tierPos - tierIdx; // 0 = underside of bough, 1 = top of bough

      // Droop & taper
      const taper = Math.pow(1 - foliageNorm, 0.85);
      const tierFlare = 0.58 + 0.42 * (1 - inTier);
      const sideAsym = dx >= 0 ? (1 + tree.asym) : (1 - tree.asym);
      const jitter = (hash2(Math.floor(wx), wy + tree.seed) - 0.5) * 1.15;
      const radius = Math.max(0.55, tree.maxRadius * taper * tierFlare * sideAsym + jitter * 0.65);

      if (Math.abs(dx) > radius) return null;

      const edgeDist = radius - Math.abs(dx);
      const nHash = hash2(Math.round(wx) + tree.seed, wy * 3);

      // Spire tip
      if (foliageNorm > 0.93) {
        const ch = nHash > 0.5 ? '^' : '|';
        const lvl = Math.min(LEVELS - 1, Math.floor(spec.inkMax * (LEVELS - 1)));
        return { ch, lvl, bold: spec.bold };
      }

      // Opaque negative-space snow pillow resting on upper 38% of each bough tier
      const snowCap = 0.62 - (tree.layerId === 2 ? 0.04 : 0.0) + (nHash - 0.5) * 0.14;
      if (inTier > snowCap && edgeDist > 0.35) {
        // Pure white negative space that occludes trees behind it, with tiny occasional snow grain
        if (nHash > 0.92 && tree.layerId === 2) {
          return { ch: '.', lvl: 2, bold: 0, snow: true };
        }
        return { ch: ' ', lvl: 0, bold: 0, snow: true };
      }

      // Dense shadowed underside needles directly beneath snow pillow
      const shade = (1 - inTier) * 0.65 + (1 - Math.abs(dx) / (radius + 0.01)) * 0.35;
      const ink = spec.inkMin + (spec.inkMax - spec.inkMin) * Math.min(1, shade + (nHash - 0.5) * 0.25);
      const lvl = Math.max(1, Math.min(LEVELS - 1, Math.round(ink * (LEVELS - 1))));

      let ch;
      if (edgeDist < 0.9) {
        ch = pick(PINE_EDGE, Math.round(wx), wy, tree.seed);
      } else if (shade > 0.55) {
        ch = pick(PINE_DARK, Math.round(wx), wy, tree.seed);
      } else {
        ch = pick(PINE_MID, Math.round(wx), wy, tree.seed);
      }

      return { ch, lvl, bold: spec.bold };
    }

    // Intermittent localized gust packets (long periods of stillness, occasional passing wind front)
    function getGust(wx, t) {
      let g = 0;
      // Two staggered sparse wave packets
      for (let k = 0; k < 2; k++) {
        const period = k === 0 ? 19.0 : 29.0;
        const phase = (t + k * 9.5) % period;
        if (phase < 6.5) {
          const env = Math.sin((phase / 6.5) * Math.PI);
          const frontX = -90 + phase * 32;
          const dist = (wx - frontX) / 28;
          const spatial = Math.exp(-dist * dist);
          g += env * env * spatial * (k === 0 ? 1.35 : 0.95);
        }
      }
      return g;
    }

    // Viewport state
    let cols = 0, rows = 0, cssW = 0, cssH = 0;

    function resize() {
      const rect = mount.getBoundingClientRect();
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));

      const newDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!atlas || newDpr !== dpr) buildAtlas();

      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);

      cols = Math.ceil(cssW / CONFIG.cellW);
      rows = Math.ceil(cssH / CONFIG.cellH);
    }

    function drawCell(col, row, ch, lvl, bold) {
      const gi = G_IDX[ch];
      if (gi === undefined || ch === ' ') return;
      const sx = gi * atlasCellW;
      const sy = (bold * LEVELS + lvl) * atlasCellH;
      const dx = Math.round(col * CONFIG.cellW * dpr);
      const dy = Math.round(row * CONFIG.cellH * dpr);
      ctx.drawImage(atlas, sx, sy, atlasCellW, atlasCellH, dx, dy, atlasCellW, atlasCellH);
    }

    function renderFrame(t) {
      // Clear to crisp paper background
      ctx.fillStyle = CONFIG.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const halfCols = Math.floor(cols / 2);

      // Pre-collect visible trees per layer for this viewport width
      const visibleTrees = [[], [], []];
      for (let l = 0; l < 3; l++) {
        const spec = LAYER_SPECS[l];
        const minSlot = Math.floor((-halfCols - 14) / spec.spacing);
        const maxSlot = Math.ceil((cols - halfCols + 14) / spec.spacing);
        for (let s = minSlot; s <= maxSlot; s++) {
          const tr = getTree(l, s);
          if (tr) visibleTrees[l].push(tr);
        }
      }

      // Render cell-by-cell in world space (wx centered, wy bottom-anchored)
      for (let row = 0; row < rows; row++) {
        const wy = (rows - 1) - row;

        for (let col = 0; col < cols; col++) {
          const wx = col - halfCols;
          const gust = getGust(wx, t);

          // 1. Background distant ridge silhouette & subtle overcast sky grain
          let ch = ' ';
          let lvl = 0;
          let bold = 0;

          const ridgeH = 14 + Math.sin(wx * 0.035) * 4.5 + fbm2(wx * 0.05, 1.3, 2) * 8.5;
          if (wy < ridgeH && wy > 4) {
            const depthFade = (ridgeH - wy) / 11;
            const n = hash2(wx, wy);
            if (n > 0.35) {
              ch = pick(MIST_BANK, wx, wy, 3);
              lvl = Math.max(1, Math.min(3, Math.round(depthFade * 2.5)));
            }
          }

          // 2. Far timberline (Layer 0)
          const trees0 = visibleTrees[0];
          for (let i = 0; i < trees0.length; i++) {
            const tr = trees0[i];
            if (Math.abs(wx - tr.cx) > tr.maxRadius + 3) continue;
            const hit = sampleTree(tr, wx, wy, gust * 0.3);
            if (hit) { ch = hit.ch; lvl = hit.lvl; bold = hit.bold; break; }
          }

          // 3. Volumetric mist band between far & mid forest
          const mist1 = fbm2(wx * 0.045 - t * 0.14, wy * 0.08 + 2.1, 3);
          const mistBand1 = Math.exp(-Math.pow((wy - 10) / 6.5, 2));
          if (mist1 * mistBand1 > 0.42) {
            ch = mist1 * mistBand1 > 0.56 ? ' ' : pick(MIST_BANK, wx, wy, 7);
            lvl = ch === ' ' ? 0 : 1;
            bold = 0;
          }

          // 4. Mid forest (Layer 1)
          const trees1 = visibleTrees[1];
          for (let i = 0; i < trees1.length; i++) {
            const tr = trees1[i];
            if (Math.abs(wx - tr.cx) > tr.maxRadius + 3) continue;
            const hit = sampleTree(tr, wx, wy, gust * 0.65);
            if (hit) { ch = hit.ch; lvl = hit.lvl; bold = hit.bold; break; }
          }

          // 5. Luminous fog halo directly behind foreground conifers (key for Notan separation)
          const mist2 = fbm2(wx * 0.038 - t * 0.22, wy * 0.09 + 7.4, 3);
          const mistBand2 = Math.exp(-Math.pow((wy - 7) / 5.5, 2));
          if (mist2 * mistBand2 > 0.44) {
            ch = ' ';
            lvl = 0;
            bold = 0;
          }

          // 6. Foreground hero spruces (Layer 2)
          const trees2 = visibleTrees[2];
          for (let i = 0; i < trees2.length; i++) {
            const tr = trees2[i];
            if (Math.abs(wx - tr.cx) > tr.maxRadius + 4) continue;
            const hit = sampleTree(tr, wx, wy, gust);
            if (hit) { ch = hit.ch; lvl = hit.lvl; bold = hit.bold; break; }
          }

          // 7. Ground snowdrift bank (wy === 0..2)
          const driftH = 1.6 + Math.sin(wx * 0.09) * 0.9 + hash2(wx, 0) * 0.7;
          if (wy < driftH && lvl === 0) {
            if (hash2(wx, wy + 91) > 0.76) {
              ch = pick('.,-~_', wx, wy, 11);
              lvl = 2;
              bold = 0;
            }
          }

          // 8. 3-layer world-tiled parallax snowfall
          // Far snow
          const sy0 = Math.floor(wy + t * 2.2);
          const sx0 = Math.floor(wx - t * 0.6);
          if (hash2(sx0, sy0) > 0.986 && lvl < 4) {
            ch = pick(SNOW_FAR, sx0, sy0, 21);
            lvl = 3;
            bold = 0;
          }
          // Mid snow
          const sy1 = Math.floor(wy + t * 4.4);
          const sx1 = Math.floor(wx - t * 1.4 - Math.sin(t * 0.6 + wy * 0.15) * 1.2);
          if (hash2(sx1 + 409, sy1 + 113) > 0.989) {
            ch = pick(SNOW_MID, sx1, sy1, 22);
            lvl = lvl > 8 ? 2 : 5;
            bold = 0;
          }
          // Near crisp snowflakes
          const sy2 = Math.floor(wy + t * 7.2);
          const sx2 = Math.floor(wx - t * 2.4 - gust * 2.0);
          if (hash2(sx2 + 911, sy2 + 577) > 0.9945) {
            ch = pick(SNOW_NEAR, sx2, sy2, 23);
            lvl = lvl > 8 ? 1 : 9;
            bold = 0;
          }

          if (ch !== ' ' && lvl > 0) {
            drawCell(col, row, ch, lvl, bold);
          }
        }
      }
    }

    // Lifecycle: ResizeObserver + prefers-reduced-motion + theme sync + RAF loop
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let rafId = null;
    let disposed = false;
    const startTime = performance.now();

    function currentTime() {
      return reducedMotion ? 4.2 : ((performance.now() - startTime) / 1000) * CONFIG.speed;
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function loop(now) {
      if (disposed || reducedMotion) {
        rafId = null;
        return;
      }
      const t = ((now - startTime) / 1000) * CONFIG.speed;
      renderFrame(t);
      rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (disposed) return;
      stopLoop();
      if (reducedMotion) {
        renderFrame(4.2);
      } else {
        rafId = requestAnimationFrame(loop);
      }
    }

    function syncTheme() {
      const palette = getActivePalette();
      if (CONFIG.bg === palette.bg && CONFIG.inkRGB === palette.inkRGB) return;
      CONFIG.bg = palette.bg;
      CONFIG.inkRGB = palette.inkRGB;
      buildAtlas();
      renderFrame(currentTime());
    }

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      resize();
      renderFrame(currentTime());
    });
    ro.observe(mount);

    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    function onMotionChange(event) {
      reducedMotion = event.matches;
      startLoop();
    }
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', onMotionChange);
    } else if (motionQuery.addListener) {
      motionQuery.addListener(onMotionChange);
    }

    function onPageHide() {
      stopLoop();
    }

    function onPageShow(event) {
      if (event.persisted && !disposed) {
        resize();
        startLoop();
      }
    }

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    resize();
    startLoop();

    return function cleanup() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      ro.disconnect();
      themeObserver.disconnect();
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener('change', onMotionChange);
      } else if (motionQuery.removeListener) {
        motionQuery.removeListener(onMotionChange);
      }
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }

  window.mountHeavySnowfall = mountHeavySnowfall;

  const mount = document.getElementById('heavy-snowfall-mount');
  const canvas = document.getElementById('heavy-snowfall-canvas');
  if (mount && canvas) {
    window.__cleanupHeavySnowfall = mountHeavySnowfall(mount, canvas);
  }
})();
