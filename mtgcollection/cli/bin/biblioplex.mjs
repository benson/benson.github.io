#!/usr/bin/env node
import { run } from '../src/cli.mjs';

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write('fatal: ' + (err?.stack || err?.message || String(err)) + '\n');
    process.exit(1);
  });
