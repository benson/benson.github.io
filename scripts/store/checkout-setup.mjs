import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadLocalEnv, readStripeCliProfile, upsertEnvFile } from "./env.mjs";

const DEFAULT_WEBHOOK_URL = "https://benson-store-checkout-api.bensonperry.workers.dev/api/store/webhook/stripe";
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-03-25.dahlia";
const WRANGLER_CONFIG = "wrangler.store-checkout.jsonc";
const DEFAULT_STORE_PUBLIC_URL = "https://bensonperry.com";

const REQUIRED_WORKER_SECRETS = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PRINTFUL_API_KEY",
  "PRINTFUL_STORE_ID"
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
    paymentDomain: null,
    registerPaymentDomain: false,
    writeLocal: false,
    webhookUrl: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--create-webhook") args.createWebhook = true;
    else if (arg === "--deploy") args.deploy = true;
    else if (arg === "--force-webhook") args.forceWebhook = true;
    else if (arg === "--payment-domain") args.paymentDomain = argv[(index += 1)] || null;
    else if (arg.startsWith("--payment-domain=")) args.paymentDomain = arg.slice("--payment-domain=".length);
    else if (arg === "--register-payment-domain") args.registerPaymentDomain = true;
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

function readinessStatus(value) {
  if (value === "true") return "ok";
  if (value === "false") return "pending";
  return "missing";
}

export function normalizePaymentMethodDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    return parsed.hostname.toLowerCase();
  }

  const withoutProtocol = raw.replace(/^[a-z]+:\/\//i, "");
  return withoutProtocol.split("/")[0].split(":")[0].toLowerCase() || null;
}

export function paymentDomainFromPublicUrl(publicUrl = DEFAULT_STORE_PUBLIC_URL) {
  return normalizePaymentMethodDomain(publicUrl || DEFAULT_STORE_PUBLIC_URL);
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
      PRINTFUL_STORE_ID: process.env.PRINTFUL_STORE_ID || null,
      STRIPE_WALLET_DOMAIN_READY: process.env.STRIPE_WALLET_DOMAIN_READY || null,
      STRIPE_PAYMENT_METHODS_READY: process.env.STRIPE_PAYMENT_METHODS_READY || null,
      SHOP_PAY_CLIENT_ID: process.env.SHOP_PAY_CLIENT_ID || null,
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null,
      SHOPIFY_ADMIN_API_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || null
    },
    secretKind: process.env.STRIPE_SECRET_KEY ? envSecretKind : profileSecretKind
  };
}

