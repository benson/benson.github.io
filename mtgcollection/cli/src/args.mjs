// Tiny, dependency-free argv parser.
//   bp <command> [subcommand] [positionals...] [--flag value] [--flag=value] [--bool]
// A flag consumes the next token as its value unless the flag is a known boolean
// or the next token looks like another flag. `--` ends flag parsing.

const BOOLEAN_FLAGS = new Set([
  'json', 'yes', 'y', 'help', 'h', 'version', 'v',
  'csv', 'table', 'dry-run', 'no-browser', 'no-color', 'all', 'force', 'verbose',
  'desc', 'no-resolve', 'archive', 'write',
]);

const SHORT_ALIASES = { y: 'yes', h: 'help', v: 'version' };

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  let i = 0;
  let noMoreFlags = false;

  while (i < argv.length) {
    const tok = argv[i];
    if (noMoreFlags || tok === '-' || !tok.startsWith('-')) {
      positionals.push(tok);
      i += 1;
      continue;
    }
    if (tok === '--') { noMoreFlags = true; i += 1; continue; }

    let raw = tok.startsWith('--') ? tok.slice(2) : tok.slice(1);
    let value;
    const eq = raw.indexOf('=');
    if (eq !== -1) { value = raw.slice(eq + 1); raw = raw.slice(0, eq); }

    const name = SHORT_ALIASES[raw] || raw;

    if (value !== undefined) {
      flags[name] = value;
      i += 1;
      continue;
    }
    if (BOOLEAN_FLAGS.has(raw) || BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      i += 1;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || (next.startsWith('-') && next !== '-')) {
      flags[name] = true;
      i += 1;
    } else {
      flags[name] = next;
      i += 2;
    }
  }

  return { positionals, flags };
}

// Coerce a flag that may be a string or boolean into a trimmed string or null.
export function strFlag(flags, ...names) {
  for (const n of names) {
    const v = flags[n];
    if (typeof v === 'string') return v;
  }
  return null;
}

export function boolFlag(flags, ...names) {
  return names.some(n => flags[n] === true || flags[n] === 'true');
}

export function intFlag(flags, name, fallback = null) {
  const v = flags[name];
  if (v == null || v === true) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
