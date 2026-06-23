const DEG = Math.PI / 180;
const STORAGE_KEY = "buoy-rangefinder-v1";

const els = {
  baseline: document.querySelector("#baselineInput"),
  target: document.querySelector("#targetInput"),
  targetChip: document.querySelector("#targetChip"),
  statusBlock: document.querySelector("#statusBlock"),
  statusText: document.querySelector("#statusText"),
  distanceValue: document.querySelector("#distanceValue"),
  deltaValue: document.querySelector("#deltaValue"),
  offsetValue: document.querySelector("#offsetValue"),
  distanceAValue: document.querySelector("#distanceAValue"),
  distanceBValue: document.querySelector("#distanceBValue"),
  headingValue: document.querySelector("#headingValue"),
  enableCompass: document.querySelector("#enableCompass"),
  shoreBearing: document.querySelector("#shoreBearingInput"),
  bearingA: document.querySelector("#bearingAInput"),
  bearingB: document.querySelector("#bearingBInput"),
  angleA: document.querySelector("#angleAInput"),
  angleB: document.querySelector("#angleBInput"),
  bearingsPanel: document.querySelector("#bearingsPanel"),
  anglesPanel: document.querySelector("#anglesPanel"),
  calculate: document.querySelector("#calculateButton"),
  plot: document.querySelector("#plot"),
};

const state = {
  mode: "bearings",
  side: "right",
  heading: null,
  result: null,
};