async function stripeRequest(secretKey, pathname, { method = "GET", body = null, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${STRIPE_API}${pathname}`, {
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

async function createStripeWebhook({ secretKey, webhookUrl, force = false, fetchImpl = fetch }) {
  const existing = await stripeRequest(secretKey, `/webhook_endpoints?limit=100`, { fetchImpl });
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
    body: params,
    fetchImpl
  });

  return {
    status: "created",
    id: created.id,
    secret: created.secret || null
  };
}

export function paymentMethodDomainReadiness(domain) {
  const enabled = domain?.enabled === true;
  const applePay = enabled && domain?.apple_pay?.status === "active";
  const googlePay = enabled && domain?.google_pay?.status === "active";
  const link = enabled && domain?.link?.status === "active";

  return {
    enabled,
    applePay,
    googlePay,
    link,
    walletDomainReady: applePay,
    paymentMethodsReady: googlePay && link
  };
}

export async function ensureStripePaymentMethodDomain({
  secretKey,
  domainName,
  fetchImpl = fetch
}) {
  const normalized = normalizePaymentMethodDomain(domainName);
  if (!normalized) throw new Error("Payment method domain is required.");

  const query = new URLSearchParams({ domain_name: normalized, limit: "100" });
  const existing = await stripeRequest(secretKey, `/payment_method_domains?${query}`, { fetchImpl });
  const match = (existing.data || []).find((domain) => domain.domain_name === normalized);

  let status = "exists";
  let domain = match;

  if (!domain) {
    const params = new URLSearchParams();
    params.set("domain_name", normalized);
    params.set("enabled", "true");
    domain = await stripeRequest(secretKey, "/payment_method_domains", {
      method: "POST",
      body: params,
      fetchImpl
    });
    status = "created";
  }

  let readiness = paymentMethodDomainReadiness(domain);
  if (!readiness.walletDomainReady || !readiness.paymentMethodsReady) {
    domain = await stripeRequest(secretKey, `/payment_method_domains/${encodeURIComponent(domain.id)}/validate`, {
      method: "POST",
      fetchImpl
    });
    readiness = paymentMethodDomainReadiness(domain);
    status = status === "created" ? "created-and-validated" : "validated";
  }

  return {
    status,
    domainName: normalized,
    domain,
    readiness
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
  npm run store:checkout:setup -- --create-webhook --register-payment-domain --write-local
  npm run store:checkout:setup -- --deploy

Options:
  --create-webhook       Create a Stripe webhook endpoint when a usable Stripe secret key is available.
  --force-webhook        Create a new webhook endpoint even if the same URL already exists.
  --register-payment-domain
                         Register or validate the Stripe payment-method domain for embedded wallets.
  --payment-domain <host>
                         Override the Stripe payment-method domain. Defaults to STORE_PUBLIC_URL host.
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
  const paymentDomain =
    args.paymentDomain ||
    process.env.STORE_PAYMENT_METHOD_DOMAIN ||
    paymentDomainFromPublicUrl(process.env.STORE_PUBLIC_URL || DEFAULT_STORE_PUBLIC_URL);

  console.log("Store checkout setup");
  console.log("");
  for (const name of REQUIRED_WORKER_SECRETS) {
    const ok = secretPresent(values[name]);
    printStatus(name, ok ? "ok" : "missing");
  }

  for (const name of OPTIONAL_WORKER_SECRETS) {
    const isReadinessMarker = name === "STRIPE_WALLET_DOMAIN_READY" || name === "STRIPE_PAYMENT_METHODS_READY";
    printStatus(name, isReadinessMarker ? readinessStatus(values[name]) : secretPresent(values[name]) ? "ok" : "missing", "optional");
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

  if (args.registerPaymentDomain) {
    console.log("");
    if (!values.STRIPE_SECRET_KEY || !["standard", "restricted"].includes(stripeSecretKind(values.STRIPE_SECRET_KEY))) {
      printStatus("Stripe payment domain", "missing", "needs a usable STRIPE_SECRET_KEY");
    } else {
      const registration = await ensureStripePaymentMethodDomain({
        secretKey: values.STRIPE_SECRET_KEY,
        domainName: paymentDomain
      });

      values.STRIPE_WALLET_DOMAIN_READY = registration.readiness.walletDomainReady ? "true" : "false";
      values.STRIPE_PAYMENT_METHODS_READY = registration.readiness.paymentMethodsReady ? "true" : "false";

      printStatus("Stripe payment domain", registration.status, registration.domainName);
      printStatus("Apple Pay domain", registration.readiness.applePay ? "ok" : "warning", registration.domain?.apple_pay?.status || "unknown");
      printStatus("Google Pay domain", registration.readiness.googlePay ? "ok" : "warning", registration.domain?.google_pay?.status || "unknown");
      printStatus("Link domain", registration.readiness.link ? "ok" : "warning", registration.domain?.link?.status || "unknown");
    }
  }

  if (args.writeLocal) {
    const toWrite = {};
    for (const name of REQUIRED_WORKER_SECRETS) {
      if (values[name]) toWrite[name] = values[name];
    }
    for (const name of ["STRIPE_WALLET_DOMAIN_READY", "STRIPE_PAYMENT_METHODS_READY"]) {
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
