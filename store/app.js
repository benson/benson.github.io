import { fetchStoreApiFromBases, storeApiBases } from "./api-client.mjs";
import { checkoutReadiness, checkoutReadinessFromError } from "./checkout-readiness.mjs";
import { orderReturnMessage, shouldPollFulfillmentStatus } from "./order-return.mjs";

const grid = document.querySelector("#product-grid");
const template = document.querySelector("#product-template");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const cartToggle = document.querySelector("#cart-toggle");
const cartCount = document.querySelector("#cart-count");
const checkoutPanel = document.querySelector("#checkout-panel");
const cartLines = document.querySelector("#cart-lines");
const cartSubtotal = document.querySelector("#cart-subtotal");
const checkoutAvailability = document.querySelector("#checkout-availability");
const checkoutButton = document.querySelector("#checkout-button");
const checkoutNote = document.querySelector("#checkout-note");
const embeddedCheckout = document.querySelector("#embedded-checkout");
const imageLightbox = document.querySelector("#image-lightbox");
const imageLightboxTitle = document.querySelector("#image-lightbox-title");
const imageLightboxStage = document.querySelector("#image-lightbox-stage");
const imageLightboxImage = document.querySelector("#image-lightbox-image");
const imageLightboxZoomButtons = [...document.querySelectorAll("[data-lightbox-zoom]")];
const imageLightboxCloseButton = document.querySelector(".image-lightbox-controls [data-close-lightbox]");

const apiBases = storeApiBases({
  primary: window.STORE_API_BASE || "",
  fallback: window.STORE_API_FALLBACK_BASE || ""
});

let activeFilter = "all";
let products = [];
let catalog = null;
let cart = [];
let checkoutState = checkoutReadiness();
let checkoutNotice = "";
let stripePromise = null;
const imageLightboxState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: null,
  previousFocus: null
};

const imageLightboxZoom = {
  min: 1,
  max: 4,
  step: 0.5,
  wheelStep: 0.25
};

async function fetchStoreApi(path, options = {}) {
  return fetchStoreApiFromBases(path, options, { bases: apiBases });
}

const money = (cents, currency = "USD") => {
  const amount = (Number(cents) || 0) / 100;
  const hasCents = Math.abs(Number(cents) || 0) % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0
  }).format(amount);
};

function storeAssetFallbackUrl(assetPath) {
  if (window.location.hostname !== "bensonperry.com") return "";
  if (!String(assetPath || "").startsWith("assets/")) return "";
  return new URL(assetPath, "https://benson.github.io/store/").href;
}

