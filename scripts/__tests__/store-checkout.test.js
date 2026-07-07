const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "store", "products.json"), "utf8"));

async function checkoutModule() {
  return import("../store/checkout.mjs");
}

async function fulfillmentModule() {
  return import("../store/fulfillment.mjs");
}

function readyPrintfulCatalog() {
  return JSON.parse(
    JSON.stringify({
      ...catalog,
      products: catalog.products.map((product) => {
        if (product.id !== "small-useful-light-tee") return product;
        return {
          ...product,
          embeddedFulfillment: {
            recommended: "printful",
            status: "ready",
            variants: Object.fromEntries(
              product.variants.map((variant, index) => [
                variant.id,
                {
                  catalogVariantId: 7000 + index,
                  frontPlacement: "front",
                  backPlacement: "back"
                }
              ])
            )
          }
        };
      })
    })
  );
}

function paidStripeSession(cartMetadata) {
  return {
    id: "cs_test_123",
    metadata: {
      cart: cartMetadata
    },
    customer_details: {
      email: "buyer@example.com",
      name: "Buyer Person",
      address: {
        line1: "123 Main St",
        line2: "Apt 4",
        city: "Brooklyn",
        state: "NY",
        country: "US",
        postal_code: "11201"
      }
    }
  };
}

function memoryStore() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key) || null;
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

test("checkout resolves cart prices from the server catalog", async () => {
  const { resolveCart } = await checkoutModule();
  const lines = resolveCart(catalog, [
    {
      productId: "small-useful-light-tee",
      variantId: "small-useful-light-black-m",
      quantity: 2,
      price: 1
    }
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].unitAmount, 3995);
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[0].sku, "small-useful-light-black-m");
});

test("checkout rejects unknown variants", async () => {
  const { resolveCart, StoreCheckoutError } = await checkoutModule();
  assert.throws(
    () =>
      resolveCart(catalog, [
        {
          productId: "small-useful-light-tee",
          variantId: "small-useful-light-black-giant",
          quantity: 1
        }
      ]),
    StoreCheckoutError
  );
});

test("checkout blocks live payment sessions until fulfillment credentials are configured", async () => {
  const { buildStripeCheckoutSessionParams, StoreCheckoutError } = await checkoutModule();
  assert.throws(
    () =>
      buildStripeCheckoutSessionParams({
        catalog,
        items: [
          {
            productId: "small-useful-light-tee",
            variantId: "small-useful-light-black-s",
            quantity: 1
          }
        ],
        env: { STORE_PUBLIC_URL: "https://bensonperry.com" }
      }),
    (error) => error instanceof StoreCheckoutError && error.status === 503 && error.details.providers.includes("printful")
  );
});

test("checkout blocks live payment sessions until fulfillment mapping is ready", async () => {
  const { buildStripeCheckoutSessionParams, StoreCheckoutError } = await checkoutModule();
  const unmappedCatalog = readyPrintfulCatalog();
  unmappedCatalog.products[0].embeddedFulfillment.status = "needs-provider-account-and-variant-mapping";

  assert.throws(
    () =>
      buildStripeCheckoutSessionParams({
        catalog: unmappedCatalog,
        items: [
          {
            productId: "small-useful-light-tee",
            variantId: "small-useful-light-black-s",
            quantity: 1
          }
        ],
        env: {
          PRINTFUL_API_KEY: "test",
          STORE_PUBLIC_URL: "https://bensonperry.com"
        }
      }),
    (error) => error instanceof StoreCheckoutError && error.status === 409 && error.details.products.includes("small-useful-light-tee")
  );
});

test("checkout can build an embedded Stripe session in explicit unfulfilled test mode", async () => {
  const { buildStripeCheckoutSessionParams } = await checkoutModule();
  const { params, lines } = buildStripeCheckoutSessionParams({
    catalog,
    items: [
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-xl",
        quantity: 1
      }
    ],
    env: {
      STORE_ALLOW_UNFULFILLED_CHECKOUT: "true",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  });

  assert.equal(params.get("ui_mode"), "embedded_page");
  assert.equal(params.get("payment_method_types[0]"), "card");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "3995");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.match(params.get("return_url"), /^https:\/\/bensonperry\.com\/store\//);
  assert.equal(lines[0].variantId, "small-useful-light-black-xl");
});

