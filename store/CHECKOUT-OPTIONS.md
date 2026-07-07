# Checkout platform options

Researched against official docs on 2026-07-07.

Goal: a buyer should be able to start and finish a purchase at `https://bensonperry.com/store`, while future product launches stay close to "give Codex an idea, approve the result, and sell it."

## Decision criteria

- Same-site buyer experience: cart, shipping details, and payment happen from `bensonperry.com/store`.
- Custom storefront UI: the visible store remains a file we can design and iterate on directly.
- Programmatic product pipeline: artwork, mockups, product metadata, variants, and fulfillment mapping can be generated or checked by scripts.
- Print-on-demand fulfillment: Benson should not pack, ship, or manually create provider orders.
- Low operating surface: avoid WordPress/plugin/server maintenance unless it removes more work than it adds.
- Wallet support: card is required; Apple Pay, Google Pay, and Link are strong fits; Shop Pay is desirable but must not force the whole architecture into a bad shape.

## Short version

The best fit is still:

1. Custom static storefront at `bensonperry.com/store`.
2. Small Cloudflare Worker checkout API.
3. Stripe Embedded Checkout or Stripe Payment Element for same-site card, Apple Pay, Google Pay, and Link.
4. Printful first for fulfillment automation, with Gelato kept as the strongest alternate provider.
5. Optional Shop Pay Wallet later, only if the extra Shopify account/reconciliation work is worth it.

The reason is simple: strict same-site checkout rules out most "easy merch store" platforms, and strict product automation rules out most embed-a-store widgets. Stripe plus a POD API is more infrastructure than a hosted shop, but it is the only path in this set that keeps the checkout on Benson's site and keeps the product factory programmable.

## Option matrix

| Option | Same-site checkout | Custom UI | Product automation | Fulfillment automation | Wallets | Fit |
| --- | --- | --- | --- | --- | --- | --- |
| Fourthwall hosted/storefront API | No | Medium | Good | Excellent | Platform-owned | Fallback only |
| Shopify Storefront API / Hydrogen | No for checkout | Good | Good | Good via apps | Best Shop Pay | Not for strict same-site checkout |
| Shopify Shop Pay button | No, checkout link | Limited | Medium | Shopify-centered | Shop Pay | Shortcut only |
| Shop Pay Wallet API | Mostly popup-based | Good | Complex | We own reconciliation | Shop Pay | Later add-on |
| Stripe Embedded Checkout + Printful | Yes | Excellent | Excellent | Good | Card, Link, Apple Pay, Google Pay where eligible | Best MVP |
| Stripe Payment Element + Printful | Yes | Excellent | Excellent | Good | Most flexible Stripe wallets | Next evolution if Embedded Checkout is too boxed-in |
| BigCommerce Embedded Checkout | Mostly yes | Medium | Good | Needs integration choices | Depends on payment setup | Credible but heavier |
| WooCommerce + Stripe + Printful | Yes | Medium | Good | Good via plugin | Card, Apple Pay, Google Pay, Link | Capable but too much maintenance |
| Snipcart + POD webhook | Yes-ish embedded overlay | Medium | Medium | Custom webhook needed | Stripe-dependent | Useful, but not enough control |
| Ecwid embed | Yes-ish embedded store | Low/medium | Medium | Apps/API | Depends on plan/gateway | Easy admin, weaker Codex pipeline |
| Medusa / Saleor / Commerce Layer / Swell | Yes | Excellent | Excellent | Custom integration | Gateway-dependent | Too much platform surface for this store |

## Platform notes

### Fourthwall

Fourthwall is still the easiest creator-merch backend. It is good at products, mockups, fulfillment, customer support flows, and the current automation already proves it can support quick product launches.

It fails the new checkout constraint. Fourthwall's custom storefront path leads to Fourthwall checkout, and the available fulfillment API is for adding fulfillment/tracking information to existing Fourthwall orders rather than creating a new POD order from an external Stripe payment.

Useful sources:

- https://docs.fourthwall.com/storefront/overview
- https://docs.fourthwall.com/storefront/checkout
- https://help.fourthwall.com/manage-my-shop/apps-features-and-integrations/storefront-api-for-custom-storefronts
- https://docs.fourthwall.com/api-reference/platform/fulfillment/create-fulfillment

