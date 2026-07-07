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
