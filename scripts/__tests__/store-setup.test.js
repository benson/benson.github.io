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
  const args = parseArgs([
    "--create-webhook",
    "--register-payment-domain",
    "--payment-domain",
    "https://bensonperry.com/store",
    "--write-local",
    "--deploy",
    "--webhook-url",
    "https://example.com/webhook"
  ]);

  assert.equal(args.createWebhook, true);
  assert.equal(args.registerPaymentDomain, true);
  assert.equal(args.paymentDomain, "https://bensonperry.com/store");
  assert.equal(args.writeLocal, true);
  assert.equal(args.deploy, true);
  assert.equal(args.webhookUrl, "https://example.com/webhook");
});

test("checkout setup normalizes payment method domains", async () => {
  const { normalizePaymentMethodDomain, paymentDomainFromPublicUrl } = await setupModule();

  assert.equal(normalizePaymentMethodDomain("https://BensonPerry.com/store"), "bensonperry.com");
  assert.equal(normalizePaymentMethodDomain("www.bensonperry.com:443/store"), "www.bensonperry.com");
  assert.equal(paymentDomainFromPublicUrl("https://store.example.test/path"), "store.example.test");
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("checkout setup creates a missing Stripe payment method domain", async () => {
  const { ensureStripePaymentMethodDomain } = await setupModule();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/payment_method_domains?")) {
      return jsonResponse({ data: [] });
    }
    assert.equal(url, "https://api.stripe.com/v1/payment_method_domains");
    assert.equal(options.method, "POST");
    assert.match(String(options.body), /domain_name=bensonperry\.com/);
    assert.match(String(options.body), /enabled=true/);
    return jsonResponse({
      id: "pmd_123",
      domain_name: "bensonperry.com",
      enabled: true,
      apple_pay: { status: "active" },
      google_pay: { status: "active" },
      link: { status: "active" }
    });
  };

  const result = await ensureStripePaymentMethodDomain({
    secretKey: "sk_test_123",
    domainName: "https://bensonperry.com/store",
    fetchImpl
  });

  assert.equal(result.status, "created");
  assert.equal(result.domainName, "bensonperry.com");
  assert.equal(result.readiness.walletDomainReady, true);
  assert.equal(result.readiness.paymentMethodsReady, true);
  assert.equal(calls.length, 2);
});

test("checkout setup validates an existing inactive Stripe payment method domain", async () => {
  const { ensureStripePaymentMethodDomain } = await setupModule();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/payment_method_domains?")) {
      return jsonResponse({
        data: [
          {
            id: "pmd_123",
            domain_name: "bensonperry.com",
            enabled: true,
            apple_pay: { status: "inactive" },
            google_pay: { status: "active" },
            link: { status: "active" }
          }
        ]
      });
    }
    assert.equal(url, "https://api.stripe.com/v1/payment_method_domains/pmd_123/validate");
    return jsonResponse({
      id: "pmd_123",
      domain_name: "bensonperry.com",
      enabled: true,
      apple_pay: { status: "active" },
      google_pay: { status: "active" },
      link: { status: "active" }
    });
  };

  const result = await ensureStripePaymentMethodDomain({
    secretKey: "sk_test_123",
    domainName: "bensonperry.com",
    fetchImpl
  });

  assert.equal(result.status, "validated");
  assert.equal(result.readiness.walletDomainReady, true);
  assert.equal(result.readiness.paymentMethodsReady, true);
  assert.deepEqual(calls, [
    "https://api.stripe.com/v1/payment_method_domains?domain_name=bensonperry.com&limit=100",
    "https://api.stripe.com/v1/payment_method_domains/pmd_123/validate"
  ]);
});
