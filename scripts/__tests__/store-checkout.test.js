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

function paidStripeSession(cartMetadata, overrides = {}) {
  return {
    id: "cs_test_123",
    livemode: false,
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
    },
    ...overrides
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
  assert.equal(lines[0].unitAmount, 1838);
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
    (error) => error instanceof StoreCheckoutError && error.status === 503 && error.details.providers.includes("printful-api-key")
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
          PRINTFUL_STORE_ID: "123",
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
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1838");
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
      PRINTFUL_STORE_ID: "123",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  });

  assert.equal(params.get("shipping_address_collection[allowed_countries][0]"), "US");
  assert.equal(params.get("shipping_address_collection[allowed_countries][1]"), "CA");
});

test("checkout allowed countries are shared across mixed carts", async () => {
  const { buildStripeCheckoutSessionParams } = await checkoutModule();
  const multiCountryCatalog = readyPrintfulCatalog();
  multiCountryCatalog.products.push({
    ...multiCountryCatalog.products[0],
    id: "north-america-test-tee",
    status: "live",
    variants: [
      {
        ...multiCountryCatalog.products[0].variants[0],
        id: "north-america-test-tee-black-s",
        sku: "north-america-test-tee-black-s"
      }
    ],
    checkout: {
      ...multiCountryCatalog.products[0].checkout,
      allowedCountries: ["US", "CA"]
    },
    embeddedFulfillment: {
      ...multiCountryCatalog.products[0].embeddedFulfillment,
      variants: {
        "north-america-test-tee-black-s": {
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
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-s",
        quantity: 1
      },
      {
        productId: "north-america-test-tee",
        variantId: "north-america-test-tee-black-s",
        quantity: 1
      }
    ],
    env: {
      PRINTFUL_API_KEY: "test",
      PRINTFUL_STORE_ID: "123",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  });

  assert.equal(params.get("shipping_address_collection[allowed_countries][0]"), "US");
  assert.equal(params.get("shipping_address_collection[allowed_countries][1]"), null);
});

test("checkout rejects mixed carts with no shared shipping country", async () => {
  const { buildStripeCheckoutSessionParams, StoreCheckoutError } = await checkoutModule();
  const multiCountryCatalog = readyPrintfulCatalog();
  multiCountryCatalog.products.push({
    ...multiCountryCatalog.products[0],
    id: "canada-only-test-tee",
    status: "live",
    variants: [
      {
        ...multiCountryCatalog.products[0].variants[0],
        id: "canada-only-test-tee-black-s",
        sku: "canada-only-test-tee-black-s"
      }
    ],
    checkout: {
      ...multiCountryCatalog.products[0].checkout,
      allowedCountries: ["CA"]
    },
    embeddedFulfillment: {
      ...multiCountryCatalog.products[0].embeddedFulfillment,
      variants: {
        "canada-only-test-tee-black-s": {
          catalogVariantId: 999,
          frontPlacement: "front",
          backPlacement: "back"
        }
      }
    }
  });

  assert.throws(
    () =>
      buildStripeCheckoutSessionParams({
        catalog: multiCountryCatalog,
        items: [
          {
            productId: "small-useful-light-tee",
            variantId: "small-useful-light-black-s",
            quantity: 1
          },
          {
            productId: "canada-only-test-tee",
            variantId: "canada-only-test-tee-black-s",
            quantity: 1
          }
        ],
        env: {
          PRINTFUL_API_KEY: "test",
          PRINTFUL_STORE_ID: "123",
          STORE_PUBLIC_URL: "https://bensonperry.com"
        }
      }),
    (error) => error instanceof StoreCheckoutError && error.status === 409 && error.details.products.includes("canada-only-test-tee")
  );
});

test("checkout adds an included standard shipping option from product policy", async () => {
  const { buildStripeCheckoutSessionParams } = await checkoutModule();
  const { params } = buildStripeCheckoutSessionParams({
    catalog: readyPrintfulCatalog(),
    items: [
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        quantity: 1
      }
    ],
    env: {
      PRINTFUL_API_KEY: "test",
      PRINTFUL_STORE_ID: "123",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  });

  assert.equal(params.get("shipping_options[0][shipping_rate_data][display_name]"), "US standard shipping included");
  assert.equal(params.get("shipping_options[0][shipping_rate_data][type]"), "fixed_amount");
  assert.equal(params.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]"), "0");
  assert.equal(params.get("shipping_options[0][shipping_rate_data][fixed_amount][currency]"), "usd");
  assert.equal(params.get("shipping_options[0][shipping_rate_data][metadata][strategy]"), "included-us-standard");
});

test("checkout config reports card, wallet, and Shop Pay readiness", async () => {
  const { checkoutConfig } = await checkoutModule();
  const config = checkoutConfig({
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WALLET_DOMAIN_READY: "true",
    STRIPE_PAYMENT_METHODS_READY: "true",
    PRINTFUL_API_KEY: "pf_test_123",
    PRINTFUL_STORE_ID: "123",
    SHOP_PAY_CLIENT_ID: "shop_pay_client"
  });

  assert.equal(config.configured, true);
  assert.equal(config.fulfillmentReady, true);
  assert.equal(config.fulfillment.status, "configured");
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

  assert.equal(config.fulfillmentReady, false);
  assert.equal(config.fulfillment.status, "needs-printful-api-key");
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
  assert.throws(
    () => {
      const staleTimestamp = timestamp - 600;
      const staleSignature = crypto.createHmac("sha256", secret).update(`${staleTimestamp}.${payload}`).digest("hex");
      verifyStripeWebhookSignature(payload, `t=${staleTimestamp},v1=${staleSignature}`, secret);
    },
    /Stale Stripe signature/
  );
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
        PRINTFUL_STORE_ID: "123",
        STRIPE_WEBHOOK_SECRET: secret,
        STORE_PUBLIC_URL: "https://bensonperry.com"
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ data: { id: "pf_order_route_123", status: "draft" } })
      })
    }
  );
  const webhookBody = await webhook.json();
  assert.equal(webhook.status, 200);
  assert.equal(webhookBody.fulfillment.record.providerOrderId, "pf_order_route_123");
  assert.equal(webhookBody.fulfillment.record.providerConfirmationStatus, "skipped-test-mode");

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
  const { printfulExternalId } = await fulfillmentModule();
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
      PRINTFUL_STORE_ID: "123",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.printful.com/v2/orders");
      assert.equal(options.method, "POST");
      assert.match(options.headers.Authorization, /^Bearer /);
      const body = JSON.parse(options.body);
      assert.equal(body.external_id, printfulExternalId(session.id));
      assert.notEqual(body.external_id, session.id);
      assert.ok(body.external_id.length <= 32);
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
  assert.equal(result.externalId, printfulExternalId(session.id));
  assert.equal(result.created.id, "pf_order_123");
  assert.equal(result.confirmed, null);
  assert.equal(result.confirmationStatus, "skipped-test-mode");
});

