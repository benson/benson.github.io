const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function scaffoldModule() {
  return import("../store/product-scaffold.mjs");
}

test("product scaffold slugifies titles and parses cents", async () => {
  const { cents, slugify } = await scaffoldModule();

  assert.equal(slugify("Small Useful Light!"), "small-useful-light");
  assert.equal(cents("39.95"), 3995);
  assert.equal(cents("32"), 3200);
  assert.equal(cents("3995c"), 3995);
});

test("product scaffold builds a safe embedded t-shirt draft", async () => {
  const { buildScaffoldProduct } = await scaffoldModule();
  const product = buildScaffoldProduct({
    title: "Small Useful Light",
    type: "t-shirt",
    summary: "a little lamp doing its best"
  });

  assert.equal(product.id, "small-useful-light");
  assert.equal(product.status, "draft");
  assert.equal(product.checkout.mode, "embedded-stripe");
  assert.deepEqual(product.checkout.allowedCountries, ["US"]);
  assert.equal(product.variants.length, 5);
  assert.equal(product.variants[0].id, "small-useful-light-black-s");
  assert.equal(product.embeddedFulfillment.recommended, "printful");
  assert.equal(product.embeddedFulfillment.status, "needs-provider-mapping");
  assert.equal(product.embeddedFulfillment.catalogProductId, 1421);
  assert.equal(product.production.backArtwork, "assets/small-useful-light-back.png");
});

test("product scaffold parses catalog apply options", async () => {
  const { parseArgs } = await scaffoldModule();
  const args = parseArgs([
    "--title",
    "Priority Pass Hat",
    "--id",
    "priority-pass",
    "--type",
    "hat",
    "--image",
    "assets/hat.png",
    "--front-artwork",
    "assets/hat-front.png",
    "--no-back",
    "--apply",
    "--replace",
    "--allow-missing-assets",
    "--catalog",
    "tmp/products.json"
  ]);

  assert.equal(args.title, "Priority Pass Hat");
  assert.equal(args.id, "priority-pass");
  assert.equal(args.type, "hat");
  assert.equal(args.image, "assets/hat.png");
  assert.equal(args.frontArtwork, "assets/hat-front.png");
  assert.equal(args.noBack, true);
  assert.equal(args.apply, true);
  assert.equal(args.replace, true);
  assert.equal(args.allowMissingAssets, true);
  assert.equal(args.catalog, "tmp/products.json");
});

test("product scaffold lets hats avoid back placements by default", async () => {
  const { buildScaffoldProduct } = await scaffoldModule();
  const product = buildScaffoldProduct({
    title: "Priority Pass Hat",
    type: "hat",
    price: "32"
  });
  const variant = product.variants[0];
  const mapping = product.embeddedFulfillment.variants[variant.id];

  assert.equal(product.category, "accessories");
  assert.equal(product.price, 3200);
  assert.equal(product.production.method, "embroidery");
  assert.equal(product.production.backArtwork, "");
  assert.equal(mapping.frontPlacement, "front");
  assert.equal(mapping.backPlacement, false);
});

test("product scaffold parses custom color, sizes, and details", async () => {
  const { buildScaffoldProduct } = await scaffoldModule();
  const product = buildScaffoldProduct({
    title: "Blue Table Thing",
    color: "Navy",
    sizes: "S,M",
    details: "soft, mysterious",
    price: "25"
  });

  assert.deepEqual(product.details, ["soft", "mysterious"]);
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[0].label, "Navy / S");
  assert.equal(product.variants[1].price, 2500);
});

test("product scaffold applies and replaces catalog records", async () => {
  const { applyScaffoldProduct, buildScaffoldProduct } = await scaffoldModule();
  const product = buildScaffoldProduct({ title: "Quiet Moon", type: "hat" });
  const initial = { updated: "2026-01-01", products: [] };

  const added = applyScaffoldProduct(initial, product, { date: "2026-07-07" });
  assert.equal(added.replaced, false);
  assert.equal(added.catalog.updated, "2026-07-07");
  assert.equal(added.catalog.products[0].id, "quiet-moon");

  assert.throws(() => applyScaffoldProduct(added.catalog, product), /already exists/);

  const replacement = buildScaffoldProduct({ title: "Quiet Moon", type: "hat", price: "40" });
  const replaced = applyScaffoldProduct(added.catalog, replacement, { date: "2026-07-08", replace: true });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.catalog.products.length, 1);
  assert.equal(replaced.catalog.products[0].price, 4000);
});

test("product scaffold apply refuses missing assets by default", async () => {
  const { runProductScaffold } = await scaffoldModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-product-scaffold-"));
  const catalog = path.join(dir, "products.json");
  fs.writeFileSync(catalog, JSON.stringify({ updated: "2026-01-01", products: [] }, null, 2));

  await assert.rejects(
    () =>
      runProductScaffold(
        {
          apply: true,
          catalog,
          title: "Priority Pass Hat",
          type: "hat"
        },
        { now: "2026-07-07" }
      ),
    /missing asset: assets\/priority-pass-hat-mockup.png/
  );
});

test("product scaffold apply writes catalog when assets exist", async () => {
  const { runProductScaffold } = await scaffoldModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-product-scaffold-"));
  const catalog = path.join(dir, "products.json");
  const assets = path.join(dir, "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(catalog, JSON.stringify({ updated: "2026-01-01", products: [] }, null, 2));
  fs.writeFileSync(path.join(assets, "priority-pass-hat-mockup.png"), "mockup");
  fs.writeFileSync(path.join(assets, "priority-pass-hat-front.png"), "front");

  const result = await runProductScaffold(
    {
      apply: true,
      catalog,
      price: "32",
      title: "Priority Pass Hat",
      type: "hat"
    },
    { now: "2026-07-07" }
  );

  const updated = JSON.parse(fs.readFileSync(catalog, "utf8"));
  assert.equal(result.applied, true);
  assert.equal(result.replaced, false);
  assert.equal(updated.updated, "2026-07-07");
  assert.equal(updated.products.length, 1);
  assert.equal(updated.products[0].id, "priority-pass-hat");
  assert.equal(updated.products[0].price, 3200);
});

test("product scaffold can apply missing assets only to a custom private catalog", async () => {
  const { runProductScaffold } = await scaffoldModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-product-scaffold-"));
  const catalog = path.join(dir, "draft-products.json");
  fs.writeFileSync(catalog, JSON.stringify({ updated: "2026-01-01", products: [] }, null, 2));

  const result = await runProductScaffold(
    {
      allowMissingAssets: true,
      apply: true,
      catalog,
      title: "Private Draft Hat",
      type: "hat"
    },
    { now: "2026-07-07" }
  );

  const updated = JSON.parse(fs.readFileSync(catalog, "utf8"));
  assert.equal(result.applied, true);
  assert.equal(result.assetIssues.length, 2);
  assert.equal(updated.products[0].id, "private-draft-hat");
});
