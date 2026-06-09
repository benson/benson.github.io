import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

const SCRYFALL_API = "https://api.scryfall.com";
const TCG_HANDOFF_API = defaultHandoffApiUrl();
const SCRYFALL_DELAY_MS = 80;
const CHECK_STORAGE_PREFIX = "tcg-handoff-checks:";
const PREVIEW_IMAGE_WIDTH = 900;
const PREVIEW_IMAGE_HEIGHT = 1200;
const PREVIEW_IMAGE_MAX_BYTES = 180 * 1024;
const PREVIEW_IMAGE_MAX_CARDS = 24;
const PREVIEW_PANEL_MARGIN = 32;
const PREVIEW_IMAGE_LOAD_TIMEOUT_MS = 4500;
const PREVIEW_IMAGE_LOAD_ATTEMPTS = 2;
const scryfallCache = new Map();

const state = {
  orders: [],
  batchName: "",
  shareUrl: "",
  shareUrlKind: "",
  sharedMode: false,
  checkedOrders: new Set(),
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
  if (state.orders.length && state.shareUrlKind !== "short") {
    await createShortShareUrl().catch((error) => console.warn("Short handoff link failed", error));
  }
  if (!state.shareUrl) await updateShareUrl();
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    showToast(state.shareUrlKind === "short" ? "Short link copied." : "Long fallback link copied.");
  } catch {
    showToast("Clipboard was blocked.");
  }
});

els.clearButton.addEventListener("click", () => {
  state.orders = [];
  state.batchName = "";
  state.shareUrl = "";
  state.shareUrlKind = "";
  state.sharedMode = false;
  state.checkedOrders = new Set();
  history.replaceState(null, "", cleanUrl());
  render();
});

document.addEventListener("click", async (event) => {
  const checkButton = event.target.closest("[data-toggle-order]");
  if (checkButton) {
    toggleOrderChecked(checkButton.dataset.toggleOrder);
    return;
  }

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

const loadedShortLink = await loadFromShortLink();
if (!loadedShortLink) await loadFromHash();
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
    state.sharedMode = false;
    state.checkedOrders = new Set();
    render();
    const matchedImages = await resolveMissingCardImages();
    await updateShareUrl();
    const shortReady = state.orders.length ? await createShortShareUrl().catch((error) => {
      console.warn("Short handoff link failed", error);
      return false;
    }) : false;
    render();

    if (!state.orders.length) {
      showToast("No orders found.");
    } else {
      const skipped = skippedPages ? ` ${skippedPages} non-order page skipped.` : "";
      const matched = matchedImages ? ` ${matchedImages} card image${matchedImages === 1 ? "" : "s"} matched.` : "";
      const link = shortReady ? " Short link ready." : " Long fallback ready.";
      showToast(`Loaded ${state.orders.length} orders.${skipped}${matched}${link}`);
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
  const { cardCount } = sharePreviewCounts();

  document.body.classList.toggle("shared-view", state.sharedMode && hasOrders);
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
      (order, index) => {
        const key = orderCheckKey(order, index);
        const checked = state.checkedOrders.has(key);
        const buyer = order.buyerName || order.shipToLines[0] || "Unknown buyer";
        const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

        return `
        <article class="order-card${checked ? " is-checked" : ""}">
          <div class="order-top">
            <div class="order-heading">
              <button
                class="check-toggle"
                type="button"
                data-toggle-order="${escapeAttr(key)}"
                aria-pressed="${checked ? "true" : "false"}"
                aria-label="${escapeAttr(`${checked ? "Reopen" : "Check off"} order ${index + 1}`)}"
              >
                <span class="check-box" aria-hidden="true">${checked ? "&#10003;" : ""}</span>
                <span class="check-text">${checked ? "Done" : "Open"}</span>
              </button>
              <div>
                <div class="order-kicker">Order ${index + 1}</div>
                <h2>${escapeHtml(buyer)}</h2>
                ${order.orderNumber ? `<div class="order-number">${escapeHtml(order.orderNumber)}</div>` : ""}
              </div>
            </div>
            <span class="pill">${itemCount} card${itemCount === 1 ? "" : "s"}</span>
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
      `;
      },
    )
    .join("");
}

function sharePreviewCounts() {
  return {
    orderCount: state.orders.length,
    cardCount: state.orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + cardQuantity(item), 0),
      0,
    ),
  };
}

