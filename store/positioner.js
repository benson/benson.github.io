const stage = document.querySelector("#positioner-stage");
const shirtImage = document.querySelector("#shirt-image");
const logoHandle = document.querySelector("#logo-handle");
const logoImage = logoHandle?.querySelector("img");
const shirtSelect = document.querySelector("#position-shirt");
const leftInput = document.querySelector("#position-left");
const topInput = document.querySelector("#position-top");
const widthInput = document.querySelector("#position-width");
const output = document.querySelector("#position-output");
const copyButton = document.querySelector("#copy-position");
const readoutLeft = document.querySelector("#readout-left");
const readoutTop = document.querySelector("#readout-top");
const readoutSize = document.querySelector("#readout-size");
const presetButtons = [...document.querySelectorAll("[data-position-preset]")];

const area = {
  width: 1800,
  height: 2400
};

const shirts = {
  pepper: {
    src: "assets/redbullfinch-positioner-pepper-blank.jpg?v=redbullfinch-positioner-1",
    alt: "pepper Comfort Colors shirt"
  },
  crimson: {
    src: "assets/redbullfinch-positioner-crimson-blank.jpg?v=redbullfinch-positioner-1",
    alt: "crimson Comfort Colors shirt"
  }
};

const presets = {
  current: { left: 960, top: 610, width: 270 },
  higher: { left: 970, top: 500, width: 255 },
  inboard: { left: 870, top: 590, width: 255 },
  lower: { left: 960, top: 730, width: 270 }
};

const saved = JSON.parse(window.localStorage.getItem("redbullfinch-positioner") || "null");
const position = {
  shirt: saved?.shirt && shirts[saved.shirt] ? saved.shirt : "pepper",
  left: Number.isFinite(saved?.left) ? saved.left : presets.current.left,
  top: Number.isFinite(saved?.top) ? saved.top : presets.current.top,
  width: Number.isFinite(saved?.width) ? saved.width : presets.current.width
};

const drag = {
  active: false,
  pointerId: null,
  offsetX: 0,
  offsetY: 0
};

function logoRatio() {
  const naturalWidth = logoImage?.naturalWidth || 1;
  const naturalHeight = logoImage?.naturalHeight || 1;
  return naturalHeight / naturalWidth;
}

function positionHeight(width = position.width) {
  return Math.round(width * logoRatio());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPosition() {
  const height = positionHeight();
  position.left = Math.round(clamp(position.left, 0, area.width - position.width));
  position.top = Math.round(clamp(position.top, 0, area.height - height));
  position.width = Math.round(clamp(position.width, Number(widthInput.min), Number(widthInput.max)));
}

function positionPayload() {
  const width = Math.round(position.width);
  const height = positionHeight(width);
  return {
    area_width: area.width,
    area_height: area.height,
    width,
    height,
    top: Math.round(position.top),
    left: Math.round(position.left)
  };
}

function savePosition() {
  window.localStorage.setItem("redbullfinch-positioner", JSON.stringify(position));
}

function updateControls() {
  leftInput.value = String(position.left);
  topInput.value = String(position.top);
  widthInput.value = String(position.width);
  shirtSelect.value = position.shirt;
}

function updateStage() {
  const payload = positionPayload();
  stage.style.setProperty("--logo-left", `${(payload.left / area.width) * 100}%`);
  stage.style.setProperty("--logo-top", `${(payload.top / area.height) * 100}%`);
  stage.style.setProperty("--logo-width", `${(payload.width / area.width) * 100}%`);
  shirtImage.src = shirts[position.shirt].src;
  shirtImage.alt = shirts[position.shirt].alt;
  readoutLeft.textContent = String(payload.left);
  readoutTop.textContent = String(payload.top);
  readoutSize.textContent = `${payload.width} x ${payload.height}`;
  output.value = JSON.stringify(payload, null, 2);
}

function render() {
  clampPosition();
  updateControls();
  updateStage();
  savePosition();
}

function stagePoint(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * area.width,
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * area.height
  };
}

function beginDrag(event) {
  const point = stagePoint(event);
  drag.active = true;
  drag.pointerId = event.pointerId;
  drag.offsetX = point.x - position.left;
  drag.offsetY = point.y - position.top;
  logoHandle.setPointerCapture(event.pointerId);
  logoHandle.classList.add("is-dragging");
}

function moveDrag(event) {
  if (!drag.active || drag.pointerId !== event.pointerId) return;
  const point = stagePoint(event);
  position.left = point.x - drag.offsetX;
  position.top = point.y - drag.offsetY;
  render();
}

function endDrag(event) {
  if (!drag.active || drag.pointerId !== event.pointerId) return;
  drag.active = false;
  drag.pointerId = null;
  logoHandle.classList.remove("is-dragging");
  logoHandle.releasePointerCapture?.(event.pointerId);
}

function moveWithKeyboard(event) {
  const distance = event.shiftKey ? 25 : 5;
  if (event.key === "ArrowLeft") position.left -= distance;
  else if (event.key === "ArrowRight") position.left += distance;
  else if (event.key === "ArrowUp") position.top -= distance;
  else if (event.key === "ArrowDown") position.top += distance;
  else return;

  event.preventDefault();
  render();
}

shirtSelect.addEventListener("change", () => {
  position.shirt = shirtSelect.value;
  render();
});

leftInput.addEventListener("input", () => {
  position.left = Number(leftInput.value);
  render();
});

topInput.addEventListener("input", () => {
  position.top = Number(topInput.value);
  render();
});

widthInput.addEventListener("input", () => {
  position.width = Number(widthInput.value);
  render();
});

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    Object.assign(position, presets[button.dataset.positionPreset]);
    render();
  });
}

logoHandle.addEventListener("pointerdown", beginDrag);
logoHandle.addEventListener("pointermove", moveDrag);
logoHandle.addEventListener("pointerup", endDrag);
logoHandle.addEventListener("pointercancel", endDrag);
logoHandle.addEventListener("keydown", moveWithKeyboard);

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.value);
  copyButton.textContent = "copied";
  window.setTimeout(() => {
    copyButton.textContent = "copy position";
  }, 1200);
});

logoImage.addEventListener("load", render, { once: true });
render();
