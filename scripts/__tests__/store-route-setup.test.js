const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const { Readable } = require("node:stream");
const test = require("node:test");

async function routeModule() {
  return import("../store/route-setup.mjs");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("route setup parses deploy, dry-run, public URL, and route flags", async () => {
  const { parseArgs } = await routeModule();
  const args = parseArgs([
    "--deploy",
    "--dry-run",
    "--public-url",
    "https://example.com",
    "--route",
    "example.com/api/store/*"
  ]);

  assert.equal(args.deploy, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.publicUrl, "https://example.com");
  assert.equal(args.route, "example.com/api/store/*");
});

test("route setup builds the same-origin config URL", async () => {
  const { sameOriginConfigUrl } = await routeModule();

  assert.equal(sameOriginConfigUrl("https://bensonperry.com/"), "https://bensonperry.com/api/store/config");
});

test("route setup checks a live JSON same-origin API response", async () => {
  const { checkSameOriginRoute } = await routeModule();
  const result = await checkSameOriginRoute({
    publicUrl: "https://bensonperry.com",
    fetchImpl: async (url) => {
      assert.equal(url, "https://bensonperry.com/api/store/config");
      return jsonResponse({ mode: "stripe-embedded" });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.detail, "stripe-embedded");
});

test("route setup reports missing same-origin route responses", async () => {
  const { checkSameOriginRoute } = await routeModule();
  const result = await checkSameOriginRoute({
    fetchImpl: async () => jsonResponse({ error: "not found" }, 404)
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.detail, "not found");
});

test("route setup builds Wrangler route deploy args", async () => {
  const { wranglerRouteDeployArgs } = await routeModule();

  assert.deepEqual(wranglerRouteDeployArgs({ route: "bensonperry.com/api/store/*" }), [
    "--yes",
    "wrangler@latest",
    "deploy",
    "--config",
    "wrangler.store-checkout.jsonc",
    "--route",
    "bensonperry.com/api/store/*"
  ]);
  assert.ok(wranglerRouteDeployArgs({ dryRun: true }).includes("--dry-run"));
});

test("route setup recognizes Cloudflare route permission errors", async () => {
  const { routePermissionHint } = await routeModule();

  assert.match(routePermissionHint("Authentication error [code: 10000]"), /Workers Routes edit permission/);
  assert.equal(routePermissionHint("some other wrangler failure"), "");
});

test("route setup can run a mocked Wrangler route deploy", async () => {
  const { runWranglerRouteDeploy } = await routeModule();
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    const child = new EventEmitter();
    child.stdout = Readable.from(["uploaded"]);
    child.stderr = Readable.from([]);
    process.nextTick(() => child.emit("close", 0));
    return child;
  };

  const result = await runWranglerRouteDeploy({
    route: "bensonperry.com/api/store/*",
    dryRun: true,
    spawnImpl
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].command, "npx");
  assert.ok(calls[0].args.includes("--dry-run"));
});
