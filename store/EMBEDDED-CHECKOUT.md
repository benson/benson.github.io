# Embedded checkout plan

This is the implementation plan for replacing Fourthwall-hosted checkout links with an on-page checkout at `bensonperry.com/store`.

## Target architecture

```mermaid
flowchart LR
  A["buyer on bensonperry.com/store"] --> B["custom cart UI"]
  B --> C["store checkout API"]
  C --> D["Stripe Checkout Session"]
  D --> E["embedded Stripe checkout on bensonperry.com/store"]
  E --> F["Stripe webhook: checkout.session.completed"]
  F --> G["Cloudflare KV order record"]
  G --> H["fulfillment adapter"]
  H --> I["Printful order"]
```

## API surface

- `GET /api/store/config`
  - Returns public checkout configuration, including the Stripe publishable key when configured.
  - Reports card, Stripe wallet, Link, and optional Shop Pay readiness.
- `POST /api/store/checkout-session`
  - Validates product IDs, variant IDs, quantities, and prices against `store/products.json`.
  - Creates a Stripe Embedded Checkout Session.
  - Adds the catalog's supported included-shipping policy as a zero-dollar Stripe shipping option.
  - Restricts shipping address collection to countries shared by every product in the cart.
  - Returns the session client secret for Stripe.js.
- `GET /api/store/session-status?session_id=...`
  - Lets the return page show whether checkout completed.
- `GET /api/store/order-status?session_id=...`
  - Reads the fulfillment idempotency record for a paid Stripe session.
  - Lets the return page distinguish queued, processing, failed, and missing provider handoff states.
- `POST /api/store/webhook/stripe`
  - Verifies the Stripe webhook signature.
  - On successful payment, decodes the cart metadata and hands the order to the Printful fulfillment adapter.
  - Uses the `STORE_ORDERS` Cloudflare KV namespace to avoid duplicate Printful orders on repeated Stripe webhook delivery.

## Current backend deployment

The checkout API Worker is deployed at:

- `https://benson-store-checkout-api.bensonperry.workers.dev/api/store/config`

The preferred production route is:

- `https://bensonperry.com/api/store/*`

Attaching that route currently needs a Cloudflare API token with Workers Routes edit permission for the `bensonperry.com` zone. Until then, the frontend can call the workers.dev API host while the customer remains on `bensonperry.com/store`.

The storefront is wired to prefer same-origin API calls first. If `/api/store/*` is not routed yet, it falls back to the workers.dev checkout API for missing-route responses. Once the Cloudflare route can be attached, the page should start using `https://bensonperry.com/api/store/*` without another frontend change.

The Worker has a `STORE_ORDERS` KV namespace bound for fulfillment idempotency:

- `b3fa6b8d6c1b457d80fd53ad5324d18c`

Each paid Stripe checkout session writes `stripe:{session_id}:fulfillment` before calling Printful and updates it after provider order creation. Duplicate `checkout.session.completed` webhook deliveries return the stored record instead of creating another provider order.

The storefront return flow also reads that record through `/api/store/order-status`. If Stripe says payment succeeded but the provider handoff has not appeared yet, the buyer still sees a received/pending message instead of a false fulfillment success.

## Product manifest additions

Each sellable product should expose:

- `variants`: store-owned variant IDs, labels, option names, price, SKU, and availability.
- `checkout`: checkout strategy and shipping policy.
- `embeddedFulfillment`: provider-specific product, variant, and placement mapping.

The frontend only sends store-owned product IDs and variant IDs. The backend is responsible for prices and fulfillment mappings so buyers cannot manipulate checkout amounts.

Product preflight is automated through:

```powershell
npm run store:fulfillment:doctor -- --network
```

The local part checks:

- every embedded checkout product has a ready Printful mapping;
- every storefront variant has a Printful catalog variant ID;
- front/back placements only use supported placement names;
- storefront/mockup and print artwork files exist;
- print PNG dimensions are large enough for the mapped placement;
- garment print files include alpha transparency.
- every embedded product declares the supported `included-us-standard` shipping policy and buyer-facing label.

