import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileActiveSynergies } from "../active-synergies.js";

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.className = "";
    this.textContent = "";
    this.id = "";
    this.type = "";
    this.hidden = false;
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, reference) {
    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node.parentElement = this;
    return node;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === "id") this.id = String(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    for (const child of this.children) {
      if (className && child.className.split(/\s+/).includes(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeDocument {
  constructor() { this.activeElement = null; }
  createElement(tagName) { return new FakeElement(tagName, this); }
}

const synergy = (id, overrides = {}) => ({
  id,
  glyph: id === "breach-window" ? "BR" : id === "ultimate-resonance" ? "UR" : "MS",
  name: id === "breach-window" ? "Breach Window" : id === "ultimate-resonance" ? "Ultimate Resonance" : "Moving Screen",
  status: "Ready",
  copy: "Coordinate with the squad to trigger this effect.",
  contributors: [{ slot: 0, name: "Echo" }, { slot: 1, name: "Zuri" }],
  progress: 0.5,
  ...overrides,
});

test("active synergy progress updates preserve chip, tooltip, and keyboard focus identity", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  const [chip] = reconcileActiveSynergies(root, [synergy("breach-window")]);
  const tooltip = chip.querySelector(".synergy-tooltip");
  chip.focus();

  const [updated] = reconcileActiveSynergies(root, [synergy("breach-window", { status: "1.2s remaining", progress: 0.4 })]);
  assert.equal(updated, chip);
  assert.equal(updated.querySelector(".synergy-tooltip"), tooltip);
  assert.equal(document.activeElement, chip);
  assert.equal(chip.type, "button");
  assert.equal(chip.getAttribute("aria-describedby"), "synergy-tooltip-breach-window");
  assert.equal(chip.getAttribute("aria-label"), "Breach Window. 1.2s remaining. Coordinate with the squad to trigger this effect. Contributors: Echo 1, Zuri 2.");
  assert.equal(chip.querySelector(".synergy-progress").style.getPropertyValue("--synergy-progress"), "40%");
  assert.equal(chip.querySelector(".synergy-tooltip").getAttribute("role"), "tooltip");
});

test("keyed reconciliation reorders and removes synergy chips without replacing survivors", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  const [breach, ultimate] = reconcileActiveSynergies(root, [synergy("breach-window"), synergy("ultimate-resonance")]);
  const [moved, survivor] = reconcileActiveSynergies(root, [synergy("moving-screen"), synergy("breach-window")]);
  assert.equal(survivor, breach);
  assert.equal(root.children[0], moved);
  assert.equal(root.children[1], breach);
  assert.equal(ultimate.parentElement, null);
  assert.equal(root.hidden, false);

  reconcileActiveSynergies(root, []);
  assert.equal(root.children.length, 0);
  assert.equal(root.hidden, true);
});

test("active synergy reconciliation rejects unsafe, duplicate, or unbounded input", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  assert.throws(() => reconcileActiveSynergies(root, [synergy("bad id")]), /unique and safe/);
  assert.throws(() => reconcileActiveSynergies(root, [synergy("moving-screen"), synergy("moving-screen")]), /unique and safe/);
  assert.throws(() => reconcileActiveSynergies(root, [synergy("moving-screen", { contributors: Array.from({ length: 5 }, (_, slot) => ({ slot })) })]), /Invalid contributors/);
  assert.throws(() => reconcileActiveSynergies(root, ["a", "b", "c", "d"].map((id) => synergy(id))), /bounded array/);
});

test("synergy tooltips remain pointer-transparent and reduced-motion safe", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.synergy-tooltip \{[^}]+pointer-events: none;/s);
  assert.match(css, /\.synergy-chip:focus-visible \.synergy-tooltip/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]+\.synergy-chip[^}]+transition: none;/);
});
