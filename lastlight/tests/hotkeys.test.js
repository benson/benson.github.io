import test from "node:test";
import assert from "node:assert/strict";
import { isReportShortcut, shouldOpenReportShortcut } from "../hotkeys.js";

test("the report shortcut accepts physical and printable backquote keys", () => {
  assert.equal(isReportShortcut({ code: "Backquote", key: "Dead" }), true);
  assert.equal(isReportShortcut({ code: "Backquote", key: "`" }), true);
  assert.equal(isReportShortcut({ code: "Backquote", key: "~" }), true);
  assert.equal(isReportShortcut({ code: "KeyR", key: "r" }), false);
});

test("the report shortcut is suppressed while typing, repeating, or another dialog is open", () => {
  const event = { code: "Backquote", key: "`", repeat: false };
  assert.equal(shouldOpenReportShortcut(event, { isTyping: false, dialogOpen: false }), true);
  assert.equal(shouldOpenReportShortcut({ ...event, repeat: true }, { isTyping: false, dialogOpen: false }), false);
  assert.equal(shouldOpenReportShortcut(event, { isTyping: true, dialogOpen: false }), false);
  assert.equal(shouldOpenReportShortcut(event, { isTyping: false, dialogOpen: true }), false);
});