function bindProductImageFallback(image, imageLink, product) {
  image.addEventListener(
    "error",
    () => {
      if (image.dataset.fallbackTried === "true") return;
      const fallbackUrl = storeAssetFallbackUrl(product.image);
      if (!fallbackUrl) return;
      image.dataset.fallbackTried = "true";
      image.src = fallbackUrl;
      imageLink.href = fallbackUrl;
    },
    { once: true }
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isImageLightboxOpen() {
  return imageLightbox?.classList.contains("is-open");
}

function clampImageLightboxPan() {
  if (!imageLightboxStage || !imageLightboxImage || imageLightboxState.zoom <= imageLightboxZoom.min) {
    imageLightboxState.panX = 0;
    imageLightboxState.panY = 0;
    return;
  }

  const stageRect = imageLightboxStage.getBoundingClientRect();
  const imageWidth = imageLightboxImage.offsetWidth || stageRect.width;
  const imageHeight = imageLightboxImage.offsetHeight || stageRect.height;
  const maxX = Math.max(0, (imageWidth * imageLightboxState.zoom - stageRect.width) / 2 + 40);
  const maxY = Math.max(0, (imageHeight * imageLightboxState.zoom - stageRect.height) / 2 + 40);

  imageLightboxState.panX = clamp(imageLightboxState.panX, -maxX, maxX);
  imageLightboxState.panY = clamp(imageLightboxState.panY, -maxY, maxY);
}

function imageLightboxZoomLabel() {
  return `${Number.isInteger(imageLightboxState.zoom) ? imageLightboxState.zoom : imageLightboxState.zoom.toFixed(1)}x`;
}

function updateImageLightboxTransform() {
  if (!imageLightboxStage) return;

  imageLightboxStage.style.setProperty("--lightbox-zoom", String(imageLightboxState.zoom));
  imageLightboxStage.style.setProperty("--lightbox-pan-x", `${imageLightboxState.panX}px`);
  imageLightboxStage.style.setProperty("--lightbox-pan-y", `${imageLightboxState.panY}px`);
  imageLightboxStage.classList.toggle("is-zoomed", imageLightboxState.zoom > imageLightboxZoom.min);

  for (const button of imageLightboxZoomButtons) {
    const action = button.dataset.lightboxZoom;
    if (action === "out") button.disabled = imageLightboxState.zoom <= imageLightboxZoom.min;
    if (action === "in") button.disabled = imageLightboxState.zoom >= imageLightboxZoom.max;
    if (action === "reset") button.textContent = imageLightboxZoomLabel();
  }
}

function setImageLightboxZoom(nextZoom, { resetPan = false } = {}) {
  imageLightboxState.zoom = clamp(Number(nextZoom) || 1, imageLightboxZoom.min, imageLightboxZoom.max);
  if (resetPan || imageLightboxState.zoom <= imageLightboxZoom.min) {
    imageLightboxState.panX = 0;
    imageLightboxState.panY = 0;
  }
  clampImageLightboxPan();
  updateImageLightboxTransform();
}

function resetImageLightboxView() {
  imageLightboxState.zoom = 1;
  imageLightboxState.panX = 0;
  imageLightboxState.panY = 0;
  imageLightboxState.drag = null;
  imageLightboxStage?.classList.remove("is-dragging");
  updateImageLightboxTransform();
}

function openImageLightbox(product, imageUrl) {
  if (!imageLightbox || !imageLightboxImage || !imageLightboxTitle || !imageUrl) return;

  imageLightboxState.previousFocus = document.activeElement;
  resetImageLightboxView();
  imageLightboxTitle.textContent = product.title || "product image";
  imageLightboxImage.src = imageUrl;
  imageLightboxImage.alt = product.alt || product.title || "";
  imageLightbox.classList.add("is-open");
  imageLightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-lightbox-open");
  imageLightboxCloseButton?.focus();
}

function closeImageLightbox() {
  if (!imageLightbox || !isImageLightboxOpen()) return;

  imageLightbox.classList.remove("is-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-lightbox-open");
  resetImageLightboxView();
  imageLightboxImage.removeAttribute("src");
  imageLightboxState.previousFocus?.focus?.();
  imageLightboxState.previousFocus = null;
}

function updateImageLightboxZoom(action) {
  if (action === "in") setImageLightboxZoom(imageLightboxState.zoom + imageLightboxZoom.step);
  if (action === "out") setImageLightboxZoom(imageLightboxState.zoom - imageLightboxZoom.step);
  if (action === "reset") setImageLightboxZoom(1, { resetPan: true });
}

function beginImageLightboxDrag(event) {
  if (!imageLightboxStage || imageLightboxState.zoom <= imageLightboxZoom.min) return;
  event.preventDefault();
  imageLightboxState.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPanX: imageLightboxState.panX,
    startPanY: imageLightboxState.panY
  };
  imageLightboxStage.classList.add("is-dragging");
  imageLightboxStage.setPointerCapture(event.pointerId);
}

function moveImageLightboxDrag(event) {
  const drag = imageLightboxState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  imageLightboxState.panX = drag.startPanX + event.clientX - drag.startX;
  imageLightboxState.panY = drag.startPanY + event.clientY - drag.startY;
  clampImageLightboxPan();
  updateImageLightboxTransform();
}

function endImageLightboxDrag(event) {
  const drag = imageLightboxState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  imageLightboxState.drag = null;
  imageLightboxStage?.classList.remove("is-dragging");
  imageLightboxStage?.releasePointerCapture?.(event.pointerId);
}

const firstAvailableVariant = (product) =>
  (product.variants || []).find((variant) => variant.available !== false) || null;

function availableVariantPrices(product) {
  return (product.variants || [])
    .filter((variant) => variant.available !== false)
    .map((variant) => Number(variant.price ?? product.price))
    .filter((price) => Number.isInteger(price));
}

function productPriceLabel(product) {
  const prices = availableVariantPrices(product);
  if (!prices.length) return money(product.price, product.currency);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min, product.currency) : `from ${money(min, product.currency)}`;
}

