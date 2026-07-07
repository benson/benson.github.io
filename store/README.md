# bensonperry.com/store

The public store is a static storefront that reads `store/products.json`.

The embedded checkout target is Stripe plus Printful. Fourthwall remains a temporary fallback while Stripe and Printful account credentials are being configured.

## Product Workflow

1. Make the design/art file.
2. Add production fields, storefront variants, checkout settings, and fulfillment mapping to `store/products.json`.
3. Save the product mockup under `store/assets/`.
4. Run `npm run store:printful:map -- --product <product-id> --catalog-product <printful-catalog-product-id> --apply`.
5. Run `npm run store:fulfillment:doctor -- --network`.
6. Run `npm run store:launch:check -- --network`.
7. Run `npm run store:checkout:setup -- --create-webhook --register-payment-domain --write-local --deploy` once Stripe and Printful credentials exist.
8. Run `npm run store:launch:check -- --network --live`.
9. Deploy the homepage and Worker once the launch check is clean.

For fallback Fourthwall publishing:

```powershell
npm run store:publish -- --id <product-id> --dry-run
npm run store:publish -- --id <product-id> --apply --publish
```

`store/studio.html` can draft product entries and export JSON, but it does not write to the repository by itself.

See `store/EMBEDDED-CHECKOUT.md` for the embedded checkout architecture and setup details. See `store/FOURTHWALL-AUTOMATION.md` for fallback Fourthwall publishing.
