import { pathToFileURL } from "node:url";
import { checkoutConfig, loadCatalog, resolveCart } from "./checkout.mjs";
import { loadLocalEnv, readStripeCliProfile } from "./env.mjs";
import { fetchPrintfulCatalogProduct, localProductReadinessIssues, printfulCatalogIssues } from "./product-readiness.mjs";
import { runCheckoutSmoke } from "./checkout-smoke.mjs";
import { stripeSecretKind } from "./checkout-setup.mjs";

const DEFAULT_API_BASE = "https://benson-store-checkout-api.bensonperry.workers.dev";
const DEFAULT_PUBLIC_URL = "https://bensonperry.com";

export function parseArgs(argv) {
  const args = {
    apiBase: DEFAULT_API_BASE,
    help: false,
    live: false,
    network: false,
    productId: null,
    publicUrl: DEFAULT_PUBLIC_URL,
    sameOrigin: false,
    smoke: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--api-base") args.apiBase = argv[(index += 1)] || "";
    else if (arg.startsWith("--api-base=")) args.apiBase = arg.slice("--api-base=".length);
    else if (arg === "--live") args.live = true;
    else if (arg === "--network") args.network = true;
    else if (arg === "--product") args.productId = argv[(index += 1)] || "";
    else if (arg.startsWith("--product=")) args.productId = arg.slice("--product=".length);
    else if (arg === "--public-url") args.publicUrl = argv[(index += 1)] || "";
    else if (arg.startsWith("--public-url=")) args.publicUrl = arg.slice("--public-url=".length);
    else if (arg === "--same-origin") args.sameOrigin = true;
    else if (arg === "--skip-smoke") args.smoke = false;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function check(label, ok, detail = "", { required = true, status = null } = {}) {
  return {
    label,
    ok: Boolean(ok),
    detail,
    required,
    status: status || (ok ? "ok" : required ? "missing" : "optional")
  };
}

function usableStripeSecret(secret) {
  return ["standard", "restricted"].includes(stripeSecretKind(secret));
}

export function credentialChecks({ env = process.env, stripeProfile = readStripeCliProfile() } = {}) {
  const profileSecretUsable = usableStripeSecret(stripeProfile.secretKey);
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY || stripeProfile.publishableKey || null;
  const secretKey = env.STRIPE_SECRET_KEY || (profileSecretUsable ? stripeProfile.secretKey : null);
  const profileSecretKind = stripeSecretKind(stripeProfile.secretKey);
  const secretKind = stripeSecretKind(secretKey || env.STRIPE_SECRET_KEY);
  const checks = [
    check("STRIPE_PUBLISHABLE_KEY", Boolean(publishableKey)),
    check("STRIPE_SECRET_KEY", usableStripeSecret(secretKey), secretKind === "missing" ? "" : secretKind),
    check("STRIPE_WEBHOOK_SECRET", Boolean(env.STRIPE_WEBHOOK_SECRET)),
    check("PRINTFUL_API_KEY", Boolean(env.PRINTFUL_API_KEY)),
    check("STRIPE_WALLET_DOMAIN_READY", env.STRIPE_WALLET_DOMAIN_READY === "true", "Apple Pay domain readiness"),
    check("STRIPE_PAYMENT_METHODS_READY", env.STRIPE_PAYMENT_METHODS_READY === "true", "Google Pay/Link domain readiness"),
    check("SHOP_PAY_CLIENT_ID", Boolean(env.SHOP_PAY_CLIENT_ID), "optional Shopify Wallet lane", { required: false })
  ];

  if (!env.STRIPE_SECRET_KEY && profileSecretKind === "claimable-sandbox") {
    checks.push(
      check("Stripe sandbox", false, "claimable sandbox key found; claim it and run stripe login for a full test key", {
        required: true,
        status: "blocked"
      })
    );
  }

  return checks;
}

function embeddedProducts(catalog, productId = null) {
  return (catalog.products || []).filter((product) => {
    if (productId && product.id !== productId) return false;
    return product.checkout?.mode === "embedded-stripe";
  });
}

export async function productReadinessChecks({ catalog, productId = null, network = false, fetchImpl = fetch } = {}) {
  const products = embeddedProducts(catalog, productId);
  if (!products.length) {
    return [check("embedded products", false, productId ? `no embedded checkout product found for ${productId}` : "none found")];
  }

  const checks = [];
  for (const product of products) {
    const issues = localProductReadinessIssues(product, catalog);
    const variants = product.variants || [];
    for (const variant of variants) {
      try {
        resolveCart(catalog, [{ productId: product.id, variantId: variant.id, quantity: 1 }]);
      } catch (error) {
        issues.push(`${variant.id} cart validation failed: ${error.message}`);
      }
    }

    if (network && product.embeddedFulfillment?.recommended === "printful" && product.embeddedFulfillment.catalogProductId) {
      try {
        const printfulProduct = await fetchPrintfulCatalogProduct(product.embeddedFulfillment.catalogProductId, fetchImpl);
        issues.push(...printfulCatalogIssues(product, printfulProduct));
      } catch (error) {
        issues.push(`Printful catalog validation failed: ${error.message}`);
      }
    }

    checks.push(
      check(product.id, issues.length === 0, issues.join("; ") || `${variants.length} variant(s) ready${network ? " and catalog-checked" : ""}`)
    );
  }

  return checks;
}

function firstSmokeTarget(catalog, productId = null) {
  const product = embeddedProducts(catalog, productId).find((candidate) => candidate.status === "live") || embeddedProducts(catalog, productId)[0];
  const variant = (product?.variants || []).find((candidate) => candidate.available !== false) || null;
  return {
    productId: product?.id || null,
    variantId: variant?.id || null
  };
}

export async function smokeChecks({ catalog, productId = null } = {}) {
  const target = firstSmokeTarget(catalog, productId);
  if (!target.productId) return [check("local checkout smoke", false, "no embedded checkout product found")];

  try {
    const options = { productId: target.productId };
    if (target.variantId) options.variantId = target.variantId;
    const result = await runCheckoutSmoke(options);
    return [
      check(
        "local checkout smoke",
        true,
        `${result.fulfillmentStatus}; mocked Printful order ${result.providerOrderId}; catalog variant ${result.catalogVariantId}`
      )
    ];
  } catch (error) {
    return [check("local checkout smoke", false, error.message)];
  }
}

function configChecks(config, prefix = "local config") {
  return [
    check(`${prefix}: card`, config.payments?.card?.status === "configured", config.payments?.card?.status || "missing"),
    check(`${prefix}: fulfillment`, config.fulfillmentReady === true, config.fulfillment?.status || "missing"),
    check(
      `${prefix}: Apple Pay`,
      config.payments?.wallets?.applePay?.status === "eligible",
      config.payments?.wallets?.applePay?.status || "missing"
    ),
    check(
      `${prefix}: Google Pay`,
      config.payments?.wallets?.googlePay?.status === "eligible",
      config.payments?.wallets?.googlePay?.status || "missing"
    ),
    check(`${prefix}: Link`, config.payments?.wallets?.link?.status === "eligible", config.payments?.wallets?.link?.status || "missing")
  ];
}

export async function liveApiChecks({ apiBase = DEFAULT_API_BASE, fetchImpl = fetch, label = "live checkout API", prefix = "live config" } = {}) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
  try {
    const response = await fetchImpl(`${base}/api/store/config`, { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType && !contentType.includes("application/json")) {
      return [check(label, false, `unexpected content type: ${contentType}`)];
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return [check(label, false, data.error || `HTTP ${response.status}`)];
    return [check(label, true, base), ...configChecks(data, prefix)];
  } catch (error) {
    return [check(label, false, error.message)];
  }
}

export function summarizeChecks(checks) {
  const failures = checks.filter((item) => item.required && !item.ok);
  return {
    ok: failures.length === 0,
    failures,
    failureCount: failures.length
  };
}

export async function runLaunchCheck({
  apiBase = DEFAULT_API_BASE,
  env = process.env,
  fetchImpl = fetch,
  live = false,
  network = false,
  productId = null,
  publicUrl = DEFAULT_PUBLIC_URL,
  sameOrigin = false,
  smoke = true,
  stripeProfile = readStripeCliProfile()
} = {}) {
  const catalog = await loadCatalog();
  const checks = [
    ...credentialChecks({ env, stripeProfile }),
    ...configChecks(checkoutConfig(env), "local config"),
    ...(await productReadinessChecks({ catalog, productId, network, fetchImpl }))
  ];

  if (smoke) checks.push(...(await smokeChecks({ catalog, productId })));
  if (live) checks.push(...(await liveApiChecks({ apiBase, fetchImpl })));
  if (sameOrigin) {
    checks.push(
      ...(await liveApiChecks({
        apiBase: publicUrl,
        fetchImpl,
        label: "same-origin checkout API",
        prefix: "same-origin config"
      }))
    );
  }

  return {
    checks,
    summary: summarizeChecks(checks)
  };
}

function usage() {
  console.log(`Store launch check

Checks whether the embedded store is ready to accept real orders.

Usage:
  npm run store:launch:check
  npm run store:launch:check -- --network --live
  npm run store:launch:check -- --product small-useful-light-tee

Options:
  --api-base <url>  Checkout API base for --live checks. Defaults to the workers.dev API.
  --live            Check the deployed checkout API public config.
  --network         Check the live Printful public catalog for mapped products.
  --product <id>    Check one embedded checkout product.
  --public-url <url>
                   Public site URL for --same-origin checks. Defaults to https://bensonperry.com.
  --same-origin     Check the preferred bensonperry.com/api/store/* route.
  --skip-smoke      Skip the local signed-webhook/Printful mock smoke test.
`);
}

function printReport(checks) {
  for (const item of checks) {
    console.log(`${item.status.padEnd(8)} ${item.label}${item.detail ? ` - ${item.detail}` : ""}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  loadLocalEnv();
  const result = await runLaunchCheck(args);
  console.log("Store launch check");
  console.log("");
  printReport(result.checks);
  console.log("");

  if (!result.summary.ok) {
    console.log(`Not launch-ready: ${result.summary.failureCount} required check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("Launch-ready: embedded checkout can accept real orders.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
