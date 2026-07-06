const grid = document.querySelector("#product-grid");
const template = document.querySelector("#product-template");
const filterButtons = [...document.querySelectorAll("[data-filter]")];

let activeFilter = "all";
let products = [];

const money = (cents, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format((Number(cents) || 0) / 100);

const normalStatus = (product) => {
  if (product.status === "sold-out") return "sold out";
  if (product.checkoutUrl && product.status === "live") return "buy";
  if (product.status === "sample") return "sample";
  return "coming soon";
};

function renderProducts() {
  grid.innerHTML = "";
  const visible = products.filter((product) => activeFilter === "all" || product.category === activeFilter);

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "nothing in this pile yet.";
    grid.append(empty);
    return;
  }

  for (const product of visible) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".product-card");
    const imageLink = node.querySelector(".product-image-link");
    const image = node.querySelector(".product-image");
    const type = node.querySelector(".product-type");
    const price = node.querySelector(".product-price");
    const title = node.querySelector(".product-title");
    const summary = node.querySelector(".product-summary");
    const details = node.querySelector(".product-details");
    const buy = node.querySelector(".buy-link");

    card.dataset.category = product.category;
    image.src = product.image;
    image.alt = product.alt || product.title;
    imageLink.href = product.image;
    type.textContent = product.type || product.category;
    price.textContent = money(product.price, product.currency);
    title.textContent = product.title;
    summary.textContent = product.summary;

    for (const detail of product.details || []) {
      const item = document.createElement("li");
      item.textContent = detail;
      details.append(item);
    }

    const status = normalStatus(product);
    buy.textContent = status;
    if (status === "buy") {
      buy.href = product.checkoutUrl;
    } else {
      buy.removeAttribute("href");
      buy.classList.add("is-disabled");
      buy.setAttribute("aria-disabled", "true");
    }

    grid.append(node);
  }
}

function setFilter(nextFilter) {
  activeFilter = nextFilter;
  for (const button of filterButtons) {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
  renderProducts();
}

async function loadProducts() {
  try {
    const response = await fetch("products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const data = await response.json();
    products = data.products || [];
    renderProducts();
  } catch (error) {
    grid.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "the shelf is temporarily missing.";
    grid.append(empty);
    console.error(error);
  }
}

for (const button of filterButtons) {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
}

loadProducts();
