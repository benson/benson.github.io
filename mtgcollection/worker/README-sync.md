# MTG Collection Sync Worker

This worker keeps legacy public deck share links in KV and adds authenticated
cross-device collection sync with D1 and a Durable Object.

For the Clerk and production deployment checklist, see
`AUTH_PRODUCTION_CHECKLIST.md`.

## Required Cloudflare Setup

1. Create the D1 database:

```sh
wrangler d1 create mtgcollection-sync
```

2. Replace `database_id = "replace-with-d1-database-id"` in `wrangler.toml`
   with the returned database id.

3. Apply the schema:

```sh
wrangler d1 migrations apply mtgcollection-sync
```

4. Add Clerk verification:

```sh
wrangler secret put CLERK_JWT_KEY
```

`CLERK_JWT_KEY` should be Clerk's PEM public key. Configure these non-secret
values in `wrangler.toml`:

- `CLERK_ISSUER`: the exact Clerk issuer, such as
  `https://clerk.bensonperry.com` for the production instance.
- `CLERK_AUTHORIZED_PARTIES`: a comma-separated list of allowed browser origins,
  such as `https://bensonperry.com`.
- `CLERK_AUDIENCE`: optional. If set, the Worker requires Clerk tokens to include
  a matching `aud` claim. Leave it unset unless the Clerk token template is
  configured to emit that audience.

## Frontend Config

Set `window.MTGCOLLECTION_CLERK_PUBLISHABLE_KEY` before `app.js` loads, or add:

```html
<meta name="mtgcollection-clerk-publishable-key" content="pk_...">
```

Optional overrides:

```js
window.MTGCOLLECTION_SYNC_API_URL = 'http://127.0.0.1:8787';
window.MTGCOLLECTION_SHARE_API_URL = 'http://127.0.0.1:8787';
```

For local development, `.dev.vars` sets `SYNC_AUTH_DISABLED=1`. When the app is
opened from `localhost` or `127.0.0.1` without a Clerk publishable key, it uses
a built-in `dev sync` identity so the end-to-end sync flow can be tested before
production auth is configured. If `index.html` contains the production
publishable key, localhost still uses `dev sync` unless
`window.MTGCOLLECTION_CLERK_PUBLISHABLE_KEY` is set explicitly.
