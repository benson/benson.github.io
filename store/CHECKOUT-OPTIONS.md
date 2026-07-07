# Checkout platform options

Goal: let a customer buy from `https://bensonperry.com/store` without being sent to a separate storefront, while keeping product launches low-friction for future ideas.

## Requirements

- Custom storefront and checkout entry live on `bensonperry.com/store`.
- Buyer can pay by credit card plus accelerated wallets where the platform supports them.
- Product creation stays programmable from artwork and a short product brief.
- Fulfillment is print-on-demand, so Benson does not pack or ship items manually.
- Avoid a full ecommerce admin surface unless it removes more friction than it adds.

## What the docs imply

### Fourthwall

Fourthwall is excellent for creator-merch fulfillment and product creation, and the current API automation already proves that. It is not a fit for this checkout goal.

Fourthwall's Storefront API docs say its checkout path redirects customers to Fourthwall's hosted checkout page, and the help docs explicitly say you cannot build a custom checkout flow with that API. Fourthwall's Open API fulfillment endpoint is for adding fulfillment/tracking to an existing Fourthwall order, not for creating a print-on-demand order from an external Stripe payment.

Useful source:

- https://docs.fourthwall.com/storefront/overview
- https://docs.fourthwall.com/storefront/checkout
- https://docs.fourthwall.com/api-reference/platform/fulfillment/create-fulfillment
- https://help.fourthwall.com/manage-my-shop/apps-features-and-integrations/storefront-api-for-custom-storefronts

Verdict: keep as the temporary fallback and a useful reference implementation, but do not build the final checkout on it.

### Shopify Storefront API and Hydrogen

Shopify gives the best native Shop Pay story, but normal headless Shopify checkout still sends the buyer to Shopify's web checkout. Shopify's Storefront API cart docs describe `checkoutUrl` as the field used to direct or redirect buyers to Shopify web checkout. Hydrogen docs also say customers are directed back to Shopify-hosted checkout.

Useful source:

- https://shopify.dev/docs/api/storefront/latest/objects/Cart
- https://shopify.dev/docs/storefronts/headless/hydrogen/migrate

Verdict: strong commerce backend, weak fit for the "start to finish on bensonperry.com/store" requirement unless we accept Shopify-hosted checkout.

### Shopify Shop Pay button / Storefront Web Components

Shopify's simple Shop Pay button can be embedded on any site, but it uses Checkout Links and directs the buyer to an accelerated buy-it-now checkout. That is useful, but it is still not a full custom checkout on our page.

Useful source:

- https://shopify.dev/docs/storefronts/headless/additional-sdks/web-components
- https://shopify.dev/docs/api/storefront-web-components

Verdict: useful if we want a fast Shop Pay shortcut, not enough for the whole checkout.

### Shop Pay Wallet API

This is the only Shopify path that looks like it can add Shop Pay to an existing checkout. It is real, but not lightweight. Shopify says it requires a new Shopify store, Shopify Payments in test mode for development, allowed origins, Storefront API credentials, GraphQL Admin API credentials, event handling, order reconciliation, fulfillment tracking, refunds, disputes, and monitoring. Most Shop Pay interactions happen in a Shopify-hosted popup.

Useful source:

- https://shopify.dev/docs/api/commerce-components/pay

Verdict: possible later, but too heavy to make the core MVP depend on it. Add it as a second payment lane after Stripe checkout and fulfillment are working.

### Stripe Embedded Checkout / Payment Element

Stripe has the best fit for "checkout on my page." Embedded Checkout renders a secure checkout form on our website, created by a backend Checkout Session. Stripe says Checkout Sessions must be created server-side because they need a secret key. Stripe's embedded Checkout can collect shipping and billing addresses, use Stripe Tax, and supports Link by default. Stripe's Express Checkout Element supports Apple Pay, Google Pay, Link, PayPal, Klarna, and Amazon Pay where enabled, supported, and available.

Useful source:

- https://docs.stripe.com/checkout/embedded/quickstart
- https://docs.stripe.com/payments/payment-element
- https://docs.stripe.com/elements/express-checkout-element
- https://docs.stripe.com/payments/payment-methods/integration-options
- https://docs.stripe.com/payments/payment-methods/pmd-registration