The `--network` part also validates the configured Printful token against Printful's v2 OAuth scopes endpoint when `PRINTFUL_API_KEY` exists, then calls Printful's public catalog endpoint and verifies:

- the mapped catalog product exists;
- mapped Printful variants still exist;
- store size/color options match the provider variants;
- mapped placements are supported by the Printful product;
- mapped variants are available for the configured checkout countries.

Printful variant mapping can be generated from the public catalog:

```powershell
npm run store:printful:map -- --product <product-id> --catalog-product <printful-catalog-product-id>
npm run store:printful:map -- --product <product-id> --catalog-product <printful-catalog-product-id> --apply
```

The mapper matches store variants to Printful catalog variants by `Color` and `Size`, verifies the selected front/back placements, and refuses to write if any variant is missing or ambiguous. The first command is a dry run; add `--apply` only after reviewing the mapping.

The current `small-useful-light-tee` is mapped to Printful catalog product `1421`, `Unisex Fine Jersey Tee | LAT Apparel 6901`, with black size variants:

| Store variant | Printful catalog variant |
| --- | --- |
| `small-useful-light-black-s` | `44067` |
| `small-useful-light-black-m` | `44077` |
| `small-useful-light-black-l` | `44087` |
| `small-useful-light-black-xl` | `44097` |
| `small-useful-light-black-2xl` | `44107` |

## MVP choice

Start with Stripe Embedded Checkout and US-only shipping. Prefer "shipping included" pricing for the first product because it keeps the first checkout flow simple and avoids building live shipping-rate recalculation before the provider is finalized.

Stripe's current embedded Checkout docs use `ui_mode=embedded_page` and `stripe.createEmbeddedCheckoutPage(...)`. The frontend calls `createEmbeddedCheckoutPage` when available and falls back to `initEmbeddedCheckout` for older Stripe.js behavior.

When fulfillment credentials exist, the webhook should create a provider draft order first and only confirm it after the Stripe payment is complete.

## Wallet support

The Stripe Checkout Session explicitly enables `card`, which is the base requirement for card entry and card-backed wallets in Stripe Checkout. The config endpoint reports:

- `payments.card`: card checkout through Stripe.
- `payments.wallets.applePay`: Apple Pay eligibility marker. Production still requires Stripe/domain wallet readiness and a supported browser/device.
- `payments.wallets.googlePay`: Google Pay eligibility marker. Production still requires Stripe payment-method domain readiness and a supported browser/device.
- `payments.wallets.link`: Stripe Link eligibility marker. Production still requires Stripe payment-method domain readiness and supported account/payment-method settings.
- `payments.shopPay`: optional Shopify Shop Pay Wallet lane. This is separate from Stripe and still requires Shopify setup.

The buyer remains on `bensonperry.com/store`; Stripe's secure embedded checkout frame handles payment data.

## Why not deploy this over the current buy path yet?

The current Fourthwall path is live and buyable. The embedded checkout path should not replace it in production until Stripe and fulfillment credentials are configured and a real provider order can be created after payment.

## Required Worker secrets

The Worker is deployed, but payment is intentionally disabled until these secrets exist:

```powershell
npm run store:checkout:setup
```

That command checks ignored local env files and the Stripe CLI profile without printing secret values. Once Stripe and Printful credentials exist locally, it can create the Stripe webhook endpoint, write the generated webhook secret to `.env.local`, and deploy Worker secrets:

```powershell
npm run store:checkout:setup -- --create-webhook --register-payment-domain --write-local --deploy
```

If a Stripe CLI claimable sandbox exists, the setup command prints the claim URL. Claim the sandbox or log into Stripe, add `PRINTFUL_API_KEY` to `.env.local`, then rerun the setup command.

Manual fallback:

```powershell
npx wrangler secret put STRIPE_PUBLISHABLE_KEY --config wrangler.store-checkout.jsonc
npx wrangler secret put STRIPE_SECRET_KEY --config wrangler.store-checkout.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config wrangler.store-checkout.jsonc
```

Wallet readiness markers after the Stripe dashboard/domain setup is complete:

