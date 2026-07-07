import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FulfillmentError, fulfillStripeSessionWithPrintful, printfulOrderId } from "./fulfillment.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const catalogPath = path.join(root, "store", "products.json");

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-03-25.dahlia";
const MAX_QUANTITY = 10;

export class StoreCheckoutError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.name = "StoreCheckoutError";
    this.status = status;
    this.details = details;
  }
}

export async function loadCatalog(filePath = catalogPath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function encodeCartMetadata(lines) {
  return Buffer.from(JSON.stringify(lines), "utf8").toString("base64url");
}

export function decodeCartMetadata(value) {
  if (!value) return [];
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreCheckoutError(message);
  }
}

function productUrl(publicUrl, product) {
  const base = String(publicUrl || "https://bensonperry.com").replace(/\/+$/, "");
  const image = String(product.image || "").replace(/^\/+/, "");
  return `${base}/store/${image}`;
}

function lineTitle(product, variant) {
  return variant?.label ? `${product.title} - ${variant.label}` : product.title;
}

export function resolveCart(catalog, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new StoreCheckoutError("Cart is empty.");
  }

  const products = new Map((catalog.products || []).map((product) => [product.id, product]));
  const lines = [];

  for (const item of rawItems) {
    assertPlainObject(item, "Cart item must be an object.");
    const product = products.get(item.productId);
    if (!product) throw new StoreCheckoutError(`Unknown product: ${item.productId}`);
    if (product.status !== "live") throw new StoreCheckoutError(`${product.title} is not live.`);

    const quantity = Number(item.quantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new StoreCheckoutError(`${product.title} quantity must be between 1 and ${MAX_QUANTITY}.`);
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find((candidate) => candidate.id === item.variantId) || null;
    if (variants.length && !variant) throw new StoreCheckoutError(`${product.title} requires a valid variant.`);
    if (variant && variant.available === false) throw new StoreCheckoutError(`${variant.label} is unavailable.`);

    const price = Number(variant?.price ?? product.price);
    if (!Number.isInteger(price) || price < 0) throw new StoreCheckoutError(`${product.title} has an invalid price.`);

    lines.push({
      productId: product.id,
      variantId: variant?.id || null,
      sku: variant?.sku || product.id,
      title: lineTitle(product, variant),
      productTitle: product.title,
      variantLabel: variant?.label || "",
      quantity,
      unitAmount: price,
      currency: String(product.currency || "USD").toLowerCase(),
      image: product.image || "",
      fulfillmentReady: product.embeddedFulfillment?.status === "ready",
      fulfillmentProvider: product.embeddedFulfillment?.recommended || null
    });
  }

  return lines;
}

export function ensureFulfillmentReady(lines, env = process.env) {
  if (env.STORE_ALLOW_UNFULFILLED_CHECKOUT === "true") return;
  const missing = lines.filter((line) => !line.fulfillmentReady);
  if (missing.length) {
    throw new StoreCheckoutError(
      "Embedded checkout is not ready for live orders because fulfillment mapping is missing.",
      409,
      { products: missing.map((line) => line.productId) }
    );
  }

  const missingCredentials = [...new Set(lines.map((line) => line.fulfillmentProvider))].flatMap((provider) => {
    if (provider !== "printful") return [];
    return [
      !env.PRINTFUL_API_KEY ? "printful-api-key" : null,
      !env.PRINTFUL_STORE_ID ? "printful-store-id" : null
    ].filter(Boolean);
  });
  if (missingCredentials.length) {
    throw new StoreCheckoutError(
      "Embedded checkout is not ready for live orders because fulfillment credentials are missing.",
      503,
      { providers: missingCredentials }
    );
  }
}

