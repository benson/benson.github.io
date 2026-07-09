import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv, root } from "./env.mjs";
import { productPublicAssetUrl } from "./fulfillment.mjs";
import { pngInfo } from "./product-readiness.mjs";

const PRINTFUL_API = "https://api.printful.com";
const DEFAULT_PRODUCTS = ["redbullfinch-pepper-tee", "redbullfinch-crimson-tee"];
const DEFAULT_PUBLIC_URL = "https://bensonperry.com";
const DEFAULT_MOCKUP_WIDTH = 1400;
const AREA = {
  area_width: 1800,
  area_height: 2400
};

const CANDIDATES = [
  {
    id: "default",
    label: "Printful default",
    note: "No custom position. This should match the current live proof.",
    artwork: "normal"
  },
  {
    id: "higher",
    label: "Higher",
    note: "First real proof from the higher widget preset.",
    artwork: "normal",
    position: { left: 970, top: 500, width: 255 }
  },
  {
    id: "inboard",
    label: "Inboard",
    note: "A little closer to the shirt center.",
    artwork: "normal",
    position: { left: 870, top: 590, width: 255 }
  },
  {
    id: "lower",
    label: "Lower",
    note: "A lower chest placement check.",
    artwork: "normal",
    position: { left: 960, top: 730, width: 270 }
  },
  {
    id: "smaller-higher",
    label: "Smaller higher",
    note: "A smaller mark, moved upward.",
    artwork: "normal",
    position: { left: 980, top: 520, width: 220 }
  },
  {
    id: "mirrored-default",
    label: "Mirrored default",
    note: "Mirrored artwork with Printful's default placement.",
    artwork: "mirrored"
  },
  {
    id: "mirrored-higher",
    label: "Mirrored higher",
    note: "Mirrored artwork with the higher preset.",
    artwork: "mirrored",
    position: { left: 970, top: 500, width: 255 }
  }
];

const ARTWORKS = {
  normal: "assets/redbullfinch-embroidery-full.png",
  mirrored: "assets/redbullfinch-embroidery-full-mirrored.png"
};

function parseArgs(argv) {
  const args = {
    candidates: null,
    mockupWidth: DEFAULT_MOCKUP_WIDTH,
    products: DEFAULT_PRODUCTS,
    publicUrl: process.env.STORE_PUBLIC_URL || DEFAULT_PUBLIC_URL
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--candidate") {
      args.candidates = [...(args.candidates || []), argv[(index += 1)]];
    } else if (arg.startsWith("--candidate=")) {
      args.candidates = [...(args.candidates || []), arg.slice("--candidate=".length)];
    } else if (arg === "--product") {
      args.products = argv[(index += 1)].split(",").map((value) => value.trim()).filter(Boolean);
    } else if (arg.startsWith("--product=")) {
      args.products = arg.slice("--product=".length).split(",").map((value) => value.trim()).filter(Boolean);
    } else if (arg === "--mockup-width") {
      args.mockupWidth = Number(argv[(index += 1)]);
    } else if (arg.startsWith("--mockup-width=")) {
      args.mockupWidth = Number(arg.slice("--mockup-width=".length));
    } else if (arg === "--public-url") {
      args.publicUrl = argv[(index += 1)];
    } else if (arg.startsWith("--public-url=")) {
      args.publicUrl = arg.slice("--public-url=".length);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(args.mockupWidth) || args.mockupWidth < 800) {
    throw new Error("--mockup-width must be a number of at least 800.");
  }

  return args;
}

function help() {
  console.log(`Printful proof board

Generates real Printful mockup proofs for the redbullfinch embroidery products.

Usage:
  node scripts/store/printful-proof-board.mjs
  node scripts/store/printful-proof-board.mjs --candidate higher --candidate inboard

Options:
  --candidate <id>      Candidate to generate. Repeatable. Defaults to all.
  --product <ids>       Comma-separated store product ids. Defaults to redbullfinch tees.
  --mockup-width <px>   Printful mockup width. Defaults to ${DEFAULT_MOCKUP_WIDTH}.
  --public-url <url>    Public site URL for artwork. Defaults to STORE_PUBLIC_URL or ${DEFAULT_PUBLIC_URL}.
`);
}

function readCatalog() {
  return JSON.parse(fs.readFileSync(path.join(root, "store", "products.json"), "utf8"));
}

function selectedCandidates(ids) {
  if (!ids?.length) return CANDIDATES;
  const byId = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
  return ids.map((id) => {
    const candidate = byId.get(id);
    if (!candidate) throw new Error(`Unknown candidate: ${id}`);
    return candidate;
  });
}

function artworkRatio(artworkPath) {
  const info = pngInfo(path.join(root, "store", artworkPath));
  return info.height / info.width;
}

function normalizedPosition(candidate, ratio) {
  if (!candidate.position) return null;
  const width = Math.round(candidate.position.width);
  const height = Math.round(candidate.position.height || width * ratio);
  return {
    ...AREA,
    width,
    height,
    top: Math.round(candidate.position.top),
    left: Math.round(candidate.position.left)
  };
}

