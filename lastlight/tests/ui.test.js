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

test("multiplayer input uses sequenced host application and snapshot acknowledgements", () => {
  assert.match(game, /from "\.\/protocol\.js/);
  assert.match(game, /guestInputSequences\.create\(input, now\)/);
  assert.match(game, /hostInputSequences\.apply\(message\?\._from, message\)/);
  assert.match(game, /createSnapshotMessage\(state\.sim\.snapshot\(\), hostInputSequences\.acknowledgements\(\)\)/);
  assert.match(game, /guestInputSequences\.acknowledge\(snapshotMessage\.ack\[state\.clientId\], now\)/);
  assert.match(game, /multiplayerInput: inputProtocolDiagnostics\(\)/);
  assert.match(game, /hostInputSequences\.remove\(message\.id\)/);
  assert.match(game, /function closeSocket\(\)[^\n]+resetInputProtocol\(\)/);
});

test("hosts capture anonymous deterministic replays and expose an explicit post-run copy action", () => {
  assert.match(html, /id="copy-replay"[^>]*>Copy deterministic replay</);
  assert.match(game, /new ReplayRecorder\(/);
  assert.match(game, /createRandomSeed\(\)/);
  assert.match(game, /recordReplayCheckpoint\(\)/);
  assert.match(game, /navigator\.clipboard\.writeText\(JSON\.stringify\(state\.resultReplay\)\)/);
  assert.doesNotMatch(game, /submitRunTelemetry\([^)]*replay/i);
});

test("deployment applies the bounded runtime config to simulation, replay, telemetry, and diagnostics", () => {
  assert.match(game, /loadRuntimeConfig\(\{ endpoint: RUNTIME_CONFIG_ENDPOINT \}\)/);
  assert.match(game, /await runtimeConfigReady/);
  assert.match(game, /gameplayFeatureContract\(state\.runtimeConfig\.config\)/);
  assert.match(game, /featureConfigVersion: state\.runtimeConfig\.config\.configVersion/);
  assert.match(game, /state\.runtimeConfig\.config\.flags\.deterministicReplay/);
  assert.match(game, /state\.runtimeConfig\.config\.flags\.runTelemetry/);
  assert.match(game, /runtimeConfig: \{/);
});

test("display and accessibility settings are persistent and reachable while waiting or paused", () => {
  for (const id of ["quality-button", "lobby-quality", "pause-quality", "quality-dialog"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const value of ["auto", "high", "reduced", "minimal"]) assert.match(html, new RegExp(`<option value="${value}"`));
  for (const id of ["quality-effects", "quality-shake", "quality-hit-flashes", "quality-flash", "quality-health-bars", "quality-reduced-motion"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(game, /from "\.\/quality-settings\.js/);
  assert.match(game, /saveQualitySettings\(/);
  assert.match(game, /document\.querySelector\("dialog\[open\]"\)/);
  assert.match(css, /\.quality-shortcut:active \{ transform: scale\(\.98\); \}/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{ \.quality-shortcut:hover/);
  assert.doesNotMatch(css.match(/\.quality-shortcut \{[^}]+\}/s)?.[0] || "", /transition:\s*all/);
});

test("compatible local run recovery is explicit, privacy-safe, and resumes paused", () => {
  for (const id of ["recovery-offer", "recovery-title", "recovery-copy", "recovery-resume", "recovery-discard"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(game, /Simulation\.fromRecoveryState\(checkpoint\.simulation\)/);
  assert.match(game, /ReplayRecorder\.fromDraft\(checkpoint\.replay, sim\.players\)/);
  assert.match(game, /sim\.paused = true; sim\.pauseReason = "manual"/);
  assert.match(game, /persistRecoveryCheckpoint\(true\)/);
  assert.match(game, /discardRecovery\(\{ notify: false \}\)/);
  assert.match(css, /\.recovery-offer/);
});

test("developer network simulation wraps transport boundaries and remains production-default-off", () => {
  assert.match(game, /resolveNetworkLabActivation\(\{ url: location\.href \}\)/);
  assert.match(game, /state\.networkLab\.upstream\(payload, deliver\)/);
  assert.match(game, /state\.networkLab\.downstream\(event\.data/);
  assert.match(game, /state\.networkLab\?\.teardown\(\)/);
  assert.match(game, /const \{ seed, \.\.\.diagnostics \} = state\.networkLab\.diagnostics\(\)/);
});
