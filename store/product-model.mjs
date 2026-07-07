export const TYPE_DEFAULTS = {
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
  const centsMatch = normalized.match(/^(\d+)\s*c$/i);
  if (centsMatch) return Number(centsMatch[1]);
  return Math.round((Number.parseFloat(normalized) || 0) * 100);
}

export function splitList(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function defaultsForType(type) {
  return TYPE_DEFAULTS[type] || TYPE_DEFAULTS["t-shirt"];
}

export function buildEmbeddedProductDraft(options = {}) {
  const type = options.type || "t-shirt";
  const defaults = defaultsForType(type);
  const title = String(options.title || "").trim() || "untitled product";
  const id = slugify(options.id || title);
  const price = cents(options.price) ?? defaults.price;
  const color = options.color || defaults.variants.color;
  const sizes = splitList(options.sizes, defaults.variants.sizes);
  const details = splitList(options.details, defaults.details);
  const image = options.image || `assets/${id}-mockup.png`;
  const frontArtwork = options.frontArtwork || `assets/${id}-front.png`;
  const backArtwork =
    options.backArtwork !== null && options.backArtwork !== undefined
      ? options.backArtwork
      : type === "hat" || options.noBack
        ? ""
        : `assets/${id}-back.png`;

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
    category: options.category || defaults.category,
    price,
    currency: "USD",
    status: options.status || "draft",
    image,
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
      frontArtwork,
      backArtwork,
      notes: "Scaffolded draft. Replace placeholder asset paths with production-ready artwork before publishing."
    }
  };
}