function usesUnlimitedColorEmbroidery(product) {
  const production = product.production || {};
  return (
    String(production.method || "").toLowerCase() === "embroidery" &&
    (production.unlimitedColorEmbroidery === true || production.embroideryColorMode === "unlimited-color")
  );
}

function placementOptions(product) {
  if (!usesUnlimitedColorEmbroidery(product)) return [];
  return [{ name: "unlimited_color", value: true }];
}

function taskProduct({ product, candidate, publicUrl }) {
  const proof = product.visualProof || {};
  const artworkPath = ARTWORKS[candidate.artwork || "normal"];
  if (!artworkPath) throw new Error(`Unknown artwork flavor: ${candidate.artwork}`);

  const ratio = artworkRatio(artworkPath);
  const position = normalizedPosition(candidate, ratio);
  const layer = {
    type: "file",
    url: productPublicAssetUrl(publicUrl, artworkPath)
  };
  if (position) layer.position = position;

  return {
    request: {
      productId: product.id,
      productTitle: product.title,
      candidateId: candidate.id,
      candidateLabel: candidate.label,
      candidateNote: candidate.note,
      artwork: candidate.artwork || "normal",
      artworkPath,
      position,
      catalogVariantId: proof.catalogVariantId,
      placement: proof.placement,
      mockupStyleId: proof.mockupStyleId
    },
    payload: {
      source: "catalog",
      mockup_style_ids: [proof.mockupStyleId],
      catalog_product_id: product.embeddedFulfillment?.catalogProductId,
      catalog_variant_ids: [proof.catalogVariantId],
      placements: [
        {
          placement: proof.placement,
          technique: String(product.production?.method || "dtg").toLowerCase() === "embroidery" ? "embroidery" : "dtg",
          layers: [layer],
          ...(placementOptions(product).length ? { placement_options: placementOptions(product) } : {})
        }
      ]
    }
  };
}

function assertProofableProduct(product) {
  if (!product) throw new Error("Product is missing.");
  if (product.embeddedFulfillment?.recommended !== "printful") throw new Error(`${product.id} is not a Printful product.`);
  if (!product.visualProof?.catalogVariantId) throw new Error(`${product.id} is missing visualProof.catalogVariantId.`);
  if (!product.visualProof?.placement) throw new Error(`${product.id} is missing visualProof.placement.`);
  if (!Number.isInteger(product.visualProof?.mockupStyleId)) throw new Error(`${product.id} is missing visualProof.mockupStyleId.`);
}

function printfulHeaders(env, hasBody = false) {
  return {
    Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(env.PRINTFUL_STORE_ID ? { "X-PF-Store-Id": String(env.PRINTFUL_STORE_ID) } : {})
  };
}

function redact(text, env) {
  let output = String(text || "");
  for (const secret of [env.PRINTFUL_API_KEY, env.PRINTFUL_STORE_ID].filter(Boolean)) {
    output = output.split(String(secret)).join("[redacted]");
  }
  return output;
}

