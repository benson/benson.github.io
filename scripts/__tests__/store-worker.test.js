const assert = require("node:assert/strict");
const test = require("node:test");

async function workerModule() {
  return import("../../workers/store-checkout-worker.mjs");
}

test("worker checkout params use catalog checkout allowed countries", async () => {
  const { buildCheckoutParams } = await workerModule();
  const params = buildCheckoutParams(
    [
      {
        productId: "small-useful-light-tee",
        variantId: "small-useful-light-black-m",
        quantity: 1
      }
    ],
    {
      PRINTFUL_API_KEY: "test",
      STORE_PUBLIC_URL: "https://bensonperry.com"
    }
  );

  assert.equal(params.get("shipping_address_collection[allowed_countries][0]"), "US");
});

test("worker checkout config matches wallet readiness markers", async () => {
  const { checkoutConfig } = await workerModule();
  const config = checkoutConfig({
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WALLET_DOMAIN_READY: "true",
    STRIPE_PAYMENT_METHODS_READY: "true"
  });

  assert.equal(config.payments.card.status, "configured");
  assert.equal(config.payments.wallets.applePay.status, "eligible");
  assert.equal(config.payments.wallets.googlePay.status, "eligible");
  assert.equal(config.payments.wallets.link.status, "eligible");
});