function toRad(deg) {
  return deg * DEG;
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

function parseNumber(input) {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function fmtFeet(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)} ft`;
}

function setStatus(kind, message) {
  els.statusBlock.className = `status-block ${kind || ""}`.trim();
  els.statusText.textContent = message;
}

function rayFromBearing(bearing, shoreBearing, side) {
  const diff = toRad(normalizeDeg(bearing - shoreBearing));
  return {
    x: Math.cos(diff),
    y: side === "right" ? Math.sin(diff) : -Math.sin(diff),
  };
}

export function solveFromBearings({ baseline, shoreBearing, bearingA, bearingB, side }) {
  const vA = rayFromBearing(bearingA, shoreBearing, side);
  const vB = rayFromBearing(bearingB, shoreBearing, side);
  const det = (vB.x * vA.y) - (vA.x * vB.y);

  if (Math.abs(det) < 0.02) {
    return { ok: false, message: "sight lines are almost parallel" };
  }

  const t = (-baseline * vB.y) / det;
  const u = (-baseline * vA.y) / det;
  const x = t * vA.x;
  const y = t * vA.y;

  if (t <= 0 || u <= 0 || y <= 0) {
    return { ok: false, message: "sightings do not meet offshore" };
  }

  return buildResult({ baseline, x, y, quality: Math.min(1, Math.abs(det)) });
}

export function solveFromAngles({ baseline, angleA, angleB }) {
  const tanA = Math.tan(toRad(angleA));
  const tanB = Math.tan(toRad(angleB));

  if (angleA <= 0 || angleA >= 90 || angleB <= 0 || angleB >= 90 || tanA <= 0 || tanB <= 0) {
    return { ok: false, message: "angles must be between 0 and 90" };
  }

  const x = (baseline * tanB) / (tanA + tanB);
  const y = (baseline * tanA * tanB) / (tanA + tanB);
  const spread = Math.sin(toRad(angleA + angleB));
  return buildResult({ baseline, x, y, quality: Math.max(0, Math.min(1, spread)) });
}

function buildResult({ baseline, x, y, quality }) {
  return {
    ok: true,
    x,
    y,
    quality,
    distanceA: Math.hypot(x, y),
    distanceB: Math.hypot(baseline - x, y),
  };
}

function readInputs() {
  const baseline = parseNumber(els.baseline);
  const target = parseNumber(els.target);

  if (!baseline || baseline <= 0) return { ok: false, message: "enter the baseline" };
  if (!target || target <= 0) return { ok: false, message: "enter the goal distance" };

  if (state.mode === "bearings") {
    const shoreBearing = parseNumber(els.shoreBearing);
    const bearingA = parseNumber(els.bearingA);
    const bearingB = parseNumber(els.bearingB);

    if (shoreBearing === null || bearingA === null || bearingB === null) {
      return { ok: false, message: "enter two sightings" };
    }

    return {
      ok: true,
      target,
      solution: solveFromBearings({
        baseline,
        shoreBearing: normalizeDeg(shoreBearing),
        bearingA: normalizeDeg(bearingA),
        bearingB: normalizeDeg(bearingB),
        side: state.side,
      }),
    };
  }

  const angleA = parseNumber(els.angleA);
  const angleB = parseNumber(els.angleB);

  if (angleA === null || angleB === null) {
    return { ok: false, message: "enter both angles" };
  }

  return {
    ok: true,
    target,
    solution: solveFromAngles({ baseline, angleA, angleB }),
  };
}

function updateTargetChip() {
  const target = parseNumber(els.target) || 100;
  els.targetChip.textContent = Math.round(target);
}

function markDirty() {
  updateTargetChip();
  save();

  if (state.result) {
    setStatus("warn", "tap calculate to update");
  } else if (hasRequiredInputs()) {
    setStatus("warn", "tap calculate");
  } else {
    setStatus("", state.mode === "bearings" ? "enter two sightings" : "enter both angles");
    clearReadout();
  }
}

function hasRequiredInputs() {
  if (!parseNumber(els.baseline) || !parseNumber(els.target)) return false;

  if (state.mode === "bearings") {
    return parseNumber(els.shoreBearing) !== null
      && parseNumber(els.bearingA) !== null
      && parseNumber(els.bearingB) !== null;
  }

  return parseNumber(els.angleA) !== null && parseNumber(els.angleB) !== null;
}

function calculate() {
  const inputs = readInputs();
  updateTargetChip();

  if (!inputs.ok) {
    state.result = null;
    setStatus("", inputs.message);
    clearReadout();
    drawPlot();
    save();
    return;
  }

  if (!inputs.solution.ok) {
    state.result = null;
    setStatus("bad", inputs.solution.message);
    clearReadout();
    drawPlot();
    save();
    return;
  }

  state.result = inputs.solution;
  const delta = state.result.y - inputs.target;
  const absDelta = Math.abs(delta);
  const closeEnough = absDelta <= 3;
  const qualityWarn = state.result.quality < 0.18;
  const statusKind = closeEnough && !qualityWarn ? "ok" : qualityWarn ? "warn" : "bad";
  const statusText = closeEnough
    ? "right around the goal"
    : delta > 0
      ? `${fmtFeet(absDelta)} too far`
      : `${fmtFeet(absDelta)} too close`;

  setStatus(statusKind, qualityWarn ? `${statusText}; widen the baseline if you can` : statusText);
  els.distanceValue.textContent = fmtFeet(state.result.y);
  els.deltaValue.textContent = closeEnough
    ? "hold there"
    : delta > 0
      ? `${fmtFeet(absDelta)} toward shore`
      : `${fmtFeet(absDelta)} farther out`;
  els.offsetValue.textContent = `${fmtFeet(state.result.x)} from A`;
  els.distanceAValue.textContent = fmtFeet(state.result.distanceA);
  els.distanceBValue.textContent = fmtFeet(state.result.distanceB);
  drawPlot();
  save();
}

function clearReadout() {
  els.distanceValue.textContent = "--";
  els.deltaValue.textContent = "--";
  els.offsetValue.textContent = "--";
  els.distanceAValue.textContent = "--";
  els.distanceBValue.textContent = "--";
}

function drawPlot() {
  const canvas = els.plot;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round(rect.width * ratio));
  const height = Math.max(220, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(ratio, ratio);

  const w = width / ratio;
  const h = height / ratio;
  const baseline = parseNumber(els.baseline) || 50;
  const target = parseNumber(els.target) || 100;
  const result = state.result;
  const waterTop = 18;
  const shoreY = h - 58;
  const pad = 26;

  const minX = Math.min(0, result ? result.x : 0);
  const maxX = Math.max(baseline, result ? result.x : baseline, baseline * 1.05);
  const maxY = Math.max(target, result ? result.y : target, baseline * 0.9);
  const scaleX = (w - pad * 2) / Math.max(1, maxX - minX);
  const scaleY = (shoreY - waterTop) / Math.max(1, maxY);
  const scale = Math.min(scaleX, scaleY);
  const originX = pad - minX * scale;

  const px = (x) => originX + x * scale;
  const py = (y) => shoreY - y * scale;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(155, 107, 67, 0.58)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(14, shoreY);
  ctx.lineTo(w - 14, shoreY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(239, 123, 69, 0.78)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(14, py(target));
  ctx.lineTo(w - 14, py(target));
  ctx.stroke();
  ctx.setLineDash([]);

  drawLabel(ctx, "goal", w - 56, py(target) - 8, "#8b4b25");
  drawPoint(ctx, px(0), shoreY, "A", "#102321");
  drawPoint(ctx, px(baseline), shoreY, "B", "#102321");

  if (result) {
    ctx.strokeStyle = "rgba(16, 35, 33, 0.72)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px(0), shoreY);
    ctx.lineTo(px(result.x), py(result.y));
    ctx.lineTo(px(baseline), shoreY);
    ctx.stroke();

    ctx.strokeStyle = "#0e7c7b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px(result.x), shoreY);
    ctx.lineTo(px(result.x), py(result.y));
    ctx.stroke();

    drawPoint(ctx, px(result.x), py(result.y), "", "#ef7b45", 8);
    drawLabel(ctx, fmtFeet(result.y), px(result.x) + 10, py(result.y) + 4, "#102321");
  } else {
    ctx.strokeStyle = "rgba(14, 124, 123, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px(baseline / 2), shoreY);
    ctx.lineTo(px(baseline / 2), py(target));
    ctx.stroke();
  }

  ctx.restore();
}

function drawPoint(ctx, x, y, label, color, radius = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    drawLabel(ctx, label, x - 5, y + 24, color);
  }
}

function drawLabel(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText(text, x, y);
}

async function enableCompass() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined"
      && typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        setStatus("warn", "compass permission was not granted");
        return;
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    els.enableCompass.textContent = "compass on";
    setStatus("", "point the phone and capture");
  } catch (error) {
    setStatus("warn", "compass is unavailable on this phone");
  }
}

function handleOrientation(event) {
  let heading = null;

  if (typeof event.webkitCompassHeading === "number") {
    heading = event.webkitCompassHeading;
  } else if (typeof event.alpha === "number") {
    heading = 360 - event.alpha;
  }

  if (heading === null || !Number.isFinite(heading)) return;

  state.heading = normalizeDeg(heading);
  els.headingValue.textContent = `${state.heading.toFixed(0)}°`;
}

function captureHeading(kind) {
  if (state.heading === null) {
    setStatus("warn", "enable compass first");
    return;
  }

  const target = kind === "shore" ? els.shoreBearing : kind === "a" ? els.bearingA : els.bearingB;
  target.value = state.heading.toFixed(1);
  calculate();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  els.bearingsPanel.classList.toggle("is-hidden", mode !== "bearings");
  els.anglesPanel.classList.toggle("is-hidden", mode !== "angles");
  markDirty();
}

function setSide(side) {
  state.side = side;
  document.querySelectorAll(".segment").forEach((segment) => {
    segment.classList.toggle("is-active", segment.dataset.side === side);
  });
  markDirty();
}

function save() {
  const payload = {
    mode: state.mode,
    side: state.side,
    baseline: els.baseline.value,
    target: els.target.value,
    shoreBearing: els.shoreBearing.value,
    bearingA: els.bearingA.value,
    bearingB: els.bearingB.value,
    angleA: els.angleA.value,
    angleB: els.angleB.value,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;

    els.baseline.value = saved.baseline || "50";
    els.target.value = saved.target || "100";
    els.shoreBearing.value = saved.shoreBearing || "";
    els.bearingA.value = saved.bearingA || "";
    els.bearingB.value = saved.bearingB || "";
    els.angleA.value = saved.angleA || "";
    els.angleB.value = saved.angleB || "";
    state.side = saved.side === "left" ? "left" : "right";
    state.mode = saved.mode === "angles" ? "angles" : "bearings";
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

document.querySelectorAll("input").forEach((input) => input.addEventListener("input", markDirty));
document.querySelectorAll(".capture").forEach((button) => {
  button.addEventListener("click", () => captureHeading(button.dataset.capture));
});
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});
document.querySelectorAll(".segment").forEach((segment) => {
  segment.addEventListener("click", () => setSide(segment.dataset.side));
});
els.enableCompass.addEventListener("click", enableCompass);
els.calculate.addEventListener("click", calculate);
window.addEventListener("resize", drawPlot);

restore();
setSide(state.side);
setMode(state.mode);
drawPlot();
