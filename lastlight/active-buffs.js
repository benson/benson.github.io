const partsByButton = new WeakMap();

function setText(node, value) {
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}

function setAttribute(node, name, value) {
  const next = String(value);
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}

function createElement(document, tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function createActiveBuffButton(root, buff) {
  const document = root.ownerDocument;
  const button = createElement(document, "button", "active-buff");
  button.type = "button";
  button.dataset.buffField = buff.field;

  const image = createElement(document, "img");
  image.alt = "";
  const progress = createElement(document, "i", "active-buff-progress");
  progress.setAttribute("aria-hidden", "true");
  const countdown = createElement(document, "b", "active-buff-countdown");
  const label = createElement(document, "span", "active-buff-label");
  const tooltip = createElement(document, "span", "active-buff-tooltip");
  tooltip.id = `active-buff-${buff.field}`;
  tooltip.setAttribute("role", "tooltip");
  const tooltipName = createElement(document, "strong");
  const tooltipCopy = createElement(document, "em");
  const tooltipTime = createElement(document, "small", "active-buff-tooltip-time");
  tooltip.append(tooltipName, tooltipCopy, tooltipTime);
  button.append(image, progress, countdown, label, tooltip);
  partsByButton.set(button, { image, progress, countdown, label, tooltip, tooltipName, tooltipCopy, tooltipTime });
  return button;
}

function updateActiveBuffButton(button, buff) {
  const parts = partsByButton.get(button);
  if (!parts) throw new Error(`Active buff node ${buff.field} was not created by the reconciler`);
  const preciseTime = `${buff.remaining.toFixed(1)} seconds remaining`;
  const visibleTime = buff.remaining < 10 ? buff.remaining.toFixed(1) : Math.ceil(buff.remaining);
  setAttribute(button, "aria-describedby", parts.tooltip.id);
  setAttribute(button, "aria-label", `${buff.name}, ${preciseTime}. ${buff.copy}`);
  setAttribute(parts.image, "src", buff.icon);
  parts.progress.style.setProperty("--buff-progress", `${Math.max(0, Math.min(100, buff.remaining / buff.max * 100))}%`);
  setText(parts.countdown, visibleTime);
  setText(parts.label, buff.name);
  setText(parts.tooltipName, buff.name);
  setText(parts.tooltipCopy, buff.copy);
  setText(parts.tooltipTime, preciseTime);
}

function validateBuffs(buffs) {
  if (!Array.isArray(buffs)) throw new TypeError("Active buffs must be an array");
  const ids = new Set();
  for (const buff of buffs) {
    if (!buff || !/^[a-z][a-zA-Z0-9]*$/.test(buff.field || "")) throw new TypeError(`Invalid active buff field: ${String(buff?.field)}`);
    if (ids.has(buff.field)) throw new TypeError(`Duplicate active buff field: ${buff.field}`);
    if (!Number.isFinite(buff.remaining) || !Number.isFinite(buff.max) || buff.max <= 0) throw new TypeError(`Invalid active buff timing: ${buff.field}`);
    ids.add(buff.field);
  }
}

export function reconcileActiveBuffs(root, buffs) {
  if (!root?.ownerDocument) throw new TypeError("Active buff root must be a DOM element");
  validateBuffs(buffs);
  const existing = new Map([...root.children].filter((node) => node.dataset?.buffField).map((node) => [node.dataset.buffField, node]));
  const buttons = [];
  buffs.forEach((buff, index) => {
    const button = existing.get(buff.field) || createActiveBuffButton(root, buff);
    updateActiveBuffButton(button, buff);
    existing.delete(buff.field);
    const current = root.children[index] || null;
    if (current !== button) root.insertBefore(button, current);
    buttons.push(button);
  });
  for (const stale of existing.values()) stale.remove();
  return buttons;
}