test("fulfillment requests unlimited-color embroidery without thread overrides", async () => {
  const { buildPrintfulOrder } = await fulfillmentModule();
  const embroideryCatalog = readyPrintfulCatalog();
  const product = embroideryCatalog.products.find((candidate) => candidate.id === "small-useful-light-tee");
  product.production = {
    ...product.production,
    method: "embroidery",
    frontArtwork: product.production.backArtwork,
    backArtwork: "",
    frontPosition: {
      width: 2.8,
      height: 2.8,
      top: 0.6,
      left: 0.6
    },
    embroideryColorMode: "unlimited-color",
    unlimitedColorEmbroidery: true,
    threadColors: ["#000000", "#FFFFFF"]
  };
  product.embeddedFulfillment.variants["small-useful-light-black-m"] = {
    catalogVariantId: 7001,
    frontPlacement: "embroidery_chest_left",
    backPlacement: false
  };

  const order = buildPrintfulOrder({
    catalog: embroideryCatalog,
    cartLines: [
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        sku: "small-useful-light-black-m",
        quantity: 1,
        unitAmount: 3995,
        title: "Small Useful Light"
      }
    ],
    session: paidStripeSession("ignored"),
    env: { STORE_PUBLIC_URL: "https://bensonperry.com" }
  });
  const placement = order.order_items[0].placements[0];

  assert.deepEqual(placement.placement_options, [{ name: "unlimited_color", value: true }]);
  assert.equal(placement.layers[0].layer_options, undefined);
});

test("Printful external ids fit provider limits for live Stripe sessions", async () => {
  const { printfulExternalId } = await fulfillmentModule();
  const stripeSessionId = "cs_live_a1XmaCJf5wHfQ6AnmzwZ5WVb2fT5Ptm3GoR9cxYmwYxdj2klgRkK0zt4JG";
  const externalId = printfulExternalId(stripeSessionId);

  assert.ok(externalId.startsWith("bp_l_"));
  assert.ok(externalId.length <= 32);
  assert.equal(externalId, printfulExternalId(stripeSessionId));
  assert.notEqual(externalId, stripeSessionId);
});

test("fulfillment confirms Printful orders for live Stripe sessions", async () => {
  const { encodeCartMetadata, fulfillStripeCheckoutSession } = await checkoutModule();
  const session = paidStripeSession(
    encodeCartMetadata([
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        sku: "small-useful-light-black-m",
        quantity: 1
      }
    ]),
    {
      id: "cs_live_123",
      livemode: true
    }
  );
  const calls = [];

  const result = await fulfillStripeCheckoutSession({
    catalog: readyPrintfulCatalog(),
    session,
    env: {
      PRINTFUL_API_KEY: "test",
      PRINTFUL_STORE_ID: "123",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (url === "https://api.printful.com/v2/orders") {
        return {
          ok: true,
          json: async () => ({ data: { id: "pf_order_456", status: "draft" } })
        };
      }
      assert.equal(url, "https://api.printful.com/v2/orders/pf_order_456/confirmation");
      return {
        ok: true,
        json: async () => ({ data: { id: "pf_order_456", status: "confirmed" } })
      };
    }
  });

  assert.deepEqual(calls, [
    { url: "https://api.printful.com/v2/orders", method: "POST" },
    { url: "https://api.printful.com/v2/orders/pf_order_456/confirmation", method: "POST" }
  ]);
  assert.equal(result.provider, "printful");
  assert.equal(result.created.data.id, "pf_order_456");
  assert.equal(result.confirmed.data.status, "confirmed");
  assert.equal(result.confirmationStatus, "confirmed");
});

test("fulfillment retries Printful confirmation while costs calculate", async () => {
  const { confirmPrintfulOrderWhenReady } = await fulfillmentModule();
  const calls = [];

  const result = await confirmPrintfulOrderWhenReady({
    orderId: "pf_order_456",
    delaysMs: [0],
    env: {
      PRINTFUL_API_KEY: "test",
      PRINTFUL_STORE_ID: "123"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (calls.length === 1) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: "Order cannot be confirmed. Cost calculations still running, try again after costs have been calculated."
            }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({ data: { id: "pf_order_456", status: "confirmed" } })
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.data.status, "confirmed");
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
      PRINTFUL_STORE_ID: "123",
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
      PRINTFUL_STORE_ID: "123",
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
