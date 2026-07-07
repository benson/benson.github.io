import { pathToFileURL } from "node:url";

const TYPE_DEFAULTS = {
  "t-shirt": {
    category: "apparel",
    price: 3995,
    method: "dtg",
    blank: "black unisex tee",
    details: ["front/back print", "US standard shipping included"],
    catalogProductId: 1421,
    catalogProduct: "Unisex Fine Jersey Tee | LAT Apparel 6901",
    variants: {
      color: "Black",
      sizes: ["S", "M", "L", "XL", "2XL"]
    }
  },
  hat: {
    category: "accessories",
    price: 3200,
    method: "embroidery",
    blank: "adjustable cap",
    details: ["front embroidery", "adjustable strap", "US standard shipping included"],
    variants: {
      color: "Black",
      sizes: ["OS"]
    }
  },
  playmat: {
    category: "tabletop",
    price: 3495,
    method: "sublimation",
    blank: "stitched-edge playmat",
    details: ["full-surface print", "US standard shipping included"],
    variants: {
      color: "Full color",
      sizes: ["Standard"]
    }
  }
};

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled-product";
}

export function cents(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/^\$/, "").trim();
  const centsMatch = normalized.match(/^(\d+)\s*(?:c|¢)$/i);
  if (centsMatch) return Number(centsMatch[1]);
  return Math.round((Number.parseFloat(normalized) || 0) * 100);
}

function splitList(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArgs(argv) {
  const args = {
    color: null,
    details: null,
    help: false,
    price: null,
    sizes: null,
    status: "draft",
    summary: "",
    title: "",
    type: "t-shirt"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--color") args.color = argv[(index += 1)] || "";
    else if (arg.startsWith("--color=")) args.color = arg.slice("--color=".length);
    else if (arg === "--details") args.details = argv[(index += 1)] || "";
    else if (arg.startsWith("--details=")) args.details = arg.slice("--details=".length);
    else if (arg === "--price") args.price = argv[(index += 1)] || "";
    else if (arg.startsWith("--price=")) args.price = arg.slice("--price=".length);
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
  const type = options.type || "t-shirt";
  const defaults = TYPE_DEFAULTS[type] || TYPE_DEFAULTS["t-shirt"];
  const title = String(options.title || "").trim() || "untitled product";
  const id = slugify(title);
  const price = cents(options.price) ?? defaults.price;
  const color = options.color || defaults.variants.color;
  const sizes = splitList(options.sizes, defaults.variants.sizes);
  const details = splitList(options.details, defaults.details);

  const variants = sizes.map((size) => {
    const variantId = slugify(`${id}-${color}-${size}`);
    return {
      id: variantId,
      sku: variantId,
      label: `${color} / ${size}`,
      options: {
        Color: color,
        Size: size
      },
      price,
      available: true
    };
  });

  const embeddedFulfillment = {
    recommended: "printful",
    status: "needs-provider-mapping",
    notes: "Run store:printful:map after choosing the provider catalog product. Do not mark ready until every variant maps to a provider variant.",
    variants: Object.fromEntries(
      variants.map((variant) => [
        variant.id,
        {
          catalogVariantId: null,
          frontPlacement: "front",
          backPlacement: type === "hat" ? false : "back"
        }
      ])
    )
  };

  if (defaults.catalogProductId) embeddedFulfillment.catalogProductId = defaults.catalogProductId;
  if (defaults.catalogProduct) embeddedFulfillment.catalogProduct = defaults.catalogProduct;

  return {
    id,
    title,
    type,
    category: defaults.category,
    price,
    currency: "USD",
    status: options.status || "draft",
    image: `assets/${id}-mockup.png`,
    alt: `${title} mockup`,
    summary: options.summary || "",
    details,
    variants,
    checkout: {
      mode: "embedded-stripe",
      shipping: {
        strategy: "included-us-standard",
        label: "US standard shipping included"
      },
      allowedCountries: ["US"]
    },
    fulfillment: "embedded",
    embeddedFulfillment,
    production: {
      method: defaults.method,
      blank: defaults.blank,
      frontArtwork: `assets/${id}-front.png`,
      backArtwork: type === "hat" ? "" : `assets/${id}-back.png`,
      notes: "Scaffolded draft. Replace placeholder asset paths with production-ready artwork before publishing."
    }
  };
}

function usage() {
  console.log(`Store product scaffold

Prints a safe embedded-checkout product draft for store/products.json.

Usage:
  npm run store:product:scaffold -- --title "small useful light" --type t-shirt
  npm run store:product:scaffold -- --title "priority pass hat" --type hat --price 32

Options:
  --title <text>    Product title. Used to derive stable IDs and asset paths.
  --type <type>     Product type: t-shirt, hat, playmat. Defaults to t-shirt.
  --price <amount>  Price in dollars. Use a trailing c for raw cents. Defaults by type.
  --color <name>    Variant color. Defaults by type.
  --sizes <list>    Comma-separated sizes. Defaults by type.
  --summary <text>  Storefront summary.
  --details <list>  Comma-separated product details.
  --status <value>  Product status. Defaults to draft.
`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  console.log(JSON.stringify(buildScaffoldProduct(args), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
