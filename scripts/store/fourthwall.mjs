#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const STORE_DIR = path.join(ROOT_DIR, "store");
export const CATALOG_PATH = path.join(STORE_DIR, "products.json");
export const DEFAULT_API_BASE = "https://api.fourthwall.com";
export const LOCAL_ENV_FILES = [
  path.join(ROOT_DIR, ".env.local"),
  path.join(ROOT_DIR, ".env")
];

const DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL"];
const DEFAULT_COLORS = ["Black"];
const IMAGE_CONTENT_TYPE = "image/png";

class UserBlockedError extends Error {
  constructor(message, code = "USER_BLOCKED") {
    super(message);
    this.name = "UserBlockedError";
    this.code = code;
  }
}

class FourthwallApiError extends Error {
  constructor(message, response, body) {
    super(message);
    this.name = "FourthwallApiError";
    this.status = response.status;
    this.body = body;
  }
}

export function parseArgs(argv) {
  const options = {
    command: "publish",
    apply: false,
    dryRun: false,
    publish: false,
    updateCatalog: true,
    forceNew: false,
    json: false,
    colors: null,
    sizes: null,
    limit: 8,
    apiBase: process.env.FOURTHWALL_API_BASE || DEFAULT_API_BASE
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    options.command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const [flag, inlineValue] = raw.split("=", 2);
    const nextValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= args.length) throw new Error(`${flag} needs a value`);
      return args[index];
    };

    if (flag === "--id") options.id = nextValue();
    else if (flag === "--template-id") options.templateId = nextValue();
    else if (flag === "--query") options.query = nextValue();
    else if (flag === "--api-base") options.apiBase = nextValue();
    else if (flag === "--profit-margin") options.profitMargin = Number(nextValue());
    else if (flag === "--limit") options.limit = Number(nextValue());
    else if (flag === "--color" || flag === "--colors") options.colors = splitCsv(nextValue());
    else if (flag === "--size" || flag === "--sizes") options.sizes = splitCsv(nextValue());
    else if (flag === "--apply") options.apply = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--publish") options.publish = true;
    else if (flag === "--hidden" || flag === "--no-publish") options.publish = false;
    else if (flag === "--no-catalog-update") options.updateCatalog = false;
    else if (flag === "--force-new") options.forceNew = true;
    else if (flag === "--json") options.json = true;
    else if (flag === "--help" || flag === "-h") options.command = "help";
    else throw new Error(`Unknown option: ${raw}`);
  }

  if (options.apply && options.dryRun) {
    throw new Error("Use either --apply or --dry-run, not both");
  }

  options.dryRun = !options.apply;
  return options;
}

function splitCsv(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loadLocalEnvFiles({ files = LOCAL_ENV_FILES, env = process.env } = {}) {
  const loaded = [];
  for (const file of files) {
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (env[key] !== undefined) continue;
      env[key] = unquoteEnvValue(rawValue.trim());
    }
    loaded.push(file);
  }
  return loaded;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function getAuthFromEnv(env = process.env) {
  if (env.FOURTHWALL_API_TOKEN) {
    return { header: `Bearer ${env.FOURTHWALL_API_TOKEN}` };
  }

  if (env.FOURTHWALL_BASIC_AUTH) {
    return { header: `Basic ${env.FOURTHWALL_BASIC_AUTH}` };
  }

  if (env.FOURTHWALL_API_USERNAME && env.FOURTHWALL_API_PASSWORD) {
    const pair = `${env.FOURTHWALL_API_USERNAME}:${env.FOURTHWALL_API_PASSWORD}`;
    return { header: `Basic ${Buffer.from(pair, "utf8").toString("base64")}` };
  }

  return null;
}

export async function readCatalog(catalogPath = CATALOG_PATH) {
  const raw = await fs.readFile(catalogPath, "utf8");
  return JSON.parse(raw);
}

export async function writeCatalog(catalog, catalogPath = CATALOG_PATH) {
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export function findProduct(catalog, id) {
  if (!id) {
    if (catalog.products?.length === 1) return catalog.products[0];
    throw new Error("Pass --id because the catalog contains more than one product");
  }

  const product = catalog.products?.find((item) => item.id === id);
  if (!product) throw new Error(`No store product found for id: ${id}`);
  return product;
}

export function getByPath(value, dottedPath) {
  return String(dottedPath)
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), value);
}

