const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
    STRIPE_PAYMENT_METHODS_READY: "true",
    PRINTFUL_API_KEY: "pf_test_123"
  });

  assert.equal(config.fulfillmentReady, true);
  assert.equal(config.fulfillment.status, "configured");
  assert.equal(config.payments.card.status, "configured");
  assert.equal(config.payments.wallets.applePay.status, "eligible");
  assert.equal(config.payments.wallets.googlePay.status, "eligible");
  assert.equal(config.payments.wallets.link.status, "eligible");
});

function signPayload(payload, secret, timestamp) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

test("worker webhook verification accepts fresh Stripe signatures", async () => {
  const { verifyWebhook } = await workerModule();
  const secret = "whsec_worker_test";
  const payload = JSON.stringify({ id: "evt_worker_test" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(payload, secret, timestamp);

  await assert.doesNotReject(() => verifyWebhook(payload, `t=${timestamp},v1=${signature}`, secret));
});

test("worker webhook verification rejects stale Stripe signatures", async () => {
  const { verifyWebhook } = await workerModule();
  const secret = "whsec_worker_test";
  const payload = JSON.stringify({ id: "evt_worker_test" });
  const timestamp = Math.floor(Date.now() / 1000) - 600;
  const signature = signPayload(payload, secret, timestamp);

  await assert.rejects(
    () => verifyWebhook(payload, `t=${timestamp},v1=${signature}`, secret),
    /Stale Stripe signature/
  );
});
