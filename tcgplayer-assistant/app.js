import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

const SCRYFALL_API = "https://api.scryfall.com";
const SCRYFALL_DELAY_MS = 80;
const scryfallCache = new Map();

const state = {
  orders: [],
  batchName: "",
  shareUrl: "",
};

const els = {
  pdfInput: document.querySelector("#pdfInput"),
  dropZone: document.querySelector("#dropZone"),
  summary: document.querySelector("#summary"),
  orders: document.querySelector("#orders"),
  emptyState: document.querySelector("#emptyState"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  clearButton: document.querySelector("#clearButton"),
  toast: document.querySelector("#toast"),
};

els.pdfInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) importPdf(file);
});

els.dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("dragging");
});

els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  const [file] = event.dataTransfer.files || [];
  if (file) importPdf(file);
});

els.copyLinkButton.addEventListener("click", async () => {
  if (!state.shareUrl) await updateShareUrl();
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    showToast("Link copied.");
  } catch {
    showToast("Clipboard was blocked.");
  }
});

els.clearButton.addEventListener("click", () => {
  state.orders = [];
  state.batchName = "";
  state.shareUrl = "";
  history.replaceState(null, "", cleanUrl());
  render();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-address]");
  if (!button) return;
  const order = state.orders.find((candidate) => candidate.orderNumber === button.dataset.copyAddress);
  if (!order) return;

  try {
    await navigator.clipboard.writeText(order.shipToLines.join("\n"));
    showToast("Address copied.");
  } catch {
    showToast("Clipboard was blocked.");
  }
});

await loadFromHash();
render();
resolveMissingImagesFromSharedLink();

async function importPdf(file) {
  try {
    setLoading(true, `Reading ${file.name}...`);
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const parsed = [];
    let skippedPages = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const order = await parsePackingSlipPage(page);
      if (order) parsed.push(order);
      else skippedPages += 1;
    }

    state.orders = mergeOrderPages(parsed);
    state.batchName = file.name;
    render();
    const matchedImages = await resolveMissingCardImages();
    await updateShareUrl();
    render();

    if (!state.orders.length) {
      showToast("No orders found.");
    } else {
      const skipped = skippedPages ? ` ${skippedPages} non-order page skipped.` : "";
      const matched = matchedImages ? ` ${matchedImages} card image${matchedImages === 1 ? "" : "s"} matched.` : "";
      showToast(`Loaded ${state.orders.length} orders.${skipped}${matched}`);
    }
  } catch (error) {
    console.error(error);
    showToast("Could not parse that PDF.");
  } finally {
    setLoading(false);
    els.pdfInput.value = "";
  }
}

async function parsePackingSlipPage(page) {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const lines = buildLines(textContent.items);
  const flatText = lines.map((line) => line.text).join("\n");
  const orderNumber = extractFirst(flatText, /Order Number:\s*([A-Z0-9-]+)/i);

  if (!orderNumber || !/Ship To:/i.test(flatText) || !/Quantity/i.test(flatText)) {
    return null;
  }

  const shipToLines = extractShipTo(lines);
  return {
    orderNumber,
    buyerName: extractField(lines, "Buyer Name") || shipToLines[0] || "",
    orderDate: extractField(lines, "Order Date"),
    shippingMethod: extractField(lines, "Shipping Method"),
    sellerName: extractField(lines, "Seller Name"),
    shipToLines,
    items: extractItems(lines, viewport.width),
  };
}

function buildLines(items) {
  const tokens = items
    .map((item) => ({
      text: cleanupLine(String(item.str || "").replace(/\u00a0/g, " ")),
      x: item.transform[4],
      y: item.transform[5],
    }))
    .filter((item) => item.text);

  tokens.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  for (const token of tokens) {
    const line = lines.find((candidate) => Math.abs(candidate.y - token.y) <= 2.5);
    if (line) {
      line.tokens.push(token);
      line.y = (line.y + token.y) / 2;
      line.x = Math.min(line.x, token.x);
    } else {
      lines.push({ y: token.y, x: token.x, tokens: [token], text: "" });
    }
  }

  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
    line.text = cleanupLine(line.tokens.map((token) => token.text).join(" "));
  }

  return lines.filter((line) => line.text);
}

function extractShipTo(lines) {
  const shipIndex = lines.findIndex((line) => /^Ship To:/i.test(line.text));
  const orderIndex = lines.findIndex((line, index) => index > shipIndex && /^Order Number:/i.test(line.text));
  if (shipIndex < 0 || orderIndex < 0) return [];

  return lines
    .slice(shipIndex + 1, orderIndex)
    .filter((line) => line.x < 260)
    .map((line) => cleanupLine(line.text))
    .filter(Boolean);
}