function variantOptionLabel(product, variant) {
  const label = variant.options?.Size || variant.label;
  const prices = availableVariantPrices(product);
  const uniquePrices = new Set(prices);
  const price = Number(variant.price ?? product.price);

  if (uniquePrices.size <= 1 || !Number.isInteger(price)) return label;
  return `${label} / ${money(price, product.currency)}`;
}

const itemKey = (item) => `${item.productId}:${item.variantId || ""}`;

function normalStatus(product) {
  if (product.status === "sold-out") return "sold out";
  if (product.status === "live" && firstAvailableVariant(product)) return "add to cart";
  if (product.checkoutUrl && product.status === "live") return "temporary checkout";
  if (product.status === "ready") return "print ready";
  if (product.status === "sample") return "sample";
  return "coming soon";
}

function openCheckout() {
  checkoutPanel.classList.add("is-open");
  checkoutPanel.setAttribute("aria-hidden", "false");
}

function closeCheckout() {
  checkoutPanel.classList.remove("is-open");
  checkoutPanel.setAttribute("aria-hidden", "true");
}

function cartLineTotal(line) {
  return line.price * line.quantity;
}

function cartTotal() {
  return cart.reduce((sum, line) => sum + cartLineTotal(line), 0);
}

function updateCartCount() {
  cartCount.textContent = String(cart.reduce((sum, line) => sum + line.quantity, 0));
}

function renderCheckoutAvailability() {
  checkoutAvailability.innerHTML = "";
  checkoutAvailability.dataset.status = checkoutState.status;

  const message = document.createElement("span");
  message.className = "checkout-availability-message";
  message.textContent = checkoutState.message;
  checkoutAvailability.append(message);

  if (checkoutState.methods.length) {
    const list = document.createElement("ul");
    list.className = "payment-method-list";
    for (const method of checkoutState.methods) {
      const item = document.createElement("li");
      item.className = method.ready ? "is-ready" : "is-pending";
      item.textContent = method.label;
      list.append(item);
    }
    checkoutAvailability.append(list);
  }
}

function setCheckoutNotice(message = "") {
  checkoutNotice = message;
  checkoutNote.textContent = checkoutNotice;
}

function checkoutBlocked() {
  return checkoutState.status === "pending" || checkoutState.status === "unavailable";
}

function renderCart() {
  cartLines.innerHTML = "";
  updateCartCount();
  renderCheckoutAvailability();

  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "empty-cart";
    empty.textContent = "cart is empty.";
    cartLines.append(empty);
    checkoutButton.disabled = true;
    cartSubtotal.textContent = money(0);
    checkoutNote.textContent = checkoutNotice;
    embeddedCheckout.hidden = true;
    embeddedCheckout.innerHTML = "";
    return;
  }

  for (const line of cart) {
    const row = document.createElement("div");
    row.className = "cart-line";

    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = line.title;
    const meta = document.createElement("span");
    meta.textContent = `${line.variantLabel} / ${money(line.price, line.currency)}`;
    copy.append(name, meta);

    const controls = document.createElement("div");
    controls.className = "quantity-controls";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "-";
    minus.setAttribute("aria-label", `remove one ${line.title}`);
    minus.addEventListener("click", () => changeQuantity(line, -1));

    const quantity = document.createElement("span");
    quantity.textContent = String(line.quantity);

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `add one ${line.title}`);
    plus.addEventListener("click", () => changeQuantity(line, 1));

    controls.append(minus, quantity, plus);
    row.append(copy, controls);
    cartLines.append(row);
  }

  cartSubtotal.textContent = money(cartTotal(), cart[0]?.currency);
  checkoutButton.disabled = checkoutBlocked();
}

