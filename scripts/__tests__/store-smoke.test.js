const assert = require("node:assert/strict");
const test = require("node:test");

async function smokeModule() {
  return import("../store/checkout-smoke.mjs");
}

test("checkout smoke helper simulates paid webhook through order status", async () => {
  const { runCheckoutSmoke } = await smokeModule();
  const result = await runCheckoutSmoke({
    productId: "small-useful-light-tee",
    variantId: "small-useful-light-black-m",
    quantity: 1
  });

  assert.equal(result.fulfillmentStatus, "succeeded");
  assert.equal(result.providerOrderId, "pf_smoke_order");
  assert.equal(result.printfulCalls, 1);
  assert.equal(result.catalogVariantId, 44077);
  assert.equal(result.placementCount, 2);
});

test("checkout smoke args parse product, variant, and quantity", async () => {
  const { parseArgs } = await smokeModule();
  const args = parseArgs(["--product", "p", "--variant=v", "--quantity", "2"]);

  assert.equal(args.productId, "p");
  assert.equal(args.variantId, "v");
  assert.equal(args.quantity, 2);
});
