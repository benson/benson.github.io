const assert = require("node:assert/strict");
const test = require("node:test");

async function readinessModule() {
  return import("../../store/checkout-readiness.mjs");
}

test("checkout readiness reports pending before config is loaded", async () => {
  const { checkoutReadiness } = await readinessModule();
  const state = checkoutReadiness();

  assert.equal(state.ready, false);
  assert.equal(state.status, "loading");
  assert.equal(state.message, "checking checkout...");
  assert.deepEqual(state.methods, []);
});

test("checkout readiness reports card and wallet eligibility", async () => {
  const { checkoutReadiness } = await readinessModule();
  const state = checkoutReadiness({
    configured: true,
    payments: {
      card: { status: "configured" },
      wallets: {
        applePay: { status: "eligible" },
        googlePay: { status: "eligible" },
        link: { status: "eligible" }
      },
      shopPay: { configured: true, status: "optional-ready-to-integrate" }
    }
  });

  assert.equal(state.ready, true);
  assert.equal(state.status, "ready");
  assert.equal(state.message, "checkout ready");
  assert.deepEqual(
    state.methods.map((method) => [method.id, method.ready]),
    [
      ["card", true],
      ["apple-pay", true],
      ["google-pay", true],
      ["link", true]
    ]
  );
});

test("checkout readiness only lists Shop Pay when the checkout lane is ready", async () => {
  const { checkoutReadiness } = await readinessModule();
  const state = checkoutReadiness({
    configured: true,
    payments: {
      card: { status: "configured" },
      wallets: {
        applePay: { status: "eligible" },
        googlePay: { status: "eligible" },
        link: { status: "eligible" }
      },
      shopPay: { configured: true, status: "ready" }
    }
  });

  assert.equal(state.ready, true);
  assert.equal(state.methods.at(-1).id, "shop-pay");
  assert.equal(state.methods.at(-1).ready, true);
});

test("checkout readiness keeps checkout pending when Stripe keys are missing", async () => {
  const { checkoutReadiness } = await readinessModule();
  const state = checkoutReadiness({
    configured: false,
    payments: {
      card: { status: "needs-stripe-keys" },
      wallets: {
        applePay: { status: "needs-stripe-keys-or-domain-registration" },
        googlePay: { status: "needs-stripe-keys-or-payment-method-domain" },
        link: { status: "needs-stripe-keys-or-payment-method-domain" }
      },
      shopPay: { configured: false, status: "needs-shopify-wallet-setup" }
    }
  });

  assert.equal(state.ready, false);
  assert.equal(state.status, "pending");
  assert.equal(state.message, "checkout setup pending");
  assert.deepEqual(
    state.methods.map((method) => [method.id, method.ready]),
    [
      ["card", false],
      ["apple-pay", false],
      ["google-pay", false],
      ["link", false]
    ]
  );
});

test("checkout readiness records config fetch errors", async () => {
  const { checkoutReadinessFromError } = await readinessModule();
  const state = checkoutReadinessFromError(new Error("checkout backend is not deployed yet."));

  assert.equal(state.ready, false);
  assert.equal(state.status, "unavailable");
  assert.equal(state.message, "checkout backend is not deployed yet.");
  assert.deepEqual(state.methods, []);
});
