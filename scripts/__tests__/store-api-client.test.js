const assert = require("node:assert/strict");
const test = require("node:test");

async function apiClientModule() {
  return import("../../store/api-client.mjs");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("store API client prefers same-origin and de-duplicates fallback bases", async () => {
  const { storeApiBases } = await apiClientModule();

  assert.deepEqual(
    storeApiBases({
      primary: "",
      fallback: "https://benson-store-checkout-api.bensonperry.workers.dev/"
    }),
    ["", "https://benson-store-checkout-api.bensonperry.workers.dev"]
  );
  assert.deepEqual(storeApiBases({ primary: "", fallback: "" }), [""]);
});

test("store API client falls back when the same-origin route is missing", async () => {
  const { fetchStoreApiFromBases } = await apiClientModule();
  const urls = [];
  const response = await fetchStoreApiFromBases(
    "/api/store/config",
    { cache: "no-store" },
    {
      bases: ["", "https://worker.example.test"],
      fetchImpl: async (url) => {
        urls.push(url);
        if (url === "/api/store/config") return jsonResponse({ error: "not found" }, 404);
        return jsonResponse({ configured: true });
      }
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(urls, ["/api/store/config", "https://worker.example.test/api/store/config"]);
});

test("store API client falls back when a static host returns HTML for an API route", async () => {
  const { fetchStoreApiFromBases } = await apiClientModule();
  const urls = [];
  const response = await fetchStoreApiFromBases(
    "/api/store/config",
    { cache: "no-store" },
    {
      bases: ["", "https://worker.example.test"],
      fetchImpl: async (url) => {
        urls.push(url);
        if (url === "/api/store/config") {
          return new Response("<!doctype html><title>store</title>", {
            status: 200,
            headers: { "Content-Type": "text/html" }
          });
        }
        return jsonResponse({ configured: true });
      }
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(urls, ["/api/store/config", "https://worker.example.test/api/store/config"]);
});

test("store API client does not mask real checkout backend errors with fallback", async () => {
  const { fetchStoreApiFromBases } = await apiClientModule();
  const urls = [];
  const response = await fetchStoreApiFromBases(
    "/api/store/checkout-session",
    { method: "POST" },
    {
      bases: ["", "https://worker.example.test"],
      fetchImpl: async (url) => {
        urls.push(url);
        return jsonResponse({ error: "credentials missing" }, 503);
      }
    }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(urls, ["/api/store/checkout-session"]);
});