```powershell
npm run store:checkout:setup -- --register-payment-domain --write-local --deploy
```

Manual fallback:

```powershell
npx wrangler secret put STRIPE_WALLET_DOMAIN_READY --config wrangler.store-checkout.jsonc
npx wrangler secret put STRIPE_PAYMENT_METHODS_READY --config wrangler.store-checkout.jsonc
```

Fulfillment requires one provider:

```powershell
npx wrangler secret put PRINTFUL_API_KEY --config wrangler.store-checkout.jsonc
```

or:

```powershell
npx wrangler secret put GELATO_API_KEY --config wrangler.store-checkout.jsonc
```

Optional Shop Pay Wallet integration would require:

```powershell
npx wrangler secret put SHOP_PAY_CLIENT_ID --config wrangler.store-checkout.jsonc
npx wrangler secret put SHOPIFY_STOREFRONT_ACCESS_TOKEN --config wrangler.store-checkout.jsonc
npx wrangler secret put SHOPIFY_ADMIN_API_ACCESS_TOKEN --config wrangler.store-checkout.jsonc
```

Only for Stripe test-mode smoke tests before fulfillment mapping exists, set:

```powershell
npx wrangler secret put STORE_ALLOW_UNFULFILLED_CHECKOUT --config wrangler.store-checkout.jsonc
```

That value should not be `true` in production.

## Fulfillment doctor

Run:

```powershell
npm run store:fulfillment:doctor
npm run store:fulfillment:doctor -- --network
```

It checks local environment presence, Printful API authentication when a token exists, print assets, every embedded-checkout product's fulfillment mapping, and optionally the live Printful catalog. It intentionally exits non-zero until Stripe secrets, the Printful API key, and all provider variant IDs are configured.

## Local checkout smoke

Run:

```powershell
npm run store:checkout:smoke
```

This simulates a paid `checkout.session.completed` Stripe webhook against the local API handler, mocks the Printful order API, and then reads `/api/store/order-status`. It proves the signed webhook, cart metadata, Printful order payload, idempotency store, and order-status path work together without creating a real payment or provider order.

Use it after product manifest changes and before deploying credentials. It does not replace a real Stripe/Printful test order once account credentials exist.

## Launch readiness gate

Run:

```powershell
npm run store:launch:check -- --network --live
```

This is the one-command launch gate for embedded checkout. It checks:

- local Stripe, Printful, webhook, and wallet-domain readiness;
- Printful API authentication during `--network` checks when a token exists;
- local checkout config for card, Apple Pay, Google Pay, and Link eligibility markers;
- product artwork, Printful mapping, variant cart validation, and optional live Printful catalog readiness;
- the local signed Stripe webhook path with a mocked Printful order;
- the deployed Worker public config when `--live` is set.

After the Cloudflare route permission is fixed, add `--same-origin`:

```powershell
npm run store:launch:check -- --network --live --same-origin
```

It exits non-zero until the store can safely accept real embedded checkout orders. Today it is expected to fail only on missing account credentials/domain readiness while the product and mocked fulfillment smoke pass.

## Cloudflare route blocker

The current Cloudflare token can upload Workers, but it failed to attach the route `bensonperry.com/api/store/*` with a Cloudflare `403 Forbidden` response from `/zones/.../workers/routes`. Wrangler also reported that the token does not have `All Zones` permissions before falling back to the zone route endpoint.

To check or attach the preferred same-origin route:

```powershell
npm run store:route:setup
npm run store:route:setup -- --dry-run
npm run store:route:setup -- --deploy
```

The deploy command uses Wrangler's `--route bensonperry.com/api/store/*` flag, then rechecks `https://bensonperry.com/api/store/config`. It currently fails with a clear permission hint because the Cloudflare token still needs Workers Routes edit permission for the `bensonperry.com` zone.

Dashboard fallback:

1. Open Cloudflare.
2. Go to Workers & Pages > `benson-store-checkout-api` > Settings > Triggers.
3. Add route `bensonperry.com/api/store/*` in zone `bensonperry.com`.
4. Rerun `npm run store:launch:check -- --network --live --same-origin`.