function cardQuantity(item) {
  return Math.max(1, Number(item?.quantity) || 1);
}

function cardLineHtml(item) {
  const card = item.card || null;
  const imageUrl = card?.imageUrl || "";
  const imageAlt = card ? [card.name, card.setName, card.collectorNumber ? `#${card.collectorNumber}` : ""].filter(Boolean).join(" ") : item.description;
  const displayName = card?.name || item.parsedProduct?.displayName || item.description;

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
        ${item.totalPrice ? `<span class="price">${escapeHtml(item.totalPrice)}</span>` : ""}
      </div>
    </div>
  `;
}

function toggleOrderChecked(key) {
  if (!state.sharedMode || !key) return;

  if (state.checkedOrders.has(key)) {
    state.checkedOrders.delete(key);
  } else {
    state.checkedOrders.add(key);
  }

  saveLocalChecks();
  render();
}

function loadLocalChecks() {
  state.checkedOrders = new Set();
  if (!state.sharedMode || !state.orders.length) return;

  try {
    const saved = JSON.parse(localStorage.getItem(checksStorageKey()) || "[]");
    if (Array.isArray(saved)) state.checkedOrders = new Set(saved.filter(Boolean));
  } catch (error) {
    console.warn("Could not load order checks", error);
  }
}

function saveLocalChecks() {
  if (!state.sharedMode || !state.orders.length) return;

  try {
    localStorage.setItem(checksStorageKey(), JSON.stringify([...state.checkedOrders]));
  } catch (error) {
    console.warn("Could not save order checks", error);
  }
}

function checksStorageKey() {
  const source = state.orders.map(orderCheckSource).join("~");
  return `${CHECK_STORAGE_PREFIX}${hashString(source)}`;
}

function orderCheckKey(order, index) {
  return `${index}-${hashString(orderCheckSource(order))}`;
}

function orderCheckSource(order) {
  return [
    order.buyerName || order.shipToLines?.[0] || "",
    ...(order.shipToLines || []),
    ...(order.items || []).map((item) => [item.quantity, item.card?.name || item.parsedProduct?.displayName || item.description || "", item.totalPrice || ""].join(":")),
  ].join("|");
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
  const imageUrls = scryfallImageUrls(card);
  const image = imageUrls[0] || "";
  if (!image) return null;

  return {
    id: card.id || "",
    name: card.name || parsed.lookupName || parsed.displayName || "",
    setCode: card.set || "",
    setName: card.set_name || parsed.setName || "",
    collectorNumber: card.collector_number || parsed.collectorNumber || "",
    finish: parsed.finish || "",
    imageUrl: image,
    imageUrls,
    scryfallUri: card.scryfall_uri || "",
    imageStatus: card.image_status || "",
  };
}

function scryfallImageUrl(card) {
  return scryfallImageUrls(card)[0] || "";
}

function scryfallImageUrls(card) {
  if (card?.image_uris) return uniqueValues([card.image_uris.normal, card.image_uris.large, card.image_uris.png, card.image_uris.small]);
  const face = Array.isArray(card?.card_faces) ? card.card_faces[0] : null;
  return uniqueValues([face?.image_uris?.normal, face?.image_uris?.large, face?.image_uris?.png, face?.image_uris?.small]);
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function loadFromShortLink() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("s");
  if (!id) return false;

  const key = window.location.hash.slice(1);
  if (!key) {
    showToast("That short link is missing its key. Copy the full link again.");
    return true;
  }

  try {
    const encrypted = await fetchEncryptedHandoff(id);
    const json = await decryptSharedPayload(encrypted, key);
    const shared = expandSharedPayload(JSON.parse(json));
    if (!shared.orders.length) throw new Error("short link did not contain orders");

    state.orders = shared.orders;
    state.batchName = shared.batchName || "Shared handoff";
    state.shareUrl = `${TCG_HANDOFF_API}/t/${encodeURIComponent(id)}#${key}`;
    state.shareUrlKind = "short";
    state.sharedMode = true;
    loadLocalChecks();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not open that short link.");
  }

  return true;
}

