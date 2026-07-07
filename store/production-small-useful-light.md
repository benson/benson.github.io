# Small Useful Light

Codex-original tee design.

## Concept

A small lamp turning a tangled line into a clear path. No text, no brand marks, no game-specific references.

## Production Files

- Primary back print: `store/assets/small-useful-light-generated-print-4500.png`
- Store mockup: `store/assets/small-useful-light-generated-mockup.png`
- Front chest mark: `store/assets/small-useful-light-front.png`
- Editable front source: `store/assets/small-useful-light-front.svg`
- Fallback/vector back print: `store/assets/small-useful-light-back.png`
- Editable fallback/vector back source: `store/assets/small-useful-light-back.svg`

## File Checks

- Generated back PNG: 4500x3000, transparent RGBA, 300 DPI metadata
- Front PNG: 1800x1800, transparent RGBA, 300 DPI
- Mockup PNG: 1254x1254, opaque storefront image
- Fallback back PNG: 4500x5400, transparent RGBA, 300 DPI

## Recommended Product Setup

- Provider: Fourthwall
- Product type: printed t-shirt, DTG
- Blank: LAT Unisex Fine Jersey Tee, black
- Front placement: left chest, using `small-useful-light-front.png`
- Back placement: full back print, using `small-useful-light-generated-print-4500.png`
- Listing title: small useful light
- Listing price: $34

Run this after the Fourthwall account/API credential exists:

```powershell
npm run store:publish -- --id small-useful-light-tee --apply --publish
```

The publisher uploads the artwork, creates or finds the hosted Fourthwall product, writes the product URL into `checkoutUrl`, and changes `status` from `ready` to `live`.