export function checkoutAllowedCountries(catalog, lines) {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const products = productIds
    .map((productId) => (catalog.products || []).find((product) => product.id === productId))
    .filter(Boolean);
  const countrySets = products.map((product) => {
    const countries = (product.checkout?.allowedCountries || [])
      .filter(Boolean)
      .map((country) => String(country).toUpperCase());
    return new Set(countries.length ? countries : ["US"]);
  });

  if (!countrySets.length) return ["US"];

  const shared = [...countrySets[0]].filter((country) => countrySets.every((set) => set.has(country)));
  if (!shared.length) {
    throw new StoreCheckoutError("Cart products do not share a supported shipping country.", 409, {
      products: productIds
    });
  }

  return shared;
}

export function checkoutShippingOptions(catalog, lines) {
  const productIds = new Set(lines.map((line) => line.productId));
  const currency = lines[0]?.currency || "usd";
  const products = (catalog.products || []).filter((product) => productIds.has(product.id));
  const hasIncludedStandard = products.some((product) => product.checkout?.shipping?.strategy === "included-us-standard");
  if (!hasIncludedStandard) return [];

  const label =
    products.find((product) => product.checkout?.shipping?.strategy === "included-us-standard")?.checkout?.shipping?.label ||
    "US standard shipping included";

  return [
    {
      strategy: "included-us-standard",
      label,
      amount: 0,
      currency
    }
  ];
}

export function checkoutConfig(env = process.env) {
  const stripeConfigured = Boolean(env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_SECRET_KEY);
  const fulfillmentReady = Boolean((env.PRINTFUL_API_KEY && env.PRINTFUL_STORE_ID) || env.STORE_ALLOW_UNFULFILLED_CHECKOUT === "true");
  const walletDomainReady = env.STRIPE_WALLET_DOMAIN_READY === "true";
  const paymentMethodsReady = env.STRIPE_PAYMENT_METHODS_READY === "true";

  return {
    mode: "stripe-embedded",
    configured: stripeConfigured,
    fulfillmentReady,
    fulfillment: {
      provider: "printful",
      status: fulfillmentReady ? "configured" : !env.PRINTFUL_API_KEY ? "needs-printful-api-key" : "needs-printful-store-id"
    },
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY || null,
    payments: {
      card: {
        provider: "stripe",
        status: stripeConfigured ? "configured" : "needs-stripe-keys"
      },
      wallets: {
        applePay: {
          provider: "stripe",
          status: stripeConfigured && walletDomainReady ? "eligible" : "needs-stripe-keys-or-domain-registration"
        },
        googlePay: {
          provider: "stripe",
          status: stripeConfigured && paymentMethodsReady ? "eligible" : "needs-stripe-keys-or-payment-method-domain"
        },
        link: {
          provider: "stripe",
          status: stripeConfigured && paymentMethodsReady ? "eligible" : "needs-stripe-keys-or-payment-method-domain"
        }
      },
      shopPay: {
        provider: "shopify",
        configured: Boolean(env.SHOP_PAY_CLIENT_ID),
        status: env.SHOP_PAY_CLIENT_ID ? "optional-ready-to-integrate" : "needs-shopify-wallet-setup"
      }
    },
    shopPay: {
      configured: Boolean(env.SHOP_PAY_CLIENT_ID),
      status: env.SHOP_PAY_CLIENT_ID ? "optional-ready-to-integrate" : "needs-shopify-wallet-setup"
    }
  };
}

async function getFulfillmentRecord(store, key) {
  if (!store?.get) return null;
  const value = await store.get(key);
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

async function putFulfillmentRecord(store, key, value) {
  if (!store?.put) return;
  await store.put(key, JSON.stringify(value));
}

export function assertStripeSessionId(sessionId) {
  const value = String(sessionId || "");
  if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(value)) {
    throw new StoreCheckoutError("Invalid session ID.");
  }
  return value;
}

export function fulfillmentRecordKey(sessionId) {
  return `stripe:${assertStripeSessionId(sessionId)}:fulfillment`;
}

export async function fulfillmentStatus(sessionId, orderStore = null) {
  const key = fulfillmentRecordKey(sessionId);
  const record = await getFulfillmentRecord(orderStore, key);
  return {
    status: record?.status || "missing",
    key,
    fulfillment: record || null
  };
}

