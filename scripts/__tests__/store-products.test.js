const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const catalogPath = path.join(root, "store", "products.json");

test("store catalog has valid product records", () => {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  assert.ok(Array.isArray(catalog.products));
  assert.ok(catalog.products.length > 0);

  const ids = new Set();
  for (const product of catalog.products) {
    assert.match(product.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(product.id), `duplicate product id: ${product.id}`);
    ids.add(product.id);

    assert.ok(product.title);
    assert.ok(product.category);
    assert.ok(Number.isInteger(product.price));
    assert.ok(product.price >= 0);
    assert.ok(product.currency);
    assert.ok(product.image);
    assert.ok(fs.existsSync(path.join(root, "store", product.image)), `missing image: ${product.image}`);

    if (product.production) {
      for (const key of ["frontArtwork", "backArtwork", "fallbackBackArtwork", "frontSource", "fallbackBackSource"]) {
        if (!product.production[key]) continue;
        assert.ok(
          fs.existsSync(path.join(root, "store", product.production[key])),
          `missing production asset: ${product.production[key]}`
        );
      }
    }

    if (product.status === "live") {
      assert.ok(product.checkoutUrl || product.checkout?.mode, `${product.id} is live without a checkout path`);
    }

    if (product.checkout?.mode === "embedded-stripe") {
      assert.ok(Array.isArray(product.variants), `${product.id} embedded checkout requires variants`);
      assert.ok(product.variants.length > 0, `${product.id} embedded checkout requires at least one variant`);
      const variantIds = new Set();
      for (const variant of product.variants) {
        assert.match(variant.id, /^[a-z0-9-]+$/);
        assert.ok(!variantIds.has(variant.id), `duplicate variant id: ${variant.id}`);
        variantIds.add(variant.id);
        assert.ok(variant.sku);
        assert.ok(variant.label);
        assert.ok(Number.isInteger(variant.price));
        assert.ok(variant.price >= 0);
      }
    }
  }
});