async function printfulJson(pathname, { env = process.env, method = "GET", body = null } = {}) {
  const response = await fetch(`${PRINTFUL_API}${pathname}`, {
    method,
    headers: printfulHeaders(env, Boolean(body)),
    body: body ? JSON.stringify(body) : null
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(redact(data.detail || data.error?.message || data.message || JSON.stringify(data), env));
  }
  return data;
}

async function createMockupTasks(products, { env = process.env, mockupWidth = DEFAULT_MOCKUP_WIDTH } = {}) {
  return printfulJson("/v2/mockup-tasks", {
    env,
    method: "POST",
    body: {
      format: "png",
      mockup_width_px: mockupWidth,
      products: products.map((entry) => entry.payload)
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForTasks(taskIds, { env = process.env, attempts = 24, delayMs = 5000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await printfulJson(`/v2/mockup-tasks?id=${encodeURIComponent(taskIds.join(","))}`, { env });
    const tasks = Array.isArray(data.data) ? data.data : [];
    const done = tasks.length === taskIds.length && tasks.every((task) => ["completed", "failed"].includes(task.status));
    if (done) return tasks;
    await sleep(delayMs);
  }
  throw new Error(`Timed out waiting for Printful mockup task(s): ${taskIds.join(", ")}`);
}

function mockupUrlFor(task, request) {
  const variant = (task.catalog_variant_mockups || []).find((entry) => entry.catalog_variant_id === request.catalogVariantId);
  const mockup = (variant?.mockups || []).find((entry) => entry.style_id === request.mockupStyleId && entry.placement === request.placement);
  return mockup?.mockup_url || variant?.mockups?.[0]?.mockup_url || null;
}

async function download(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, bytes);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderProofBoard(results, generatedAt) {
  const groups = new Map();
  for (const result of results) {
    if (!groups.has(result.productId)) groups.set(result.productId, []);
    groups.get(result.productId).push(result);
  }

  const sections = [...groups.entries()]
    .map(([productId, items]) => {
      const title = items[0]?.productTitle || productId;
      const cards = items
        .map((item) => {
          const recipe = {
            productId: item.productId,
            candidateId: item.candidateId,
            production: {
              frontArtwork: item.artworkPath,
              ...(item.position ? { frontPosition: item.position } : {})
            }
          };
          return `<article class="proof-card">
            <a href="${escapeHtml(item.assetPath)}" target="_blank" rel="noreferrer">
              <img src="${escapeHtml(item.assetPath)}" alt="${escapeHtml(item.productTitle)} ${escapeHtml(item.candidateLabel)} Printful proof">
            </a>
            <div class="proof-card-body">
              <p class="kicker">${escapeHtml(item.candidateId)}</p>
              <h3>${escapeHtml(item.candidateLabel)}</h3>
              <p>${escapeHtml(item.candidateNote)}</p>
              <pre>${escapeHtml(JSON.stringify(recipe, null, 2))}</pre>
            </div>
          </article>`;
        })
        .join("\n");
      return `<section class="proof-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="proof-grid">${cards}</div>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>redbullfinch Printful proofs | benson perry</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="/store/favicon.svg">
  <link rel="stylesheet" href="style.css?v=redbullfinch-proof-board-1">
  <style>
    .proof-shell { max-width: 1440px; }
    .proof-section { margin-top: 34px; }
    .proof-section h2 { font-size: clamp(2.2rem, 5vw, 4rem); margin-bottom: 18px; }
    .proof-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .proof-card { overflow: hidden; border: 2px solid var(--line); border-radius: 8px; background: var(--paper-strong); box-shadow: 7px 7px 0 var(--shadow); }
    .proof-card img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-bottom: 2px solid var(--line); background: #eee5d8; }
    .proof-card-body { display: grid; gap: 8px; padding: 14px; }
    .proof-card h3 { font-size: 1.6rem; }
    .proof-card p { color: var(--muted); }
    .proof-card pre { overflow: auto; max-height: 280px; border: 1px solid rgba(23,20,17,.18); border-radius: 6px; padding: 10px; background: rgba(255,250,241,.7); font-size: .78rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/store/">store</a>
    <nav aria-label="proof links">
      <a href="/store/positioner.html">positioner</a>
      <a href="/store/">catalog</a>
    </nav>
  </header>

  <main class="proof-shell">
    <section class="positioner-heading">
      <div>
        <p class="kicker">Printful proof board</p>
        <h1>redbullfinch proofs</h1>
      </div>
      <p>Generated ${escapeHtml(generatedAt)} from Printful mockup tasks.</p>
    </section>
    ${sections}
  </main>
</body>
</html>
`;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  loadLocalEnv();
  const args = parseArgs(argv);
  if (args.help) {
    help();
    return null;
  }
  if (!env.PRINTFUL_API_KEY) throw new Error("PRINTFUL_API_KEY is missing.");

  const catalog = readCatalog();
  const productById = new Map((catalog.products || []).map((product) => [product.id, product]));
  const candidates = selectedCandidates(args.candidates);
  const products = args.products.map((id) => {
    const product = productById.get(id);
    assertProofableProduct(product);
    return product;
  });

  const taskInputs = products.flatMap((product) => candidates.map((candidate) => taskProduct({ product, candidate, publicUrl: args.publicUrl })));
  console.log(`Creating ${taskInputs.length} Printful proof mockup task(s)...`);
  const created = await createMockupTasks(taskInputs, { env, mockupWidth: args.mockupWidth });
  const tasks = Array.isArray(created.data) ? created.data : [];
  if (tasks.length !== taskInputs.length) {
    throw new Error(`Expected ${taskInputs.length} tasks, Printful returned ${tasks.length}.`);
  }

  const taskIds = tasks.map((task) => task.id);
  console.log(`Waiting for Printful task(s): ${taskIds.join(", ")}`);
  const completed = await waitForTasks(taskIds, { env });
  const completedById = new Map(completed.map((task) => [task.id, task]));
  const generatedAt = new Date().toISOString();
  const assetDir = path.join(root, "store", "assets", "redbullfinch-proofs");
  const results = [];

  for (let index = 0; index < taskInputs.length; index += 1) {
    const request = taskInputs[index].request;
    const task = completedById.get(taskIds[index]);
    if (!task || task.status !== "completed") {
      throw new Error(`Printful task failed for ${request.productId}/${request.candidateId}: ${JSON.stringify(task?.failure_reasons || task)}`);
    }

    const mockupUrl = mockupUrlFor(task, request);
    if (!mockupUrl) throw new Error(`No mockup URL for ${request.productId}/${request.candidateId}.`);
    const filename = `${request.productId}-${request.candidateId}.png`;
    const targetPath = path.join(assetDir, filename);
    await download(mockupUrl, targetPath);
    results.push({
      ...request,
      taskId: task.id,
      mockupUrl,
      assetPath: `assets/redbullfinch-proofs/${filename}`,
      generatedAt
    });
    console.log(`saved ${request.productId}/${request.candidateId}`);
  }

  const manifestPath = path.join(assetDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedAt, results }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "store", "redbullfinch-proofs.html"), renderProofBoard(results, generatedAt));
  console.log("Wrote store/redbullfinch-proofs.html");
  return { generatedAt, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