export function buildStripeCheckoutSessionParams({ catalog, items, env = process.env }) {
  const publicUrl = env.STORE_PUBLIC_URL || "https://bensonperry.com";
  const lines = resolveCart(catalog, items);
  ensureFulfillmentReady(lines, env);

  const params = new URLSearchParams();
  params.set("ui_mode", "embedded_page");
  params.set("mode", "payment");
  params.set("submit_type", "pay");
  params.set("payment_method_types[0]", "card");
  params.set("return_url", `${publicUrl.replace(/\/+$/, "")}/store/?checkout=return&session_id={CHECKOUT_SESSION_ID}`);
  params.set("customer_creation", "always");
  params.set("metadata[cart]", encodeCartMetadata(lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    sku: line.sku,
    quantity: line.quantity
  }))));

  if (env.STRIPE_AUTOMATIC_TAX === "true") {
    params.set("automatic_tax[enabled]", "true");
  }

  checkoutAllowedCountries(catalog, lines).forEach((country, index) => {
    params.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  });

  checkoutShippingOptions(catalog, lines).forEach((option, index) => {
    params.set(`shipping_options[${index}][shipping_rate_data][display_name]`, option.label);
    params.set(`shipping_options[${index}][shipping_rate_data][type]`, "fixed_amount");
    params.set(`shipping_options[${index}][shipping_rate_data][fixed_amount][amount]`, String(option.amount));
    params.set(`shipping_options[${index}][shipping_rate_data][fixed_amount][currency]`, option.currency);
    params.set(`shipping_options[${index}][shipping_rate_data][metadata][strategy]`, option.strategy);
  });

  lines.forEach((line, index) => {
    params.set(`line_items[${index}][price_data][currency]`, line.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, line.title);
    if (line.image) {
      params.set(`line_items[${index}][price_data][product_data][images][0]`, productUrl(publicUrl, line));
    }
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
  });

  return { params, lines };
}

async function stripeRequest(pathname, { secretKey, method = "GET", body, apiVersion = STRIPE_API_VERSION } = {}) {
  if (!secretKey) throw new StoreCheckoutError("Stripe secret key is not configured.", 503);

  const response = await fetch(`${STRIPE_API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": apiVersion,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new StoreCheckoutError(data.error?.message || "Stripe request failed.", response.status, data);
  }

  return data;
}

export async function createStripeCheckoutSession({ catalog, items, env = process.env }) {
  const { params, lines } = buildStripeCheckoutSessionParams({ catalog, items, env });
  const session = await stripeRequest("/checkout/sessions", {
    secretKey: env.STRIPE_SECRET_KEY,
    method: "POST",
    body: params,
    apiVersion: env.STRIPE_API_VERSION || STRIPE_API_VERSION
  });

  return {
    id: session.id,
    clientSecret: session.client_secret,
    lines
  };
}

export async function retrieveStripeSession(sessionId, env = process.env) {
  const value = assertStripeSessionId(sessionId);
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(value)}`, {
    secretKey: env.STRIPE_SECRET_KEY,
    apiVersion: env.STRIPE_API_VERSION || STRIPE_API_VERSION
  });
}

export function verifyStripeWebhookSignature(payload, signatureHeader, secret, toleranceSeconds = 300) {
  if (!secret) throw new StoreCheckoutError("Stripe webhook secret is not configured.", 503);
  if (!signatureHeader) throw new StoreCheckoutError("Missing Stripe signature.", 400);

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = Number(parts.t);
  const expected = parts.v1;
  if (!timestamp || !expected) throw new StoreCheckoutError("Invalid Stripe signature.", 400);

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) throw new StoreCheckoutError("Stale Stripe signature.", 400);

  const signedPayload = `${timestamp}.${payload}`;
  const actual = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new StoreCheckoutError("Invalid Stripe signature.", 400);
  }

  return true;
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function errorResponse(error) {
  const status = error instanceof StoreCheckoutError || error instanceof FulfillmentError ? error.status : 500;
  return jsonResponse(
    {
      error: error.message || "Unexpected checkout error.",
      details: error.details || {}
    },
    status
  );
}

