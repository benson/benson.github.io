# Frictionless Product Pipeline

This store should support a fast loop:

1. Benson gives Codex a product idea and taste constraints.
2. Codex chooses the product route, blank, production method, and file requirements.
3. Codex creates or prepares production artwork and storefront mockups.
4. Codex adds the listing to `store/products.json`.
5. Benson thumbs-up/thumbs-downs the product.
6. Codex walks the final hosted checkout step, then flips the listing live.

The user should not have to think about file format, DPI, embroidery constraints, product JSON, storefront implementation, or deployment unless they explicitly want to.

## Product Statuses

- `draft`: idea exists, not ready for public display.
- `ready`: production files and listing are ready, but hosted checkout does not exist yet.
- `sample`: placeholder/sample item, useful for visual testing.
- `live`: `checkoutUrl` exists and customers can buy it.
- `sold-out`: leave listed, but disable purchase.

## Default Routes

- T-shirts: DTG on a black heavyweight or garment-dyed unisex tee unless the idea calls for another blank.
- Hats: embroidery only when the artwork is simple enough; otherwise choose patch or printed hat options.
- Playmats: full-surface print with a single flattened production image.

## Codex Responsibilities

- Pick the lowest-friction fulfillment path that still preserves the idea.
- Avoid IP-infringing, offensive, or overly fragile artwork.
- Produce production assets separately from storefront mockups.
- Validate dimensions, transparency, obvious broken assets, and store rendering.
- Keep the public listing honest until real checkout exists.

## Benson Responsibilities

- Give a taste read.
- Create or approve the hosted product account/product when credentials, payment, or identity details are required.
- Buy/order a sample when the product matters enough to verify physically.