function extractField(lines, label) {
  const labelPattern = new RegExp(`${escapeRegExp(label)}:\\s*(.+?)(?=\\s+(Order Date|Shipping Method|Buyer Name|Seller Name):|$)`, "i");

  for (const line of lines) {
    const value = extractFirst(line.text, labelPattern);
    if (value) return cleanupLine(value);
  }

  return "";
}

function extractItems(lines, pageWidth) {
  const start = lines.findIndex((line) => /Quantity/i.test(line.text) && /Description/i.test(line.text));
  if (start < 0) return [];

  const end = lines.findIndex((line, index) => index > start && /For Any Questions/i.test(line.text));
  const candidates = lines.slice(start + 1, end > start ? end : undefined);
  const priceColumnStart = pageWidth * 0.66;
  const descriptionStart = pageWidth * 0.13;
  const rows = [];

  const descriptionPart = (line) =>
    cleanupLine(
      line.tokens
        .filter((token) => token.x >= descriptionStart && token.x < priceColumnStart)
        .map((token) => token.text)
        .join(" "),
    );

  const isTotalLine = (text) => /^(\d+\s+)?Total(\s+\$[\d,]+(?:\.\d{2})?)?$/i.test(text);
  const isInstructionLine = (text) => /^(Please|Click|If the seller|Log into|For Any|To Provide)/i.test(text);
  const isMarkerLine = (text) =>
    /^(\d+)\s+(.+?)\s+(\$[\d,]+(?:\.\d{2})?)\s+(\$[\d,]+(?:\.\d{2})?)$/.test(text) ||
    /^(\d+)\s+(\$[\d,]+(?:\.\d{2})?)\s+(\$[\d,]+(?:\.\d{2})?)$/.test(text);

  for (let index = 0; index < candidates.length; index += 1) {
    const line = candidates[index];
    const text = cleanupLine(line.text);
    if (!text) continue;
    if (/^\d+\s+Total\s+\$[\d,]+(?:\.\d{2})?/i.test(text) || isTotalLine(text)) break;

    const rowMatch = text.match(/^(\d+)\s+(.+?)\s+(\$[\d,]+(?:\.\d{2})?)\s+(\$[\d,]+(?:\.\d{2})?)$/);
    const qtyPriceOnly = text.match(/^(\d+)\s+(\$[\d,]+(?:\.\d{2})?)\s+(\$[\d,]+(?:\.\d{2})?)$/);
    if (!rowMatch && !qtyPriceOnly) continue;

    const descriptionParts = [];
    const quantity = Number(rowMatch?.[1] || qtyPriceOnly?.[1]);
    const price = rowMatch?.[3] || qtyPriceOnly?.[2] || "";
    const totalPrice = rowMatch?.[4] || qtyPriceOnly?.[3] || "";

    if (rowMatch) {
      const [, , description] = rowMatch;
      if (/^Total$/i.test(description)) break;
      descriptionParts.push(cleanupLine(description));
    }

    for (let back = index - 1; back >= 0; back -= 1) {
      const previous = candidates[back];
      const previousText = cleanupLine(previous.text);
      if (!previousText || isMarkerLine(previousText) || isTotalLine(previousText)) break;
      if (previous.y - line.y > 18) break;

      const part = descriptionPart(previous);
      if (!part || isInstructionLine(part) || /^Total$/i.test(part)) break;
      descriptionParts.unshift(part);
    }

    for (let next = index + 1; next < candidates.length; next += 1) {
      const following = candidates[next];
      const followingText = cleanupLine(following.text);
      if (!followingText || isMarkerLine(followingText) || isTotalLine(followingText)) break;
      if (line.y - following.y > 18) break;

      const part = descriptionPart(following);
      if (!part || isInstructionLine(part) || /^Total$/i.test(part)) break;
      descriptionParts.push(part);
    }

    const description = cleanupLine(descriptionParts.join(" "));
    if (!description) continue;

    rows.push({
      quantity,
      description,
      price,
      totalPrice,
      parsedProduct: parseTcgplayerProduct(description),
    });
  }

  return rows;
}

function mergeOrderPages(pages) {
  const byOrder = new Map();

  for (const page of pages) {
    const existing = byOrder.get(page.orderNumber);
    if (!existing) {
      byOrder.set(page.orderNumber, { ...page, items: [...page.items] });
      continue;
    }

    existing.items.push(...page.items);
    existing.shipToLines = existing.shipToLines.length ? existing.shipToLines : page.shipToLines;
    existing.buyerName ||= page.buyerName;
    existing.orderDate ||= page.orderDate;
    existing.shippingMethod ||= page.shippingMethod;
    existing.sellerName ||= page.sellerName;
  }

  return Array.from(byOrder.values());
}

