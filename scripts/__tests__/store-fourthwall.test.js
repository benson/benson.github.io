const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
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

test("Fourthwall publisher loads ignored local env files without overriding shell env", async () => {
  const fourthwall = await loadModule();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "store-env-"));
  const envPath = path.join(tempDir, ".env.local");
  const env = {
    FOURTHWALL_API_USERNAME: "already-set"
  };

  await fs.writeFile(
    envPath,
    [
      "# local credentials",
      "FOURTHWALL_API_USERNAME=file-user",
      "FOURTHWALL_API_PASSWORD=\"file-password\"",
      "FOURTHWALL_API_TOKEN='file-token'"
    ].join("\n"),
    "utf8"
  );

  const loaded = await fourthwall.loadLocalEnvFiles({ files: [envPath], env });
  assert.deepEqual(loaded, [envPath]);
  assert.equal(env.FOURTHWALL_API_USERNAME, "already-set");
  assert.equal(env.FOURTHWALL_API_PASSWORD, "file-password");
  assert.equal(env.FOURTHWALL_API_TOKEN, "file-token");
});

test("Fourthwall publisher can run the full create and publish flow against mocked API calls", async () => {
  const fourthwall = await loadModule();
  const calls = [];

  const productTemplateSummary = {
    productId: "pro_test",
    name: "Premium T-Shirt",
    slug: "premium-t-shirt",
    category: "apparel/t-shirts",
    brand: "Comfort Colors",
    basePrice: { amount: 21.5, currency: "USD" },
    productionMethod: "DTG",
    supportsBackendRendering: true
  };
  const productTemplate = {
    ...productTemplateSummary,
    colorVariants: [
      {
        color: { name: "Black", hex: "#000000" },
        available: true,
        sizeVariants: [
          { variantId: "var_s", size: "S", available: true, price: { amount: 21.5, currency: "USD" } },
          { variantId: "var_m", size: "M", available: true, price: { amount: 21.5, currency: "USD" } },
          { variantId: "var_l", size: "L", available: true, price: { amount: 21.5, currency: "USD" } },
          { variantId: "var_xl", size: "XL", available: true, price: { amount: 22.5, currency: "USD" } }
        ]
      }
    ],
    customizableAreas: [
      { regionId: "front", name: "Front", available: true, supportsBackendRendering: true, placements: [] },
      { regionId: "back", name: "Back", available: true, supportsBackendRendering: true, placements: [] }
    ]
  };

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  async function fetchImpl(url, init = {}) {
    const method = init.method || "GET";
    const parsed = new URL(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path: parsed.pathname, body, url: String(url), headers: init.headers });

    if (parsed.hostname === "upload.local") return new Response("", { status: 200 });
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/shops/current") {
      return json({
        id: "sh_test",
        name: "Benson Store",
        domain: "benson-test.fourthwall.com",
        publicDomain: "benson-test.fourthwall.com"
      });
    }
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/products") {
      return json({ results: [], total: 0, page: 0, size: 20, totalPages: 0 });
    }
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/product-templates") {
      return json({ code: "not-found" }, 404);
    }
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/product-templates/page/1") {
      return json({ results: [productTemplateSummary], total: 1 });
    }
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/product-templates/pro_test") {
      return json(productTemplate);
    }
    if (method === "POST" && parsed.pathname === "/open-api/v1.0/media/upload-url") {
      return json({
        uploadUrl: `https://upload.local/${body.fileName}`,
        fileUrl: `https://cdn.fourthwall.test/${body.fileName}`
      }, 201);
    }
    if (method === "POST" && parsed.pathname === "/open-api/v1.0/media/images") {
      const id = body.fileUrl.includes("front") ? "img_front" : "img_back";
      return json({
        id,
        uri: body.fileUrl,
        width: body.width,
        height: body.height,
        thumbnail: body.fileUrl,
        preview: body.fileUrl
      }, 201);
    }
    if (method === "POST" && parsed.pathname === "/open-api/v1.0/products") {
      return json({
        productId: "off_test",
        customizationId: "cus_test",
        images: []
      }, 201);
    }
    if (method === "GET" && parsed.pathname === "/open-api/v1.0/products/off_test") {
      return json({
        id: "off_test",
        name: "small useful light",
        slug: "small-useful-light",
        description: "a quiet tee",
        type: "STANDARD",
        state: { type: "AVAILABLE" },
        access: { type: "PUBLIC" },
        images: [],
        variants: [],
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z"
      });
    }
    if (method === "PUT" && parsed.pathname === "/open-api/v1.0/products/off_test/state") {
      assert.deepEqual(body, { state: "PUBLIC" });
      return json({ id: "off_test", name: "small useful light", slug: "small-useful-light" });
    }
    if (method === "PUT" && parsed.pathname === "/open-api/v1.0/products/off_test/availability") {
      assert.deepEqual(body, { available: true });
      return json({ id: "off_test", name: "small useful light", slug: "small-useful-light" });
    }

    return json({ code: "unexpected", method, path: parsed.pathname }, 500);
  }

  const result = await fourthwall.publishProduct({
    id: "small-useful-light-tee",
    apply: true,
    dryRun: false,
    publish: true,
    updateCatalog: false,
    apiBase: "https://api.test"
  }, {
    env: {
      FOURTHWALL_API_USERNAME: "user",
      FOURTHWALL_API_PASSWORD: "password"
    },
    fetchImpl
  });

  assert.equal(result.providerProduct.id, "off_test");
  assert.equal(result.productUrl, "https://benson-test.fourthwall.com/products/small-useful-light");
  assert.equal(result.colors[0], "Black");
  assert.deepEqual(result.sizes, ["S", "M", "L", "XL"]);

  const createCall = calls.find((call) => call.method === "POST" && call.path === "/open-api/v1.0/products");
  assert.equal(createCall.body.type, "design");
  assert.equal(createCall.body.productTemplateId, "pro_test");
  assert.equal(createCall.body.publishOnCreate, true);
  assert.deepEqual(createCall.body.regions, [
    { region: "front", imageId: "img_front", placementStrategy: "AUTO" },
    { region: "back", imageId: "img_back", placementStrategy: "AUTO" }
  ]);

  const uploadCalls = calls.filter((call) => call.url.startsWith("https://upload.local/"));
  assert.equal(uploadCalls.length, 2);
  assert.ok(uploadCalls.every((call) => call.headers["x-goog-content-length-range"]));
});
