# biblioplex cli

manage your [biblioplex](https://biblioplex.bensonperry.com) magic: the gathering
collection from the terminal — search, edit, import, and export, all against your
live cloud collection.

cloud-first: every command reads and writes the same collection the web app uses,
so the cli and the website stay perfectly in sync.

## install

requires **node 20+**.

```sh
npm install -g biblioplex      # then run `biblioplex` or `bp`
# or, no install:
npx biblioplex login
```

> the global command is `biblioplex`. it also installs a short `bp` alias; if some
> other tool already owns `bp` on your machine, just use `biblioplex` (or add your
> own alias).

## sign in

```sh
bp login            # read-only (search/export)
bp login --write    # also allow edits/imports
```

`bp login` opens your browser once to authorize the cli, then stores a refresh
token locally so you stay signed in for ~30 days. `bp logout` revokes it.

on a headless box: `bp login --no-browser` prints a url to open elsewhere.

## examples

```sh
# search with the same query grammar as the web app
bp search "t:creature c:rg cmc<=3 -t:legendary"
bp search rare f:foil --sort price --desc --limit 20

# totals and your most valuable cards
bp summary

# containers
bp ls decks
bp show "deck:breya"
bp deck show breya
bp deck export breya --preset moxfield > breya.txt

# edits (need `bp login --write`)
bp add "Sol Ring" --set c21 --cn 263 --qty 2 --location "box:bulk"
bp edit "Sol Ring" --condition lightly_played
bp move "Sol Ring" --to "deck:breya"
bp tag add trade "Sol Ring"
bp rm "Sol Ring"
bp undo                      # revert the last cli change

# bulk import / export (cloud stays the source of truth)
bp import moxfield-export.csv          # auto-detects the format
bp export "f:foil" --format moxfield > foils.txt
bp export --archive --output backup.json
```

ambiguous card names list the matching stacks; narrow with
`--set/--cn/--finish/--condition/--location`, or apply to all with `--all`.

## scripting / agents

every command accepts `--json` and prints a stable envelope to stdout:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "message": "..." } }
```

diagnostics go to stderr, so `--json` stdout is always a single json document.
exit codes: `0` ok · `1` error · `2` usage · `3` auth (run `bp login`) · `4` rate-limited.

## configuration

- credentials: `~/.config/biblioplex/credentials.json` (mode 600)
- override the api endpoint: `--api <url>` or `BIBLIOPLEX_API_BASE`
- override the config dir: `BIBLIOPLEX_CONFIG_DIR`

## notes

- zero runtime dependencies (node built-ins only).
- card search/sort, csv adapters, and the collection model are shared verbatim
  with the web app (see `vendor/`), so behavior matches exactly.
- macOS and linux are supported in this release.
