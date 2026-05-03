const KW_FOIL = /\bfoil\b/g;
const KW_PRERELEASE = /\b(prerelease|pre-release|pre release|date\s*stamp(ed)?)\b/g;
const KW_PROMO = /\b(promo|stamp|stamped)\b/g;
const KW_CONDITIONS = [
  ['damaged',           /\b(damaged|dmg|poor)\b/g],
  ['heavily_played',    /\b(heavily\s*played|heavy\s*play(ed)?|hp)\b/g],
  ['moderately_played', /\b(moderately\s*played|moderate\s*play(ed)?|mp)\b/g],
  ['lightly_played',    /\b(lightly\s*played|light\s*play(ed)?|lp|excellent)\b/g],
  ['near_mint',         /\b(near\s*mint|nm|mint|n\.m\.)\b/g],
];

const QTY_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const QTY_WORD_RE = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s+of)?\s+/;
const QTY_DIGIT_PREFIX_RE = /^\s*(\d{1,3})\s+(?=[a-z])/;
const QTY_SUFFIX_RE = /\s+x\s*(\d{1,3})\b/;
const LOCATION_RE = /\b(?:in|to)\s+(.+?)\s*$/;

export function parseVoiceText(text, validSetsArg) {
  const sets = validSetsArg instanceof Set ? validSetsArg : new Set(validSetsArg || []);
  let clean = String(text || '').toLowerCase()
    .replace(/\b(um|uh|uhh|okay|ok)\b/g, '')
    .replace(/number\s*/g, '')
    .replace(/hashtag\s*/g, '')
    .replace(/pound\s*/g, '')
    .replace(/hash\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { kind: 'empty' };

  const againMatch = clean.match(/^again(?:\s+(.+))?$/);
  if (againMatch) {
    let qty = null;
    const tail = (againMatch[1] || '').trim();
    if (tail) {
      const tm = tail.match(/^(\d{1,3})(?:\s*(?:times?|x))?$/) ||
                 tail.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*times?)?$/);
      if (tm) {
        const v = QTY_WORDS[tm[1]] ?? parseInt(tm[1], 10);
        if (v > 0) qty = v;
      }
    }
    return { kind: 'again', qty };
  }

  let location = null;
  const locMatch = clean.match(LOCATION_RE);
  if (locMatch) {
    location = locMatch[1].trim().toLowerCase();
    clean = clean.slice(0, locMatch.index).trim();
  }

  let qty = null;
  const suffixMatch = clean.match(QTY_SUFFIX_RE);
  if (suffixMatch) {
    qty = parseInt(suffixMatch[1], 10);
    clean = (clean.slice(0, suffixMatch.index) + clean.slice(suffixMatch.index + suffixMatch[0].length)).trim();
  } else {
    const wordMatch = clean.match(QTY_WORD_RE);
    if (wordMatch) {
      qty = QTY_WORDS[wordMatch[1]];
      clean = clean.slice(wordMatch[0].length).trim();
    } else {
      const digitMatch = clean.match(QTY_DIGIT_PREFIX_RE);
      if (digitMatch) {
        qty = parseInt(digitMatch[1], 10);
        clean = clean.slice(digitMatch[0].length).trim();
      }
    }
  }
  if (qty != null && (!Number.isFinite(qty) || qty < 1)) qty = null;

  const hasFoil = KW_FOIL.test(clean); KW_FOIL.lastIndex = 0;
  let variant = 'regular';
  if (KW_PRERELEASE.test(clean)) variant = 'prerelease';
  else if (KW_PROMO.test(clean)) variant = 'promo';
  KW_PRERELEASE.lastIndex = 0; KW_PROMO.lastIndex = 0;
  let condition = null;
  for (const [value, re] of KW_CONDITIONS) {
    re.lastIndex = 0;
    if (re.test(clean)) { condition = value; break; }
    re.lastIndex = 0;
  }
  let stripped = clean
    .replace(KW_FOIL, ' ')
    .replace(KW_PRERELEASE, ' ')
    .replace(KW_PROMO, ' ');
  for (const [, re] of KW_CONDITIONS) stripped = stripped.replace(re, ' ');
  stripped = stripped.replace(/\s+/g, ' ').trim();

  const parsed = smartParseSetCnWith(stripped, sets);
  if (!parsed) return { kind: 'unparsed' };
  return {
    kind: 'card',
    set: parsed.set,
    cn: parsed.cn,
    variant,
    foil: hasFoil,
    condition,
    qty,
    location,
  };
}

function smartParseSetCnWith(text, sets) {
  const alnum = text.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!alnum) return null;
  if (sets && sets.size > 0) {
    for (let k = 5; k >= 2; k--) {
      const candidate = alnum.slice(0, k);
      const rest = alnum.slice(k);
      if (sets.has(candidate) && /^\d+[a-z]?$/.test(rest)) {
        return { set: candidate, cn: rest };
      }
    }
    const m = alnum.match(/^([a-z]+)(\d)0(\d+)$/);
    if (m && m[3].length >= 1) {
      const setCode = m[1] + m[2] + m[3][0];
      const cn = m[3].slice(1);
      if (sets.has(setCode) && cn.length > 0) return { set: setCode, cn };
    }
  }
  const m = text.match(/^\s*([a-z0-9]{2,5})\s+(\d{1,4}[a-z]?)\b/i);
  if (m) return { set: m[1].toLowerCase(), cn: m[2] };
  return null;
}
