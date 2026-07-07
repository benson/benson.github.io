const assert = require("node:assert/strict");
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
