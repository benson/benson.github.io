// Output layer. Two contracts at once:
//  - humans get aligned tables / lines on stdout, colour only on a TTY
//  - agents/scripts get a stable JSON envelope on stdout with --json
// Diagnostics (spinners, "logged in as…") always go to stderr so --json stdout
// stays a single clean JSON document.

const COLORS = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

export function createOutput({ json = false, color = true } = {}) {
  const useColor = color && !!process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code, s) => (useColor ? code + s + COLORS.reset : String(s));

  return {
    json,
    useColor,
    c: {
      dim: s => paint(COLORS.dim, s),
      bold: s => paint(COLORS.bold, s),
      red: s => paint(COLORS.red, s),
      green: s => paint(COLORS.green, s),
      yellow: s => paint(COLORS.yellow, s),
      cyan: s => paint(COLORS.cyan, s),
    },

    // Primary success payload. JSON mode prints one envelope; otherwise calls
    // humanFn to render whatever shape fits (table, lines, etc.).
    emit(data, humanFn) {
      if (json) {
        process.stdout.write(JSON.stringify({ ok: true, data }, null, 2) + '\n');
      } else if (humanFn) {
        humanFn();
      }
    },

    // A plain stdout line (human mode). No-op under --json.
    line(str = '') {
      if (!json) process.stdout.write(str + '\n');
    },

    // Diagnostics: always stderr, never part of the JSON document.
    info(str) {
      process.stderr.write(str + '\n');
    },

    // Render rows as an aligned table to stdout (human mode only).
    table(columns, rows) {
      if (json || !rows.length) return;
      const widths = columns.map((col, i) =>
        Math.max(col.header.length, ...rows.map(r => String(r[i] ?? '').length)));
      const fmt = cells => cells
        .map((cell, i) => {
          const s = String(cell ?? '');
          return columns[i].align === 'right' ? s.padStart(widths[i]) : s.padEnd(widths[i]);
        })
        .join('  ')
        .replace(/\s+$/, '');
      process.stdout.write(this.c.dim(fmt(columns.map(c => c.header))) + '\n');
      for (const row of rows) process.stdout.write(fmt(row) + '\n');
    },

    // Raw text to stdout (e.g. CSV / deck export). Printed in both modes since
    // it IS the requested artifact.
    raw(str) {
      process.stdout.write(str.endsWith('\n') ? str : str + '\n');
    },

    error(err) {
      const message = err?.message || String(err);
      if (json) {
        process.stdout.write(JSON.stringify({ ok: false, error: { message, ...(err?.extra || {}) } }, null, 2) + '\n');
      } else {
        process.stderr.write(this.c.red('error: ') + message + '\n');
      }
    },
  };
}
