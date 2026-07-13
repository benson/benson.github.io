const partsByChip = new WeakMap();

function setText(node, value) {
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
}

function setAttribute(node, name, value) {
  const next = String(value);
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}

function element(document, tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function createChip(root, entry) {
  const document = root.ownerDocument, chip = element(document, "button", `synergy-chip synergy-${entry.id}`);
  chip.type = "button"; chip.dataset.synergyId = entry.id;
  const glyph = element(document, "b", "synergy-glyph"), body = element(document, "span", "synergy-chip-body");
  const name = element(document, "strong"), status = element(document, "small"), contributors = element(document, "span", "synergy-contributors");
  const progress = element(document, "i", "synergy-progress"); progress.setAttribute("aria-hidden", "true");
  const tooltip = element(document, "span", "synergy-tooltip"); tooltip.id = `synergy-tooltip-${entry.id}`; tooltip.setAttribute("role", "tooltip");
  const tooltipName = element(document, "strong"), tooltipCopy = element(document, "em"), tooltipContributors = element(document, "small");
  body.append(name, status, contributors); tooltip.append(tooltipName, tooltipCopy, tooltipContributors);
  chip.append(glyph, body, progress, tooltip);
  partsByChip.set(chip, { glyph, name, status, contributors, progress, tooltip, tooltipName, tooltipCopy, tooltipContributors });
  return chip;
}

function updateChip(chip, entry) {
  const parts = partsByChip.get(chip);
  if (!parts) throw new TypeError(`Synergy chip ${entry.id} was not created by the reconciler`);
  const contributorCopy = entry.contributors.map(({ slot, name }) => `${name || "Specialist"} ${slot + 1}`).join(", ");
  setText(parts.glyph, entry.glyph); setText(parts.name, entry.name); setText(parts.status, entry.status);
  setText(parts.contributors, entry.contributors.map(({ slot }) => `S${slot + 1}`).join(" · "));
  setText(parts.tooltipName, entry.name); setText(parts.tooltipCopy, entry.copy);
  setText(parts.tooltipContributors, contributorCopy ? `Contributors: ${contributorCopy}` : "Squad effect");
  setAttribute(chip, "aria-describedby", parts.tooltip.id);
  setAttribute(chip, "aria-label", `${entry.name}. ${entry.status}. ${entry.copy}${contributorCopy ? ` Contributors: ${contributorCopy}.` : ""}`);
  const progress = Number.isFinite(entry.progress) ? Math.max(0, Math.min(1, entry.progress)) : 1;
  parts.progress.style.setProperty("--synergy-progress", `${progress * 100}%`);
}

function validate(entries) {
  if (!Array.isArray(entries) || entries.length > 3) throw new TypeError("Active synergies must be a bounded array");
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || !/^[a-z][a-z0-9-]*$/.test(entry.id || "") || ids.has(entry.id)) throw new TypeError("Active synergy ids must be unique and safe");
    if (!Array.isArray(entry.contributors) || entry.contributors.length > 4) throw new TypeError(`Invalid contributors for ${entry.id}`);
    ids.add(entry.id);
  }
}

export function reconcileActiveSynergies(root, entries) {
  if (!root?.ownerDocument) throw new TypeError("Synergy root must be a DOM element");
  validate(entries);
  const existing = new Map([...root.children].filter((node) => node.dataset?.synergyId).map((node) => [node.dataset.synergyId, node]));
  const chips = [];
  entries.forEach((entry, index) => {
    const chip = existing.get(entry.id) || createChip(root, entry);
    updateChip(chip, entry); existing.delete(entry.id);
    const current = root.children[index] || null;
    if (current !== chip) root.insertBefore(chip, current);
    chips.push(chip);
  });
  for (const stale of existing.values()) stale.remove();
  root.hidden = chips.length === 0;
  return chips;
}
