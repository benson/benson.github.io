import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

export const VERSION = pkg.version;
export const DEFAULT_API_BASE = 'https://api.bensonperry.com';
export const CLI_CLIENT_ID = 'biblioplex-cli';
export const CLIENT_LABEL = 'biblioplex-cli';
export const READ_SCOPE = 'collection.read';
export const WRITE_SCOPE = 'collection.write';

// Process exit codes. 3 = auth so scripts can detect "needs `bp login`".
export const EXIT = { OK: 0, ERROR: 1, USAGE: 2, AUTH: 3, RATE_LIMIT: 4 };

export function configDir() {
  if (process.env.BIBLIOPLEX_CONFIG_DIR) return process.env.BIBLIOPLEX_CONFIG_DIR;
  if (process.platform === 'win32') return join(process.env.APPDATA || homedir(), 'biblioplex');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'biblioplex');
}

export function credentialsPath() { return join(configDir(), 'credentials.json'); }
export function configPath() { return join(configDir(), 'config.json'); }
