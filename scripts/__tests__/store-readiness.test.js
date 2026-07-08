const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "store", "products.json"), "utf8"));
const product = catalog.products.find((candidate) => candidate.id === "small-useful-light-tee");

async function readinessModule() {
  return import("../store/product-readiness.mjs");
}

function matchingPrintfulProduct() {
  const variants = product.variants.map((variant) => ({
    id: product.embeddedFulfillment.variants[variant.id].catalogVariantId,
    color: variant.options.Color,
    size: variant.options.Size,
    in_stock: true,
    availability_status: [
      {
        region: "US",
        status: "in_stock"
      }
    ]
  }));

  return {
    product: {
      id: product.embeddedFulfillment.catalogProductId,
      title: product.embeddedFulfillment.catalogProduct,
      is_discontinued: false,
      files: [
        { type: "front" },
        { type: "back" },
        { type: "mockup" }
      ]
    },
    variants
  };
}

test("readiness checker inspects PNG dimensions and alpha", async () => {
  const { pngInfo } = await readinessModule();
  const info = pngInfo(path.join(root, "store", product.production.backArtwork));

  assert.equal(info.width, 4500);
  assert.equal(info.height, 3000);
  assert.equal(info.hasAlpha, true);
});

test("current shirt passes local product readiness checks", async () => {
  const { localProductReadinessIssues } = await readinessModule();
  assert.deepEqual(localProductReadinessIssues(product, catalog), []);
});

test("product readiness requires a supported embedded checkout shipping policy", async () => {
  const { localProductReadinessIssues } = await readinessModule();
  const draft = JSON.parse(JSON.stringify(product));
  draft.checkout.shipping = { strategy: "manual-later" };

  const issues = localProductReadinessIssues(draft, catalog);
  assert.ok(issues.some((issue) => issue.includes("checkout shipping strategy")));
  assert.ok(issues.some((issue) => issue.includes("checkout shipping label")));
});

test("product readiness requires storefront imagery to match provider visual proof", async () => {
  const { localProductReadinessIssues } = await readinessModule();
  const draft = JSON.parse(JSON.stringify(product));
  draft.image = "assets/small-useful-light-back-only-mockup.png";

  const issues = localProductReadinessIssues(draft, catalog);
  assert.ok(issues.some((issue) => issue.includes("storefront image must match visualProof mockup")));
});

test("product readiness requires live Printful products to declare visual proof", async () => {
  const { localProductReadinessIssues } = await readinessModule();
  const draft = JSON.parse(JSON.stringify(product));
  delete draft.visualProof;

  const issues = localProductReadinessIssues(draft, catalog);
  assert.ok(issues.some((issue) => issue.includes("missing visualProof")));
});

test("Printful catalog readiness accepts matching variants and placements", async () => {
  const { printfulCatalogIssues } = await readinessModule();
  assert.deepEqual(printfulCatalogIssues(product, matchingPrintfulProduct()), []);
});

test("Printful API token verifier reads OAuth scopes without exposing the token", async () => {
  const { verifyPrintfulApiToken } = await readinessModule();
  const result = await verifyPrintfulApiToken({
    apiKey: "pf_test_secret",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.printful.com/v2/oauth-scopes");
      assert.equal(options.headers.Authorization, "Bearer pf_test_secret");
      return new Response(
        JSON.stringify({
          data: [
            { value: "orders:write" },
            { value: "catalog:read" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  });

  assert.deepEqual(result.scopeValues, ["orders:write", "catalog:read"]);
});

test("Printful API token verifier redacts invalid token errors", async () => {
  const { verifyPrintfulApiToken } = await readinessModule();
  await assert.rejects(
    () =>
      verifyPrintfulApiToken({
        apiKey: "pf_test_secret",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { message: "bad token pf_test_secret" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          })
      }),
    (error) => error.message === "bad token [redacted]"
  );
});

test("Printful order-context verifier sends store id for shipping-rate checks", async () => {
  const { verifyPrintfulOrderContext } = await readinessModule();
  const result = await verifyPrintfulOrderContext({
    apiKey: "pf_test_secret",
    storeId: "123",
    catalogVariantId: 44067,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.printful.com/v2/shipping-rates");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer pf_test_secret");
      assert.equal(options.headers["X-PF-Store-Id"], "123");
      const body = JSON.parse(options.body);
      assert.equal(body.order_items[0].catalog_variant_id, 44067);
      return new Response(JSON.stringify({ data: [{ shipping: "STANDARD", rate: "4.75", currency: "USD" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.catalogVariantId, 44067);
  assert.equal(result.rateCount, 1);
  assert.equal(result.standardRate.rate, "4.75");
});

test("Printful order-context verifier reports missing store context without leaking the token", async () => {
  const { verifyPrintfulOrderContext } = await readinessModule();
  await assert.rejects(
    () =>
      verifyPrintfulOrderContext({
        apiKey: "pf_test_secret",
        catalogVariantId: 44067,
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { message: "This endpoint requires `store_id`! pf_test_secret" } }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          })
      }),
    (error) => error.message === "This endpoint requires `store_id`! [redacted]"
  );
});

test("Printful catalog readiness catches variant and availability drift", async () => {
  const { printfulCatalogIssues } = await readinessModule();
  const remote = matchingPrintfulProduct();
  remote.variants[0].size = "M";
  remote.variants[1].availability_status[0].status = "out_of_stock";
  remote.product.files = [{ type: "front" }];

  const issues = printfulCatalogIssues(product, remote);
  assert.ok(issues.some((issue) => issue.includes("size mismatch")));
  assert.ok(issues.some((issue) => issue.includes("out_of_stock")));
  assert.ok(issues.some((issue) => issue.includes("placement back")));
});
