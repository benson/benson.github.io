import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("guide exposes the six adaptive impact materials and their accessibility fallbacks", () => {
  assert.match(html, /href="#guide-materials"/);
  assert.match(game, /id="guide-materials"/);
  assert.match(game, /MATERIAL_CLASSES\.map/);
  assert.match(game, /material\.fallback\.label/);
  assert.match(game, /renderer\.drainMaterialAudioCues/);
});

test("guide derives universal evolution behavior from the authoritative contract", () => {
  assert.match(game, /getWeaponEvolution\(weapon\.id\)/);
  assert.match(game, /evolution\?\.capabilities\?\.map/);
  assert.match(game, /Evolution: evolutionBehavior/);
});

test("performance reports expose cosmetic environmental load without protocol fields", () => {
  assert.match(game, /environmentInteractions: renderer\.environmentDiagnostics\(\)/);
  assert.doesNotMatch(game, /send\([^\n]+environmentInteractions/);
});

test("damage source telemetry updates a persistent interactive panel shell", () => {
  assert.match(html, /id="damage-ledger-handle"[^>]+tabindex="0"/);
  assert.match(html, /id="damage-ledger-collapse"[^>]+aria-expanded="true"/);
  assert.match(html, /id="damage-ledger-content"[^>]+aria-live="polite"/);
  assert.match(game, /lastlight:damage-ledger-layout:v1/);
  assert.match(game, /new ResizeObserver/);
  assert.match(game, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(game, /matchMedia\("\(max-width: 650px\)"\)/);
  assert.match(game, /fitDamageLedgerToContents\(\)/);
  assert.match(game, /userSized/);
  assert.doesNotMatch(game, /damageBySource[^\n]+slice\(0, 3\)/);
  assert.doesNotMatch(game, /\$\("damage-ledger"\)\.innerHTML/);
  assert.match(css, /\.damage-ledger \{[^}]+resize: both;/s);
  assert.match(css, /\.damage-ledger\.collapsed \{[^}]+resize: none;/s);
});

test("active powerups expose detailed pointer and keyboard inspection", () => {
  const activeBuffs = readFileSync(new URL("../active-buffs.js", import.meta.url), "utf8");
  assert.match(activeBuffs, /createElement\(document, "button", "active-buff"\)/);
  assert.match(activeBuffs, /createElement\(document, "span", "active-buff-tooltip"\)/);
  assert.match(activeBuffs, /aria-describedby/);
  assert.match(activeBuffs, /seconds remaining/);
  assert.match(game, /reconcileActiveBuffs\(\$\("active-buffs-hud"\), active\)/);
  assert.doesNotMatch(game, /\$\("active-buffs-hud"\)\.innerHTML/);
  assert.match(css, /\.active-buff:hover \.active-buff-tooltip, \.active-buff:focus-visible \.active-buff-tooltip/);
});

test("runtime sound uses the bounded dynamic hierarchy without gameplay RNG", () => {
  assert.match(game, /import \{ DynamicAudioMixer \} from "\.\/audio-mix\.js/);
  assert.match(game, /state\.audioMixer\.requestCue\(name, \{ \.\.\.details, duration:/);
  assert.match(game, /audioMixer\?\.setDensity\(state\.qualitySettings\.effectsDensity\)/);
  assert.match(game, /audioMix: state\.audioMixer\?\.diagnostics\(\) \|\| null/);
  assert.match(game, /resolveAudioCue\(name, details\)/);
  assert.match(game, /voice\.volume \* cue\.variation\.gain/);
  assert.match(game, /cue\.destination/);
  assert.match(game, /cue\.pan/);
  assert.match(game, /if \(localHost\) Object\.defineProperty\(window, "__lastlightQA"/);
});

test("objective notices use longer dwell times and a short interruptible fade", () => {
  assert.match(game, /type === "danger" \? 4500 : 3800/);
  assert.match(game, /clearTimeout\(state\.bannerTimer\); clearTimeout\(state\.bannerExitTimer\)/);
  assert.match(css, /\.objective-banner \{[^}]+transition: opacity 220ms[^;]+, transform 220ms/s);
  assert.match(css, /\.objective-banner\.is-exiting \{[^}]+transition-duration: 180ms;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("desktop-only type overrides preserve compact controls while result actions stay readable", () => {
  const desktop = css.match(/@media \(min-width: 981px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(desktop, /\.control-ribbon \{ font-size: 10px; \}/);
  for (const selector of [".control-ribbon kbd", ".damage-ledger-actions button", ".guide-tabs a", ".report-button", ".build-badge"]) {
    assert.match(desktop, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /\.copy-scorecard \{[^}]+font: 700 12px\/1 var\(--sans\)/s);
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+\.damage-ledger \{[^}]+resize: none;/);
});

test("squad and boss HUD bars share the segmented health contract", () => {
  assert.match(game, /import \{ bossHealthSegments, playerHealthSegments \} from "\.\/health-bars\.js/);
  assert.match(game, /healthDividerMarkup\(bossHealthSegments\(boss\.maxHp, apexContract\?\.phases/);
  assert.match(game, /healthDividerMarkup\(playerHealthSegments\(p\.maxHp\)\)/);
  assert.match(html, /id="boss-health-segments" class="health-dividers"/);
  assert.match(css, /\.health-divider\.major/);
  assert.match(css, /\.mini-shield-fill/);
  assert.match(html, /id="boss-hud"[^>]+role="progressbar"[^>]+aria-valuetext=/);
  assert.match(game, /aria-valuetext[\s\S]+apexActionId/);
  assert.match(html, /href="#guide-apex">Apexes/);
});

test("specialist select exposes an accessible authored starting-weapon detail surface", () => {
  assert.match(html, /id="starting-weapon-trigger"[^>]+aria-controls="starting-weapon-tooltip"[^>]+aria-describedby="starting-weapon-tooltip"/);
  assert.match(html, /id="starting-weapon-tooltip"[^>]+role="tooltip"/);
  assert.match(html, /id="detail-weapon-behavior"/);
  assert.match(html, /id="detail-weapon-stats"/);
  assert.match(game, /const SIGNATURE_BEHAVIORS = \{/);
  assert.match(game, /weaponTelemetry\("signature", \{ level: 1, evolved: false \}, player\)/);
  assert.match(game, /signatureEvolutionTelemetry\(spec\.id, player\)/);
  assert.match(game, /Radius: telemetry\.radius/);
  assert.match(game, /Reach: telemetry\.reach/);
  assert.match(game, /Pierce: telemetry\.pierce/);
  assert.match(game, /Lifetime: telemetry\.lifetime/);
  assert.match(game, /Secondary: telemetry\.secondary/);
  assert.match(game, /data-cadence-kind/);
  assert.match(game, /\$\{Math\.round\(100 - remaining\)\} Flow/);
  assert.match(game, /hasteState: \[player\.hotTime > 0, player\.hasteBuff > 0, player\.frenzy > 0\]/);
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

test("post-run results stay contained on phone-width viewports", () => {
  assert.match(css, /\.result-card \{[^}]+min-width: 0;/s);
  assert.match(html, /<header class="result-header" aria-labelledby="result-title">/);
  assert.match(css, /\.result-header \{[^}]+grid-template-columns: minmax\(0, 1\.15fr\) minmax\(300px, \.85fr\);/s);
  assert.match(css, /\.scoreboard-wrap \{[^}]+max-width: 100%;[^}]+overflow-x: auto;/s);
  const mobile = css.match(/@media \(max-width: 650px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(mobile, /\.result-screen \{ place-items: start center; padding: 12px; \}/);
  assert.match(mobile, /\.result-damage-breakdown \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(mobile, /\.result-damage-breakdown article > div \{ grid-template-columns: minmax\(72px, \.8fr\) minmax\(42px, 1fr\) minmax\(76px, auto\);/);
});

test("upgrade intelligence uses authoritative combat metadata", () => {
  assert.match(game, /from "\.\/combat-metadata\.js/);
  assert.match(game, /from "\.\/upgrade-preview\.js/);
  assert.match(game, /buildUpgradeComparison\(choice, player\)/);
  assert.match(game, /upgradeComparisonMarkup\(details\)/);
  assert.match(game, /aria-hidden="true">→<\/i>/);
  assert.match(game, /getPassiveAffectedSources\(passiveId/);
  assert.match(game, /class="affected-loadout/);
  assert.match(game, /getCurrentStatExplanation\(id, raw\)/);
  assert.match(game, /class="upgrade-stat" tabindex="0" aria-describedby=/);
  assert.match(css, /\.upgrade-stat-tooltip/);
});

test("the report hotkey is global but yields to typing and open dialogs", () => {
  assert.match(game, /from "\.\/hotkeys\.js/);
  assert.match(game, /if \(isReportShortcut\(event\)\)/);
  assert.match(game, /shouldOpenReportShortcut\(event, \{ isTyping, dialogOpen \}\)/);
  assert.match(game, /if \(isTyping \|\| dialogOpen \|\| state\.screen !== "game"\) return/);
  assert.doesNotMatch(game, /state\.screen !== "game"\) return;\s*const key[\s\S]{0,500}reportKey/);
  assert.match(game, /state\.screen === "game" && state\.authorityState === "active" && state\.isHost && state\.sim && !state\.sim\.paused/);
  assert.match(game, /state\.resumeAfterReport && state\.screen === "game" && state\.isHost && state\.sim\?\.paused && state\.sim\.pauseReason === "manual"/);
});

test("relay identity is sent after WebSocket upgrade instead of in the request URL", () => {
  assert.match(game, /new URL\(`\$\{RELAY_BASE\}\$\{encodeURIComponent\(code\)\}`\)/);
  assert.doesNotMatch(game, /url\.searchParams\.set\("(?:name|specialist|resume)"/);
  assert.match(game, /addEventListener\("open", \(\) => send\(\{[\s\S]{0,160}type: "hello", profile:[\s\S]{0,160}migrationCapabilities: migrationCapabilities\(\)/);
});

test("multiplayer input uses sequenced host application and snapshot acknowledgements", () => {
  assert.match(game, /from "\.\/protocol\.js/);
  assert.match(game, /guestInputSequences\.create\(input, now\)/);
  assert.match(game, /hostInputSequences\.apply\(message\?\._from, message\)/);
  assert.match(game, /createSnapshotMessage\(state\.sim\.snapshot\(\), hostInputSequences\.acknowledgements\(\), \{ epoch: state\.authorityEpoch, snapshotSeq: state\.authoritySnapshotSeq\+\+ \}\)/);
  assert.match(game, /guestInputSequences\.acknowledge\(snapshotMessage\.ack\[state\.clientId\], now\)/);
  assert.match(game, /multiplayerInput: inputProtocolDiagnostics\(\)/);
  assert.match(game, /hostInputSequences\.remove\(message\.id\)/);
  assert.match(game, /function closeSocket\([^)]*\) \{[\s\S]{0,700}resetInputProtocol\(\)/);
});

test("hosts capture anonymous deterministic replays and expose a verified post-run viewer", () => {
  assert.match(html, /id="watch-replay"[^>]*>Watch verified replay</);
  assert.doesNotMatch(html, /id="copy-replay"/);
  assert.match(game, /new ReplayRecorder\(/);
  assert.match(game, /createRandomSeed\(\)/);
  assert.match(game, /recordReplayCheckpoint\(\)/);
  assert.match(html, /id="replay-copy"[^>]*>Copy replay JSON</);
  assert.match(game, /navigator\.clipboard\.writeText\(JSON\.stringify\(state\.resultReplay\)\)/);
  assert.doesNotMatch(game, /submitRunTelemetry\([^)]*replay/i);
  assert.match(game, /captureClientError\("replay finalize", error\)/);
  assert.match(game, /function showResult\(game\)[\s\S]+finalizeReplayCapture\(\)[\s\S]+setScreen\("result"\)/);
});

test("result screen exposes an accessible verified replay viewer with complete transport controls", () => {
  for (const id of ["watch-replay", "replay-dialog", "replay-canvas", "replay-play", "replay-back", "replay-forward", "replay-timeline", "replay-speed", "replay-copy", "replay-stats", "replay-loadouts", "replay-inspect"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /aria-label="Interactive replay battlefield/);
  assert.match(game, /new VerifiedReplayTimeline\(state\.resultReplay, createGameReplayAdapters\(\)/);
  assert.match(game, /viewer\.timeline\.advance\(dt, viewer\.speed\)/);
  assert.match(game, /queueReplaySeek\(event\.currentTarget\.value\)/);
  assert.match(game, /replayRenderer\.inspectAt\(event\.clientX, event\.clientY/);
  assert.match(game, /event\.code === "Space"/);
  assert.match(css, /\.replay-dialog/); assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css.match(/\.replay-controls button[^}]+\}/s)?.[0] || "", /transition:\s*all/);
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

test("reconnect identity is tab-scoped so a second tab cannot steal the first tab's seat", () => {
  assert.match(game, /sessionStorage\.getItem\(CLIENT_TOKEN_KEY\)/);
  assert.match(game, /sessionStorage\.setItem\(CLIENT_TOKEN_KEY, token\)/);
  assert.doesNotMatch(game, /localStorage\.(?:getItem|setItem)\(CLIENT_TOKEN_KEY/);
});

test("authority loss freezes controls, cancels stale results, and retries the same room", () => {
  assert.match(game, /import \{ RECONNECT_DELAYS_MS, SquadPresenceTracker, authorityStateCopy \}/);
  assert.match(game, /connectRoom\(state\.room, \{ reconnecting: true \}\)/);
  assert.match(game, /rememberRoomInUrl\(code\)/);
  assert.match(game, /url\.searchParams\.delete\("room"\)/);
  assert.match(game, /if \(next !== "active"\) clearGameplayControls\(\)/);
  assert.match(game, /state\.authorityState !== "active"/);
  assert.match(game, /clearTimeout\(state\.resultTimer\); state\.resultTimer = null; state\.endShown = false/);
  assert.match(game, /message\.migrated && \["game", "result"\]\.includes\(state\.screen\)/);
});

test("going offline closes an apparently live relay before waiting without consuming attempts", () => {
  assert.match(game, /window\.addEventListener\("offline", \(\) => \{[\s\S]+?clearTimeout\(state\.reconnectTimer\); state\.reconnectTimer = null;[\s\S]+?closeSocket\(\{ preserveReconnect: true \}\);[\s\S]+?setAuthorityState\("reconnecting", \{ attempt: state\.reconnectAttempts, phase: "offline" \}\);/);
  assert.match(game, /if \(navigator\.onLine === false\) \{ setAuthorityState\("reconnecting", \{ attempt: state\.reconnectAttempts, phase: "offline" \}\); return; \}/);
});

test("a reconnect welcome without a live authority fails closed instead of synchronizing forever", () => {
  assert.match(game, /connectRoom\(state\.room, \{ reconnecting: true \}\)\.then\(\(welcome\) => \{[\s\S]+?if \(!welcome\.hostId && welcome\.role !== "host"\) \{[\s\S]+?setAuthorityState\("unavailable", \{ reason: "no-compatible-successor" \}\);/);
});

test("localhost QA can inspect authority and deliberately exercise relay loss", () => {
  assert.match(game, /authorityState:\s*\(\)\s*=>\s*\(\{/);
  assert.match(game, /disconnectRelay:\s*\(\)\s*=>\s*\{/);
  assert.match(game, /state\.ws\.close\(4101,\s*"QA authority loss"\)/);
  assert.match(game, /protectPlayers:\s*\(\)\s*=>\s*\{/);
  assert.match(game, /if \(localHost\) Object\.defineProperty\(window, "__lastlightQA"/);
});

test("a rejoined client adopts the current authority epoch but stays frozen until authoritative sync", () => {
  assert.match(game, /guestInputSequences\.setEpoch\(state\.authorityEpoch\)/);
  assert.match(game, /authoritySnapshotGate\.commit\(\{ epoch: state\.authorityEpoch, hostId: state\.authorityHostId \}\)/);
  assert.match(game, /if \(recoveringAuthority\) setAuthorityState\("synchronizing"\)/);
  assert.match(game, /if \(recoveringAuthority\) \{ finishAuthorityRestoration\(\); toast\("Operation restored · run state synchronized"\); \}/);
  assert.match(game, /if \(state\.authorityState === "synchronizing"\) finishAuthorityRestoration\(\)/);
  assert.doesNotMatch(game, /state\.authorityState === "reconnecting"\) setAuthorityState\("active"\)/);
});

test("feedback diagnostics strip room, relay, token, and network-lab query parameters", () => {
  assert.match(game, /function reportLocation\(\) \{ return `\$\{location\.origin\}\$\{location\.pathname\}`; \}/);
  assert.equal((game.match(/url: reportLocation\(\)/g) || []).length, 2);
  assert.match(game, /route: \{ viewMode: state\.screen, path: location\.pathname, search: ""/);
  assert.doesNotMatch(game.slice(game.indexOf("function diagnosticText"), game.indexOf("function captureClientError")), /location\.(?:href|search)/);
});

test("result-screen recovery also waits for an authoritative ended-run sync", () => {
  assert.doesNotMatch(game, /state\.screen === "result" \? finishAuthorityRestoration\(\) : setAuthorityState\("synchronizing"\)/);
  assert.match(game, /if \(recoveringAuthority\) setAuthorityState\("synchronizing"\)/);
  assert.match(game, /const recoveringResult = recoveringAuthority && state\.screen === "result";[\s\S]+?if \(!recoveringResult\) startRemoteGame\(message\);[\s\S]+?if \(recoveringResult\) state\.resultGame = message\.state;/);
  assert.match(game, /else if \(state\.sim && state\.screen === "result"\) \{\s*sendRunSync\(message\._from\);/);
});

test("enemy identity guide stays named and reachable on mobile", () => {
  assert.match(html, /id="guide-dialog"[^>]+aria-labelledby="guide-title"/);
  assert.match(html, /<h2 id="guide-title">UPGRADES & RARE FINDS<\/h2>/);
  assert.match(game, /Hasted elite/);
  assert.match(game, /Shielded elite/);
  assert.match(game, /Volatile elite/);
  assert.match(css, /\.topbar-actions #guide-button \{ display: inline-flex;/);
  assert.match(css, /#lobby-guide \{ display: inline-flex;/);
});

test("mobile reuses the visible E and R slots instead of rendering duplicate cast buttons", () => {
  assert.doesNotMatch(html, /id="touch-[er]"/);
  assert.match(html, /id="move-stick"/);
  assert.doesNotMatch(css, /#touch-e|#touch-r|\.touch-controls button/);
  assert.match(game, /\[\["e-slot", "e"\], \["r-slot", "r"\]\]/);
  assert.match(game, /matchMedia\("\(pointer: coarse\)"\)\.matches/);
  assert.match(game, /node\.setAttribute\("role", "button"\)/);
  assert.match(game, /node\.setAttribute\("aria-keyshortcuts", slot\.toUpperCase\(\)\)/);
  assert.match(game, /!\["Enter", " "\]\.includes\(event\.key\)/);
  assert.match(game, /node\.setAttribute\("aria-disabled", String\(!unlocked \|\| cooldown > \.04\)\)/);
  assert.equal((game.match(/node\.getAttribute\("aria-disabled"\) === "true"/g) || []).length, 2);
});

test("draft intelligence remains visible for local and teammate locked choices", () => {
  assert.match(game, /draftForecastIdentity\(game\)/);
  assert.match(game, /forecastDraftChoice\(choice, player, \{ gold: game\.gold, gameLevel: game\.level \}\)/);
  assert.match(game, /buildcraftTagsMarkup\(buildcraft, 2\)/);
  assert.match(game, /forecastConsequencesMarkup\(forecast\)/);
  assert.match(game, /ready \? `aria-disabled="true"`/);
  assert.doesNotMatch(game, /ready \? "disabled"/);
  assert.match(css, /\.buildcraft-tags/);
  assert.match(css, /\.forecast-consequences/);
});

test("draft controls and replacement decisions stay in-place, accessible, and touch-sized", () => {
  for (const id of ["draft-controls", "draft-reroll", "draft-banish", "draft-skip", "draft-status", "replacement-tray", "replacement-options", "replacement-cancel"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(game, /createDraftActionMessage\(\{ \.\.\.message, action: message\.type \}, state\.authorityEpoch\)/);
  assert.match(game, /sanitizeDraftActionMessage\(message, \{ transport: true \}\)/);
  assert.match(game, /performDraftAction\(\{ type: "reroll" \}\)/);
  assert.match(game, /performDraftAction\(\{ type: "skip" \}\)/);
  assert.match(game, /replacementRequired\(choice, player\)/);
  assert.match(game, /forecastDraftChoice\(choice, player, \{ gold: game\.gold, gameLevel: game\.level, replacementId: target\.id \}\)/);
  assert.match(game, /state\.draftForecastKeys\.get\(player\.id\)/);
  assert.match(css, /\.draft-controls button \{[^}]*min-height: 42px/s);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*\.draft-controls button \{ min-height: 44px;/);
  assert.match(css, /\.replacement-option \{[^}]*min-height: 54px/s);
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
