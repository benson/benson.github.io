export class FulfillmentError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.name = "FulfillmentError";
    this.status = status;
    this.details = details;
  }
}

export function extractStripeAddress(session) {
  const shipping = session?.shipping_details;
  const customer = session?.customer_details || {};
  const address = shipping?.address || customer.address || {};
  const name = shipping?.name || customer.name;

  return {
    name,
    email: customer.email,
    phone: customer.phone,
    address1: address.line1,
    address2: address.line2,
    city: address.city,
    stateCode: address.state,
    countryCode: address.country,
    zip: address.postal_code
  };
}

export function assertFulfillmentAddress(address) {
  const missing = ["name", "email", "address1", "city", "countryCode", "zip"].filter((field) => !address?.[field]);
  if (missing.length) {
    throw new FulfillmentError("Stripe session is missing shipping details for fulfillment.", 422, { missing });
  }
}

export function productPublicAssetUrl(publicUrl, assetPath) {
  const base = String(publicUrl || "https://bensonperry.com").replace(/\/+$/, "");
  return `${base}/store/${String(assetPath || "").replace(/^\/+/, "")}`;
}

export function printfulTechnique(method) {
  if (String(method || "").toLowerCase() === "embroidery") return "embroidery";
  return "dtg";
}

export function buildPrintfulOrder({ catalog, cartLines, session, env = process.env }) {
  const publicUrl = env.STORE_PUBLIC_URL || "https://bensonperry.com";
  const address = extractStripeAddress(session);
  assertFulfillmentAddress(address);

  const products = new Map((catalog.products || []).map((product) => [product.id, product]));
  const items = cartLines.map((line) => {
    const product = products.get(line.productId);
    if (!product) throw new FulfillmentError(`Unknown fulfillment product: ${line.productId}`);

    const provider = product.embeddedFulfillment || {};
    if (provider.recommended !== "printful") {
      throw new FulfillmentError(`${product.id} is not mapped to Printful.`);
    }
    if (provider.status !== "ready") {
      throw new FulfillmentError(`${product.id} Printful mapping is not ready.`, 409, {
        status: provider.status || "missing"
      });
    }

    const variant = provider.variants?.[line.variantId];
    if (!variant?.catalogVariantId) {
      throw new FulfillmentError(`${product.id} missing Printful catalog variant for ${line.variantId}.`, 409);
    }

    const production = product.production || {};
    const placements = [];
    if (variant.frontPlacement !== false && production.frontArtwork) {
      placements.push({
        placement: variant.frontPlacement || "front",
        technique: printfulTechnique(production.method),
        layers: [
          {
            type: "file",
            url: productPublicAssetUrl(publicUrl, production.frontArtwork)
          }
        ]
      });
    }
    if (variant.backPlacement !== false && production.backArtwork) {
      placements.push({
        placement: variant.backPlacement || "back",
        technique: printfulTechnique(production.method),
        layers: [
          {
            type: "file",
            url: productPublicAssetUrl(publicUrl, production.backArtwork)
          }
        ]
      });
    }

    if (!placements.length) {
      throw new FulfillmentError(`${product.id} has no Printful artwork placements.`, 409);
    }

    return {
      source: "catalog",
      catalog_variant_id: variant.catalogVariantId,
      external_id: line.sku || line.variantId || product.id,
      quantity: line.quantity,
      retail_price: (Number(line.unitAmount) / 100).toFixed(2),
      name: line.title,
      placements
    };
  });

  return {
    external_id: session.id,
    shipping: env.PRINTFUL_SHIPPING || "STANDARD",
    recipient: {
      name: address.name,
      address1: address.address1,
      address2: address.address2 || undefined,
      city: address.city,
      state_code: address.stateCode || undefined,
      country_code: address.countryCode,
      zip: address.zip,
      email: address.email,
      phone: address.phone || undefined
    },
    order_items: items
  };
}

function printfulHeaders(env, hasBody = false) {
  return {
    Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(env.PRINTFUL_STORE_ID ? { "X-PF-Store-Id": env.PRINTFUL_STORE_ID } : {})
  };
}

export function printfulOrderId(response) {
  return response?.id || response?.data?.id || response?.result?.id || null;
}

export function shouldConfirmPrintfulOrder({ session, env = process.env } = {}) {
  if (env.PRINTFUL_CONFIRM_ORDERS === "true") return true;
  if (env.PRINTFUL_CONFIRM_ORDERS === "false") return false;
  return session?.livemode === true;
}

export async function createPrintfulOrder({ order, env = process.env, fetchImpl = fetch }) {
  if (!env.PRINTFUL_API_KEY) throw new FulfillmentError("Printful API key is not configured.", 503);

  const response = await fetchImpl("https://api.printful.com/v2/orders", {
    method: "POST",
    headers: printfulHeaders(env, true),
    body: JSON.stringify(order)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FulfillmentError(data.error?.message || data.message || "Printful order creation failed.", response.status, data);
  }
  return data;
}

export async function confirmPrintfulOrder({ orderId, env = process.env, fetchImpl = fetch }) {
  if (!env.PRINTFUL_API_KEY) throw new FulfillmentError("Printful API key is not configured.", 503);
  if (!orderId) throw new FulfillmentError("Printful order id is required before confirmation.", 502);

  const response = await fetchImpl(`https://api.printful.com/v2/orders/${encodeURIComponent(orderId)}/confirmation`, {
    method: "POST",
    headers: printfulHeaders(env)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FulfillmentError(data.error?.message || data.message || "Printful order confirmation failed.", response.status, data);
  }
  return data;
}

export async function fulfillStripeSessionWithPrintful({ catalog, cartLines, session, env = process.env, fetchImpl = fetch }) {
  const order = buildPrintfulOrder({ catalog, cartLines, session, env });
  const created = await createPrintfulOrder({ order, env, fetchImpl });
  const orderId = printfulOrderId(created);
  const shouldConfirm = shouldConfirmPrintfulOrder({ session, env });
  if (shouldConfirm && !orderId) {
    throw new FulfillmentError("Printful order creation did not return an order id for confirmation.", 502);
  }
  const confirmed = shouldConfirm ? await confirmPrintfulOrder({ orderId, env, fetchImpl }) : null;
  const confirmationStatus = confirmed ? "confirmed" : session?.livemode === true ? "skipped-by-config" : "skipped-test-mode";
  return {
    provider: "printful",
    externalId: order.external_id,
    order,
    created,
    confirmed,
    confirmationStatus
  };
}
