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

test("checkout blocks live payment sessions until fulfillment is mapped", async () => {
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
    StoreCheckoutError
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

  assert.equal(params.get("ui_mode"), "embedded");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "3995");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.match(params.get("return_url"), /^https:\/\/bensonperry\.com\/store\//);
  assert.equal(lines[0].variantId, "small-useful-light-black-xl");
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
