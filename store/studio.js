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
  summary: document.querySelector("#field-summary"),
  details: document.querySelector("#field-details"),
  image: document.querySelector("#field-image"),
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

const slug = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled-product";

const cents = (value) => Math.round((Number.parseFloat(value) || 0) * 100);

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
  const details = fields.details.value
    .split(",")
    .map((detail) => detail.trim())
    .filter(Boolean);

  return {
    id: slug(fields.title.value),
    title: fields.title.value.trim() || "untitled product",
    type: fields.type.value,
    category: fields.category.value,
    price: cents(fields.price.value),
    currency: "USD",
    status: fields.status.value,
    image: fields.image.value.trim() || "assets/sample-shirt.png",
    alt: `${fields.type.value} product mockup`,
    summary: fields.summary.value.trim(),
    details,
    checkoutUrl: fields.checkoutUrl.value.trim(),
    fulfillment: "fourthwall"
  };
}

function statusText(product) {
  if (product.checkoutUrl && product.status === "live") return "buy";
  if (product.status === "sold-out") return "sold out";
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
  preview.buy.classList.toggle("is-disabled", text !== "buy");
  if (text === "buy") {
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

function loadDraft(draft) {
  fields.title.value = draft.title || "";
  fields.type.value = draft.type || "t-shirt";
  fields.category.value = draft.category || "apparel";
  fields.price.value = ((draft.price || 0) / 100).toString();
  fields.status.value = draft.status || "draft";
  fields.summary.value = draft.summary || "";
  fields.details.value = (draft.details || []).join(", ");
  fields.image.value = draft.image || "";
  fields.checkoutUrl.value = draft.checkoutUrl || "";
  localImageUrl = "";
  fileField.value = "";
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
