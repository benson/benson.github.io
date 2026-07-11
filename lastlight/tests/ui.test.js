import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("damage source telemetry updates a persistent interactive panel shell", () => {
  assert.match(html, /id="damage-ledger-handle"[^>]+tabindex="0"/);
  assert.match(html, /id="damage-ledger-collapse"[^>]+aria-expanded="true"/);
  assert.match(html, /id="damage-ledger-content"[^>]+aria-live="polite"/);
  assert.match(game, /lastlight:damage-ledger-layout:v1/);
  assert.match(game, /new ResizeObserver/);
  assert.match(game, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(game, /matchMedia\("\(max-width: 650px\)"\)/);
  assert.doesNotMatch(game, /\$\("damage-ledger"\)\.innerHTML/);
  assert.match(css, /\.damage-ledger \{[^}]+resize: both;/s);
  assert.match(css, /\.damage-ledger\.collapsed \{[^}]+resize: none;/s);
});

test("objective notices use longer dwell times and a short interruptible fade", () => {
  assert.match(game, /type === "danger" \? 4500 : 3800/);
  assert.match(game, /clearTimeout\(state\.bannerTimer\); clearTimeout\(state\.bannerExitTimer\)/);
  assert.match(css, /\.objective-banner \{[^}]+transition: opacity 220ms[^;]+, transform 220ms/s);
  assert.match(css, /\.objective-banner\.is-exiting \{[^}]+transition-duration: 180ms;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("desktop-only type overrides lift critical compact controls to nine pixels", () => {
  const desktop = css.match(/@media \(min-width: 981px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(desktop, /\.control-ribbon \{ font-size: 10px; \}/);
  for (const selector of [".control-ribbon kbd", ".damage-ledger-actions button", ".copy-scorecard", ".guide-tabs a", ".report-button", ".build-badge"]) {
    assert.match(desktop, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+\.damage-ledger \{[^}]+resize: none;/);
});

test("squad and boss HUD bars share the segmented health contract", () => {
  assert.match(game, /import \{ bossHealthSegments, playerHealthSegments \} from "\.\/health-bars\.js/);
  assert.match(game, /healthDividerMarkup\(bossHealthSegments\(boss\.maxHp\)\)/);
  assert.match(game, /healthDividerMarkup\(playerHealthSegments\(p\.maxHp\)\)/);
  assert.match(html, /id="boss-health-segments" class="health-dividers"/);
  assert.match(css, /\.health-divider\.major/);
  assert.match(css, /\.mini-shield-fill/);
});

test("specialist select exposes an accessible authored starting-weapon detail surface", () => {
  assert.match(html, /id="starting-weapon-trigger"[^>]+aria-controls="starting-weapon-tooltip"[^>]+aria-describedby="starting-weapon-tooltip"/);
  assert.match(html, /id="starting-weapon-tooltip"[^>]+role="tooltip"/);
  assert.match(html, /id="detail-weapon-behavior"/);
  assert.match(html, /id="detail-weapon-stats"/);
  assert.match(game, /const SIGNATURE_BEHAVIORS = \{/);
  assert.match(game, /weaponTelemetry\("signature", \{ level: 1, evolved: false \}, player\)/);
  assert.match(game, /Evolves into \$\{spec\.signature\.evolve\}/);
  assert.match(game, /setStartingWeaponDetailsOpen/);
  assert.match(game, /event\.key !== "Escape"/);
  assert.match(css, /\.starting-weapon-detail:not\(\.is-suppressed\):focus-within \.starting-weapon-tooltip/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]+\.starting-weapon-detail:hover \.starting-weapon-tooltip/);
  assert.doesNotMatch(html.match(/<button id="starting-weapon-trigger"[^>]+>/)?.[0] || "", /title=/);
});

test("upgrade draft typography is readable on desktop while mobile stays compact", () => {
  const desktop = css.match(/@media \(min-width: 981px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  for (const rule of [
    /\.upgrade-card p \{ font-size: 14px/,
    /\.upgrade-card \.card-stats dt \{ font-size: 9px/,
    /\.upgrade-current-stats span \{ font-size: 9px/,
    /\.teammate-choice > b \{ font-size: 12px/,
    /\.teammate-choice-tooltip > p \{ font-size: 12px/,
    /\.upgrade-reference span \{ font-size: 11px/,
  ]) assert.match(desktop, rule);
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+\.upgrade-panel h2 \{ font-size: 40px; \}/);
  assert.match(css, /\.teammate-choice:focus-visible \.teammate-choice-tooltip \{[^}]+transition: none;/s);
});

test("upgrade intelligence uses authoritative combat metadata", () => {
  assert.match(game, /from "\.\/combat-metadata\.js/);
  assert.match(game, /formatProjectileDisplay\(getCombatMetadata\("signature", player\.specialist\), projectiles\)/);
  assert.match(game, /getPassiveAffectedSources\(passiveId/);
  assert.match(game, /class="affected-loadout/);
  assert.match(game, /getCurrentStatExplanation\(id, raw\)/);
  assert.match(game, /class="upgrade-stat" tabindex="0" aria-describedby=/);
  assert.match(css, /\.upgrade-stat-tooltip/);
});

test("relay identity is sent after WebSocket upgrade instead of in the request URL", () => {
  assert.match(game, /new URL\(`\$\{RELAY_BASE\}\$\{encodeURIComponent\(code\)\}`\)/);
  assert.doesNotMatch(game, /url\.searchParams\.set\("(?:name|specialist|resume)"/);
  assert.match(game, /addEventListener\("open", \(\) => send\(\{ type: "hello", profile:/);
});

test("hosts capture anonymous deterministic replays and expose an explicit post-run copy action", () => {
  assert.match(html, /id="copy-replay"[^>]*>Copy deterministic replay</);
  assert.match(game, /new ReplayRecorder\(/);
  assert.match(game, /createRandomSeed\(\)/);
  assert.match(game, /recordReplayCheckpoint\(\)/);
  assert.match(game, /navigator\.clipboard\.writeText\(JSON\.stringify\(state\.resultReplay\)\)/);
  assert.doesNotMatch(game, /submitRunTelemetry\([^)]*replay/i);
});
