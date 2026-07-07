const assert = require("node:assert/strict");
const test = require("node:test");

async function modelModule() {
  return import("../../store/product-model.mjs");
}

test("store product model builds embedded hat drafts for the studio", async () => {
  const { buildEmbeddedProductDraft } = await modelModule();
  const product = buildEmbeddedProductDraft({
    color: "Black",
    details: "black cotton, front embroidery",
    image: "assets/priority-pass-hat-mockup.png",
    price: "32",
    sizes: "OS",
    title: "Priority Pass Hat",
    type: "hat"
  });
  const variant = product.variants[0];

  assert.equal(product.id, "priority-pass-hat");
  assert.equal(product.category, "accessories");
  assert.equal(product.fulfillment, "embedded");
  assert.equal(product.checkout.mode, "embedded-stripe");
  assert.equal(product.price, 3200);
  assert.deepEqual(product.details, ["black cotton", "front embroidery"]);
  assert.equal(variant.id, "priority-pass-hat-black-os");
  assert.equal(product.embeddedFulfillment.variants[variant.id].backPlacement, false);
});

test("store product model keeps t-shirt defaults aligned with the CLI scaffold", async () => {
  const { buildEmbeddedProductDraft, cents, slugify } = await modelModule();
  const product = buildEmbeddedProductDraft({ title: "Small Useful Light", type: "t-shirt" });

  assert.equal(slugify("Small Useful Light!"), "small-useful-light");
  assert.equal(cents("3995c"), 3995);
  assert.equal(product.variants.length, 5);
  assert.equal(product.embeddedFulfillment.catalogProductId, 1421);
  assert.equal(product.production.backArtwork, "assets/small-useful-light-back.png");
});
