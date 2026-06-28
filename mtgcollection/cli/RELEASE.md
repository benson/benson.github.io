# biblioplex cli — deployment & publish runbook

Everything below is **manual / sign-off gated**. Nothing in this change deploys
or publishes on its own. Work was done on branch `biblioplex-cli`.

## 0. fill in placeholders first

- `package.json` → `repository.url` / `bugs.url`: replace `REPLACE_ME` with your
  GitHub owner.
- `.github/workflows/cli-release.yml` → `TAP_REPO`: set to `<owner>/homebrew-tap`.
- `packaging/biblioplex.rb`: `sha256` is filled automatically by the release
  workflow; leave as-is until first publish.

## 1. deploy the worker (production auth change) — REQUIRED FIRST

The CLI needs the worker changes in `mtgcollection/worker/{worker.js,mcp.js}`:
a public OAuth client (`biblioplex-cli`, code-defined — no KV seeding needed),
loopback redirects, `mcp_at_` tokens accepted on `/sync/*` with scope checks,
refresh-token rotation, and a `/revoke` endpoint.

```sh
cd mtgcollection/worker
npx wrangler deploy
```

No new secrets or vars are required (the existing CLERK_OAUTH_* secrets power the
login bridge). Verify after deploy:

```sh
# revocation endpoint now advertised:
curl -s https://api.bensonperry.com/.well-known/oauth-authorization-server | grep revocation_endpoint
# loopback authorize is accepted for the cli client (expects a redirect to clerk):
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://api.bensonperry.com/authorize?response_type=code&client_id=biblioplex-cli&redirect_uri=http://127.0.0.1:8765/callback&code_challenge=abc&code_challenge_method=S256&scope=collection.read"
```

## 2. smoke-test the cli against production

```sh
cd mtgcollection/cli
node bin/biblioplex.mjs login          # real browser login via Clerk
node bin/biblioplex.mjs summary
node bin/biblioplex.mjs login --write
node bin/biblioplex.mjs add "Sol Ring" --set c21 --cn 263 --qty 1 --dry-run
```

## 3. publish to npm

First confirm the name is available and you’re logged in (`npm whoami`).

```sh
cd mtgcollection/cli
npm run sync-vendor && npm test       # vendor fresh + green
npm publish --access public           # first publish; add --provenance from CI
```

Or, preferred, tag-driven via CI (needs `NPM_TOKEN` repo secret):

```sh
git tag cli-v0.1.0 && git push origin cli-v0.1.0
```

## 4. homebrew (optional)

1. Create a tap repo `github.com/<owner>/homebrew-tap` with
   `Formula/biblioplex.rb` (copy from `packaging/biblioplex.rb`).
2. Add repo secret `HOMEBREW_TAP_TOKEN` (PAT with write access to the tap) and
   set repo variable `ENABLE_HOMEBREW=true`.
3. The release workflow’s `update-homebrew-tap` job will bump `url`+`sha256` on
   each `cli-v*` tag. Users then `brew install <owner>/tap/biblioplex`.

## 5. merge

```sh
git checkout master && git merge --ff-only biblioplex-cli && git push
```

(Pushing `master` deploys the web app via GitHub Pages — the only app-facing
change is the behavior-preserving `searchCore.js` extraction, already verified in
the browser and by the test suite.)