test("checkout allowed countries come from products in the cart", async () => {
  const { buildStripeCheckoutSessionParams } = await checkoutModule();
  const multiCountryCatalog = readyPrintfulCatalog();
  multiCountryCatalog.products.push({
    ...multiCountryCatalog.products[0],
    id: "global-test-tee",
    status: "live",
    variants: [
      {
        ...multiCountryCatalog.products[0].variants[0],
        id: "global-test-tee-black-s",
        sku: "global-test-tee-black-s"
      }
    ],
    checkout: {
      mode: "embedded-stripe",
      allowedCountries: ["US", "CA"]
    },
    embeddedFulfillment: {
      ...multiCountryCatalog.products[0].embeddedFulfillment,
      variants: {
        "global-test-tee-black-s": {
          catalogVariantId: 999,
          frontPlacement: "front",
          backPlacement: "back"
        }
      }
    }
  });

  const { params } = buildStripeCheckoutSessionParams({
    catalog: multiCountryCatalog,
    items: [
      {
        productId: "global-test-tee",
        variantId: "global-test-tee-black-s",
        quantity: 1
      }
    ],
    env: {
      PRINTFUL_API_KEY: "test",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  });

  assert.equal(params.get("shipping_address_collection[allowed_countries][0]"), "US");
  assert.equal(params.get("shipping_address_collection[allowed_countries][1]"), "CA");
});

test("checkout config reports card, wallet, and Shop Pay readiness", async () => {
  const { checkoutConfig } = await checkoutModule();
  const config = checkoutConfig({
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WALLET_DOMAIN_READY: "true",
    STRIPE_PAYMENT_METHODS_READY: "true",
    SHOP_PAY_CLIENT_ID: "shop_pay_client"
  });

  assert.equal(config.configured, true);
  assert.equal(config.payments.card.status, "configured");
  assert.equal(config.payments.wallets.applePay.status, "eligible");
  assert.equal(config.payments.wallets.googlePay.status, "eligible");
  assert.equal(config.payments.wallets.link.status, "eligible");
  assert.equal(config.payments.shopPay.configured, true);
});

test("checkout config keeps Stripe wallets pending until payment domain is ready", async () => {
  const { checkoutConfig } = await checkoutModule();
  const config = checkoutConfig({
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_SECRET_KEY: "sk_test_123"
  });

  assert.equal(config.payments.wallets.applePay.status, "needs-stripe-keys-or-domain-registration");
  assert.equal(config.payments.wallets.googlePay.status, "needs-stripe-keys-or-payment-method-domain");
  assert.equal(config.payments.wallets.link.status, "needs-stripe-keys-or-payment-method-domain");
});

test("checkout API exposes fulfillment status records by Stripe session", async () => {
  const { fulfillmentRecordKey, handleStoreApiRequest } = await checkoutModule();
  const store = memoryStore();
  await store.put(
    fulfillmentRecordKey("cs_test_123"),
    JSON.stringify({
      status: "succeeded",
      stripeSessionId: "cs_test_123",
      provider: "printful",
      providerOrderId: "pf_order_123"
    })
  );

  const response = await handleStoreApiRequest(
    new Request("https://example.com/api/store/order-status?session_id=cs_test_123"),
    { orderStore: store }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "succeeded");
  assert.equal(body.fulfillment.provider, "printful");
  assert.equal(body.fulfillment.providerOrderId, "pf_order_123");
});

test("checkout verifies Stripe webhook signatures", async () => {
  const { verifyStripeWebhookSignature } = await checkoutModule();
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${signature}`, secret), true);
  assert.throws(() => verifyStripeWebhookSignature(payload, `t=${timestamp},v1=bad`, secret));
});

test("checkout webhook route records fulfillment and exposes order status", async () => {
  const { encodeCartMetadata, fulfillmentRecordKey, handleStoreApiRequest } = await checkoutModule();
  const secret = "whsec_test";
  const store = memoryStore();
  const session = paidStripeSession(
    encodeCartMetadata([
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        sku: "small-useful-light-black-m",
        quantity: 1
      }
    ])
  );
  const payload = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: {
      object: session
    }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

  const webhook = await handleStoreApiRequest(
    new Request("https://example.com/api/store/webhook/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": `t=${timestamp},v1=${signature}`
      },
      body: payload
    }),
    {
      orderStore: store,
      env: {
        PRINTFUL_API_KEY: "test",
        STRIPE_WEBHOOK_SECRET: secret,
        STORE_PUBLIC_URL: "https://bensonperry.com"
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ id: "pf_order_route_123", status: "draft" })
      })
    }
  );
  const webhookBody = await webhook.json();
  assert.equal(webhook.status, 200);
  assert.equal(webhookBody.fulfillment.record.providerOrderId, "pf_order_route_123");

  const status = await handleStoreApiRequest(
    new Request("https://example.com/api/store/order-status?session_id=cs_test_123"),
    { orderStore: store }
  );
  const statusBody = await status.json();
  assert.equal(statusBody.status, "succeeded");
  assert.equal(statusBody.key, fulfillmentRecordKey("cs_test_123"));
  assert.equal(statusBody.fulfillment.providerOrderId, "pf_order_route_123");
});

test("fulfillment builds a Printful order from a paid Stripe session", async () => {
  const { encodeCartMetadata, fulfillStripeCheckoutSession } = await checkoutModule();
  const session = paidStripeSession(
    encodeCartMetadata([
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        sku: "small-useful-light-black-m",
        quantity: 1
      }
    ])
  );

  const result = await fulfillStripeCheckoutSession({
    catalog: readyPrintfulCatalog(),
    session,
    env: {
      PRINTFUL_API_KEY: "test",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.printful.com/v2/orders");
      assert.equal(options.method, "POST");
      assert.match(options.headers.Authorization, /^Bearer /);
      const body = JSON.parse(options.body);
      assert.equal(body.external_id, "cs_test_123");
      assert.equal(body.recipient.email, "buyer@example.com");
      assert.equal(body.order_items[0].catalog_variant_id, 7001);
      assert.equal(body.order_items[0].placements.length, 2);
      assert.match(body.order_items[0].placements[0].layers[0].url, /^https:\/\/bensonperry\.com\/store\/assets\//);
      return {
        ok: true,
        json: async () => ({ id: "pf_order_123", status: "draft" })
      };
    }
  });

  assert.equal(result.provider, "printful");
  assert.equal(result.created.id, "pf_order_123");
});

test("fulfillment is idempotent for repeated Stripe webhook deliveries", async () => {
  const { encodeCartMetadata, fulfillStripeCheckoutSession } = await checkoutModule();
  const store = memoryStore();
  const session = paidStripeSession(
    encodeCartMetadata([
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        sku: "small-useful-light-black-m",
        quantity: 1
      }
    ])
  );
  let printfulCalls = 0;

  const first = await fulfillStripeCheckoutSession({
    catalog: readyPrintfulCatalog(),
    session,
    orderStore: store,
    env: {
      PRINTFUL_API_KEY: "test",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    },
    fetchImpl: async () => {
      printfulCalls += 1;
      return {
        ok: true,
        json: async () => ({ id: "pf_order_123", status: "draft" })
      };
    }
  });
  const second = await fulfillStripeCheckoutSession({
    catalog: readyPrintfulCatalog(),
    session,
    orderStore: store,
    env: {
      PRINTFUL_API_KEY: "test",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    },
    fetchImpl: async () => {
      printfulCalls += 1;
      throw new Error("duplicate fulfillment should not call provider");
    }
  });

  assert.equal(printfulCalls, 1);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.record.providerOrderId, "pf_order_123");
});

test("fulfillment refuses Printful orders without provider mapping", async () => {
  const { buildPrintfulOrder, FulfillmentError } = await fulfillmentModule();
  const unmappedCatalog = readyPrintfulCatalog();
  delete unmappedCatalog.products[0].embeddedFulfillment.variants["small-useful-light-black-m"];

  assert.throws(
    () =>
      buildPrintfulOrder({
        catalog: unmappedCatalog,
        cartLines: [
          {
            productId: "small-useful-light-tee",
            variantId: "small-useful-light-black-m",
            quantity: 1,
            unitAmount: 3995,
            currency: "usd"
          }
        ],
        session: paidStripeSession("ignored"),
        env: { STORE_PUBLIC_URL: "https://bensonperry.com" }
      }),
    FulfillmentError
  );
});