export async function fulfillStripeCheckoutSession({ catalog, session, env = process.env, fetchImpl = fetch, orderStore = null }) {
  const key = fulfillmentRecordKey(session?.id);
  const existing = await getFulfillmentRecord(orderStore, key);
  if (existing?.status === "succeeded" || existing?.status === "processing") {
    return {
      idempotent: true,
      provider: existing.provider,
      key,
      record: existing
    };
  }

  const items = decodeCartMetadata(session?.metadata?.cart);
  const lines = resolveCart(catalog, items);
  const providers = new Set(lines.map((line) => line.fulfillmentProvider));
  if (providers.size !== 1 || !providers.has("printful")) {
    throw new FulfillmentError("Checkout session does not map cleanly to Printful fulfillment.", 409, {
      providers: [...providers]
    });
  }

  await putFulfillmentRecord(orderStore, key, {
    status: "processing",
    stripeSessionId: session?.id,
    provider: "printful",
    updatedAt: new Date().toISOString()
  });

  try {
    const result = await fulfillStripeSessionWithPrintful({ catalog, cartLines: lines, session, env, fetchImpl });
    const record = {
      status: "succeeded",
      stripeSessionId: session?.id,
      provider: result.provider,
      providerExternalId: result.externalId,
      providerOrderId: printfulOrderId(result.created),
      providerConfirmationStatus: result.confirmationStatus,
      updatedAt: new Date().toISOString()
    };
    await putFulfillmentRecord(orderStore, key, record);
    return {
      idempotent: false,
      provider: result.provider,
      externalId: result.externalId,
      created: result.created,
      confirmed: result.confirmed,
      confirmationStatus: result.confirmationStatus,
      key,
      record,
      result
    };
  } catch (error) {
    await putFulfillmentRecord(orderStore, key, {
      status: "failed",
      stripeSessionId: session?.id,
      provider: "printful",
      message: error.message,
      updatedAt: new Date().toISOString()
    });
    throw error;
  }
}

export async function handleStoreApiRequest(request, { env = process.env, catalogFile = catalogPath, orderStore = null, fetchImpl = fetch } = {}) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": env.STORE_CORS_ORIGIN || "https://bensonperry.com",
          "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    if (request.method === "GET" && pathname.endsWith("/api/store/config")) {
      return jsonResponse(checkoutConfig(env));
    }

    if (request.method === "POST" && pathname.endsWith("/api/store/checkout-session")) {
      const body = await request.json().catch(() => null);
      assertPlainObject(body, "Checkout request must be JSON.");
      const catalog = await loadCatalog(catalogFile);
      const session = await createStripeCheckoutSession({ catalog, items: body.items, env });
      return jsonResponse({ id: session.id, clientSecret: session.clientSecret });
    }

    if (request.method === "GET" && pathname.endsWith("/api/store/session-status")) {
      const session = await retrieveStripeSession(url.searchParams.get("session_id"), env);
      return jsonResponse({
        status: session.status,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email || null
      });
    }

    if (request.method === "GET" && pathname.endsWith("/api/store/order-status")) {
      return jsonResponse(await fulfillmentStatus(url.searchParams.get("session_id"), orderStore));
    }

    if (request.method === "POST" && pathname.endsWith("/api/store/webhook/stripe")) {
      const payload = await request.text();
      verifyStripeWebhookSignature(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
      const event = JSON.parse(payload);
      let fulfillment = "ignored";
      if (event.type === "checkout.session.completed") {
        const catalog = await loadCatalog(catalogFile);
        fulfillment = await fulfillStripeCheckoutSession({ catalog, session: event.data?.object, env, orderStore, fetchImpl });
      }
      return jsonResponse({
        received: true,
        event: event.type,
        fulfillment
      });
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
