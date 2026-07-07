import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadLocalEnv, readStripeCliProfile, upsertEnvFile } from "./env.mjs";

const DEFAULT_WEBHOOK_URL = "https://benson-store-checkout-api.bensonperry.workers.dev/api/store/webhook/stripe";
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-03-25.dahlia";
const WRANGLER_CONFIG = "wrangler.store-checkout.jsonc";

const REQUIRED_WORKER_SECRETS = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PRINTFUL_API_KEY"
];

const OPTIONAL_WORKER_SECRETS = [
  "STRIPE_WALLET_DOMAIN_READY",
  "STRIPE_PAYMENT_METHODS_READY",
  "SHOP_PAY_CLIENT_ID",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "SHOPIFY_ADMIN_API_ACCESS_TOKEN"
];

export function parseArgs(argv) {
  const args = {
    createWebhook: false,
    deploy: false,
    forceWebhook: false,
    writeLocal: false,
    webhookUrl: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--create-webhook") args.createWebhook = true;
    else if (arg === "--deploy") args.deploy = true;
    else if (arg === "--force-webhook") args.forceWebhook = true;
    else if (arg === "--write-local") args.writeLocal = true;
    else if (arg === "--webhook-url") args.webhookUrl = argv[(index += 1)] || null;
    else if (arg.startsWith("--webhook-url=")) args.webhookUrl = arg.slice("--webhook-url=".length);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

export function stripeSecretKind(secret) {
  const value = String(secret || "");
  if (!value) return "missing";
  if (value.startsWith("rkcs_")) return "claimable-sandbox";
  if (/^sk_(test|live)_/.test(value)) return "standard";
  if (/^rk_(test|live)_/.test(value)) return "restricted";
  return "unknown";
}

function printStatus(label, status, detail = "") {
  console.log(`${status.padEnd(8)} ${label}${detail ? ` - ${detail}` : ""}`);
}

function secretPresent(value) {
  return Boolean(value);
}

function resolvedConfig() {
  loadLocalEnv();
  const stripeProfile = readStripeCliProfile();
  const profileSecretKind = stripeSecretKind(stripeProfile.secretKey);
  const envSecretKind = stripeSecretKind(process.env.STRIPE_SECRET_KEY);
  const profileSecretUsable = profileSecretKind !== "claimable-sandbox" && profileSecretKind !== "missing";

  return {
    stripeProfile,
    profileSecretKind,
    values: {
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || stripeProfile.publishableKey || null,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || (profileSecretUsable ? stripeProfile.secretKey : null),
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
      PRINTFUL_API_KEY: process.env.PRINTFUL_API_KEY || null,
      STRIPE_WALLET_DOMAIN_READY: process.env.STRIPE_WALLET_DOMAIN_READY || null,
      STRIPE_PAYMENT_METHODS_READY: process.env.STRIPE_PAYMENT_METHODS_READY || null,
      SHOP_PAY_CLIENT_ID: process.env.SHOP_PAY_CLIENT_ID || null,
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null,
      SHOPIFY_ADMIN_API_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || null
    },
    secretKind: process.env.STRIPE_SECRET_KEY ? envSecretKind : profileSecretKind
  };
}

async function stripeRequest(secretKey, pathname, { method = "GET", body = null } = {}) {
  const response = await fetch(`${STRIPE_API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "Stripe request failed.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function createStripeWebhook({ secretKey, webhookUrl, force = false }) {
  const encodedUrl = encodeURIComponent(webhookUrl);
  const existing = await stripeRequest(secretKey, `/webhook_endpoints?limit=100`);
  const match = (existing.data || []).find((endpoint) => endpoint.url === webhookUrl && endpoint.status !== "disabled");
  if (match && !force) {
    return {
      status: "exists",
      id: match.id,
      secret: null
    };
  }

  const params = new URLSearchParams();
  params.set("url", webhookUrl);
  params.set("description", "Benson Perry store embedded checkout fulfillment");
  params.set("enabled_events[0]", "checkout.session.completed");
  params.set("metadata[source]", "benson-store-checkout");

  const created = await stripeRequest(secretKey, "/webhook_endpoints", {
    method: "POST",
    body: params
  });

  return {
    status: "created",
    id: created.id,
    secret: created.secret || null
  };
}

async function deployWorkerSecret(name, value) {
  const redactions = [value].filter(Boolean);
  const child = spawn("npx", ["--yes", "wrangler@latest", "secret", "put", name, "--config", WRANGLER_CONFIG], {
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.stdin.end(`${value}\n`);

  const code = await new Promise((resolve) => {
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error(redact(`wrangler secret put ${name} failed:\n${output}`, redactions));
  }
}

function redact(text, values) {
  let redacted = String(text || "");
  for (const value of values) {
    redacted = redacted.split(value).join("[redacted]");
  }
  return redacted;
}

function usage() {
  console.log(`Store checkout setup

Checks local checkout credentials by default. Side effects only happen with flags.

Usage:
  npm run store:checkout:setup
  npm run store:checkout:setup -- --create-webhook --write-local
  npm run store:checkout:setup -- --deploy

Options:
  --create-webhook       Create a Stripe webhook endpoint when a usable Stripe secret key is available.
  --force-webhook        Create a new webhook endpoint even if the same URL already exists.
  --write-local          Write resolved/generated secrets to ignored .env.local.
  --deploy               Deploy required Worker secrets through wrangler.
  --webhook-url <url>    Override the Stripe webhook URL. Defaults to the workers.dev checkout API.
`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const config = resolvedConfig();
  const values = { ...config.values };
  const webhookUrl = args.webhookUrl || process.env.STORE_STRIPE_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

  console.log("Store checkout setup");
  console.log("");
  for (const name of REQUIRED_WORKER_SECRETS) {
    const ok = secretPresent(values[name]);
    printStatus(name, ok ? "ok" : "missing");
  }

  for (const name of OPTIONAL_WORKER_SECRETS) {
    printStatus(name, secretPresent(values[name]) ? "ok" : "missing", "optional");
  }

  if (config.profileSecretKind === "claimable-sandbox") {
    printStatus("Stripe sandbox", "blocked", "claimable sandbox key found; claim it and run stripe login for a full test key");
    if (config.stripeProfile.claimUrl) console.log(`claim URL: ${config.stripeProfile.claimUrl}`);
  } else if (config.secretKind === "unknown") {
    printStatus("STRIPE_SECRET_KEY", "warning", "key shape is not recognized; setup will not deploy it automatically");
  }

  if (args.createWebhook) {
    console.log("");
    if (!values.STRIPE_SECRET_KEY || !["standard", "restricted"].includes(stripeSecretKind(values.STRIPE_SECRET_KEY))) {
      printStatus("Stripe webhook", "missing", "needs a usable STRIPE_SECRET_KEY");
    } else if (values.STRIPE_WEBHOOK_SECRET && !args.forceWebhook) {
      printStatus("Stripe webhook", "ok", "STRIPE_WEBHOOK_SECRET already configured");
    } else {
      const webhook = await createStripeWebhook({
        secretKey: values.STRIPE_SECRET_KEY,
        webhookUrl,
        force: args.forceWebhook
      });
      if (webhook.secret) {
        values.STRIPE_WEBHOOK_SECRET = webhook.secret;
        printStatus("Stripe webhook", "created", webhook.id);
      } else {
        printStatus("Stripe webhook", "exists", `${webhook.id}; Stripe only returns signing secret when an endpoint is created`);
      }
    }
  }

  if (args.writeLocal) {
    const toWrite = {};
    for (const name of REQUIRED_WORKER_SECRETS) {
      if (values[name]) toWrite[name] = values[name];
    }
    if (Object.keys(toWrite).length) {
      upsertEnvFile(toWrite);
      printStatus(".env.local", "updated", `${Object.keys(toWrite).length} value(s)`);
    } else {
      printStatus(".env.local", "skipped", "no resolved required secrets to write");
    }
  }

  if (args.deploy) {
    console.log("");
    const deployMissing = REQUIRED_WORKER_SECRETS.filter((name) => !values[name]);
    if (deployMissing.length) {
      throw new Error(`Cannot deploy Worker secrets. Missing: ${deployMissing.join(", ")}`);
    }
    if (!["standard", "restricted"].includes(stripeSecretKind(values.STRIPE_SECRET_KEY))) {
      throw new Error("Cannot deploy STRIPE_SECRET_KEY because it is not a usable Stripe API key.");
    }

    for (const name of [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]) {
      if (!values[name]) continue;
      await deployWorkerSecret(name, values[name]);
      printStatus(name, "deployed");
    }
  }

  console.log("");
  const finalMissing = REQUIRED_WORKER_SECRETS.filter((name) => !values[name]);
  if (finalMissing.length) {
    console.log(`Missing required setup: ${finalMissing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Required checkout secrets are available locally.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
