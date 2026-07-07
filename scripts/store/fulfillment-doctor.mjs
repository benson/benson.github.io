import { loadCatalog, resolveCart } from "./checkout.mjs";
import { loadLocalEnv } from "./env.mjs";
import { fetchPrintfulCatalogProduct, localProductReadinessIssues, printfulCatalogIssues } from "./product-readiness.mjs";

function hasSecret(name) {
  return Boolean(process.env[name]);
}

function printStatus(label, ok, detail = "") {
  const marker = ok ? "ok" : "missing";
  console.log(`${marker.padEnd(7)} ${label}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    network: argv.includes("--network")
  };
}

function usage() {
  console.log(`Store fulfillment doctor

Usage:
  npm run store:fulfillment:doctor
  npm run store:fulfillment:doctor -- --network

Options:
  --network  Also validate mapped Printful catalog products, variants, placements, and availability.
`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

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
    const issues = localProductReadinessIssues(product, catalog);
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

    if (args.network && product.embeddedFulfillment?.recommended === "printful" && product.embeddedFulfillment.catalogProductId) {
      try {
        const printfulProduct = await fetchPrintfulCatalogProduct(product.embeddedFulfillment.catalogProductId);
        issues.push(...printfulCatalogIssues(product, printfulProduct));
      } catch (error) {
        issues.push(`Printful catalog validation failed: ${error.message}`);
      }
    }

    if (issues.length) {
      failureCount += issues.length;
      printStatus(product.id, false, `${issues.length} issue(s)`);
      for (const issue of issues) console.log(`  - ${issue}`);
    } else {
      printStatus(product.id, true, `${variants.length} variant(s) mapped${args.network ? " and catalog-checked" : ""}`);
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
