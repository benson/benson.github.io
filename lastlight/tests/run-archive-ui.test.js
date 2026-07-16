import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("result and archive surfaces expose anonymous-default squad sharing and explicit named disclosure", () => {
  for (const id of ["copy-squad-report", "copy-squad-report-named", "run-history-dialog", "run-history-list"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Run history/);
  assert.match(game, /copySquadReportLink\(state\.resultReport\)/);
  assert.match(game, /copySquadReportLink\(state\.resultReport, \{ includeCallsigns: true \}\)/);
  assert.match(game, /url\.search = ""; url\.hash = squadRunShareFragment/);
  assert.match(game, /Copy anonymous link/); assert.match(game, /Include callsigns/);
});

test("shared report imports are feature-gated, saveable, and preserve local archive controls", () => {
  assert.match(game, /decodeSquadRunFragment\(location\.hash\)/);
  assert.match(game, /data-archive-save/);
  assert.match(game, /upsertRunArchive\(state\.runHistory, report\)/);
  assert.match(game, /flags\.sharedSquadRunArchive/);
  assert.match(game, /documentElement\.dataset\.sharedRunArchive/);
});

test("expanded archive is responsive and keeps every archive-specific type size at ten pixels or larger", () => {
  for (const selector of [".archive-players", ".archive-player", ".archive-loadout", ".archive-contribution", ".archive-sources"]) assert.match(styles, new RegExp(selector.replaceAll(".", "\\.")));
  assert.match(styles, /\.archive-players \{ display: grid; grid-template-columns: repeat\(2/);
  assert.match(styles, /@media \(max-width: 650px\)[\s\S]*\.archive-players \{ grid-template-columns: minmax\(0,1fr\)/);
  const archiveRules = styles.split(/\n/).filter((line) => /run-history|archive-/.test(line)).join("\n");
  const undersized = [...archiveRules.matchAll(/font(?:-size)?:[^;]*?\b([0-9])px\b/g)].map((match) => match[0]);
  assert.deepEqual(undersized, []);
});
