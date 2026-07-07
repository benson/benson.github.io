# Fourthwall Automation

This is the provider bridge for `bensonperry.com/store`.

The goal is that a future product idea becomes:

1. Codex prepares production artwork and a product record.
2. Benson approves the taste direction.
3. Codex runs `npm run store:publish`.
4. The script creates or finds the hosted Fourthwall product and updates `store/products.json`.
5. The homepage deploys with a working buy link.

## One-Time Setup

Fourthwall still needs a real account owner for identity, payouts, payment method, tax, and API credentials. Keep credentials out of chat and out of git.

Create a Fourthwall API key, then set one of these locally:

```powershell
$env:FOURTHWALL_API_USERNAME = "your_api_username"
$env:FOURTHWALL_API_PASSWORD = "your_api_password"
```

or:

```powershell
$env:FOURTHWALL_API_TOKEN = "your_oauth_or_api_token"
```

For a one-time setup, put the same values in an ignored `.env.local` file at the repo root:

```ini
FOURTHWALL_API_USERNAME=your_api_username
FOURTHWALL_API_PASSWORD=your_api_password
```

or:

```ini
FOURTHWALL_API_TOKEN=your_oauth_or_api_token
```

The script supports both Basic Auth and Bearer token auth because Fourthwall documents API keys, OAuth, and Basic Auth examples for the Platform API.

## Commands

Validate the local files only:

```powershell
npm run store:fourthwall -- validate --id small-useful-light-tee
```

Dry-run provider selection without creating anything:

```powershell
npm run store:publish -- --id small-useful-light-tee --dry-run
```

Run the same no-mutation credential/template check with friendlier naming:

```powershell
npm run store:fourthwall -- doctor --id small-useful-light-tee
```

Create/publish the Fourthwall product and update the store catalog:

```powershell
npm run store:publish -- --id small-useful-light-tee --apply --publish
```

Discover possible shirt templates:

```powershell
npm run store:fourthwall -- discover --query shirt
```

## What The Publisher Does

- Reads `store/products.json`.
- Validates the production PNGs and their dimensions.
- Lists Fourthwall product templates.
- Auto-selects a DTG shirt template with backend rendering, black color availability, and front/back regions.
- Uploads production PNGs to Fourthwall media.
- Registers the media assets to get `imageId` values.
- Creates a design product with `type: "design"`.
- Uses the product page URL as `checkoutUrl`, so buyers can pick their shirt size before checkout.
- Marks the local listing `live` only when `--publish` is used.

## Current Product

`small-useful-light-tee` is ready for this flow. Without Fourthwall credentials, the script stops after validating local assets and reports that credentials are the only remaining blocker.
