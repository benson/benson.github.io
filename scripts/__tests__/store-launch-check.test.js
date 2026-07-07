const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "store", "products.json"), "utf8"));

async function launchModule() {
  return import("../store/launch-check.mjs");
}

test("launch check parses product, network, live, api, and smoke flags", async () => {
  const { parseArgs } = await launchModule();
  const args = parseArgs([
    "--network",
    "--live",
    "--api-base",
    "https://checkout.example.test",
    "--product",
    "small-useful-light-tee",
    "--skip-smoke"
  ]);

  assert.equal(args.network, true);
  assert.equal(args.live, true);
  assert.equal(args.apiBase, "https://checkout.example.test");
  assert.equal(args.productId, "small-useful-light-tee");
  assert.equal(args.smoke, false);
});

test("launch check credential gate accepts required Stripe and Printful readiness", async () => {
  const { credentialChecks, summarizeChecks } = await launchModule();
  const checks = credentialChecks({
    env: {
      STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      PRINTFUL_API_KEY: "printful_123",
      STRIPE_WALLET_DOMAIN_READY: "true",
      STRIPE_PAYMENT_METHODS_READY: "true"
    },
    stripeProfile: {}
  });

  assert.equal(summarizeChecks(checks).ok, true);
});

test("launch check credential gate reports claimable Stripe sandboxes as blocked", async () => {
  const { credentialChecks, summarizeChecks } = await launchModule();
  const checks = credentialChecks({
    env: {
      STRIPE_PUBLISHABLE_KEY: "pk_test_123"
    },
    stripeProfile: {
      secretKey: "rkcs_test_123",
      publishableKey: "pk_test_123"
    }
  });

  assert.equal(summarizeChecks(checks).ok, false);
  assert.ok(checks.some((item) => item.label === "Stripe sandbox" && item.status === "blocked"));
});

test("launch check product readiness accepts the current shirt locally", async () => {
  const { productReadinessChecks, summarizeChecks } = await launchModule();
  const checks = await productReadinessChecks({
    catalog,
    productId: "small-useful-light-tee"
  });

  assert.equal(summarizeChecks(checks).ok, true);
});

test("launch check live API gate reads deployed config readiness", async () => {
  const { liveApiChecks, summarizeChecks } = await launchModule();
  const checks = await liveApiChecks({
    apiBase: "https://checkout.example.test",
    fetchImpl: async (url) => {
      assert.equal(url, "https://checkout.example.test/api/store/config");
      return new Response(
        JSON.stringify({
          payments: {
            card: { status: "configured" },
            wallets: {
              applePay: { status: "eligible" },
              googlePay: { status: "eligible" },
              link: { status: "eligible" }
            }
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  });

  assert.equal(summarizeChecks(checks).ok, true);
});