function relativeStorePath(product, dottedPath) {
  const value = getByPath(product, dottedPath);
  if (!value) return null;
  return value;
}

export function defaultRegionMappings(product) {
  const custom = product.publishing?.fourthwall?.regions;
  if (Array.isArray(custom) && custom.length > 0) return custom;

  const mappings = [];
  if (relativeStorePath(product, "production.frontArtwork")) {
    mappings.push({
      region: "front",
      artwork: "production.frontArtwork",
      placementStrategy: "AUTO"
    });
  }
  if (relativeStorePath(product, "production.backArtwork")) {
    mappings.push({
      region: "back",
      artwork: "production.backArtwork",
      placementStrategy: "AUTO"
    });
  }
  return mappings;
}

export function resolveStoreFile(relativePath) {
  const resolved = path.resolve(STORE_DIR, relativePath);
  const storeRoot = `${path.resolve(STORE_DIR)}${path.sep}`;
  if (!resolved.startsWith(storeRoot)) {
    throw new Error(`Store asset escapes store directory: ${relativePath}`);
  }
  return resolved;
}

export async function readPngMetadata(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(33);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < header.length) throw new Error("File is too small to be a PNG");
    const signature = header.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") throw new Error("File is not a PNG");
    if (header.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG is missing IHDR");
    const colorType = header.readUInt8(25);
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
      bitDepth: header.readUInt8(24),
      colorType,
      hasAlpha: colorType === 4 || colorType === 6
    };
  } finally {
    await handle.close();
  }
}

