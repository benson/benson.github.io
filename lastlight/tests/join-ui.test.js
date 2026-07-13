import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("active-run reinforcement selection is explicit, accessible, and package bounded", () => {
  assert.match(html, /id="reinforcement-panel"[^>]+aria-labelledby="reinforcement-title"/);
  for (const id of ["signature", "assault", "survival"]) assert.match(html, new RegExp(`data-join-package="${id}"`));
  assert.match(game, /roomProtocolVersion: 2,[\s\S]+migrationCapabilities: migrationCapabilities\(\)/);
  assert.match(game, /type: "join_request", protocolVersion: 2, specialist: state\.selected, packageId: state\.joinPackageId/);
  assert.match(css, /\.reinforcement-packages button\[aria-checked="true"\]/);
});

test("live admission uses the relay slot and deterministic package before committing", () => {
  assert.match(game, /message\.type === "run_admission" && state\.isHost/);
  assert.match(game, /state\.sim\.deployLateJoin\(info, \{ packageId: message\.packageId \}\)/);
  assert.match(game, /packageId: deployment\.packageId, catchUpRanks: deployment\.catchUpRanks/);
  assert.match(game, /type: "join_committed", protocolVersion: 2, admissionId: message\.admissionId, replaySlot: message\.replaySlot/);
  assert.match(game, /publishMigrationCheckpoint\(true\);[\s\S]+sendRunSync\(message\._from\)/);
  const profileBranch = game.slice(game.indexOf('message.type === "profile" && state.isHost'), game.indexOf('message.type === "lobby_state"'));
  assert.doesNotMatch(profileBranch, /addPlayer|deployLateJoin|registerPlayer/);
});

test("late reinforcement campaign clears require bounded pre-apex participation", () => {
  assert.match(game, /campaignJoinEligibility\(\{ activeCombatTicks: Number\(localPlayer\.preApexDeployedTicks/);
  assert.match(game, /Campaign clear not awarded/);
});

test("feedback screenshots attach by paste without a file-picker surface", () => {
  assert.doesNotMatch(html, /id="report-image"|type="file"/);
  assert.match(html, /<strong>Paste a screenshot<\/strong> anywhere while this form is open/);
  assert.match(game, /addEventListener\("paste", pasteReportImage\)/);
  assert.match(game, /clipboardData\?\.files/);
  assert.match(game, /state\.reportImageDataUrl/);
});
