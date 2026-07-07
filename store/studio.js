import { buildEmbeddedProductDraft, defaultsForType } from "./product-model.mjs";

const storageKey = "benson-store-drafts";
const form = document.querySelector("#studio-form");
const output = document.querySelector("#studio-output");
const draftList = document.querySelector("#draft-list");
const clearDraftsButton = document.querySelector("#clear-drafts");
const copyProductButton = document.querySelector("#copy-product");
const copyCatalogButton = document.querySelector("#copy-catalog");
const downloadCatalogButton = document.querySelector("#download-catalog");
const fileField = document.querySelector("#field-file");

const fields = {
  title: document.querySelector("#field-title"),
  type: document.querySelector("#field-type"),
  category: document.querySelector("#field-category"),
  price: document.querySelector("#field-price"),
  status: document.querySelector("#field-status"),
  color: document.querySelector("#field-color"),
  sizes: document.querySelector("#field-sizes"),
  summary: document.querySelector("#field-summary"),
  details: document.querySelector("#field-details"),
  image: document.querySelector("#field-image"),
  frontArtwork: document.querySelector("#field-front-artwork"),
  backArtwork: document.querySelector("#field-back-artwork"),
  checkoutUrl: document.querySelector("#field-checkout")
};

const preview = {
  image: document.querySelector("#preview-image"),
  imageLink: document.querySelector("#preview-image-link"),
  type: document.querySelector("#preview-type"),
  price: document.querySelector("#preview-price"),
  title: document.querySelector("#preview-title"),
  summary: document.querySelector("#preview-summary"),
  details: document.querySelector("#preview-details"),
  buy: document.querySelector("#preview-buy")
};

let baseCatalog = { updated: new Date().toISOString().slice(0, 10), products: [] };
let drafts = loadDrafts();
let localImageUrl = "";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format((Number(value) || 0) / 100);

function loadDrafts() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function saveDrafts() {
  localStorage.setItem(storageKey, JSON.stringify(drafts));
}

function productFromForm() {
  const product = buildEmbeddedProductDraft({
    backArtwork: fields.backArtwork.value.trim(),
    category: fields.category.value,
    color: fields.color.value.trim(),
    details: fields.details.value,
    frontArtwork: fields.frontArtwork.value.trim(),
    image: fields.image.value.trim(),
    price: fields.price.value,
    sizes: fields.sizes.value,
    status: fields.status.value,
    summary: fields.summary.value.trim(),
    title: fields.title.value,
    type: fields.type.value
  });
  const fallbackUrl = fields.checkoutUrl.value.trim();
  if (fallbackUrl) {
    product.checkout.fallbackUrl = fallbackUrl;
    product.checkoutUrl = fallbackUrl;
  }
  return product;
}

function statusText(product) {
  if (product.checkoutUrl && product.status === "live") return "fallback checkout";
  if (product.status === "live" && product.checkout?.mode === "embedded-stripe") return "embedded checkout";
  if (product.status === "sold-out") return "sold out";
  if (product.status === "ready") return "print ready";
  if (product.status === "sample") return "sample";
  return "draft";
}

function renderPreview() {
  const product = productFromForm();
  const imageUrl = localImageUrl || product.image;
  output.value = JSON.stringify(product, null, 2);

  preview.image.src = imageUrl;
  preview.image.alt = product.alt;
  preview.imageLink.href = imageUrl;
  preview.type.textContent = product.type;
  preview.price.textContent = money(product.price);
  preview.title.textContent = product.title;
  preview.summary.textContent = product.summary;
  preview.details.innerHTML = "";

  for (const detail of product.details) {
    const item = document.createElement("li");
    item.textContent = detail;
    preview.details.append(item);
  }

  const text = statusText(product);
  preview.buy.textContent = text;
  preview.buy.classList.toggle("is-disabled", text !== "fallback checkout");
  if (text === "fallback checkout") {
    preview.buy.href = product.checkoutUrl;
    preview.buy.removeAttribute("aria-disabled");
  } else {
    preview.buy.removeAttribute("href");
    preview.buy.setAttribute("aria-disabled", "true");
  }
}

