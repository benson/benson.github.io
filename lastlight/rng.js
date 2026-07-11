/**
 * Lastlight's versioned deterministic random source.
 *
 * Seed and snapshot state are serialized as four big-endian hexadecimal
 * uint32 words. Fork labels are encoded as UTF-8 before being mixed with the
 * complete current state. Keep these serialization rules stable: replay files
 * rely on them being identical in every JavaScript runtime.
 */

export const RNG_ALGORITHM = "xoshiro128ss-v1";

const UINT32_RANGE = 0x1_0000_0000;
const SEED_PATTERN = /^[0-9a-f]{32}$/;
const MAX_ZERO_SEED_ATTEMPTS = 4;

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function wordHex(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function stateToHex(state) {
  return Array.from(state, wordHex).join("");
}

function parseSeed(seed) {
  if (typeof seed !== "string" || !SEED_PATTERN.test(seed)) {
    throw new TypeError("RNG seed must be exactly 32 lowercase hexadecimal characters.");
  }

  const state = new Uint32Array(4);
  for (let index = 0; index < state.length; index += 1) {
    state[index] = Number.parseInt(seed.slice(index * 8, index * 8 + 8), 16) >>> 0;
  }
  if (state.every((word) => word === 0)) {
    throw new RangeError("RNG seed cannot contain an all-zero state.");
  }
  return state;
}

function secureRandomSource(source) {
  if (!source || typeof source.getRandomValues !== "function") {
    throw new Error("Secure randomness is unavailable; a Web Crypto getRandomValues source is required.");
  }
  return source;
}

/** Return a canonical, securely generated 128-bit seed. */
export function createRandomSeed(cryptoSource = globalThis.crypto) {
  const source = secureRandomSource(cryptoSource);
  const bytes = new Uint8Array(16);

  for (let attempt = 0; attempt < MAX_ZERO_SEED_ATTEMPTS; attempt += 1) {
    bytes.fill(0);
    source.getRandomValues(bytes);
    if (bytes.some((byte) => byte !== 0)) {
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  }

  throw new Error("Secure randomness repeatedly produced an invalid all-zero RNG seed.");
}

function utf8Bytes(label) {
  // TextEncoder is specified to replace unpaired UTF-16 surrogates with U+FFFD,
  // giving browser and Node the same byte sequence for every JavaScript string.
  if (typeof TextEncoder !== "function") {
    throw new Error("UTF-8 TextEncoder is required to derive deterministic RNG forks.");
  }
  return new TextEncoder().encode(label);
}

function mixByte(hash, byte) {
  return Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
}

function avalanche(value) {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b) >>> 0;
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35) >>> 0;
  result ^= result >>> 16;
  return result >>> 0;
}

function deriveForkState(state, label) {
  const labelBytes = utf8Bytes(label);
  const child = new Uint32Array(4);

  for (let lane = 0; lane < child.length; lane += 1) {
    let hash = (0x811c9dc5 ^ Math.imul(lane + 1, 0x9e3779b9)) >>> 0;

    // Mix the state in an explicitly defined little-endian byte order.
    for (const word of state) {
      hash = mixByte(hash, word & 0xff);
      hash = mixByte(hash, (word >>> 8) & 0xff);
      hash = mixByte(hash, (word >>> 16) & 0xff);
      hash = mixByte(hash, word >>> 24);
    }

    // Prefix the label with its uint32 little-endian byte length so derivation
    // remains unambiguous if this contract later gains more fields.
    const length = labelBytes.length >>> 0;
    hash = mixByte(hash, length & 0xff);
    hash = mixByte(hash, (length >>> 8) & 0xff);
    hash = mixByte(hash, (length >>> 16) & 0xff);
    hash = mixByte(hash, length >>> 24);
    for (const byte of labelBytes) hash = mixByte(hash, byte);

    child[lane] = avalanche(hash ^ state[(lane + 1) & 3]);
  }

  // This is extraordinarily unlikely, but xoshiro's all-zero state is invalid.
  if (child.every((word) => word === 0)) child[0] = 0x9e3779b9;
  return child;
}

function requireFiniteRange(min, max, method) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new TypeError(`${method} bounds must be finite numbers.`);
  }
  if (max < min) throw new RangeError(`${method} maximum must be greater than or equal to its minimum.`);
}

export class SeededRng {
  constructor(state, drawCount = 0) {
    if (!(state instanceof Uint32Array) || state.length !== 4 || state.every((word) => word === 0)) {
      throw new TypeError("SeededRng state must be a non-zero Uint32Array containing four words.");
    }
    if (!Number.isSafeInteger(drawCount) || drawCount < 0) {
      throw new TypeError("RNG drawCount must be a non-negative safe integer.");
    }
    this._state = new Uint32Array(state);
    this._drawCount = drawCount;
  }

  static fromHex(seed) {
    return new SeededRng(parseSeed(seed));
  }

  static fromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new TypeError("RNG snapshot must be an object.");
    }
    if (snapshot.algorithm !== RNG_ALGORITHM) {
      throw new RangeError(`Unsupported RNG algorithm: ${String(snapshot.algorithm)}.`);
    }
    return new SeededRng(parseSeed(snapshot.state), snapshot.drawCount);
  }

  /** Return the next unsigned 32-bit integer from xoshiro128**. */
  nextUint32() {
    const state = this._state;
    const result = Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
    const temporary = (state[1] << 9) >>> 0;

    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= temporary;
    state[3] = rotateLeft(state[3], 11);

    this._drawCount += 1;
    return result;
  }

  /** Return a number in the half-open interval [0, 1). */
  nextFloat() {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Return a number in [min, max), or [0, max) when passed one argument. */
  float(min = 0, max = 1) {
    if (arguments.length === 1) {
      max = min;
      min = 0;
    }
    requireFiniteRange(min, max, "RNG float");
    if (min === max) return min;
    return min + (max - min) * this.nextFloat();
  }

  /** Return an unbiased integer in [min, max), or [0, max) with one argument. */
  int(min, max) {
    if (arguments.length === 1) {
      max = min;
      min = 0;
    }
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new TypeError("RNG int bounds must be safe integers.");
    }
    if (max <= min) throw new RangeError("RNG int maximum must be greater than its minimum.");

    const range = max - min;
    if (range > UINT32_RANGE) {
      throw new RangeError("RNG int range cannot exceed 2^32 values.");
    }

    const limit = Math.floor(UINT32_RANGE / range) * range;
    let value;
    do value = this.nextUint32(); while (value >= limit);
    return min + (value % range);
  }

  pick(values) {
    if (!values || !Number.isSafeInteger(values.length) || values.length <= 0) {
      throw new RangeError("RNG pick requires a non-empty array-like value.");
    }
    return values[this.int(values.length)];
  }

  /**
   * Derive an independent stream from the current state without advancing it.
   * Reusing a label at the same parent state deliberately returns the same fork.
   */
  fork(label) {
    if (typeof label !== "string") throw new TypeError("RNG fork label must be a string.");
    return new SeededRng(deriveForkState(this._state, label));
  }

  snapshot() {
    return Object.freeze({
      algorithm: RNG_ALGORITHM,
      state: stateToHex(this._state),
      drawCount: this._drawCount,
    });
  }
}