function render() {
  const hasOrders = state.orders.length > 0;
  const cardCount = state.orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);

  els.emptyState.hidden = hasOrders;
  els.summary.hidden = !hasOrders;
  els.copyLinkButton.disabled = !hasOrders;
  els.clearButton.disabled = !hasOrders;

  if (!hasOrders) {
    els.summary.innerHTML = "";
    els.orders.innerHTML = "";
    return;
  }

  els.summary.innerHTML = `
    <div>
      <strong>${state.orders.length} order${state.orders.length === 1 ? "" : "s"} - ${cardCount} card${cardCount === 1 ? "" : "s"}</strong>
      <span>${escapeHtml(state.batchName || "Shared handoff")}</span>
    </div>
    <span>${formatDate(new Date())}</span>
  `;

  els.orders.innerHTML = state.orders
    .map(
      (order, index) => `
        <article class="order-card">
          <div class="order-top">
            <div>
              <div class="order-kicker">Order ${index + 1}</div>
              <h2>${escapeHtml(order.buyerName || order.shipToLines[0] || "Unknown buyer")}</h2>
              <div class="order-number">${escapeHtml(order.orderNumber)}</div>
            </div>
            <span class="pill">${order.items.reduce((sum, item) => sum + item.quantity, 0)} card${order.items.length === 1 && order.items[0]?.quantity === 1 ? "" : "s"}</span>
          </div>
          <div class="order-body">
            <section class="block">
              <h3>Cards</h3>
              <div class="cards">
                ${order.items.length ? order.items.map((item) => cardLineHtml(item)).join("") : `<div class="card-line">No card lines found</div>`}
              </div>
            </section>
            <section class="block">
              <h3>Ship To</h3>
              <address class="address">${addressHtml(order.shipToLines)}</address>
              <div class="order-meta">
                ${order.orderDate ? `<span>${escapeHtml(order.orderDate)}</span>` : ""}
                ${order.shippingMethod ? `<span>${escapeHtml(order.shippingMethod)}</span>` : ""}
              </div>
              <button class="button copy-address" type="button" data-copy-address="${escapeAttr(order.orderNumber)}">Copy Address</button>
            </section>
          </div>
        </article>
      `,
    )
    .join("");
}

function cardLineHtml(item) {
  const card = item.card || null;
  const imageUrl = card?.imageUrl || "";
  const imageAlt = card ? `${card.name} ${card.setName} #${card.collectorNumber}` : item.description;
  const displayName = card?.name || item.parsedProduct?.displayName || item.description;
  const sourceLine = card?.name ? item.description : "";
  const meta = card
    ? [card.setName, card.collectorNumber ? `#${card.collectorNumber}` : "", card.finish, card.imageStatus]
        .filter(Boolean)
        .join(" - ")
    : item.parsedProduct?.collectorNumber
      ? `Looking for #${item.parsedProduct.collectorNumber}`
      : "Image not matched";

  return `
    <div class="card-line">
      <div>
        <div class="card-art">
          ${
            imageUrl
              ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt)}" loading="lazy" />`
              : `<div class="card-art-placeholder">No image</div>`
          }
        </div>
      </div>
      <div class="card-copy">
        <span class="qty">x${item.quantity}</span>
        <div class="card-name">${escapeHtml(displayName)}</div>
        ${sourceLine ? `<div class="tcg-line">${escapeHtml(sourceLine)}</div>` : ""}
        <div class="card-meta">${escapeHtml(meta)}</div>
        ${item.totalPrice ? `<span class="price">${escapeHtml(item.totalPrice)}</span>` : ""}
      </div>
    </div>
  `;
}

async function resolveMissingImagesFromSharedLink() {
  if (!state.orders.some((order) => order.items.some((item) => !item.card?.imageUrl))) return;

  try {
    const matched = await resolveMissingCardImages();
    if (matched) {
      await updateShareUrl();
      render();
      showToast(`${matched} card image${matched === 1 ? "" : "s"} matched.`);
    }
  } catch (error) {
    console.warn("Card image lookup failed", error);
  }
}

async function resolveMissingCardImages() {
  const work = new Map();

  for (const order of state.orders) {
    for (const item of order.items) {
      item.parsedProduct ||= parseTcgplayerProduct(item.description);
      if (item.card?.imageUrl) continue;

      const key = lookupKey(item.parsedProduct, item.description);
      if (!work.has(key)) work.set(key, []);
      work.get(key).push(item);
    }
  }

  let matched = 0;
  for (const items of work.values()) {
    const sample = items[0];
    const card = await resolveScryfallCard(sample);
    if (card) {
      for (const item of items) item.card = card;
      matched += items.length;
    }
    await sleep(SCRYFALL_DELAY_MS);
  }

  return matched;
}

async function resolveScryfallCard(item) {
  const parsed = item.parsedProduct || parseTcgplayerProduct(item.description);
  const key = lookupKey(parsed, item.description);
  if (scryfallCache.has(key)) return scryfallCache.get(key);

  const candidates = await fetchScryfallCandidates(parsed);
  const best = pickBestScryfallCard(candidates, parsed);
  const card = best ? normalizeScryfallCard(best, parsed) : null;
  scryfallCache.set(key, card);
  return card;
}

async function fetchScryfallCandidates(parsed) {
  const queries = [];
  if (parsed.lookupName && parsed.collectorNumber) queries.push(`!"${parsed.lookupName}" cn:${parsed.collectorNumber}`);
  if (parsed.displayName && parsed.collectorNumber) queries.push(`!"${parsed.displayName}" cn:${parsed.collectorNumber}`);
  if (parsed.lookupName) queries.push(`!"${parsed.lookupName}"`);
  if (parsed.displayName) queries.push(`!"${parsed.displayName}"`);

  for (const query of [...new Set(queries)]) {
    const url = `${SCRYFALL_API}/cards/search?unique=prints&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data?.data) && data.data.length) return data.data;
    } catch (error) {
      console.warn("Scryfall lookup failed", error);
    }
  }

  return [];
}