function renderDrafts() {
  draftList.innerHTML = "";
  if (!drafts.length) {
    const empty = document.createElement("li");
    empty.textContent = "no drafts yet.";
    draftList.append(empty);
    return;
  }

  for (const draft of drafts) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const load = document.createElement("button");
    const remove = document.createElement("button");

    name.textContent = `${draft.title} / ${money(draft.price)}`;
    load.type = "button";
    load.textContent = "load";
    load.addEventListener("click", () => loadDraft(draft));
    remove.type = "button";
    remove.textContent = "remove";
    remove.addEventListener("click", () => {
      drafts = drafts.filter((itemDraft) => itemDraft.id !== draft.id);
      saveDrafts();
      renderDrafts();
    });

    item.append(name, load, remove);
    draftList.append(item);
  }
}

function draftColor(draft) {
  return draft.variants?.[0]?.options?.Color || defaultsForType(draft.type).variants.color;
}

function draftSizes(draft) {
  const sizes = (draft.variants || []).map((variant) => variant.options?.Size).filter(Boolean);
  return sizes.length ? sizes.join(",") : defaultsForType(draft.type).variants.sizes.join(",");
}

function loadDraft(draft) {
  fields.title.value = draft.title || "";
  fields.type.value = draft.type || "t-shirt";
  fields.category.value = draft.category || defaultsForType(fields.type.value).category;
  fields.price.value = ((draft.price || 0) / 100).toString();
  fields.status.value = draft.status || "draft";
  fields.color.value = draftColor(draft);
  fields.sizes.value = draftSizes(draft);
  fields.summary.value = draft.summary || "";
  fields.details.value = (draft.details || []).join(", ");
  fields.image.value = draft.image || "";
  fields.frontArtwork.value = draft.production?.frontArtwork || "";
  fields.backArtwork.value = draft.production?.backArtwork || "";
  fields.checkoutUrl.value = draft.checkoutUrl || draft.checkout?.fallbackUrl || "";
  localImageUrl = "";
  fileField.value = "";
  renderPreview();
}

function applyTypeDefaults() {
  const defaults = defaultsForType(fields.type.value);
  fields.category.value = defaults.category;
  fields.price.value = (defaults.price / 100).toString();
  fields.color.value = defaults.variants.color;
  fields.sizes.value = defaults.variants.sizes.join(",");
  renderPreview();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function mergedCatalog() {
  const byId = new Map();
  for (const product of baseCatalog.products || []) byId.set(product.id, product);
  for (const draft of drafts) byId.set(draft.id, draft);
  return {
    ...baseCatalog,
    updated: new Date().toISOString().slice(0, 10),
    products: [...byId.values()]
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(mergedCatalog(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "products.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function loadBaseCatalog() {
  try {
    const response = await fetch("products.json", { cache: "no-store" });
    if (response.ok) baseCatalog = await response.json();
  } catch {
    baseCatalog.products = [];
  }
}

form.addEventListener("input", renderPreview);
fields.type.addEventListener("change", applyTypeDefaults);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = productFromForm();
  drafts = [product, ...drafts.filter((draft) => draft.id !== product.id)];
  saveDrafts();
  renderDrafts();
  renderPreview();
});

fileField.addEventListener("change", () => {
  const file = fileField.files && fileField.files[0];
  if (localImageUrl) URL.revokeObjectURL(localImageUrl);
  localImageUrl = file ? URL.createObjectURL(file) : "";
  renderPreview();
});

copyProductButton.addEventListener("click", () => copyText(JSON.stringify(productFromForm(), null, 2)));
copyCatalogButton.addEventListener("click", () => copyText(JSON.stringify(mergedCatalog(), null, 2)));
downloadCatalogButton.addEventListener("click", downloadJson);
clearDraftsButton.addEventListener("click", () => {
  drafts = [];
  saveDrafts();
  renderDrafts();
});

await loadBaseCatalog();
renderPreview();
renderDrafts();
