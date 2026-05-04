# MTG Collection Auth + Sync Production Checklist

This app uses Clerk in the browser and verifies Clerk session tokens in the
Cloudflare Worker before routing sync requests to the collection Durable Object.

## Clerk Development

Historical development instance:

- Publishable key in `mtgcollection/index.html`:
  `pk_test_cmlnaHQtaGF3ay03Mi5jbGVyay5hY2NvdW50cy5kZXYk`
- Issuer in `worker/wrangler.toml`:
  `https://right-hawk-72.clerk.accounts.dev`
- JWKS URL:
  `https://right-hawk-72.clerk.accounts.dev/.well-known/jwks.json`

For local testing with real Clerk auth, serve the static app from
`http://127.0.0.1:8765` or `http://localhost:8765` and run the Worker on
`http://127.0.0.1:8787`. The production publishable key in `index.html` is
ignored on localhost unless `window.MTGCOLLECTION_CLERK_PUBLISHABLE_KEY` is set
explicitly, so local development falls back to the `dev sync` identity.

## Clerk Production

Production instance:

- Publishable key in `mtgcollection/index.html`:
  `pk_live_Y2xlcmsuYmVuc29ucGVycnkuY29tJA`
- Issuer in `worker/wrangler.toml`:
  `https://clerk.bensonperry.com`
- JWKS URL:
  `https://clerk.bensonperry.com/.well-known/jwks.json`

Configure Clerk dashboard values:

- Allowed redirect URL: `https://bensonperry.com/mtgcollection/`
- Allowed sign-in URL: `https://bensonperry.com/mtgcollection/`
- Allowed sign-up URL: `https://bensonperry.com/mtgcollection/`
- Allowed origin: `https://bensonperry.com`
- Enabled social providers: Google, Apple, and GitHub are fine for this app.
- Production social providers should use custom OAuth credentials rather than
  Clerk shared credentials.

## Worker Production

Set the production JWT public key as a Worker secret:

```sh
wrangler secret put CLERK_JWT_KEY
```

Set production non-secret vars in `worker/wrangler.toml` before deploy:

```toml
[vars]
CLERK_ISSUER = "https://clerk.bensonperry.com"
CLERK_AUTHORIZED_PARTIES = "https://bensonperry.com"
```

Leave `CLERK_AUDIENCE` unset unless Clerk is configured to include a matching
`aud` claim in browser session tokens.

Do not set `SYNC_AUTH_DISABLED=1` in production. That value belongs only in
local `.dev.vars`.

## Frontend Production

`mtgcollection/index.html` should use the production publishable key before
publishing.

If the Worker remains hosted at the same production origin/path expected by
`share.js`, no extra frontend sync URL override is needed. If it moves, set
`window.MTGCOLLECTION_SYNC_API_URL` and `window.MTGCOLLECTION_SHARE_API_URL`
before `app.js` loads.

## Acceptance

- Sign in from `https://bensonperry.com/mtgcollection/`.
- Confirm `/sync/bootstrap` returns `200` for signed-in users.
- Confirm missing or invalid tokens return `401`.
- Open the collection in two browsers and verify edits sync within a few
  seconds.
- Disable network, make a local quantity edit, restore network, and confirm the
  account chip returns to `synced`.
- Create and read a public deck share link.
