# bensonperry.com/store

The public store is a static storefront that reads `store/products.json`.

The embedded checkout target is Stripe plus Printful. Fourthwall remains a temporary fallback while Stripe and Printful account credentials are being configured.

## Product Workflow

1. Scaffold the listing:

```powershell
npm run store:product:scaffold -- --title "<product title>" --type t-shirt
```

2. Make the design/art file.
3. Save the product mockup and production artwork under `store/assets/`.
4. Apply the listing after the referenced asset files exist:

```powershell
npm run store:product:scaffold -- --title "<product title>" --type t-shirt --apply
```

Use `--replace` to update an existing draft with the same product ID.

5. Run `npm run store:printful:map -- --product <product-id> --catalog-product <printful-catalog-product-id> --apply`.
6. Run `npm run store:fulfillment:doctor -- --network` to validate assets, Printful mapping, and Printful API auth when credentials exist.
7. Run `npm run store:launch:check -- --network`.
8. Run `npm run store:checkout:setup -- --create-webhook --register-payment-domain --write-local --deploy` once Stripe and Printful credentials exist.
9. Run `npm run store:launch:check -- --network --live`.
10. Deploy the homepage and Worker once the launch check is clean.

When the Cloudflare token has route-edit permission for `bensonperry.com`, rerun the launch check with `--same-origin` to verify `https://bensonperry.com/api/store/*`. Until then the storefront tries same-origin first and falls back to the workers.dev checkout API.

The route can be attached with:

```powershell
npm run store:route:setup -- --deploy
```

For fallback Fourthwall publishing:

```powershell
npm run store:publish -- --id <product-id> --dry-run
npm run store:publish -- --id <product-id> --apply --publish
```

`store/studio.html` can draft embedded-checkout product entries and export JSON, but it does not write to the repository by itself.

See `store/EMBEDDED-CHECKOUT.md` for the embedded checkout architecture and setup details. See `store/FOURTHWALL-AUTOMATION.md` for fallback Fourthwall publishing.