Verdict: best core checkout fit. Needs a backend and Stripe account credentials. Does not provide Shop Pay.

### BigCommerce Embedded Checkout

BigCommerce can iframe its PCI-compliant checkout into a headless storefront. This keeps the buyer in context, but the checkout UI is BigCommerce's optimized one-page checkout, and BigCommerce docs note limited payment options in embedded checkout for headless storefronts. It also does not solve Shop Pay.

Useful source:

- https://docs.bigcommerce.com/developer/docs/admin/checkout-and-cart/embedded-checkout/overview
- https://docs.bigcommerce.com/developer/docs/storefront/headless/cart-and-checkout/checkout
- https://docs.bigcommerce.com/developer/docs/admin/checkout-and-cart/payments/overview

Verdict: credible if we wanted a hosted ecommerce backend, but heavier than Stripe and less aligned with the lightweight product workbench.

### WooCommerce

WooCommerce can provide same-site checkout, the official Stripe extension supports onsite cards and wallets like Apple Pay / Google Pay / Link, and Printful's WooCommerce integration can auto-import paid orders for fulfillment.

Useful source:

- https://woocommerce.com/document/stripe/
- https://woocommerce.com/document/stripe/setup-and-configuration/express-checkouts/
- https://woocommerce.com/document/printful/
- https://developer.woocommerce.com/docs/apis/rest-api/

Verdict: very capable and off-the-shelf, but it adds WordPress hosting, plugin maintenance, backups, and a larger admin surface. It is less pleasant for the "tell Codex an idea and ship it" workflow unless we intentionally want WooCommerce to become the store backend.

### Printful, Printify, and Gelato fulfillment

For a Stripe-owned checkout, we need a separate print-on-demand fulfillment backend. Printful has catalog APIs, order creation, order confirmation, shipping rates, mockup generation, and webhooks. Printify has product publishing, image upload, order submission, and webhook-style automation, but provider selection and mockup behavior can be more marketplace-like. Gelato has templates, order APIs, product-from-template APIs, webhooks, and broad global production.

Useful source:

- https://developers.printful.com/docs/v2-beta/
- https://developers.printify.com/
- https://dashboard.gelato.com/docs/
- https://dashboard.gelato.com/docs/ecommerce/products/create-from-template/
- https://dashboard.gelato.com/docs/webhooks/

Verdict: use Printful or Gelato as the first fulfillment API. Printful is the best initial fit because the API exposes catalog specs, mockups, shipping rates, order drafts, confirmation, and webhooks in one place. Gelato is a strong second candidate if we care more about global/local production.

## Recommendation

Build the next version around:

1. Static custom storefront at `bensonperry.com/store`.
2. Small backend API for checkout session creation, Stripe webhook handling, and fulfillment order creation.
3. Stripe Embedded Checkout as the core payment path.
4. Printful as the first fulfillment target, with Gelato kept as the likely alternate if Printful's catalog/product constraints are annoying.
5. Shop Pay Wallet as an optional later integration, gated behind Shopify account setup, because it requires a new Shopify store and more reconciliation work.

This gives the best tradeoff: the buyer stays on the site, the UI stays ours, card / Apple Pay / Google Pay can be supported through Stripe, and future product launches can still be driven by a product manifest plus artwork.

## Known blockers before production money can be accepted

- Stripe account, publishable key, secret key, webhook signing secret.
- Domain registration for wallet payment methods in Stripe for `bensonperry.com`.
- A deployed backend URL for the checkout API.
- Stripe Tax activation or a deliberate tax strategy.
- Printful or Gelato API credentials.
- Product-to-fulfillment mapping for each sellable variant.
- A policy decision on shipping: shipping included in product price for maximum checkout simplicity, or live shipping rates from the fulfillment provider.
- Optional Shop Pay Wallet setup: new Shopify store, Shopify Payments, Shop sales channel, allowed origins, Shop Pay client ID, Storefront API token, Admin API credentials.