function addToCart(product, variantId) {
  const variant = (product.variants || []).find((candidate) => candidate.id === variantId) || firstAvailableVariant(product);
  if (!variant) return;

  const next = {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    variantLabel: variant.label,
    price: Number(variant.price ?? product.price),
    currency: product.currency || "USD",
    quantity: 1
  };

  const existing = cart.find((line) => itemKey(line) === itemKey(next));
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push(next);
  }

  setCheckoutNotice("");
  renderCart();
  openCheckout();
}

function changeQuantity(line, delta) {
  line.quantity += delta;
  if (line.quantity <= 0) {
    cart = cart.filter((candidate) => candidate !== line);
  }
  renderCart();
}

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
    const variantField = node.querySelector(".variant-field");
    const variantSelect = node.querySelector(".variant-select");
    const action = node.querySelector(".product-action");

    card.dataset.category = product.category;
    bindProductImageFallback(image, imageLink, product);
    image.src = product.image;
    image.alt = product.alt || product.title;
    imageLink.href = product.image;
    imageLink.setAttribute("aria-label", `open larger image of ${product.title}`);
    imageLink.addEventListener("click", (event) => {
      event.preventDefault();
      openImageLightbox(product, image.currentSrc || image.src || product.image);
    });
    type.textContent = product.type || product.category;
    price.textContent = productPriceLabel(product);
    title.textContent = product.title;
    summary.textContent = product.summary;

    for (const detail of product.details || []) {
      const item = document.createElement("li");
      item.textContent = detail;
      details.append(item);
    }

    const variants = product.variants || [];
    if (variants.length) {
      for (const variant of variants) {
        const option = document.createElement("option");
        option.value = variant.id;
        option.textContent = variantOptionLabel(product, variant);
        option.disabled = variant.available === false;
        variantSelect.append(option);
      }
    } else {
      variantField.hidden = true;
    }

    const status = normalStatus(product);
    action.textContent = status;
    if (status === "add to cart") {
      action.addEventListener("click", () => addToCart(product, variantSelect.value));
    } else if (status === "temporary checkout") {
      action.addEventListener("click", () => window.open(product.checkoutUrl, "_blank", "noopener"));
    } else {
      action.disabled = true;
      action.classList.add("is-disabled");
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

async function loadStripe() {
  if (stripePromise) return stripePromise;
  stripePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-stripe-js]");
    if (existing && window.Stripe) {
      resolve(window.Stripe);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.stripe.com/clover/stripe.js";
    script.async = true;
    script.dataset.stripeJs = "true";
    script.addEventListener("load", () => resolve(window.Stripe));
    script.addEventListener("error", () => reject(new Error("stripe script failed")));
    document.head.append(script);
  });
  return stripePromise;
}

async function beginEmbeddedCheckout() {
  if (!cart.length) return;
  if (checkoutBlocked()) {
    setCheckoutNotice(checkoutState.message);
    return;
  }

  checkoutButton.disabled = true;
  setCheckoutNotice("opening secure checkout...");
  embeddedCheckout.hidden = true;
  embeddedCheckout.innerHTML = "";

  try {
    const config = await loadCheckoutConfig();
    if (!checkoutState.ready || !config.stripePublishableKey) {
      throw new Error("checkout backend needs Stripe credentials before it can accept payment.");
    }

    const Stripe = await loadStripe();
    const stripe = Stripe(config.stripePublishableKey);
    const createEmbeddedCheckout = stripe.createEmbeddedCheckoutPage || stripe.initEmbeddedCheckout;
    if (typeof createEmbeddedCheckout !== "function") {
      throw new Error("embedded checkout is unavailable in this browser.");
    }
    const checkout = await createEmbeddedCheckout.call(stripe, {
      fetchClientSecret: async () => {
        const response = await fetchStoreApi("/api/store/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              quantity: line.quantity
            }))
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "checkout session failed");
        return data.clientSecret;
      }
    });

    embeddedCheckout.hidden = false;
    checkout.mount("#embedded-checkout");
    setCheckoutNotice("");
  } catch (error) {
    setCheckoutNotice(error.message);
    checkoutButton.disabled = false;
  }
}

