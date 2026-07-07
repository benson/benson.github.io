# bensonperry.com/store

The public store is a static storefront that reads `store/products.json`.

Fulfillment and checkout are intentionally external. The current target is Fourthwall because it supports print-on-demand products, hosted checkout, and direct product links without this site handling payment or shipping state.

## Product Workflow

1. Make the design/art file.
2. Add production fields and Fourthwall publishing preferences to `store/products.json`.
3. Save the product mockup under `store/assets/`.
4. Run `npm run store:publish -- --id <product-id> --dry-run`.
5. Run `npm run store:publish -- --id <product-id> --apply --publish`.
6. Deploy the homepage.

`store/studio.html` can draft product entries and export JSON, but it does not write to the repository by itself.

See `store/FOURTHWALL-AUTOMATION.md` for the one-time credential setup and command details.