Verdict: keep as live fallback while the embedded checkout matures. Do not use it as the final same-site checkout backend.

### Shopify Storefront API and Hydrogen

Shopify is the strongest all-in commerce backend and gives the best native Shop Pay story. The problem is the checkout handoff: headless Shopify flows use a checkout URL / web checkout handoff, so the buyer leaves our page for Shopify checkout.

Useful sources:

- https://shopify.dev/docs/api/storefront/latest/objects/Cart
- https://shopify.dev/docs/storefronts/headless/hydrogen/migrate

Verdict: excellent if we relax "checkout starts and finishes on `bensonperry.com/store`." Poor fit if we keep that requirement.

### Shopify Shop Pay button and Web Components

Shopify's web components and Shop Pay button can add a fast buy path, but they are checkout-link based. This is convenient, not a custom checkout.

Useful sources:

- https://shopify.dev/docs/storefronts/headless/additional-sdks/web-components
- https://shopify.dev/docs/api/storefront-web-components

Verdict: possible shortcut later. Not the primary checkout.

### Shop Pay Wallet API

This is the real route for adding Shop Pay to a checkout that is not simply Shopify web checkout. It also comes with a lot of machinery: Shopify store setup, Shopify Payments, allowed origins, Storefront API credentials, Admin API credentials, Shop Pay event handling, order reconciliation, fulfillment tracking, refunds, disputes, and monitoring.

Useful source:

- https://shopify.dev/docs/api/commerce-components/pay

Verdict: add only after Stripe checkout and fulfillment work end to end. It is not the right dependency for the MVP.

### Stripe Embedded Checkout / Payment Element

Stripe is the cleanest same-site payment layer. The backend creates a Checkout Session or PaymentIntent; the page renders Stripe's secure payment UI; the buyer stays on `bensonperry.com/store`. Stripe's current embedded Checkout docs use `ui_mode=embedded_page` and `stripe.createEmbeddedCheckoutPage(...)`; older examples used `embedded` / `initEmbeddedCheckout`, so our implementation supports the new path and falls back to the old JS method if necessary.

Embedded Checkout is quickest. Payment Element is more work but gives more direct control if we outgrow the Checkout frame. Stripe can support cards, Link, Apple Pay, and Google Pay where the Stripe account, domain, browser, device, and payment-method settings are eligible. Stripe does not give us Shop Pay.

Useful sources:

- https://docs.stripe.com/checkout/embedded/quickstart
- https://docs.stripe.com/payments/payment-element
- https://docs.stripe.com/elements/express-checkout-element
- https://docs.stripe.com/payments/payment-methods/integration-options
- https://docs.stripe.com/payments/payment-methods/pmd-registration

Verdict: best checkout fit. Requires Stripe account credentials, webhook setup, domain wallet setup, and a tax/shipping strategy.

### BigCommerce Embedded Checkout

BigCommerce can provide a PCI-compliant embedded checkout for headless storefronts. This is a real same-context checkout option, and BigCommerce supplies more commerce admin surface than Stripe alone.

The tradeoff is weight: we inherit a larger ecommerce backend, its checkout UI assumptions, and payment/checkout constraints that are less tailored to the "small programmable object factory" we want.

Useful sources:

- https://docs.bigcommerce.com/developer/docs/admin/checkout-and-cart/embedded-checkout/overview
- https://docs.bigcommerce.com/developer/docs/storefront/headless/cart-and-checkout/checkout
- https://docs.bigcommerce.com/developer/docs/admin/checkout-and-cart/payments/overview

Verdict: credible backup if Stripe-plus-POD becomes too custom. Not the lightest first move.

### WooCommerce

WooCommerce plus the official Stripe extension can keep checkout on-site and support express wallets. Printful also has a WooCommerce integration that can automate fulfillment for paid orders.

It solves many ecommerce basics but adds WordPress hosting, plugin updates, backups, security surface, and a larger admin mental model. That works for a store-first business; it is less attractive for a tiny experimental storefront managed through Codex.

Useful sources:

- https://woocommerce.com/document/stripe/
- https://woocommerce.com/document/stripe/setup-and-configuration/express-checkouts/
- https://woocommerce.com/document/printful/
- https://developer.woocommerce.com/docs/apis/rest-api/

Verdict: very capable, but higher maintenance than this project deserves.