async function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  try {
    const params = new URLSearchParams(hash);
    const encoded = hash.includes("=") ? params.get("gz") : hash;
    const plain = params.get("data");
    if (!encoded && !plain) return;

    const json = encoded ? await gunzipBase64Url(encoded) : bytesToText(base64UrlToBytes(plain));
    const payload = JSON.parse(json);
    const shared = expandSharedPayload(payload);
    if (!shared.orders.length) return;

    state.orders = shared.orders;
    state.batchName = shared.batchName || "Shared handoff";
    state.shareUrl = window.location.href;
    state.shareUrlKind = "long";
    state.sharedMode = true;

    if (shared.shouldCompact) await updateShareUrl();
    loadLocalChecks();
  } catch (error) {
    console.error(error);
    showToast("Could not read the shared link.");
  }
}

async function updateShareUrl() {
  const payload = compactSharedPayload();
  const json = JSON.stringify(payload);
  const encoded = await gzipBase64Url(json);
  const url = cleanUrl();
  url.hash = encoded;
  state.shareUrl = url.toString();
  state.shareUrlKind = "long";
  history.replaceState(null, "", state.shareUrl);
}

async function createShortShareUrl() {
  if (!state.orders.length) return false;
  if (!window.crypto?.subtle) throw new Error("Web Crypto is unavailable.");

  const encrypted = await encryptSharedPayload(JSON.stringify(compactSharedPayload()));
  const preview = await buildSharePreview();
  const body = preview ? { ...encrypted.body, preview } : encrypted.body;
  const response = await fetch(`${TCG_HANDOFF_API}/tcg-handoffs`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Short link service returned ${response.status}.`);
  const data = await response.json();
  if (!data?.id) throw new Error("Short link service did not return an id.");

  state.shareUrl = `${TCG_HANDOFF_API}/t/${encodeURIComponent(data.id)}#${encrypted.key}`;
  state.shareUrlKind = "short";
  return true;
}

async function fetchEncryptedHandoff(id) {
  const response = await fetch(`${TCG_HANDOFF_API}/tcg-handoffs/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) throw new Error("That handoff link expired or was not found.");
  if (!response.ok) throw new Error(`Could not load that handoff link (${response.status}).`);
  return await response.json();
}

async function encryptSharedPayload(json) {
  const keyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textToBytes(json));

  return {
    key: bytesToBase64Url(keyBytes),
    body: {
      v: 1,
      alg: "A256GCM",
      iv: bytesToBase64Url(iv),
      data: bytesToBase64Url(new Uint8Array(cipher)),
    },
  };
}

async function decryptSharedPayload(encrypted, keyText) {
  if (encrypted?.v !== 1 || encrypted?.alg !== "A256GCM") throw new Error("Unsupported handoff link format.");
  const keyBytes = base64UrlToBytes(keyText);
  if (keyBytes.length !== 32) throw new Error("That handoff link has an invalid key.");

  const iv = base64UrlToBytes(encrypted.iv || "");
  const data = base64UrlToBytes(encrypted.data || "");
  const key = await window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return bytesToText(new Uint8Array(plain));
}

function compactSharedPayload() {
  return {
    v: 2,
    o: state.orders.map((order) => {
      const shipToLines = order.shipToLines || [];
      const buyerName = order.buyerName && order.buyerName !== shipToLines[0] ? order.buyerName : "";

      return [
        buyerName,
        shipToLines,
        (order.items || []).map((item) => {
          const card = item.card || {};
          const scryfallId = card.id || scryfallIdFromImageUrl(card.imageUrl);
          return trimTrailingEmptyValues([
            item.quantity || 1,
            card.name || item.parsedProduct?.displayName || item.description || "",
            item.totalPrice || "",
            scryfallId || "",
            scryfallId ? "" : card.imageUrl || "",
            scryfallId || card.imageUrl ? "" : item.description || "",
          ]);
        }),
      ];
    }),
  };
}

function expandSharedPayload(payload) {
  if (payload?.v === 2 && Array.isArray(payload.o)) {
    return {
      batchName: "Shared handoff",
      orders: payload.o.map(expandCompactOrder),
      shouldCompact: false,
    };
  }

  return {
    batchName: payload?.batchName || "Shared handoff",
    orders: Array.isArray(payload?.orders) ? payload.orders : [],
    shouldCompact: true,
  };
}

function expandCompactOrder(order, index) {
  const [buyerName = "", shipToLines = [], items = []] = Array.isArray(order) ? order : [];

  return {
    orderNumber: "",
    buyerName: buyerName || shipToLines[0] || "",
    shipToLines,
    items: items.map((item) => expandCompactItem(item, index)),
  };
}

function trimTrailingEmptyValues(values) {
  while (values.length && values[values.length - 1] === "") values.pop();
  return values;
}

function expandCompactItem(item) {
  const [quantity = 1, name = "", totalPrice = "", scryfallId = "", imageUrl = "", description = ""] = Array.isArray(item) ? item : [];
  const resolvedImageUrl = scryfallImageUrlFromId(scryfallId) || imageUrl;

  return {
    quantity,
    description,
    totalPrice,
    card: resolvedImageUrl
      ? {
          id: scryfallId,
          name,
          imageUrl: resolvedImageUrl,
        }
      : null,
    parsedProduct: name ? { displayName: name } : null,
  };
}

function firstPreviewScryfallId() {
  for (const order of state.orders) {
    for (const item of order.items || []) {
      const card = item.card || {};
      const id = validScryfallId(card.id) || validScryfallId(scryfallIdFromImageUrl(card.imageUrl));
      if (id) return id;
    }
  }

  return "";
}

async function buildSharePreview() {
  const scryfallId = firstPreviewScryfallId();
  const counts = sharePreviewCounts();
  const preview = { ...counts };
  if (scryfallId) preview.scryfallId = scryfallId;

  try {
    const image = await buildPreviewImage();
    if (image) preview.image = image;
  } catch (error) {
    console.warn("Could not build card preview image", error);
  }

  return Object.keys(preview).length ? preview : null;
}

async function buildPreviewImage() {
  const cards = previewCardLines();
  if (!cards.length || !document.createElement("canvas").getContext) return null;
  const counts = sharePreviewCounts();

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_IMAGE_WIDTH;
  canvas.height = PREVIEW_IMAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const visibleCards = cards.slice(0, PREVIEW_IMAGE_MAX_CARDS);
  const overflow = cards.length - visibleCards.length;
  const loadedCards = (
    await Promise.all(
      visibleCards.map(async (card) => ({
        ...card,
        image: await loadPreviewCardImage(card),
      })),
    )
  );

  if (!loadedCards.length) return null;

  drawPreviewCanvas(context, loadedCards, overflow, counts);
  const bytes = await previewCanvasBytes(canvas);
  if (!bytes) return null;

  return {
    type: "image/jpeg",
    width: PREVIEW_IMAGE_WIDTH,
    height: PREVIEW_IMAGE_HEIGHT,
    data: bytesToBase64Url(bytes),
  };
}

function previewCardLines() {
  const cards = [];
  for (const order of state.orders) {
    for (const item of order.items || []) {
      const card = item.card || {};
      const imageUrl = card.imageUrl || scryfallImageUrlFromId(card.id);
      const imageUrls = previewImageCandidates(card);
      const label = card.name || item.parsedProduct?.displayName || item.description || "Card";
      const quantity = cardQuantity(item);
      for (let copy = 0; copy < quantity; copy += 1) {
        cards.push({
          imageUrl,
          imageUrls,
          label,
        });
      }
    }
  }

  return cards;
}

async function loadPreviewCardImage(card) {
  const candidates = card.imageUrls?.length ? card.imageUrls : card.imageUrl ? [card.imageUrl] : [];
  for (let attempt = 0; attempt < PREVIEW_IMAGE_LOAD_ATTEMPTS; attempt += 1) {
    for (const src of candidates) {
      const image = await loadPreviewImage(src).catch(() => null);
      if (image) return image;
    }
    if (attempt < PREVIEW_IMAGE_LOAD_ATTEMPTS - 1) await sleep(140);
  }

  return null;
}

async function loadPreviewImage(src) {
  return (await loadPreviewImageBlob(src).catch(() => null)) || (await loadPreviewImageElement(src).catch(() => null));
}

async function loadPreviewImageBlob(src) {
  if (!window.createImageBitmap) throw new Error("createImageBitmap is unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_IMAGE_LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(src, { mode: "cors", cache: "force-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`preview image fetch failed (${response.status})`);
    return await createImageBitmap(await response.blob());
  } finally {
    clearTimeout(timeout);
  }
}

function loadPreviewImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("preview image timed out"));
    }, PREVIEW_IMAGE_LOAD_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("preview image failed to load"));
    };
    image.src = src;
  });
}

function previewImageCandidates(card) {
  return uniqueValues([
    ...(Array.isArray(card.imageUrls) ? card.imageUrls : []),
    card.imageUrl,
    scryfallImageUrlFromId(card.id),
    ...scryfallImageCandidatesFromUrl(card.imageUrl),
  ]);
}

function scryfallImageCandidatesFromUrl(value) {
  const id = scryfallIdFromImageUrl(value);
  if (!id) return value ? [value] : [];
  const base = `https://cards.scryfall.io`;
  const path = `front/${id[0]}/${id[1]}/${id}`;
  return [
    value,
    `${base}/normal/${path}.jpg`,
    `${base}/large/${path}.jpg`,
    `${base}/png/${path}.png`,
    `${base}/small/${path}.jpg`,
  ];
}

function drawPreviewCanvas(context, cards, overflow, counts) {
  const width = PREVIEW_IMAGE_WIDTH;
  const height = PREVIEW_IMAGE_HEIGHT;
  const margin = PREVIEW_PANEL_MARGIN;
  const panelX = margin;
  const panelY = margin;
  const panelWidth = width - margin * 2;
  const panelHeight = height - margin * 2;
  const headerHeight = 78;
  const gap = cards.length <= 4 ? 22 : 18;
  const cardAspect = 488 / 680;

  context.fillStyle = "#f5f7fa";
  context.fillRect(0, 0, width, height);
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, 30);
  context.fillStyle = "#ffffff";
  context.fill();

  drawPreviewHeader(context, counts, panelX, panelY, panelWidth, headerHeight);

  const gridX = panelX + 34;
  const gridY = panelY + headerHeight + 8;
  const gridWidthMax = panelWidth - 68;
  const gridHeightMax = panelHeight - headerHeight - 34;
  const layout = bestPreviewGrid(cards.length, gridWidthMax, gridHeightMax, gap, cardAspect);
  const gridWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * gap;
  const gridHeight = layout.rows * layout.cardHeight + (layout.rows - 1) * gap;
  const startX = gridX + (gridWidthMax - gridWidth) / 2;
  const startY = gridY + (gridHeightMax - gridHeight) / 2;

  cards.forEach((card, index) => {
    const column = Math.floor(index / layout.rows);
    const row = index % layout.rows;
    const x = startX + column * (layout.cardWidth + gap);
    const y = startY + row * (layout.cardHeight + gap);

    if (card.image) {
      context.save();
      roundedRect(context, x, y, layout.cardWidth, layout.cardHeight, Math.max(8, layout.cardWidth * 0.045));
      context.clip();
      context.drawImage(card.image, x, y, layout.cardWidth, layout.cardHeight);
      context.restore();
    } else {
      drawPreviewPlaceholderCard(context, card.label, x, y, layout.cardWidth, layout.cardHeight);
    }
  });

  if (overflow > 0) drawPreviewPill(context, `+${overflow}`, width - 96, height - 76, 56, 30);
}

function drawPreviewHeader(context, counts, x, y, width, height) {
  const orderCount = counts?.orderCount || 0;
  const cardCount = counts?.cardCount || 0;
  const text = `${orderCount} order${orderCount === 1 ? "" : "s"} - ${cardCount} card${cardCount === 1 ? "" : "s"}`;

  context.fillStyle = "#111827";
  context.font = "800 38px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + 34, y + height / 2 + 4);
}

function drawPreviewPlaceholderCard(context, label, x, y, width, height) {
  roundedRect(context, x, y, width, height, Math.max(8, width * 0.045));
  context.fillStyle = "#eef2f7";
  context.fill();
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = Math.max(2, width * 0.018);
  context.stroke();

  const padding = Math.max(14, width * 0.12);
  const fontSize = Math.max(15, Math.min(24, width * 0.12));
  context.fillStyle = "#111827";
  context.font = `800 ${fontSize}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  wrapPreviewText(context, label, x + width / 2, y + height / 2, width - padding * 2, fontSize * 1.16, 4);
}

function bestPreviewGrid(count, maxWidth, maxHeight, gap, aspect) {
  const columns = previewGridColumns(count);
  const rows = Math.ceil(count / columns);
  const cellWidth = (maxWidth - (columns - 1) * gap) / columns;
  const cellHeight = (maxHeight - (rows - 1) * gap) / rows;
  const cardWidth = Math.min(cellWidth, cellHeight * aspect);
  const cardHeight = cardWidth / aspect;
  return { rows, columns, cardWidth, cardHeight, area: cardWidth * cardHeight };
}

function previewGridColumns(count) {
  if (count <= 1) return 1;
  if (count <= 8) return 2;
  if (count <= 18) return 3;
  return 4;
}

function drawPreviewPill(context, text, x, y, width, height) {
  roundedRect(context, x, y, width, height, height / 2);
  context.fillStyle = "rgba(17, 24, 39, 0.84)";
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 18px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + width / 2, y + height / 2);
}

function wrapPreviewText(context, text, centerX, centerY, maxWidth, lineHeight, maxLines) {
  const words = String(text || "Card").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (words.length && lines.join(" ").length < words.join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.+$/, "")}...`;
  }

  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((value, index) => context.fillText(value, centerX, startY + index * lineHeight, maxWidth));
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

async function previewCanvasBytes(canvas) {
  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.44, 0.36]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength <= PREVIEW_IMAGE_MAX_BYTES) return bytes;
  }

  return null;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function validScryfallId(value) {
  const id = String(value || "").toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : "";
}

