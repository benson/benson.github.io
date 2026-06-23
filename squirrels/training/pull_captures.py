#!/usr/bin/env python3
"""pull captured detection frames off the squirrel-cam worker for retraining.

  WORKER_URL=https://squirrel-cam.<you>.workers.dev ADMIN_SECRET=xxx \
      python3 pull_captures.py [--clear]

downloads every frame into ./captures/, named frame_<ts>_<reason>_<score>.jpg
so they're easy to sort. --clear empties the bucket afterward (do it once
you've retrained, to keep R2 tidy).
"""
import json, os, sys, urllib.request

BASE = os.environ.get("WORKER_URL", "").rstrip("/")
SECRET = os.environ.get("ADMIN_SECRET", "")
OUT = os.path.join(os.path.dirname(__file__), "captures")


def get(path, raw=False):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {SECRET}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read() if raw else json.loads(r.read())


def main():
    if not BASE or not SECRET:
        sys.exit("set WORKER_URL and ADMIN_SECRET env vars")
    os.makedirs(OUT, exist_ok=True)
    keys = get("/list")["keys"]
    print(f"{len(keys)} frames on the worker")
    for k in keys:
        name = k["key"]
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(get("/frame/" + name, raw=True))
    print(f"downloaded {len(keys)} -> {OUT}")
    if "--clear" in sys.argv and keys:
        req = urllib.request.Request(BASE + "/clear", method="POST",
                                     headers={"Authorization": f"Bearer {SECRET}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            print("cleared:", json.loads(r.read()))


if __name__ == "__main__":
    main()
