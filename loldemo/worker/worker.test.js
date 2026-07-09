import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, safeProfile } from "./worker.js";

test("room codes are normalized and bounded", () => {
  assert.equal(normalizeCode(" ab-19z! "), "AB9Z");
  assert.equal(normalizeCode("ABCDEFG"), "ABCDEF");
});

test("profiles discard markup and constrain specialist ids", () => {
  assert.deepEqual(safeProfile({ name: "<b>Nova</b>", specialist: "nova", ready: 1 }), {
    name: "bNovab", specialist: "nova", ready: true,
  });
  assert.equal(safeProfile({ specialist: "../../bad" }).specialist, "zuri");
});
