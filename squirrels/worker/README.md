# squirrel-cam worker

Tiny Cloudflare worker that receives detection frames from the phone (POST
/capture) into a KV namespace, so the laptop can pull them for retraining. No
review UI — claude lists/pulls/labels/retrains, then clears. KV is used (not
R2) so there's no payment-method requirement.

## deploy (one time)

```sh
cd worker
npx wrangler kv namespace create FRAMES   # copy the printed id into wrangler.toml
npx wrangler secret put ADMIN_SECRET       # paste any random string; tell claude what you chose
npx wrangler deploy                        # prints the URL, e.g. squirrel-cam.<you>.workers.dev
```

Then tell claude the deployed URL + the ADMIN_SECRET — the URL gets plugged into
`../index.html` (`CAPTURE_URL`) and pushed, which turns capture on.

## endpoints
- `POST /capture?reason=fired|uncertain&score=NN&t=<CAPTURE_TOKEN>` — body is raw jpeg; stored as `frame_<ts>_<reason>_<score>.jpg`. Gated by site origin + the (public) capture token.
- `GET /list` — list stored frames. **Bearer ADMIN_SECRET.**
- `GET /frame/<key>` — fetch one frame. **Bearer ADMIN_SECRET.**
- `POST /clear` — delete all frames (after a retrain pull). **Bearer ADMIN_SECRET.**

Frames are ~40 KB. The client caps uploads per session and throttles, so this
stays well under KV's free write limits; run `/clear` (via pull_captures.py
--clear) after each retrain.
