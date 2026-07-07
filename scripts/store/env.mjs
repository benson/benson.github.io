import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "..", "..");

export function parseEnvText(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] = raw.trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export function loadLocalEnv({ override = false, files = [".env.local", ".env"] } = {}) {
  const loaded = {};
  for (const file of files) {
    const envPath = path.join(root, file);
    if (!fs.existsSync(envPath)) continue;
    const values = parseEnvText(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      loaded[key] = value;
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
  return loaded;
}

export function parseTomlScalars(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] = raw.trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

export function readStripeCliProfile(configPath = path.join(os.homedir(), ".config", "stripe", "config.toml")) {
  if (!fs.existsSync(configPath)) return {};
  const values = parseTomlScalars(fs.readFileSync(configPath, "utf8"));
  return {
    accountId: values.account_id || null,
    publishableKey: values.test_mode_pub_key || values.publishable_key || null,
    secretKey: values.test_mode_api_key || values.secret_key || values.api_key || null,
    claimUrl: values.sandbox_claim_url || null,
    expiresAt: values.sandbox_expires_at || values.test_mode_key_expires_at || null
  };
}

export function readEnvFile(file = ".env.local") {
  const envPath = path.join(root, file);
  if (!fs.existsSync(envPath)) return {};
  return parseEnvText(fs.readFileSync(envPath, "utf8"));
}

export function upsertEnvFile(values, file = ".env.local") {
  const envPath = path.join(root, file);
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const seen = new Set();
  const lines = existing.split(/\r?\n/).filter((line, index, all) => index < all.length - 1 || line !== "");
  const next = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || values[match[1]] === undefined) return line;
    seen.add(match[1]);
    return `${match[1]}=${quoteEnvValue(values[match[1]])}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || seen.has(key)) continue;
    next.push(`${key}=${quoteEnvValue(value)}`);
  }

  fs.writeFileSync(envPath, `${next.join("\n")}\n`);
}

function quoteEnvValue(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(text)) return text;
  return JSON.stringify(text);
}
