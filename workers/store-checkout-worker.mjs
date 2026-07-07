import catalog from "../store/products.json";
import { FulfillmentError, fulfillStripeSessionWithPrintful } from "../scripts/store/fulfillment.mjs";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-03-25.dahlia";
const MAX_QUANTITY = 10;

class StoreCheckoutError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.STORE_CORS_ORIGIN || "https://bensonperry.com",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function encodeCartMetadata(lines) {
  const jsonText = JSON.stringify(lines);
  const bytes = new TextEncoder().encode(jsonText);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreCheckoutError(message);
  }
}

function absoluteImageUrl(env, line) {
  const base = String(env.STORE_PUBLIC_URL || "https://bensonperry.com").replace(/\/+$/, "");
  return `${base}/store/${String(line.image || "").replace(/^\/+/, "")}`;
}

function resolveCart(rawItems) {
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
      title: variant?.label ? `${product.title} - ${variant.label}` : product.title,
      fulfillmentProvider: product.embeddedFulfillment?.recommended || null,
      quantity,
      unitAmount: price,
      currency: String(product.currency || "USD").toLowerCase(),
      image: product.image || "",
      fulfillmentReady: product.embeddedFulfillment?.status === "ready"
    });
  }

  return lines;
}

function decodeCartMetadata(value) {
  if (!value) return [];
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function assertStripeSessionId(sessionId) {
  const value = String(sessionId || "");
  if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(value)) {
    throw new StoreCheckoutError("Invalid session ID.");
  }
  return value;
}

function fulfillmentRecordKey(sessionId) {
  return `stripe:${assertStripeSessionId(sessionId)}:fulfillment`;
}

async function fulfillmentStatus(sessionId, env) {
  const key = fulfillmentRecordKey(sessionId);
  const record = env.STORE_ORDERS ? await env.STORE_ORDERS.get(key, { type: "json" }) : null;
  return {
    status: record?.status || "missing",
    key,
    fulfillment: record || null
  };
}

async function fulfillCheckoutSession(session, env) {
  const key = fulfillmentRecordKey(session?.id);
  const existing = env.STORE_ORDERS ? await env.STORE_ORDERS.get(key, { type: "json" }) : null;
  if (existing?.status === "succeeded" || existing?.status === "processing") {
    return {
      idempotent: true,
      provider: existing.provider,
      key,
      record: existing
    };
  }

  const items = decodeCartMetadata(session?.metadata?.cart);
  const lines = resolveCart(items);
  const providers = new Set(lines.map((line) => line.fulfillmentProvider));
  if (providers.size !== 1 || !providers.has("printful")) {
    throw new FulfillmentError("Checkout session does not map cleanly to Printful fulfillment.", 409, {
      providers: [...providers]
    });
  }

  if (env.STORE_ORDERS) {
    await env.STORE_ORDERS.put(
      key,
      JSON.stringify({
        status: "processing",
        stripeSessionId: session?.id,
        provider: "printful",
        updatedAt: new Date().toISOString()
      })
    );
  }

  try {
    const result = await fulfillStripeSessionWithPrintful({ catalog, cartLines: lines, session, env, fetchImpl: fetch });
    const record = {
      status: "succeeded",
      stripeSessionId: session?.id,
      provider: result.provider,
      providerExternalId: result.externalId,
      providerOrderId: result.created?.id || result.created?.result?.id || null,
      updatedAt: new Date().toISOString()
    };
    if (env.STORE_ORDERS) await env.STORE_ORDERS.put(key, JSON.stringify(record));
    return {
      idempotent: false,
      provider: result.provider,
      externalId: result.externalId,
      created: result.created,
      key,
      record,
      result
    };
  } catch (error) {
    if (env.STORE_ORDERS) {
      await env.STORE_ORDERS.put(
        key,
        JSON.stringify({
          status: "failed",
          stripeSessionId: session?.id,
          provider: "printful",
          message: error.message,
          updatedAt: new Date().toISOString()
        })
      );
    }
    throw error;
  }
}

