const assert = require("node:assert/strict");
const test = require("node:test");

async function envModule() {
  return import("../store/env.mjs");
}

async function setupModule() {
  return import("../store/checkout-setup.mjs");
}

test("store env parser reads quoted and unquoted local values", async () => {
  const { parseEnvText } = await envModule();
  const values = parseEnvText(`
    STRIPE_PUBLISHABLE_KEY=pk_test_123
    STRIPE_SECRET_KEY="sk_test_456"
    # ignored
    PRINTFUL_API_KEY='printful_key'
  `);

  assert.equal(values.STRIPE_PUBLISHABLE_KEY, "pk_test_123");
  assert.equal(values.STRIPE_SECRET_KEY, "sk_test_456");
  assert.equal(values.PRINTFUL_API_KEY, "printful_key");
});

test("store env parser reads Stripe CLI scalar config values", async () => {
  const { parseTomlScalars } = await envModule();
  const values = parseTomlScalars(`
    color = "off"
    [default]
    account_id = acct_123
    test_mode_api_key = rkcs_test_claimable
    test_mode_pub_key = pk_test_123
  `);

  assert.equal(values.account_id, "acct_123");
  assert.equal(values.test_mode_api_key, "rkcs_test_claimable");
  assert.equal(values.test_mode_pub_key, "pk_test_123");
});

test("checkout setup classifies Stripe key shapes", async () => {
  const { stripeSecretKind } = await setupModule();

  assert.equal(stripeSecretKind(""), "missing");
  assert.equal(stripeSecretKind("rkcs_test_123"), "claimable-sandbox");
  assert.equal(stripeSecretKind("sk_test_123"), "standard");
  assert.equal(stripeSecretKind("rk_live_123"), "restricted");
  assert.equal(stripeSecretKind("not-a-stripe-key"), "unknown");
});

test("checkout setup parses side-effect flags", async () => {
  const { parseArgs } = await setupModule();
  const args = parseArgs(["--create-webhook", "--write-local", "--deploy", "--webhook-url", "https://example.com/webhook"]);

  assert.equal(args.createWebhook, true);
  assert.equal(args.writeLocal, true);
  assert.equal(args.deploy, true);
  assert.equal(args.webhookUrl, "https://example.com/webhook");
});