### Snipcart

Snipcart can make a static site sell products with an embedded cart/checkout and webhooks. It is a tempting middle ground because it avoids building a checkout API from scratch.

The drawbacks are control and automation. We would still need custom webhook code to bridge paid Snipcart orders into a POD provider, and the product pipeline would be split between static product markup/config and Snipcart's order system. It also does not improve the Shop Pay story.

Useful sources:

- https://docs.snipcart.com/v3/
- https://docs.snipcart.com/v3/webhooks/introduction
- https://docs.snipcart.com/v3/api-reference/orders

Verdict: good for quick static-site commerce. Less good for a Codex-owned product factory.

### Ecwid

Ecwid is an easy embedded-store option with payments, product admin, and app integrations. It is one of the lowest-effort ways to put an ecommerce widget on an existing site.

The tradeoff is UI/control and product workflow. The store becomes an embedded Ecwid surface rather than a page we fully own, and future product automation has to fit Ecwid's product/admin model. It is probably easy for a human shop owner; it is less ideal for "tell Codex the idea and let scripts handle the rest."

Useful sources:

- https://docs.ecwid.com/
- https://docs.ecwid.com/api-reference/storefront-widget-js-api
- https://docs.ecwid.com/api-reference/rest-api

Verdict: easy backup if we decide custom checkout is not worth it. Not the best fit for the target workflow.

### Headless commerce frameworks

Medusa, Saleor, Commerce Layer, Swell, and similar platforms can provide proper commerce APIs while keeping the storefront custom. They are real options if the store grows into inventory, promotions, multi-product collections, customer accounts, returns, and richer order management.

For this project they are too much platform. We would still need Stripe, wallet configuration, POD fulfillment integration, hosting, migrations, and operational ownership.

Verdict: revisit only if the store becomes a meaningful product line.

## Fulfillment providers

### Printful

Printful remains the best first fulfillment target because it exposes the practical pieces we need: catalog data, product/variant information, order creation, order confirmation, shipping/rates concepts, files/placements, mockups, and webhooks. It also has a mature merchant dashboard, which matters when something goes wrong.

Useful source:

- https://developers.printful.com/docs/v2-beta/

Verdict: first provider to wire up.

### Gelato

Gelato has strong global/local production and template-based APIs. It may be better if worldwide fulfillment becomes important or if its template flow makes repeatable product creation smoother than Printful for certain items.

Useful sources:

- https://dashboard.gelato.com/docs/
- https://dashboard.gelato.com/docs/ecommerce/products/create-from-template/
- https://dashboard.gelato.com/docs/webhooks/

Verdict: best alternate provider.

### Printify

Printify has APIs for images, products, publishing, and orders, but its marketplace/provider model means product setup can involve more choices about print provider, variant availability, and print areas. That can be powerful, but it is slightly less clean as the first automation target.

Useful source:

- https://developers.printify.com/

Verdict: viable, but not first.

## Recommendation

Keep building the embedded Stripe + Printful path.

This is not because it is the least code. It is because it is the least compromise against the real goal: a cute custom store that stays on Benson's site and a product workflow where the infrastructure disappears behind scripts.

The implementation should keep escape hatches:

- Fulfillment adapter interface: Printful first, Gelato next if needed.
- Payment abstraction: Stripe Embedded Checkout first, Stripe Payment Element if we need more UI control.
- Shop Pay as separate optional lane, not a foundation dependency.
- Fourthwall buy links remain a temporary fallback until Stripe/fulfillment credentials are production-ready.

## Known blockers before production money can be accepted

- Stripe account, publishable key, secret key, and webhook signing secret.
- Stripe domain/payment-method setup for Apple Pay, Google Pay, and Link eligibility.
- Stripe Tax activation or a deliberate tax strategy.
- Printful API credentials.
- Product-to-Printful variant mapping for each sellable variant.
- A policy decision on shipping: included in product price for maximum simplicity, or live shipping rates from the provider.
- Cloudflare route permission for `bensonperry.com/api/store/*`, unless we accept the temporary workers.dev API host.
- Optional Shop Pay Wallet setup: Shopify store, Shopify Payments, Shop sales channel, allowed origins, Shop Pay client ID, Storefront API token, Admin API token, order reconciliation, fulfillment updates, refunds, and disputes.