function ensureFulfillmentReady(lines, env) {
  if (env.STORE_ALLOW_UNFULFILLED_CHECKOUT === "true") return;
  const missing = lines.filter((line) => !line.fulfillmentReady);
  if (missing.length) {
    throw new StoreCheckoutError(
      "Embedded checkout is not ready for live orders because fulfillment mapping is missing.",
      409,
      { products: missing.map((line) => line.productId) }
    );
  }

  const missingCredentials = [...new Set(lines.map((line) => line.fulfillmentProvider))]
    .filter((provider) => provider === "printful" && !env.PRINTFUL_API_KEY);
  if (missingCredentials.length) {
    throw new StoreCheckoutError(
      "Embedded checkout is not ready for live orders because fulfillment credentials are missing.",
      503,
      { providers: missingCredentials }
    );
  }
}

function checkoutConfig(env) {
  const stripeConfigured = Boolean(env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_SECRET_KEY);
  const walletDomainReady = env.STRIPE_WALLET_DOMAIN_READY === "true";
  const paymentMethodsReady = env.STRIPE_PAYMENT_METHODS_READY === "true";

  return {
    mode: "stripe-embedded",
    configured: stripeConfigured,
    fulfillmentReady: env.STORE_ALLOW_UNFULFILLED_CHECKOUT === "true",
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
          status: stripeConfigured && paymentMethodsReady ? "eligible" : "needs-stripe-keys-or-payment-method-activation"
        },
        link: {
          provider: "stripe",
          status: stripeConfigured ? "eligible" : "needs-stripe-keys"
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

function buildCheckoutParams(items, env) {
  const publicUrl = env.STORE_PUBLIC_URL || "https://bensonperry.com";
  const lines = resolveCart(items);
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

  params.set("shipping_address_collection[allowed_countries][0]", "US");

  lines.forEach((line, index) => {
    params.set(`line_items[${index}][price_data][currency]`, line.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, line.title);
    if (line.image) {
      params.set(`line_items[${index}][price_data][product_data][images][0]`, absoluteImageUrl(env, line));
    }
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
  });

  return params;
}

async function stripeRequest(path, env, options = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new StoreCheckoutError("Stripe secret key is not configured.", 503);

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": env.STRIPE_API_VERSION || STRIPE_API_VERSION,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new StoreCheckoutError(data.error?.message || "Stripe request failed.", response.status, data);
  }
  return data;
}

async function verifyWebhook(payload, signatureHeader, secret) {
  if (!secret) throw new StoreCheckoutError("Stripe webhook secret is not configured.", 503);
  if (!signatureHeader) throw new StoreCheckoutError("Missing Stripe signature.", 400);

  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  const timestamp = Number(parts.t);
  const expected = parts.v1;
  if (!timestamp || !expected) throw new StoreCheckoutError("Invalid Stripe signature.", 400);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const actual = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new StoreCheckoutError("Invalid Stripe signature.", 400);
}

async function handle(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });

  if (request.method === "GET" && pathname.endsWith("/api/store/config")) {
    return json(checkoutConfig(env));
  }

  if (request.method === "POST" && pathname.endsWith("/api/store/checkout-session")) {
    const body = await request.json().catch(() => null);
    assertPlainObject(body, "Checkout request must be JSON.");
    const params = buildCheckoutParams(body.items, env);
    const session = await stripeRequest("/checkout/sessions", env, { method: "POST", body: params });
    return json({ id: session.id, clientSecret: session.client_secret });
  }

  if (request.method === "GET" && pathname.endsWith("/api/store/session-status")) {
    const sessionId = assertStripeSessionId(url.searchParams.get("session_id"));
    const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, env);
    return json({
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || null
    });
  }

  if (request.method === "GET" && pathname.endsWith("/api/store/order-status")) {
    return json(await fulfillmentStatus(url.searchParams.get("session_id"), env));
  }

  if (request.method === "POST" && pathname.endsWith("/api/store/webhook/stripe")) {
    const payload = await request.text();
    await verifyWebhook(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
    const event = JSON.parse(payload);
    let fulfillment = "ignored";
    if (event.type === "checkout.session.completed") {
      fulfillment = await fulfillCheckoutSession(event.data?.object, env);
    }
    return json({
      received: true,
      event: event.type,
      fulfillment
    });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const response = await handle(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors(env))) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return json(
        {
          error: error.message || "Unexpected checkout error.",
          details: error.details || {}
        },
        error instanceof StoreCheckoutError || error instanceof FulfillmentError ? error.status : 500,
        cors(env)
      );
    }
  }
};
