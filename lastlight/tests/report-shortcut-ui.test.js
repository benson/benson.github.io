import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Shift+Enter submits the report form without consuming ordinary textarea Enter", () => {
  assert.match(html, /id="report-submit"[^>]+aria-keyshortcuts="Shift\+Enter"[^>]+title="Send report \(Shift\+Enter\)"/);
  assert.match(game, /\$\("report-form"\)\.addEventListener\("keydown", handleReportSubmitShortcut\)/);
  const handler = game.match(/function handleReportSubmitShortcut\(event\) \{[\s\S]+?\n\}/)?.[0] || "";
  assert.match(handler, /event\.key !== "Enter" \|\| !event\.shiftKey \|\| event\.isComposing\) return;/);
  assert.match(handler, /event\.preventDefault\(\)/);
  assert.match(handler, /event\.currentTarget\.requestSubmit\(\$\("report-submit"\)\)/);
  assert.ok(handler.indexOf("return;") < handler.indexOf("preventDefault"), "plain Enter and composition must return before newline prevention");
});
