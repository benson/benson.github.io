import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, resolveCart } from "./checkout.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(root, file);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^['"]|['"]$/g, "");
    }
  }
}

function hasSecret(name) {
  return Boolean(process.env[name]);
}

function productIssues(product) {
  const issues = [];
  const fulfillment = product.embeddedFulfillment;
  if (!fulfillment) {
    issues.push("missing embeddedFulfillment block");
    return issues;
  }

  if (fulfillment.recommended !== "printful") {
    issues.push(`provider is ${fulfillment.recommended || "missing"}, expected printful`);
  }
  if (fulfillment.status !== "ready") {
    issues.push(`status is ${fulfillment.status || "missing"}, expected ready`);
  }

  const mapped = fulfillment.variants || {};
  for (const variant of product.variants || []) {
    const providerVariant = mapped[variant.id];
    if (!providerVariant) {
      issues.push(`${variant.id} missing provider mapping`);
      continue;
    }
    if (!providerVariant.catalogVariantId) {
      issues.push(`${variant.id} missing Printful catalogVariantId`);
    }
  }

  return issues;
}

function printStatus(label, ok, detail = "") {
  const marker = ok ? "ok" : "missing";
  console.log(`${marker.padEnd(7)} ${label}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

async function main() {
  loadLocalEnv();
  const catalog = await loadCatalog();
  console.log("Store fulfillment doctor");
  console.log("");

  let failureCount = 0;
  const requiredSetup = [
    ["STRIPE_PUBLISHABLE_KEY", hasSecret("STRIPE_PUBLISHABLE_KEY")],
    ["STRIPE_SECRET_KEY", hasSecret("STRIPE_SECRET_KEY")],
    ["STRIPE_WEBHOOK_SECRET", hasSecret("STRIPE_WEBHOOK_SECRET")],
    ["PRINTFUL_API_KEY", hasSecret("PRINTFUL_API_KEY")]
  ];

  for (const [label, ok] of requiredSetup) {
    if (!printStatus(label, ok)) failureCount += 1;
  }
  printStatus("STRIPE_WALLET_DOMAIN_READY", process.env.STRIPE_WALLET_DOMAIN_READY === "true", "Apple Pay domain readiness marker");
  printStatus("STRIPE_PAYMENT_METHODS_READY", process.env.STRIPE_PAYMENT_METHODS_READY === "true", "Google Pay/payment method readiness marker");
  printStatus("SHOP_PAY_CLIENT_ID", hasSecret("SHOP_PAY_CLIENT_ID"), "optional Shopify Wallet lane");
  console.log("");

  for (const product of catalog.products || []) {
    if (product.checkout?.mode !== "embedded-stripe") continue;
    const issues = productIssues(product);
    const variants = (product.variants || []).map((variant) => ({
      productId: product.id,
      variantId: variant.id,
      quantity: 1
    }));

    for (const item of variants) {
      try {
        resolveCart(catalog, [item]);
      } catch (error) {
        issues.push(`${item.variantId} cart validation failed: ${error.message}`);
      }
    }

    if (issues.length) {
      failureCount += issues.length;
      printStatus(product.id, false, `${issues.length} issue(s)`);
      for (const issue of issues) console.log(`  - ${issue}`);
    } else {
      printStatus(product.id, true, `${variants.length} variant(s) mapped`);
    }
  }

  console.log("");
  if (failureCount) {
    console.log(`Not production-ready: ${failureCount} fulfillment issue(s).`);
    process.exitCode = 1;
  } else {
    console.log("Fulfillment mapping is production-ready.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
