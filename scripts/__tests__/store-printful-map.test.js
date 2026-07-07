const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "store", "products.json"), "utf8"));
const product = catalog.products.find((candidate) => candidate.id === "small-useful-light-tee");

async function mapModule() {
  return import("../store/printful-map.mjs");
}

function printfulProductFor(productOverrides = {}, variantOverrides = {}) {
  return {
    product: {
      id: 1421,
      title: "Unisex Fine Jersey Tee | LAT Apparel 6901",
      is_discontinued: false,
      files: [{ type: "front" }, { type: "back" }, { type: "mockup" }],
      ...productOverrides
    },
    variants: product.variants.map((variant) => ({
      id: product.embeddedFulfillment.variants[variant.id].catalogVariantId,
      color: variant.options.Color,
      size: variant.options.Size,
      in_stock: true,
      availability_status: [{ region: "US", status: "in_stock" }],
      ...variantOverrides[variant.id]
    }))
  };
}

test("Printful mapper parses dry-run and apply arguments", async () => {
  const { parseArgs } = await mapModule();
  const args = parseArgs(["--product", "p", "--catalog-product=1421", "--front-placement", "front", "--back-placement=back", "--apply"]);

  assert.equal(args.productId, "p");
  assert.equal(args.catalogProductId, 1421);
  assert.equal(args.frontPlacement, "front");
  assert.equal(args.backPlacement, "back");
  assert.equal(args.apply, true);
});

test("Printful mapper builds fulfillment mapping from size and color", async () => {
  const { buildPrintfulMapping } = await mapModule();
  const result = buildPrintfulMapping(product, printfulProductFor());

  assert.deepEqual(result.issues, []);
  assert.equal(result.mappedProduct.embeddedFulfillment.status, "ready");
  assert.equal(result.mappedProduct.embeddedFulfillment.catalogProductId, 1421);
  assert.equal(result.mapping["small-useful-light-black-s"].catalogVariantId, 44067);
  assert.equal(result.mapping["small-useful-light-black-m"].catalogVariantId, 44077);
  assert.equal(result.mapping["small-useful-light-black-2xl"].catalogVariantId, 44107);
});

test("Printful mapper reports missing provider variants", async () => {
  const { buildPrintfulMapping } = await mapModule();
  const remote = printfulProductFor();
  remote.variants = remote.variants.filter((variant) => variant.size !== "XL");

  const result = buildPrintfulMapping(product, remote);

  assert.ok(result.issues.some((issue) => issue.includes("small-useful-light-black-xl")));
  assert.equal(result.mappedProduct.embeddedFulfillment.status, "needs-provider-account-and-variant-mapping");
});

test("Printful mapper reports unsupported placements", async () => {
  const { buildPrintfulMapping } = await mapModule();
  const remote = printfulProductFor({ files: [{ type: "front" }, { type: "mockup" }] });

  const result = buildPrintfulMapping(product, remote);

  assert.ok(result.issues.some((issue) => issue.includes("placement back")));
});
