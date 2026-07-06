# bensonperry.com/store

The public store is a static storefront that reads `store/products.json`.

Fulfillment and checkout are intentionally external. The current target is Fourthwall because it supports print-on-demand products, hosted checkout, and direct product links without this site handling payment or shipping state.

## Product Workflow

1. Make the design/art file.
2. Create the product in Fourthwall.
3. Save the product mockup under `store/assets/`.
4. Add or update an entry in `store/products.json`.
5. Set `status` to `live` and paste the Fourthwall product or checkout URL into `checkoutUrl`.
6. Deploy the homepage.

`store/studio.html` can draft product entries and export JSON, but it does not write to the repository by itself.
