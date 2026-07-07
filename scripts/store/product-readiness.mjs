import fs from "node:fs";
import path from "node:path";
import { root } from "./env.mjs";

const PRINTFUL_API = "https://api.printful.com";
const PNG_SIGNATURE = "89504e470d0a1a0a";
const PRINT_PLACEMENT_REQUIREMENTS = {
  front: {
    minWidth: 1000,
    minHeight: 1000,
    alpha: true
  },
  back: {
    minWidth: 3000,
    minHeight: 3000,
    alpha: true
  }
};

export function pngInfo(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("not a PNG file");
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    hasAlpha: bytes[25] === 4 || bytes[25] === 6
  };
}

function storeAssetPath(assetPath, projectRoot = root) {
  return path.join(projectRoot, "store", String(assetPath || ""));
}

function imageIssues({ assetPath, label, requirements = {}, projectRoot = root }) {
  const issues = [];
  if (!assetPath) {
    issues.push(`${label} is missing`);
    return issues;
  }

  const filePath = storeAssetPath(assetPath, projectRoot);
  if (!fs.existsSync(filePath)) {
    issues.push(`${label} asset does not exist: ${assetPath}`);
    return issues;
  }

  if (path.extname(assetPath).toLowerCase() !== ".png") {
    issues.push(`${label} should be a PNG asset for Printful: ${assetPath}`);
    return issues;
  }

  try {
    const info = pngInfo(filePath);
    if (requirements.minWidth && info.width < requirements.minWidth) {
      issues.push(`${label} width ${info.width}px is below ${requirements.minWidth}px`);
    }
    if (requirements.minHeight && info.height < requirements.minHeight) {
      issues.push(`${label} height ${info.height}px is below ${requirements.minHeight}px`);
    }
    if (requirements.alpha && !info.hasAlpha) {
      issues.push(`${label} should include alpha transparency for garment printing`);
    }
  } catch (error) {
    issues.push(`${label} could not be inspected: ${error.message}`);
  }

  return issues;
}

export function productAssetIssues(product, { projectRoot = root } = {}) {
  const issues = [];
  if (product.image) {
    issues.push(
      ...imageIssues({
        assetPath: product.image,
        label: `${product.id} storefront image`,
        requirements: { minWidth: 800, minHeight: 800 },
        projectRoot
      })
    );
  }

  const production = product.production || {};
  const fulfillment = product.embeddedFulfillment || {};
  const placements = Object.values(fulfillment.variants || {})
    .flatMap((variant) => [variant.frontPlacement, variant.backPlacement])
    .filter((placement) => placement !== false && placement);
  const needsFront = placements.includes("front");
  const needsBack = placements.includes("back");

  if (needsFront) {
    issues.push(
      ...imageIssues({
        assetPath: production.frontArtwork,
        label: `${product.id} front artwork`,
        requirements: PRINT_PLACEMENT_REQUIREMENTS.front,
        projectRoot
      })
    );
  }

  if (needsBack) {
    issues.push(
      ...imageIssues({
        assetPath: production.backArtwork,
        label: `${product.id} back artwork`,
        requirements: PRINT_PLACEMENT_REQUIREMENTS.back,
        projectRoot
      })
    );
  }

  return issues;
}

export function localProductReadinessIssues(product, catalog) {
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
  if (!Number.isInteger(fulfillment.catalogProductId)) {
    issues.push("missing Printful catalogProductId");
  }

  const mapped = fulfillment.variants || {};
  for (const variant of product.variants || []) {
    const providerVariant = mapped[variant.id];
    if (!providerVariant) {
      issues.push(`${variant.id} missing provider mapping`);
      continue;
    }
    if (!Number.isInteger(providerVariant.catalogVariantId)) {
      issues.push(`${variant.id} missing Printful catalogVariantId`);
    }
    for (const key of ["frontPlacement", "backPlacement"]) {
      const placement = providerVariant[key];
      if (placement !== undefined && placement !== false && !["front", "back"].includes(placement)) {
        issues.push(`${variant.id} uses unsupported ${key}: ${placement}`);
      }
    }
  }

  issues.push(...productAssetIssues(product));

  if (!catalog?.products?.some((candidate) => candidate.id === product.id)) {
    issues.push(`${product.id} is not present in catalog`);
  }

  return issues;
}

export async function fetchPrintfulCatalogProduct(catalogProductId, fetchImpl = fetch) {
  const response = await fetchImpl(`${PRINTFUL_API}/products/${encodeURIComponent(catalogProductId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.result || `Printful catalog request failed: ${response.status}`);
  }
  return data.result || {};
}

function redactSecret(text, secret) {
  return String(text || "").split(String(secret || "")).join("[redacted]");
}

export async function verifyPrintfulApiToken({ apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("PRINTFUL_API_KEY is missing.");

  const response = await fetchImpl(`${PRINTFUL_API}/v2/oauth-scopes`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.result || data.data || `Printful auth request failed: ${response.status}`;
    throw new Error(redactSecret(detail, apiKey));
  }

  const scopes = Array.isArray(data.data) ? data.data : [];
  return {
    scopes,
    scopeValues: scopes.map((scope) => scope.value).filter(Boolean)
  };
}

export function printfulCatalogIssues(product, printfulProduct) {
  const issues = [];
  const catalogProductId = product.embeddedFulfillment?.catalogProductId;
  const remoteProduct = printfulProduct.product || {};
  const remoteVariants = printfulProduct.variants || [];
  const remoteVariantById = new Map(remoteVariants.map((variant) => [variant.id, variant]));
  const fileTypes = new Set((remoteProduct.files || []).map((file) => file.type || file.id).filter(Boolean));
  const allowedCountries = new Set(product.checkout?.allowedCountries || []);

  if (remoteProduct.id !== catalogProductId) {
    issues.push(`Printful product id mismatch: expected ${catalogProductId}, got ${remoteProduct.id || "missing"}`);
  }
  if (remoteProduct.is_discontinued) {
    issues.push(`${remoteProduct.title || catalogProductId} is discontinued in Printful catalog`);
  }

  for (const [storeVariantId, mapping] of Object.entries(product.embeddedFulfillment?.variants || {})) {
    const storeVariant = (product.variants || []).find((variant) => variant.id === storeVariantId);
    const remoteVariant = remoteVariantById.get(mapping.catalogVariantId);
    if (!remoteVariant) {
      issues.push(`${storeVariantId} Printful variant ${mapping.catalogVariantId} was not found`);
      continue;
    }

    const color = storeVariant?.options?.Color;
    const size = storeVariant?.options?.Size;
    if (color && remoteVariant.color && remoteVariant.color !== color) {
      issues.push(`${storeVariantId} color mismatch: expected ${color}, got ${remoteVariant.color}`);
    }
    if (size && remoteVariant.size && remoteVariant.size !== size) {
      issues.push(`${storeVariantId} size mismatch: expected ${size}, got ${remoteVariant.size}`);
    }
    if (remoteVariant.in_stock === false) {
      issues.push(`${storeVariantId} is out of stock in Printful catalog`);
    }

    for (const country of allowedCountries) {
      const availability = remoteVariant.availability_status?.find((entry) => entry.region === country);
      if (availability && availability.status !== "in_stock") {
        issues.push(`${storeVariantId} is ${availability.status} for ${country}`);
      }
    }

    for (const placement of [mapping.frontPlacement, mapping.backPlacement]) {
      if (placement !== false && placement && !fileTypes.has(placement)) {
        issues.push(`${storeVariantId} placement ${placement} is not supported by Printful product ${catalogProductId}`);
      }
    }
  }

  return issues;
}