function pickBestScryfallCard(cards, parsed) {
  if (!Array.isArray(cards) || !cards.length) return null;

  return cards
    .map((card) => ({ card, score: scoreScryfallCard(card, parsed) }))
    .sort((a, b) => b.score - a.score)[0]?.card;
}

function scoreScryfallCard(card, parsed) {
  let score = 0;
  const cardName = normalizeLookup(card?.name);
  const lookupName = normalizeLookup(parsed.lookupName);
  const displayName = normalizeLookup(parsed.displayName);
  const cardSet = normalizeLookup(card?.set_name);
  const parsedSet = normalizeLookup(parsed.setName);

  if (parsed.collectorNumber && normalizeCollectorNumber(card?.collector_number) === normalizeCollectorNumber(parsed.collectorNumber)) score += 120;
  if (lookupName && cardName === lookupName) score += 80;
  else if (displayName && cardName === displayName) score += 60;
  if (parsedSet && cardSet === parsedSet) score += 120;
  else if (parsedSet && (cardSet.includes(parsedSet) || parsedSet.includes(cardSet))) score += 70;
  else score += setNameTokenOverlap(cardSet, parsedSet) * 8;

  if (parsed.finish && Array.isArray(card?.finishes) && card.finishes.includes(parsed.finish)) score += 16;
  if (parsed.styleTags.includes("white border") && card?.border_color === "white") score += 35;
  if (parsed.styleTags.includes("borderless") && card?.border_color === "borderless") score += 35;
  if (parsed.styleTags.includes("anime") && JSON.stringify(card || {}).toLowerCase().includes("anime")) score += 20;
  if (card?.image_status === "highres_scan") score += 8;

  return score;
}

function normalizeScryfallCard(card, parsed) {
  const image = scryfallImageUrl(card);
  if (!image) return null;

  return {
    id: card.id || "",
    name: card.name || parsed.lookupName || parsed.displayName || "",
    setCode: card.set || "",
    setName: card.set_name || parsed.setName || "",
    collectorNumber: card.collector_number || parsed.collectorNumber || "",
    finish: parsed.finish || "",
    imageUrl: image,
    scryfallUri: card.scryfall_uri || "",
    imageStatus: card.image_status || "",
  };
}

function scryfallImageUrl(card) {
  if (card?.image_uris) {
    return card.image_uris.normal || card.image_uris.large || card.image_uris.png || card.image_uris.small || "";
  }
  const face = Array.isArray(card?.card_faces) ? card.card_faces[0] : null;
  return face?.image_uris?.normal || face?.image_uris?.large || face?.image_uris?.png || face?.image_uris?.small || "";
}