async function loadFulfillmentStatus(sessionId) {
  const response = await fetchStoreApi(`/api/store/order-status?session_id=${encodeURIComponent(sessionId)}`, {
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) return { status: "unavailable", error: data.error || "fulfillment status is unavailable." };
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForFulfillmentStatus(sessionId, { attempts = 6, intervalMs = 1500 } = {}) {
  let orderStatus = await loadFulfillmentStatus(sessionId);
  for (let attempt = 1; attempt < attempts && shouldPollFulfillmentStatus(orderStatus); attempt += 1) {
    setCheckoutNotice(orderReturnMessage(orderStatus));
    await sleep(intervalMs);
    orderStatus = await loadFulfillmentStatus(sessionId);
  }
  return orderStatus;
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") !== "return") return;

  openCheckout();
  checkoutButton.disabled = true;
  setCheckoutNotice("checking checkout status...");
  embeddedCheckout.hidden = true;
  embeddedCheckout.innerHTML = "";

  try {
    const sessionId = params.get("session_id") || "";
    const response = await fetchStoreApi(`/api/store/session-status?session_id=${encodeURIComponent(sessionId)}`, {
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "checkout status is unavailable.");

    if (data.paymentStatus === "paid" || data.status === "complete") {
      cart = [];
      renderCart();
      checkoutButton.disabled = true;
      const orderStatus = await waitForFulfillmentStatus(sessionId);
      setCheckoutNotice(orderReturnMessage(orderStatus));
    } else {
      checkoutButton.disabled = false;
      setCheckoutNotice("checkout was not completed.");
    }
  } catch (error) {
    checkoutButton.disabled = false;
    setCheckoutNotice(error.message);
  } finally {
    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }
}

async function loadProducts() {
  try {
    const response = await fetch("products.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    catalog = await response.json();
    products = catalog.products || [];
    renderProducts();
    renderCart();
    await handleCheckoutReturn();
  } catch (error) {
    grid.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "the shelf is temporarily missing.";
    grid.append(empty);
    console.error(error);
  }
}

async function loadCheckoutConfig() {
  const configResponse = await fetchStoreApi("/api/store/config", { cache: "no-store" });
  if (!configResponse.ok) throw new Error("checkout backend is not deployed yet.");
  const config = await configResponse.json();
  checkoutState = checkoutReadiness(config);
  renderCart();
  return config;
}

async function loadCheckoutReadiness() {
  try {
    await loadCheckoutConfig();
  } catch (error) {
    checkoutState = checkoutReadinessFromError(error);
    renderCart();
  }
}

for (const button of filterButtons) {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
}

cartToggle.addEventListener("click", openCheckout);
checkoutButton.addEventListener("click", beginEmbeddedCheckout);
document.querySelectorAll("[data-close-checkout]").forEach((button) => {
  button.addEventListener("click", closeCheckout);
});
document.querySelectorAll("[data-close-lightbox]").forEach((button) => {
  button.addEventListener("click", closeImageLightbox);
});

for (const button of imageLightboxZoomButtons) {
  button.addEventListener("click", () => updateImageLightboxZoom(button.dataset.lightboxZoom));
}

imageLightboxImage?.addEventListener("load", () => {
  clampImageLightboxPan();
  updateImageLightboxTransform();
});

imageLightboxStage?.addEventListener("wheel", (event) => {
  if (!isImageLightboxOpen()) return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  setImageLightboxZoom(imageLightboxState.zoom + direction * imageLightboxZoom.wheelStep);
});

imageLightboxStage?.addEventListener("pointerdown", beginImageLightboxDrag);
imageLightboxStage?.addEventListener("pointermove", moveImageLightboxDrag);
imageLightboxStage?.addEventListener("pointerup", endImageLightboxDrag);
imageLightboxStage?.addEventListener("pointercancel", endImageLightboxDrag);

document.addEventListener("keydown", (event) => {
  if (isImageLightboxOpen()) {
    if (event.key === "Escape") closeImageLightbox();
    if (event.key === "+" || event.key === "=") updateImageLightboxZoom("in");
    if (event.key === "-") updateImageLightboxZoom("out");
    if (event.key === "0") updateImageLightboxZoom("reset");
    return;
  }
  if (event.key === "Escape") closeCheckout();
});

loadProducts();
loadCheckoutReadiness();
