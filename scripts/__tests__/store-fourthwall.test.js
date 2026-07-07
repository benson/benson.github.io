const assert = require("node:assert/strict");
const test = require("node:test");

async function loadModule() {
  return import("../store/fourthwall.mjs");
}

test("Fourthwall publisher validates the current tee artwork", async () => {
  const fourthwall = await loadModule();
  const catalog = await fourthwall.readCatalog();
  const product = fourthwall.findProduct(catalog, "small-useful-light-tee");
  const validation = await fourthwall.validateProductAssets(product);

  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(validation.assets.length, 2);
  assert.deepEqual(validation.assets.map((asset) => asset.region), ["front", "back"]);
  assert.ok(validation.assets.every((asset) => asset.hasAlpha));
});

test("Fourthwall template ranking prefers DTG black shirt templates with required regions", async () => {
  const fourthwall = await loadModule();
  const product = {
    production: { method: "dtg" }
  };
  const template = {
    name: "Premium Heavyweight T-Shirt",
    slug: "premium-heavyweight-t-shirt",
    category: "apparel/t-shirts",
    brand: "Comfort Colors",
    productionMethod: "DTG",
    supportsBackendRendering: true,
    colorVariants: [
      {
        color: { name: "Black", hex: "#000000" },
        available: true,
        sizeVariants: [
          { size: "S", available: true },
          { size: "M", available: true },
          { size: "L", available: true }
        ]
      }
    ],
    customizableAreas: [
      { regionId: "front", name: "Front", available: true, supportsBackendRendering: true },
      { regionId: "back", name: "Back", available: true, supportsBackendRendering: true }
    ]
  };

  const ranking = fourthwall.rankTemplate(template, product, ["front", "back"]);
  assert.ok(ranking.score > 100);
  assert.deepEqual(fourthwall.chooseColors(template, ["Black"]), ["Black"]);
  assert.deepEqual(fourthwall.chooseSizes(template, ["Black"], ["S", "M", "XL"]), ["S", "M"]);
});

test("Fourthwall product request uses registered media image ids", async () => {
  const fourthwall = await loadModule();
  const request = fourthwall.createDesignProductRequest({
    product: {
      title: "small useful light",
      summary: "a quiet tee"
    },
    template: {
      productId: "pro_test"
    },
    assets: [
      {
        region: "front",
        relativePath: "assets/front.png",
        placementStrategy: "AUTO"
      },
      {
        region: "back",
        relativePath: "assets/back.png",
        placementStrategy: "AUTO"
      }
    ],
    mediaImages: [
      { id: "img_front" },
      { id: "img_back" }
    ],
    colors: ["Black"],
    sizes: ["M", "L"],
    profitMargin: 12.5,
    publish: true
  });

  assert.equal(request.type, "design");
  assert.equal(request.productTemplateId, "pro_test");
  assert.equal(request.publishOnCreate, true);
  assert.deepEqual(request.regions, [
    { region: "front", imageId: "img_front", placementStrategy: "AUTO" },
    { region: "back", imageId: "img_back", placementStrategy: "AUTO" }
  ]);
});
