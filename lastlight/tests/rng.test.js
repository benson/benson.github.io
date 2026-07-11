import test from "node:test";
import assert from "node:assert/strict";
import { createRandomSeed, RNG_ALGORITHM, SeededRng } from "../rng.js";

const GOLDEN_SEED = "0123456789abcdeffedcba9876543210";

test("xoshiro128** output and state match the v1 golden vector", () => {
  const rng = SeededRng.fromHex(GOLDEN_SEED);
  const output = Array.from({ length: 10 }, () => rng.nextUint32());

  assert.deepEqual(output, [
    2576975000, 1717987679, 3437557858, 3328806623, 2502269976,
    3596207863, 3762620995, 3723441234, 1795750380, 2056387974,
  ]);
  assert.deepEqual(rng.snapshot(), {
    algorithm: RNG_ALGORITHM,
    state: "bc34fe4f601f3ab43aca2f5d3ba323df",
    drawCount: 10,
  });
});

test("secure seed creation emits canonical 128-bit lowercase hex", () => {
  let calls = 0;
  const source = {
    getRandomValues(bytes) {
      calls += 1;
      bytes.forEach((_, index) => { bytes[index] = index + 1; });
      return bytes;
    },
  };
  assert.equal(createRandomSeed(source), "0102030405060708090a0b0c0d0e0f10");
  assert.equal(calls, 1);
});

test("seed creation rejects missing or invalid secure randomness", () => {
  assert.throws(() => createRandomSeed(null), /Secure randomness is unavailable/);
  assert.throws(() => createRandomSeed({}), /getRandomValues/);
  assert.throws(
    () => createRandomSeed({ getRandomValues: (bytes) => bytes.fill(0) }),
    /all-zero RNG seed/,
  );
});

test("seed validation is strict and rejects xoshiro's zero state", () => {
  for (const seed of [
    "", "abc", "0123456789ABCDEFFEDCBA9876543210", "g123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef00", null,
  ]) {
    assert.throws(() => SeededRng.fromHex(seed), /32 lowercase hexadecimal/);
  }
  assert.throws(() => SeededRng.fromHex("00000000000000000000000000000000"), /all-zero/);
});

test("snapshots serialize, restore, and continue an exact stream", () => {
  const original = SeededRng.fromHex(GOLDEN_SEED);
  Array.from({ length: 17 }, () => original.nextUint32());
  const serialized = JSON.parse(JSON.stringify(original.snapshot()));
  const restored = SeededRng.fromSnapshot(serialized);

  assert.equal(Object.isFrozen(original.snapshot()), true);
  assert.deepEqual(restored.snapshot(), original.snapshot());
  assert.deepEqual(
    Array.from({ length: 64 }, () => restored.nextUint32()),
    Array.from({ length: 64 }, () => original.nextUint32()),
  );
});

test("snapshot validation prevents silent algorithm or audit-count drift", () => {
  assert.throws(() => SeededRng.fromSnapshot(null), /must be an object/);
  assert.throws(
    () => SeededRng.fromSnapshot({ algorithm: "other-v1", state: GOLDEN_SEED, drawCount: 0 }),
    /Unsupported RNG algorithm/,
  );
  assert.throws(
    () => SeededRng.fromSnapshot({ algorithm: RNG_ALGORITHM, state: GOLDEN_SEED, drawCount: -1 }),
    /drawCount/,
  );
});

test("floating-point helpers use half-open ranges and stable draw counts", () => {
  const expected = SeededRng.fromHex(GOLDEN_SEED);
  const unit = expected.nextUint32() / 0x1_0000_0000;
  const ranged = expected.nextUint32() / 0x1_0000_0000;

  const actual = SeededRng.fromHex(GOLDEN_SEED);
  assert.equal(actual.nextFloat(), unit);
  assert.equal(actual.float(-3, 5), -3 + 8 * ranged);
  assert.equal(actual.float(0), 0);
  assert.equal(actual.float(4, 4), 4);
  assert.equal(actual.snapshot().drawCount, 2);
  assert.throws(() => actual.float(Number.NaN, 1), /finite/);
  assert.throws(() => actual.float(2, 1), /maximum/);
});

test("integer helpers and pick are deterministic, half-open, and validated", () => {
  const rng = SeededRng.fromHex(GOLDEN_SEED);
  assert.deepEqual(
    Array.from({ length: 12 }, () => rng.int(-2, 4)),
    [0, 3, 2, 3, -2, -1, -1, -2, -2, -2, 2, 3],
  );
  assert.equal(rng.int(1), 0);
  assert.equal(rng.pick(["north", "east", "south", "west"]), "west");
  assert.throws(() => rng.int(2, 2), /greater than/);
  assert.throws(() => rng.int(0.5, 2), /safe integers/);
  assert.throws(() => rng.int(0, 0x1_0000_0001), /2\^32/);
  assert.throws(() => rng.pick([]), /non-empty/);
});

test("integer sampling rejects modulo-biased values", () => {
  const rng = SeededRng.fromHex(GOLDEN_SEED);
  const values = [0xffff_ffff, 0xffff_fffe, 7];
  rng.nextUint32 = () => values.shift();
  assert.equal(rng.int(0, 10), 7);
  assert.equal(values.length, 0);
});

test("UTF-8 forks have stable golden vectors and do not advance the parent", () => {
  const parent = SeededRng.fromHex(GOLDEN_SEED);
  parent.nextUint32();
  const before = parent.snapshot();

  const ascii = parent.fork("enemy:wave-3");
  const unicode = parent.fork("boss:\u706b\ud83d\udd25");
  assert.deepEqual(parent.snapshot(), before);
  assert.deepEqual(ascii.snapshot(), {
    algorithm: RNG_ALGORITHM,
    state: "5ca2389cb06da800e36437751defa3de",
    drawCount: 0,
  });
  assert.deepEqual(unicode.snapshot(), {
    algorithm: RNG_ALGORITHM,
    state: "3b1b68284dc14887122c342e1d2709da",
    drawCount: 0,
  });
  assert.deepEqual(parent.fork("enemy:wave-3").snapshot(), ascii.snapshot());
  assert.notDeepEqual(parent.fork("enemy:wave-4").snapshot(), ascii.snapshot());
});

test("fork and public API argument validation fail loudly", () => {
  const rng = SeededRng.fromHex(GOLDEN_SEED);
  assert.throws(() => rng.fork(12), /must be a string/);
  assert.throws(() => new SeededRng(new Uint32Array(4)), /non-zero/);
});
