import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileActiveBuffs } from "../active-buffs.js";

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
    this.src = "";
    this.alt = "";
    this.type = "";
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

const buff = (field, remaining, overrides = {}) => ({
  field,
  name: field === "healthbackBuff" ? "Healthback" : "Rapid fire",
  icon: `/icons/${field}.webp`,
  max: 15,
  copy: field === "healthbackBuff" ? "Every takedown restores a little health." : "Massively increases weapon and ability haste.",
  remaining,
  ...overrides,
});

test("countdown updates preserve active-powerup trigger, tooltip, and keyboard focus identity", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  const [button] = reconcileActiveBuffs(root, [buff("healthbackBuff", 12.4)]);
  const tooltip = button.querySelector(".active-buff-tooltip");
  const time = button.querySelector(".active-buff-tooltip-time");
  const countdown = button.querySelector(".active-buff-countdown");
  button.focus();

  for (const remaining of [12.3, 12.2, 9.9, 9.8]) {
    const [updated] = reconcileActiveBuffs(root, [buff("healthbackBuff", remaining)]);
    assert.equal(updated, button);
    assert.equal(updated.querySelector(".active-buff-tooltip"), tooltip);
    assert.equal(document.activeElement, button);
  }
  assert.equal(time.textContent, "9.8 seconds remaining");
  assert.equal(countdown.textContent, "9.8");
  assert.equal(button.getAttribute("aria-describedby"), "active-buff-healthbackBuff");
  assert.equal(button.getAttribute("aria-label"), "Healthback, 9.8 seconds remaining. Every takedown restores a little health.");
  assert.equal(button.querySelector(".active-buff-progress").style.getPropertyValue("--buff-progress"), `${9.8 / 15 * 100}%`);
});

test("keyed reconciliation inserts and removes buffs without replacing surviving nodes", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  const [healthback] = reconcileActiveBuffs(root, [buff("healthbackBuff", 8)]);
  const [, rapid] = reconcileActiveBuffs(root, [buff("healthbackBuff", 7.9), buff("hasteBuff", 14.9)]);
  assert.equal(root.children[0], healthback);
  assert.equal(root.children[1], rapid);
  const [survivor] = reconcileActiveBuffs(root, [buff("hasteBuff", 14.8)]);
  assert.equal(survivor, rapid);
  assert.equal(root.children.length, 1);
  assert.equal(healthback.parentElement, null);
});

test("active-powerup reconciliation rejects ambiguous or unsafe keys", () => {
  const document = new FakeDocument(), root = document.createElement("div");
  assert.throws(() => reconcileActiveBuffs(root, [buff("healthbackBuff", 5), buff("healthbackBuff", 4)]), /Duplicate active buff field/);
  assert.throws(() => reconcileActiveBuffs(root, [buff("bad id", 5)]), /Invalid active buff field/);
  assert.throws(() => reconcileActiveBuffs(root, [buff("healthbackBuff", Number.NaN)]), /Invalid active buff timing/);
});

test("tooltip remains pointer-transparent and focus/reduced-motion paths do not replay movement", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.active-buff-tooltip \{[^}]+pointer-events: none;/s);
  assert.match(css, /\.active-buff:focus-visible \.active-buff-tooltip \{ transition: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]+\.active-buff-tooltip[^}]+transform: none; transition: none;/);
});
