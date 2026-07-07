import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildEmbeddedProductDraft, cents, slugify } from "../../store/product-model.mjs";
import { root } from "./env.mjs";

const DEFAULT_CATALOG_PATH = path.join(root, "store", "products.json");
const DEFAULT_STORE_ROOT = path.join(root, "store");

export { cents, slugify };

export function parseArgs(argv) {
  const args = {
    allowMissingAssets: false,
    apply: false,
    backArtwork: null,
    catalog: DEFAULT_CATALOG_PATH,
    color: null,
    details: null,
    frontArtwork: null,
    help: false,
    id: null,
    image: null,
    noBack: false,
    price: null,
    replace: false,
    sizes: null,
    status: "draft",
    summary: "",
    title: "",
    type: "t-shirt"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-missing-assets") args.allowMissingAssets = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--back-artwork") args.backArtwork = argv[(index += 1)] || "";
    else if (arg.startsWith("--back-artwork=")) args.backArtwork = arg.slice("--back-artwork=".length);
    else if (arg === "--catalog") args.catalog = argv[(index += 1)] || DEFAULT_CATALOG_PATH;
    else if (arg.startsWith("--catalog=")) args.catalog = arg.slice("--catalog=".length);
    else if (arg === "--front-artwork") args.frontArtwork = argv[(index += 1)] || "";
    else if (arg.startsWith("--front-artwork=")) args.frontArtwork = arg.slice("--front-artwork=".length);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--id") args.id = argv[(index += 1)] || "";
    else if (arg.startsWith("--id=")) args.id = arg.slice("--id=".length);
    else if (arg === "--image") args.image = argv[(index += 1)] || "";
    else if (arg.startsWith("--image=")) args.image = arg.slice("--image=".length);
    else if (arg === "--no-back") args.noBack = true;
    else if (arg === "--color") args.color = argv[(index += 1)] || "";
    else if (arg.startsWith("--color=")) args.color = arg.slice("--color=".length);
    else if (arg === "--details") args.details = argv[(index += 1)] || "";
    else if (arg.startsWith("--details=")) args.details = arg.slice("--details=".length);
    else if (arg === "--price") args.price = argv[(index += 1)] || "";
    else if (arg.startsWith("--price=")) args.price = arg.slice("--price=".length);
    else if (arg === "--replace") args.replace = true;
    else if (arg === "--sizes") args.sizes = argv[(index += 1)] || "";
    else if (arg.startsWith("--sizes=")) args.sizes = arg.slice("--sizes=".length);
    else if (arg === "--status") args.status = argv[(index += 1)] || "";
    else if (arg.startsWith("--status=")) args.status = arg.slice("--status=".length);
    else if (arg === "--summary") args.summary = argv[(index += 1)] || "";
    else if (arg.startsWith("--summary=")) args.summary = arg.slice("--summary=".length);
    else if (arg === "--title") args.title = argv[(index += 1)] || "";
    else if (arg.startsWith("--title=")) args.title = arg.slice("--title=".length);
    else if (arg === "--type") args.type = argv[(index += 1)] || "";
    else if (arg.startsWith("--type=")) args.type = arg.slice("--type=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

export function buildScaffoldProduct(options = {}) {
  return buildEmbeddedProductDraft(options);
}

export function productAssetPaths(product) {
  const paths = [product.image];
  for (const key of ["frontArtwork", "backArtwork", "fallbackBackArtwork", "frontSource", "fallbackBackSource"]) {
    if (product.production?.[key]) paths.push(product.production[key]);
  }
  return [...new Set(paths.filter(Boolean))];
}

function resolveStorePath(storeRoot, assetPath) {
  return path.isAbsolute(assetPath) ? assetPath : path.join(storeRoot, assetPath);
}

export async function missingProductAssetIssues(product, { fsImpl = fs, storeRoot = DEFAULT_STORE_ROOT } = {}) {
  const issues = [];
  for (const assetPath of productAssetPaths(product)) {
    const resolved = resolveStorePath(storeRoot, assetPath);
    try {
      const stat = await fsImpl.stat(resolved);
      if (!stat.isFile()) issues.push(`${assetPath} is not a file`);
    } catch {
      issues.push(`missing asset: ${assetPath}`);
    }
  }
  return issues;
}

function catalogDate(date = new Date()) {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function applyScaffoldProduct(catalog, product, { date = new Date(), replace = false } = {}) {
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const index = products.findIndex((candidate) => candidate.id === product.id);
  if (index >= 0 && !replace) {
    throw new Error(`Product ${product.id} already exists. Use --replace to update it.`);
  }

  const nextProducts = products.slice();
  if (index >= 0) nextProducts[index] = product;
  else nextProducts.push(product);

  return {
    catalog: {
      ...catalog,
      updated: catalogDate(date),
      products: nextProducts
    },
    replaced: index >= 0
  };
}

async function readCatalog(catalogPath, fsImpl = fs) {
  return JSON.parse(await fsImpl.readFile(catalogPath, "utf8"));
}

async function writeCatalog(catalogPath, catalog, fsImpl = fs) {
  await fsImpl.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

export async function runProductScaffold(options = {}, { fsImpl = fs, now = new Date() } = {}) {
  const product = buildScaffoldProduct(options);
  const catalogPath = path.resolve(options.catalog || DEFAULT_CATALOG_PATH);
  const storeRoot = path.dirname(catalogPath);
  const defaultCatalogPath = path.resolve(DEFAULT_CATALOG_PATH);

  if (!options.apply) {
    return {
      applied: false,
      product
    };
  }

  const assetIssues = await missingProductAssetIssues(product, { fsImpl, storeRoot });
  if (assetIssues.length && (!options.allowMissingAssets || catalogPath === defaultCatalogPath)) {
    throw new Error(
      [
        `Refusing to apply ${product.id} because referenced catalog assets are missing.`,
        ...assetIssues.map((issue) => `- ${issue}`),
        "Create the files first, or use --catalog <private path> --allow-missing-assets for a private draft catalog."
      ].join("\n")
    );
  }

  const catalog = await readCatalog(catalogPath, fsImpl);
  const result = applyScaffoldProduct(catalog, product, { date: now, replace: options.replace });
  await writeCatalog(catalogPath, result.catalog, fsImpl);

  return {
    ...result,
    applied: true,
    assetIssues,
    product
  };
}

function usage() {
  console.log(`Store product scaffold

Prints or applies a safe embedded-checkout product draft for store/products.json.

Usage:
  npm run store:product:scaffold -- --title "small useful light" --type t-shirt
  npm run store:product:scaffold -- --title "priority pass hat" --type hat --price 32
  npm run store:product:scaffold -- --title "priority pass hat" --type hat --price 32 --apply

Options:
  --title <text>    Product title. Used to derive stable IDs and asset paths.
  --id <id>         Product ID override. Defaults to a slug from --title.
  --type <type>     Product type: t-shirt, hat, playmat. Defaults to t-shirt.
  --price <amount>  Price in dollars. Use a trailing c for raw cents. Defaults by type.
  --color <name>    Variant color. Defaults by type.
  --sizes <list>    Comma-separated sizes. Defaults by type.
  --summary <text>  Storefront summary.
  --details <list>  Comma-separated product details.
  --status <value>  Product status. Defaults to draft.
  --image <path>    Storefront mockup path relative to store/.
  --front-artwork <path>
                    Production front artwork path relative to store/.
  --back-artwork <path>
                    Production back artwork path relative to store/.
  --no-back         Leave the production back artwork path empty.
  --apply           Write the product into store/products.json.
  --replace         Replace an existing product with the same ID when applying.
  --catalog <path>  Catalog path. Defaults to store/products.json.
  --allow-missing-assets
                    Apply to a custom private catalog even if assets do not exist.
`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const result = await runProductScaffold(args);
  if (!result.applied) {
    console.log(JSON.stringify(result.product, null, 2));
    return;
  }

  console.log("Store product scaffold");
  console.log("");
  console.log(`${result.replaced ? "updated" : "added"} ${result.product.id} in ${path.relative(root, path.resolve(args.catalog))}`);
  console.log(`status: ${result.product.status}`);
  if (args.allowMissingAssets) console.log("warning: missing asset checks were bypassed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