function scryfallIdFromImageUrl(value) {
  return String(value || "").match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:jpg|png|webp)/i)?.[1] || "";
}

function scryfallImageUrlFromId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "")) return "";
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function defaultHandoffApiUrl() {
  return window.TCG_HANDOFF_API_URL || "https://api.bensonperry.com";
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
  const setName = splitAt >= 0 ? cleanupLine(title.slice(0, splitAt)) : collectorIndex > 1 ? parts[0] : "";
  const displayName = splitAt >= 0 ? cleanupLine(title.slice(splitAt + 2)) : collectorIndex > 1 ? parts.slice(1, collectorIndex).join(" - ") : title;
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
    text.includes("stained glass") ? "stained glass" : "",
    text.includes("showcase") ? "showcase" : "",
    text.includes("extended art") ? "extended art" : "",
    text.includes("retro") ? "retro" : "",
  ].filter(Boolean);
}

function stripStyleParentheticals(name) {
  return cleanupLine(
    String(name || "")
      .replace(
        /\((anime borderless|anime|borderless|white border|stained glass|showcase|extended art|retro frame|retro|alternate art|foil etched|etched foil|textured foil|surge foil|galaxy foil|confetti foil|mana foil|oil slick raised foil)[^)]+\)/gi,
        "",
      )
      .replace(
        /\((anime borderless|anime|borderless|white border|stained glass|showcase|extended art|retro frame|retro|alternate art|foil etched|etched foil|textured foil|surge foil|galaxy foil|confetti foil|mana foil|oil slick raised foil)\)/gi,
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

function hashString(value) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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
