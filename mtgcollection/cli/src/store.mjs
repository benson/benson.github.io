// Local persistence for credentials and config. The refresh token is a 30-day
// bearer secret, so the file is 0600 inside a 0700 directory on POSIX. (Windows
// relies on per-user ACLs; chmod is skipped there.)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { credentialsPath, configPath, configDir } from './constants.mjs';

const undoPath = () => join(configDir(), 'undo.json');

const POSIX = process.platform !== 'win32';

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function ensureDir() {
  mkdirSync(configDir(), { recursive: true });
  if (POSIX) { try { chmodSync(configDir(), 0o700); } catch {} }
}

export function loadCredentials() {
  return readJson(credentialsPath());
}

export function saveCredentials(creds) {
  ensureDir();
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
  if (POSIX) { try { chmodSync(path, 0o600); } catch {} }
}

export function clearCredentials() {
  if (existsSync(credentialsPath())) rmSync(credentialsPath());
}

export function loadConfig() {
  return readJson(configPath()) || {};
}

export function saveConfig(config) {
  ensureDir();
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function saveUndo(record) {
  ensureDir();
  writeFileSync(undoPath(), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
}

export function loadUndo() { return readJson(undoPath()); }

export function clearUndo() { if (existsSync(undoPath())) rmSync(undoPath()); }
