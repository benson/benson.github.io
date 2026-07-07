import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCatalog } from "./checkout.mjs";
import { root } from "./env.mjs";
import { fetchPrintfulCatalogProduct, printfulCatalogIssues } from "./product-readiness.mjs";

const catalogPath = path.join(root, "store", "products.json");

export function parseArgs(argv) {
  const args = {
    apply: false,
    backPlacement: "back",
    catalogProductId: null,
    frontPlacement: "front",
    help: false,
    productId: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--product") args.productId = argv[(index += 1)] || null;
    else if (arg.startsWith("--product=")) args.productId = arg.slice("--product=".length);
    else if (arg === "--catalog-product") args.catalogProductId = Number(argv[(index += 1)] || 0) || null;
    else if (arg.startsWith("--catalog-product=")) args.catalogProductId = Number(arg.slice("--catalog-product=".length)) || null;
    else if (arg === "--front-placement") args.frontPlacement = argv[(index += 1)] || "front";
    else if (arg.startsWith("--front-placement=")) args.frontPlacement = arg.slice("--front-placement=".length);
    else if (arg === "--back-placement") args.backPlacement = argv[(index += 1)] || "back";
    else if (arg.startsWith("--back-placement=")) args.backPlacement = arg.slice("--back-placement=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function usage() {
  console.log(`Printful product mapper

Maps store variants to Printful catalog variants by Color and Size.

Usage:
  npm run store:printful:map -- --product small-useful-light-tee --catalog-product 1421
  npm run store:printful:map -- --product small-useful-light-tee --catalog-product 1421 --apply

Options:
  --product <id>           Store product ID from store/products.json.
  --catalog-product <id>   Printful catalog product ID.
  --front-placement <id>   Printful placement for front artwork. Default: front.
  --back-placement <id>    Printful placement for back artwork. Default: back.
  --apply                  Write the mapping to store/products.json. Dry-run by default.
`);
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function printfulVariantLabel(variant) {
  return [variant.color, variant.size].filter(Boolean).join(" / ") || variant.name || String(variant.id);
}

function supportedPlacementTypes(printfulProduct) {
  return new Set((printfulProduct.product?.files || []).map((file) => file.type || file.id).filter(Boolean));
}

export function buildPrintfulMapping(product, printfulProduct, { frontPlacement = "front", backPlacement = "back" } = {}) {
  const issues = [];
  const remoteProduct = printfulProduct.product || {};
  const remoteVariants = printfulProduct.variants || [];
  const placements = supportedPlacementTypes(printfulProduct);
  const mapping = {};

  for (const placement of [frontPlacement, backPlacement].filter((value) => value !== false && value)) {
    if (!placements.has(placement)) {
      issues.push(`Printful product ${remoteProduct.id || "unknown"} does not support placement ${placement}`);
    }
  }

  for (const variant of product.variants || []) {
    const color = variant.options?.Color;
    const size = variant.options?.Size;
    const matches = remoteVariants.filter(
      (candidate) => normalized(candidate.color) === normalized(color) && normalized(candidate.size) === normalized(size)
    );

    if (!matches.length) {
      issues.push(`${variant.id} could not match Printful variant for ${color || "missing color"} / ${size || "missing size"}`);
      continue;
    }
    if (matches.length > 1) {
      issues.push(`${variant.id} matched multiple Printful variants: ${matches.map((candidate) => candidate.id).join(", ")}`);
      continue;
    }

    mapping[variant.id] = {
      catalogVariantId: matches[0].id,
      frontPlacement,
      backPlacement
    };
  }

  const mappedProduct = {
    ...product,
    embeddedFulfillment: {
      ...product.embeddedFulfillment,
      recommended: "printful",
      status: issues.length ? "needs-provider-account-and-variant-mapping" : "ready",
      catalogProductId: remoteProduct.id,
      catalogProduct: remoteProduct.title,
      notes: issues.length
        ? "Printful catalog mapping needs attention before embedded checkout can accept payment."
        : "Printful catalog mapping is ready. Do not accept live Stripe payments until PRINTFUL_API_KEY and PRINTFUL_STORE_ID are configured and the webhook fulfillment path has been tested against the account.",
      variants: mapping
    }
  };

  issues.push(...printfulCatalogIssues(mappedProduct, printfulProduct));

  return {
    issues,
    mappedProduct,
    mapping,
    remoteProduct,
    remoteVariants
  };
}

export function applyMappedProduct(catalog, mappedProduct) {
  return {
    ...catalog,
    products: (catalog.products || []).map((product) => (product.id === mappedProduct.id ? mappedProduct : product))
  };
}

function mappingChanged(product, mappedProduct) {
  return JSON.stringify(product.embeddedFulfillment || null) !== JSON.stringify(mappedProduct.embeddedFulfillment || null);
}

async function writeCatalog(catalog) {
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

export async function runPrintfulMap({
  apply = false,
  backPlacement = "back",
  catalogProductId,
  fetchImpl = fetch,
  frontPlacement = "front",
  productId
} = {}) {
  if (!productId) throw new Error("Missing --product.");
  if (!catalogProductId) throw new Error("Missing --catalog-product.");

  const catalog = await loadCatalog(catalogPath);
  const product = (catalog.products || []).find((candidate) => candidate.id === productId);
  if (!product) throw new Error(`Unknown store product: ${productId}`);

  const printfulProduct = await fetchPrintfulCatalogProduct(catalogProductId, fetchImpl);
  const result = buildPrintfulMapping(product, printfulProduct, { frontPlacement, backPlacement });
  const changed = mappingChanged(product, result.mappedProduct);

  if (result.issues.length) {
    return {
      ...result,
      applied: false,
      changed
    };
  }

  if (apply && changed) {
    await writeCatalog(applyMappedProduct(catalog, result.mappedProduct));
  }

  return {
    ...result,
    applied: Boolean(apply && changed),
    changed
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const result = await runPrintfulMap(args);
  console.log("Printful product mapper");
  console.log("");
  console.log(`product: ${args.productId}`);
  console.log(`Printful catalog product: ${result.remoteProduct.title || args.catalogProductId} (${result.remoteProduct.id || args.catalogProductId})`);
  console.log(`variants mapped: ${Object.keys(result.mapping).length}`);
  for (const [variantId, mapping] of Object.entries(result.mapping)) {
    const remoteVariant = result.remoteVariants.find((variant) => variant.id === mapping.catalogVariantId);
    console.log(`ok      ${variantId} -> ${mapping.catalogVariantId} (${printfulVariantLabel(remoteVariant || {})})`);
  }

  if (result.issues.length) {
    console.log("");
    console.log(`Not mapped: ${result.issues.length} issue(s).`);
    for (const issue of result.issues) console.log(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  if (result.applied) console.log("Applied mapping to store/products.json.");
  else if (result.changed) console.log("Dry run only. Add --apply to write store/products.json.");
  else console.log("Mapping already matches store/products.json.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