export async function validateProductAssets(product) {
  const errors = [];
  const warnings = [];
  const assets = [];

  if (!product.id) errors.push("Product is missing id");
  if (!product.title) errors.push(`${product.id || "product"} is missing title`);
  if (!Number.isInteger(product.price)) errors.push(`${product.id} price must be integer cents`);
  if (product.currency !== "USD") warnings.push(`${product.id} uses ${product.currency}; Fourthwall product API prices/margins are USD`);

  const regionMappings = defaultRegionMappings(product);
  if (regionMappings.length === 0) {
    errors.push(`${product.id} does not define production artwork for Fourthwall regions`);
  }

  for (const mapping of regionMappings) {
    const relativePath = getByPath(product, mapping.artwork);
    if (!relativePath) {
      errors.push(`${product.id} missing ${mapping.artwork}`);
      continue;
    }

    const filePath = resolveStoreFile(relativePath);
    try {
      const stat = await fs.stat(filePath);
      const png = await readPngMetadata(filePath);
      const record = {
        region: mapping.region,
        placementStrategy: mapping.placementStrategy || "AUTO",
        artwork: mapping.artwork,
        relativePath,
        filePath,
        fileName: path.basename(filePath),
        size: stat.size,
        width: png.width,
        height: png.height,
        hasAlpha: png.hasAlpha
      };
      assets.push(record);

      if (!png.hasAlpha) warnings.push(`${relativePath} is opaque; transparent PNGs are safer for apparel artwork`);
      if (mapping.region === "back" && (png.width < 3000 || png.height < 2400)) {
        warnings.push(`${relativePath} may be low resolution for a large back print (${png.width}x${png.height})`);
      }
      if (mapping.region === "front" && (png.width < 1200 || png.height < 1200)) {
        warnings.push(`${relativePath} may be low resolution for a chest print (${png.width}x${png.height})`);
      }
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, assets };
}

export function createFourthwallClient({ apiBase = DEFAULT_API_BASE, auth = getAuthFromEnv(), fetchImpl = fetch } = {}) {
  if (!auth) return null;

  async function request(method, route, body) {
    const response = await fetchImpl(`${apiBase}${route}`, {
      method,
      headers: {
        Authorization: auth.header,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new FourthwallApiError(`Fourthwall ${method} ${route} failed: ${response.status} ${detail}`, response, data);
    }

    return data;
  }

  return {
    apiBase,
    get: (route) => request("GET", route),
    post: (route, body) => request("POST", route, body),
    put: (route, body) => request("PUT", route, body),
    fetchImpl
  };
}

export async function listProductTemplates(client) {
  try {
    const unpaged = await client.get("/open-api/v1.0/product-templates");
    if (Array.isArray(unpaged)) return unpaged;
    if (Array.isArray(unpaged?.results) && unpaged.results.length >= Number(unpaged.total || 0)) {
      return unpaged.results;
    }
  } catch (error) {
    if (!(error instanceof FourthwallApiError) || error.status !== 404) throw error;
  }

  const templates = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await client.get(`/open-api/v1.0/product-templates/page/${page}`);
    const results = response?.results || [];
    templates.push(...results);
    if (!results.length || templates.length >= Number(response?.total || 0)) break;
  }
  return templates;
}

export async function getProductTemplate(client, productTemplateId) {
  return client.get(`/open-api/v1.0/product-templates/${encodeURIComponent(productTemplateId)}`);
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function templateText(template) {
  return [
    template.name,
    template.slug,
    template.category,
    template.brand,
    template.productionMethod
  ].map(normalize).join(" ");
}

function colorName(colorVariant) {
  return colorVariant?.color?.name || "";
}

function availableColorVariants(template) {
  return (template.colorVariants || []).filter((variant) => variant.available !== false);
}

function availableSizesForColor(colorVariant) {
  return (colorVariant.sizeVariants || [])
    .filter((variant) => variant.available !== false)
    .map((variant) => variant.size);
}

function templateBaseAmount(template) {
  return Number(template.basePrice?.amount ?? template.priceFrom?.amount ?? 0);
}

function areaMatches(area, region) {
  const expected = regionKey(region);
  return regionKey(area.regionId) === expected || regionKey(area.name) === expected;
}

function regionKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function incompatibleTemplateText(template) {
  const text = templateText(template);
  const category = normalize(template.category);
  return (
    text.includes("sweatshirt") ||
    text.includes("hoodie") ||
    text.includes("polo") ||
    text.includes("tank") ||
    text.includes("jersey") ||
    text.includes("rash guard") ||
    text.includes("bodysuit") ||
    text.includes("baby") ||
    text.includes("youth") ||
    text.includes("kids") ||
    category.includes("kids clothing") ||
    category.includes("hoodies") ||
    category.includes("sweatshirts") ||
    category.includes("polo") ||
    category.includes("tank")
  );
}

function hasAvailableRegion(template, region) {
  return (template.customizableAreas || []).some((area) =>
    area.available !== false && area.supportsBackendRendering !== false && areaMatches(area, region)
  );
}

export function rankTemplate(template, product, requiredRegions = []) {
  const text = templateText(template);
  let score = 0;
  const reasons = [];

  if (incompatibleTemplateText(template)) return { score: -Infinity, reasons: ["not an adult t-shirt blank"] };
  if (template.supportsBackendRendering === false) return { score: -Infinity, reasons: ["does not support backend rendering"] };
  score += 20;

  if (normalize(template.productionMethod) === "dtg") {
    score += 35;
    reasons.push("DTG");
  }

  if (text.includes("t-shirt") || text.includes("tee") || text.includes("shirt")) {
    score += 30;
    reasons.push("shirt template");
  }

  if (text.includes("apparel")) score += 5;
  if (normalize(template.category).includes("apparel/t-shirts")) score += 25;
  if (text.includes("unisex")) score += 12;
  if (text.includes("supersoft")) score += 10;

  const blackVariant = availableColorVariants(template).find((variant) =>
    normalize(colorName(variant)) === "black" || normalize(variant.color?.hex) === "#000000"
  );
  if (blackVariant) {
    score += 25;
    reasons.push("black color");
  }

  for (const region of requiredRegions) {
    if (hasAvailableRegion(template, region)) {
      score += 15;
      reasons.push(`${region} region`);
    } else {
      score -= 100;
      reasons.push(`missing ${region} region`);
    }
  }

  const preferredWords = [
    "heavyweight",
    "garment",
    "premium",
    "comfort colors",
    "bella",
    "canvas",
    "unisex",
    "classic"
  ];
  for (const word of preferredWords) {
    if (text.includes(word)) score += 4;
  }

  if (normalize(product.production?.method) === "dtg" && normalize(template.productionMethod) !== "dtg") {
    score -= 80;
  }

  return { score, reasons };
}

export function chooseColors(template, requestedColors = DEFAULT_COLORS) {
  const available = availableColorVariants(template);
  const chosen = [];

  for (const requested of requestedColors) {
    const wanted = normalize(requested);
    const exact = available.find((variant) => normalize(colorName(variant)) === wanted);
    const fuzzy = exact || available.find((variant) => normalize(colorName(variant)).includes(wanted));
    const blackFallback = wanted === "black"
      ? available.find((variant) => normalize(variant.color?.hex) === "#000000")
      : null;
    const found = fuzzy || blackFallback;
    if (found && !chosen.includes(colorName(found))) chosen.push(colorName(found));
  }

  if (chosen.length === 0 && available[0]) chosen.push(colorName(available[0]));
  return chosen;
}

export function chooseSizes(template, colors, requestedSizes = DEFAULT_SIZES) {
  const colorSet = new Set(colors.map(normalize));
  const available = new Set();

  for (const colorVariant of availableColorVariants(template)) {
    if (colorSet.size > 0 && !colorSet.has(normalize(colorName(colorVariant)))) continue;
    for (const size of availableSizesForColor(colorVariant)) available.add(size);
  }

  const selected = requestedSizes.filter((size) => {
    for (const value of available) {
      if (normalize(value) === normalize(size)) return true;
    }
    return false;
  });

  return selected.length > 0 ? selected : [...available];
}

export function profitMarginFor(product, template, explicitMargin = null) {
  if (Number.isFinite(explicitMargin)) return Math.max(0, roundMoney(explicitMargin));
  if (Number.isFinite(product.publishing?.fourthwall?.profitMargin)) {
    return Math.max(0, roundMoney(product.publishing.fourthwall.profitMargin));
  }

  const targetPrice = Number(product.price || 0) / 100;
  const baseAmount = templateBaseAmount(template);
  if (targetPrice > 0 && baseAmount > 0) return Math.max(0, roundMoney(targetPrice - baseAmount));
  return 10;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

export async function selectTemplate(client, product, options = {}) {
  const requiredRegions = defaultRegionMappings(product).map((mapping) => mapping.region);

  if (options.templateId || product.publishing?.fourthwall?.templateId) {
    const templateId = options.templateId || product.publishing.fourthwall.templateId;
    const template = await getProductTemplate(client, templateId);
    const missingRegions = requiredRegions.filter((region) => !hasAvailableRegion(template, region));
    if (missingRegions.length > 0) {
      throw new Error(
        `${template.name} does not expose required Fourthwall region(s): ${missingRegions.join(", ")}`
      );
    }
    return { template, considered: [{ template, score: 999, reasons: ["explicit template id"] }] };
  }

  const summaries = await listProductTemplates(client);
  const likely = summaries
    .filter((summary) => {
      const text = templateText(summary);
      return (
        text.includes("t-shirt") ||
        text.includes("tee") ||
        normalize(summary.category).includes("apparel/t-shirts")
      );
    })
    .filter((summary) => normalize(summary.productionMethod) === "dtg" || normalize(product.production?.method) !== "dtg")
    .filter((summary) => summary.supportsBackendRendering !== false)
    .filter((summary) => !incompatibleTemplateText(summary));

  const detailed = [];
  for (const summary of likely) {
    try {
      detailed.push(await getProductTemplate(client, summary.productId));
    } catch (error) {
      if (!(error instanceof FourthwallApiError)) throw error;
    }
  }

  const considered = detailed
    .map((template) => ({ template, ...rankTemplate(template, product, requiredRegions) }))
    .sort((left, right) => right.score - left.score);

  const selected = considered.find((item) => item.score > 0);
  if (!selected) {
    throw new Error("No suitable Fourthwall DTG shirt template was found");
  }

  return { template: selected.template, considered };
}

export async function findExistingProduct(client, product) {
  const response = await client.get(`/open-api/v1.0/products?size=20&search=${encodeURIComponent(product.title)}`);
  const matches = response?.results || [];
  const slug = slugify(product.title);
  return matches.find((item) =>
    normalize(item.name) === normalize(product.title) || normalize(item.slug) === slug
  ) || null;
}

export function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uploadImageAsset(client, asset) {
  const fileBytes = await fs.readFile(asset.filePath);
  const upload = await client.post("/open-api/v1.0/media/upload-url", {
    fileName: asset.fileName,
    contentType: IMAGE_CONTENT_TYPE,
    size: fileBytes.byteLength
  });

  const uploadResponse = await client.fetchImpl(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": IMAGE_CONTENT_TYPE,
      "x-goog-content-length-range": `0,${fileBytes.byteLength}`
    },
    body: fileBytes
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`Fourthwall asset upload failed: ${uploadResponse.status} ${body}`);
  }

  return client.post("/open-api/v1.0/media/images", {
    fileUrl: upload.fileUrl,
    width: asset.width,
    height: asset.height
  });
}

export function productUrlFor(shop, product) {
  const domain = shop.publicDomain || shop.domain;
  if (!domain || !product.slug) return "";
  return `https://${domain.replace(/^https?:\/\//, "")}/products/${product.slug}`;
}

export function createDesignProductRequest({ product, template, assets, mediaImages, colors, sizes, profitMargin, publish }) {
  const mediaByPath = new Map(mediaImages.map((image, index) => [assets[index].relativePath, image]));
  const regions = assets.map((asset) => ({
    region: asset.region,
    imageId: mediaByPath.get(asset.relativePath).id,
    placementStrategy: asset.placementStrategy || "AUTO"
  }));

  return {
    type: "design",
    productTemplateId: template.productId,
    name: product.title,
    description: product.summary || product.title,
    regions,
    colors,
    sizes,
    profitMargin,
    publishOnCreate: Boolean(publish)
  };
}

export function applyProviderResultToCatalogProduct(product, result) {
  product.fulfillment = "fourthwall";
  product.providerProduct = {
    provider: "fourthwall",
    productId: result.providerProduct.id,
    customizationId: result.createResponse?.customizationId || result.providerProduct.customizationId || "",
    productTemplateId: result.template.productId,
    productUrl: result.productUrl,
    shopDomain: result.shop.publicDomain || result.shop.domain,
    colors: result.colors,
    sizes: result.sizes,
    regions: result.assets.map((asset) => ({
      region: asset.region,
      artwork: asset.relativePath
    })),
    updatedAt: new Date().toISOString()
  };

  if (result.publish) {
    product.status = "live";
    product.checkoutUrl = result.productUrl;
  }
}

export async function publishProduct(options, deps = {}) {
  const catalog = await readCatalog(deps.catalogPath);
  const product = findProduct(catalog, options.id);
  const validation = await validateProductAssets(product);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }

  const env = deps.env || process.env;
  const auth = getAuthFromEnv(env);
  const client = createFourthwallClient({ apiBase: options.apiBase, auth, fetchImpl: deps.fetchImpl || fetch });

  if (!client) {
    if (options.apply) {
      throw new UserBlockedError(
        "Fourthwall credentials are not configured. Create a Fourthwall API key, then set FOURTHWALL_API_USERNAME and FOURTHWALL_API_PASSWORD, or set FOURTHWALL_API_TOKEN.",
        "MISSING_FOURTHWALL_CREDENTIALS"
      );
    }

    return {
      mode: "dry-run",
      blocked: true,
      blockReason: "Missing Fourthwall credentials",
      storeProduct: product,
      validation,
      assets: validation.assets
    };
  }

  const shop = await client.get("/open-api/v1.0/shops/current");
  const existing = options.forceNew ? null : await findExistingProduct(client, product);
  const { template, considered } = await selectTemplate(client, product, options);
  const colors = chooseColors(template, options.colors || product.publishing?.fourthwall?.colors || DEFAULT_COLORS);
  const sizes = chooseSizes(template, colors, options.sizes || product.publishing?.fourthwall?.sizes || DEFAULT_SIZES);
  const profitMargin = profitMarginFor(product, template, options.profitMargin);

  if (options.dryRun) {
    return {
      mode: "dry-run",
      blocked: false,
      storeProduct: product,
      validation,
      shop,
      existing,
      template,
      considered: considered.slice(0, options.limit),
      assets: validation.assets,
      colors,
      sizes,
      profitMargin,
      publish: options.publish
    };
  }

  let createdProduct = existing;
  let createResponse = null;
  const mediaImages = [];

  if (!createdProduct) {
    for (const asset of validation.assets) {
      mediaImages.push(await uploadImageAsset(client, asset));
    }

    const request = createDesignProductRequest({
      product,
      template,
      assets: validation.assets,
      mediaImages,
      colors,
      sizes,
      profitMargin,
      publish: options.publish
    });

    createResponse = await client.post("/open-api/v1.0/products", request);
    const productId = createResponse.productId;
    createdProduct = await client.get(`/open-api/v1.0/products/${encodeURIComponent(productId)}`);
  }

  if (options.publish) {
    await client.put(`/open-api/v1.0/products/${encodeURIComponent(createdProduct.id)}/state`, { state: "PUBLIC" });
    await client.put(`/open-api/v1.0/products/${encodeURIComponent(createdProduct.id)}/availability`, { available: true });
    createdProduct = await client.get(`/open-api/v1.0/products/${encodeURIComponent(createdProduct.id)}`);
  }

  const productUrl = productUrlFor(shop, createdProduct);
  const result = {
    mode: "apply",
    storeProduct: product,
    validation,
    shop,
    existing,
    template,
    assets: validation.assets,
    colors,
    sizes,
    profitMargin,
    publish: options.publish,
    createResponse,
    providerProduct: createdProduct,
    productUrl
  };

  if (options.updateCatalog) {
    applyProviderResultToCatalogProduct(product, result);
    catalog.provider = {
      recommended: "fourthwall",
      mode: "api-published-hosted-product-links",
      notes: "Use npm run store:publish to upload artwork, create the Fourthwall product, and write checkoutUrl."
    };
    await writeCatalog(catalog, deps.catalogPath);
  }

  return result;
}

export async function discoverTemplates(options, deps = {}) {
  const env = deps.env || process.env;
  const auth = getAuthFromEnv(env);
  const client = createFourthwallClient({ apiBase: options.apiBase, auth, fetchImpl: deps.fetchImpl || fetch });
  if (!client) {
    throw new UserBlockedError(
      "Fourthwall credentials are not configured. Discovery needs FOURTHWALL_API_USERNAME/FOURTHWALL_API_PASSWORD or FOURTHWALL_API_TOKEN.",
      "MISSING_FOURTHWALL_CREDENTIALS"
    );
  }

  const templates = await listProductTemplates(client);
  const query = normalize(options.query || "shirt");
  return templates
    .filter((template) => templateText(template).includes(query))
    .slice(0, options.limit)
    .map((template) => ({
      productId: template.productId,
      name: template.name,
      brand: template.brand,
      category: template.category,
      productionMethod: template.productionMethod,
      supportsBackendRendering: template.supportsBackendRendering,
      basePrice: template.basePrice || template.priceFrom || null
    }));
}

export function printResult(result) {
  if (result.mode === "dry-run" && result.blocked) {
    console.log(`Dry run for ${result.storeProduct.title}`);
    console.log("Local product files are ready.");
    for (const asset of result.assets) {
      console.log(`- ${asset.region}: ${asset.relativePath} (${asset.width}x${asset.height}, ${Math.round(asset.size / 1024)} KB)`);
    }
    console.log("");
    console.log("Blocked before live publishing: Fourthwall credentials are not configured.");
    console.log("Set FOURTHWALL_API_USERNAME and FOURTHWALL_API_PASSWORD, or FOURTHWALL_API_TOKEN, then rerun with --apply --publish.");
    console.log("You can put those values in an ignored .env.local file so this is a one-time setup.");
    return;
  }

  if (result.mode === "dry-run") {
    console.log(`Dry run for ${result.storeProduct.title}`);
    console.log(`Shop: ${result.shop.name} (${result.shop.publicDomain || result.shop.domain})`);
    console.log(`Template: ${result.template.name} (${result.template.productId})`);
    console.log(`Colors: ${result.colors.join(", ")}`);
    console.log(`Sizes: ${result.sizes.join(", ")}`);
    console.log(`Profit margin: $${result.profitMargin.toFixed(2)}`);
    console.log(`Publish on create: ${result.publish ? "yes" : "no"}`);
    console.log("Assets:");
    for (const asset of result.assets) {
      console.log(`- ${asset.region}: ${asset.relativePath} (${asset.width}x${asset.height})`);
    }
    if (result.existing) console.log(`Existing product match: ${result.existing.name} (${result.existing.id})`);
    console.log("");
    console.log("Run with --apply --publish to create/publish and update store/products.json.");
    return;
  }

  console.log(`Fourthwall product ready: ${result.providerProduct.name}`);
  console.log(`Product id: ${result.providerProduct.id}`);
  console.log(`Product URL: ${result.productUrl}`);
  console.log(`Published: ${result.publish ? "yes" : "no"}`);
  if (result.publish) console.log("store/products.json was updated to live.");
}

export async function main(argv = process.argv.slice(2)) {
  await loadLocalEnvFiles();
  const options = parseArgs(argv);

  if (options.command === "help") {
    console.log(`Usage:
  npm run store:publish -- --id small-useful-light-tee --dry-run
  npm run store:publish -- --id small-useful-light-tee --apply --publish
  npm run store:fourthwall -- doctor --id small-useful-light-tee
  npm run store:fourthwall -- discover --query shirt

Credentials:
  FOURTHWALL_API_USERNAME and FOURTHWALL_API_PASSWORD, or FOURTHWALL_API_TOKEN
  Optional: save them in .env.local for reuse
`);
    return;
  }

  if (options.command === "validate") {
    const catalog = await readCatalog();
    const product = findProduct(catalog, options.id);
    const validation = await validateProductAssets(product);
    if (options.json) console.log(JSON.stringify(validation, null, 2));
    else {
      console.log(validation.ok ? "Product assets are valid." : "Product assets have errors.");
      for (const error of validation.errors) console.log(`error: ${error}`);
      for (const warning of validation.warnings) console.log(`warning: ${warning}`);
      for (const asset of validation.assets) console.log(`${asset.region}: ${asset.relativePath} (${asset.width}x${asset.height})`);
    }
    if (!validation.ok) process.exitCode = 1;
    return;
  }

  if (options.command === "doctor" || options.command === "verify") {
    const result = await publishProduct({
      ...options,
      apply: false,
      dryRun: true,
      publish: false
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printResult(result);
    return;
  }

  if (options.command === "discover") {
    const result = await discoverTemplates(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const template of result) {
        const price = template.basePrice ? `$${Number(template.basePrice.amount).toFixed(2)} ${template.basePrice.currency}` : "unknown base";
        console.log(`${template.productId} | ${template.name} | ${template.brand} | ${template.productionMethod} | ${price}`);
      }
    }
    return;
  }

  if (options.command !== "publish") {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const result = await publishProduct(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printResult(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    if (error instanceof UserBlockedError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