async function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  try {
    const params = new URLSearchParams(hash);
    const encoded = params.get("gz");
    const plain = params.get("data");
    if (!encoded && !plain) return;

    const json = encoded ? await gunzipBase64Url(encoded) : bytesToText(base64UrlToBytes(plain));
    const payload = JSON.parse(json);
    if (!payload?.orders?.length) return;

    state.orders = payload.orders;
    state.batchName = payload.batchName || "Shared handoff";
    state.shareUrl = window.location.href;
  } catch (error) {
    console.error(error);
    showToast("Could not read the shared link.");
  }
}

async function updateShareUrl() {
  const payload = {
    v: 1,
    batchName: state.batchName,
    orders: state.orders,
  };
  const json = JSON.stringify(payload);
  const encoded = await gzipBase64Url(json);
  const url = cleanUrl();
  url.hash = `gz=${encoded}`;
  state.shareUrl = url.toString();
  history.replaceState(null, "", state.shareUrl);
}

function cleanUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url;
}

async function gzipBase64Url(text) {
  if (!("CompressionStream" in window)) {
    return `plain.${bytesToBase64Url(textToBytes(text))}`;
  }

  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToBase64Url(bytes);
}

async function gunzipBase64Url(value) {
  if (value.startsWith("plain.")) {
    return bytesToText(base64UrlToBytes(value.slice(6)));
  }

  const bytes = base64UrlToBytes(value);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

function textToBytes(value) {
  return new TextEncoder().encode(value);
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseTcgplayerProduct(description) {
  const raw = cleanupLine(description);
  const withoutGame = raw.replace(/^Magic\s+-\s+/i, "");
  const parts = withoutGame.split(/\s+-\s+/).map(cleanupLine).filter(Boolean);
  const title = parts[0] || withoutGame;
  const collectorIndex = parts.findIndex((part) => /^#/.test(part));
  const collectorNumber = collectorIndex >= 0 ? parts[collectorIndex].replace(/^#/, "") : "";
  const condition = collectorIndex >= 0 ? parts.slice(collectorIndex + 2).join(" - ") : parts.slice(1).join(" - ");
  const finish = /etched/i.test(condition) ? "etched" : /foil/i.test(condition) ? "foil" : "nonfoil";
  const splitAt = title.lastIndexOf(": ");
  const setName = splitAt >= 0 ? cleanupLine(title.slice(0, splitAt)) : "";
  const displayName = splitAt >= 0 ? cleanupLine(title.slice(splitAt + 2)) : title;
  const styleTags = extractStyleTags(displayName, condition);
  const lookupName = stripStyleParentheticals(displayName);

  return {
    raw,
    setName,
    displayName,
    lookupName,
    collectorNumber,
    finish,
    condition,
    styleTags,
  };
}

function extractStyleTags(displayName, condition) {
  const text = `${displayName} ${condition}`.toLowerCase();
  return [
    text.includes("anime") ? "anime" : "",
    text.includes("borderless") ? "borderless" : "",
    text.includes("white border") ? "white border" : "",
    text.includes("showcase") ? "showcase" : "",
    text.includes("extended art") ? "extended art" : "",
    text.includes("retro") ? "retro" : "",
  ].filter(Boolean);
}

function stripStyleParentheticals(name) {
  return cleanupLine(
    String(name || "")
      .replace(
        /\((anime borderless|anime|borderless|white border|showcase|extended art|retro frame|retro|alternate art|foil etched|etched foil|textured foil|surge foil|galaxy foil|confetti foil|mana foil|oil slick raised foil)[^)]+\)/gi,
        "",
      )
      .replace(
        /\((anime borderless|anime|borderless|white border|showcase|extended art|retro frame|retro|alternate art|foil etched|etched foil|textured foil|surge foil|galaxy foil|confetti foil|mana foil|oil slick raised foil)\)/gi,
        "",
      ),
  );
}

function lookupKey(parsed, fallback) {
  return [parsed.lookupName || parsed.displayName || fallback, parsed.setName, parsed.collectorNumber, parsed.finish].map(normalizeLookup).join("|");
}

function setNameTokenOverlap(a, b) {
  if (!a || !b) return 0;
  const left = new Set(a.split(" ").filter((token) => token.length > 2));
  const right = new Set(b.split(" ").filter((token) => token.length > 2));
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCollectorNumber(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^0+/, "")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setLoading(isLoading, message = "") {
  els.dropZone.classList.toggle("dragging", isLoading);
  if (message) showToast(message);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function addressHtml(lines) {
  if (!lines.length) return `<span class="price">Missing address</span>`;
  return lines.map((line) => escapeHtml(line)).join("<br />");
}

function cleanupLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(value, regex) {
  const match = value.match(regex);
  return match ? cleanupLine(match[1]) : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
