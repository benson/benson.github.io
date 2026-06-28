import { parseArgs, boolFlag, strFlag } from './args.mjs';
import { createOutput } from './output.mjs';
import { CliError } from './errors.mjs';
import { EXIT, VERSION, DEFAULT_API_BASE } from './constants.mjs';
import { loadCredentials, saveCredentials, loadConfig } from './store.mjs';
import { Session } from './api.mjs';
import { commands, commandOrder } from './commands/index.mjs';

function resolveApiBase(flags) {
  const base = strFlag(flags, 'api') || process.env.BIBLIOPLEX_API_BASE || loadConfig().apiBase || DEFAULT_API_BASE;
  return base.replace(/\/+$/, '');
}

function printHelp(out) {
  out.line('biblioplex — manage your magic: the gathering collection from the terminal');
  out.line('');
  out.line('usage: bp <command> [options]');
  out.line('');
  out.line('commands:');
  for (const name of commandOrder) {
    out.line('  ' + name.padEnd(12) + commands[name].summary);
  }
  out.line('');
  out.line('global options:');
  out.line('  --json        machine-readable output ({ok,data}|{ok,error})');
  out.line('  --no-color    disable colored output');
  out.line('  --api <url>   override the API base url');
  out.line('  --help        show help (also: bp <command> --help)');
  out.line('  --version     print the version');
  out.line('');
  out.line('start with: bp login');
}

export async function run(argv) {
  const { positionals, flags } = parseArgs(argv);
  const out = createOutput({ json: boolFlag(flags, 'json'), color: !boolFlag(flags, 'no-color') });
  const command = positionals[0];

  if (!command) {
    if (boolFlag(flags, 'version')) { out.line(VERSION); return EXIT.OK; }
    printHelp(out);
    return EXIT.OK;
  }
  if (command === 'help') { printHelp(out); return EXIT.OK; }
  if (boolFlag(flags, 'version')) { out.line(VERSION); return EXIT.OK; }

  const cmd = commands[command];
  if (!cmd) {
    out.error(new CliError(`unknown command: ${command} (try \`bp help\`)`, EXIT.USAGE));
    return EXIT.USAGE;
  }
  if (boolFlag(flags, 'help')) {
    out.line(cmd.help || cmd.summary);
    return EXIT.OK;
  }

  const ctx = {
    out,
    flags,
    args: positionals.slice(1),
    apiBase: resolveApiBase(flags),
    makeSession() {
      const creds = loadCredentials();
      if (!creds?.accessToken) throw new CliError('not logged in — run `bp login`', EXIT.AUTH);
      return new Session({ base: this.apiBase, credentials: creds, persist: saveCredentials });
    },
  };

  try {
    return (await cmd.run(ctx)) ?? EXIT.OK;
  } catch (err) {
    out.error(err);
    if (boolFlag(flags, 'verbose') && err?.stack && !(err instanceof CliError)) out.info(err.stack);
    return err instanceof CliError ? err.code : EXIT.ERROR;
  }
}
