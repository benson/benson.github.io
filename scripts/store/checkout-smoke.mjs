import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  encodeCartMetadata,
  fulfillmentRecordKey,
  handleStoreApiRequest,
  loadCatalog,
  resolveCart
} from "./checkout.mjs";
import { loadLocalEnv } from "./env.mjs";

const DEFAULT_PRODUCT_ID = "small-useful-light-tee";
const DEFAULT_VARIANT_ID = "small-useful-light-black-m";
const DEFAULT_SESSION_ID = "cs_test_smoke123";
const SMOKE_WEBHOOK_SECRET = "whsec_store_smoke";

export function parseArgs(argv) {
  const args = {
    help: false,
    productId: DEFAULT_PRODUCT_ID,
    variantId: DEFAULT_VARIANT_ID,
    quantity: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--product") args.productId = argv[(index += 1)] || "";
    else if (arg.startsWith("--product=")) args.productId = arg.slice("--product=".length);
    else if (arg === "--variant") args.variantId = argv[(index += 1)] || "";
    else if (arg.startsWith("--variant=")) args.variantId = arg.slice("--variant=".length);
    else if (arg === "--quantity") args.quantity = Number(argv[(index += 1)] || 1);
    else if (arg.startsWith("--quantity=")) args.quantity = Number(arg.slice("--quantity=".length));
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function usage() {
  console.log(`Store checkout smoke test

Simulates a paid Stripe webhook locally, mocks Printful, and verifies the order-status route.
No real payment or provider order is created.

Usage:
  npm run store:checkout:smoke
  npm run store:checkout:smoke -- --variant small-useful-light-black-xl
`);
}

function memoryStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

function signStripePayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function paidSession({ sessionId, cartMetadata }) {
  return {
    id: sessionId,
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    metadata: {
      cart: cartMetadata
    },
    customer_details: {
      email: "smoke-buyer@example.com",
      name: "Smoke Buyer",
      address: {
        line1: "123 Test St",
        line2: "Apt 5",
        city: "Brooklyn",
        state: "NY",
        country: "US",
        postal_code: "11201"
      }
    }
  };
}

async function json(response) {
  return response.json().catch(() => ({}));
}

export async function runCheckoutSmoke({ productId = DEFAULT_PRODUCT_ID, variantId = DEFAULT_VARIANT_ID, quantity = 1 } = {}) {
  loadLocalEnv();
  const catalog = await loadCatalog();
  const cartItems = [{ productId, variantId, quantity }];
  const lines = resolveCart(catalog, cartItems);
  const cartMetadata = encodeCartMetadata(lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    sku: line.sku,
    quantity: line.quantity
  })));
  const session = paidSession({ sessionId: DEFAULT_SESSION_ID, cartMetadata });
  const payload = JSON.stringify({
    id: "evt_store_smoke",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: session
    }
  });
  const orderStore = memoryStore();
  let printfulCalls = 0;
  let printfulBody = null;

  const webhookResponse = await handleStoreApiRequest(
    new Request("https://example.com/api/store/webhook/stripe", {
      method: "POST",
      headers: {
        "Stripe-Signature": signStripePayload(payload, SMOKE_WEBHOOK_SECRET)
      },
      body: payload
    }),
    {
      catalogFile: undefined,
      env: {
        ...process.env,
        PRINTFUL_API_KEY: "smoke",
        PRINTFUL_STORE_ID: "smoke-store",
        STRIPE_WEBHOOK_SECRET: SMOKE_WEBHOOK_SECRET,
        STORE_PUBLIC_URL: "https://bensonperry.com"
      },
      orderStore,
      fetchImpl: async (url, options) => {
        printfulCalls += 1;
        printfulBody = JSON.parse(options.body);
        if (url !== "https://api.printful.com/v2/orders") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ message: `unexpected smoke URL: ${url}` })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "pf_smoke_order",
            status: "draft"
          })
        };
      }
    }
  );
  const webhookBody = await json(webhookResponse);
  if (!webhookResponse.ok) {
    throw new Error(`webhook route failed: ${webhookResponse.status} ${webhookBody.error || ""}`.trim());
  }

  const statusResponse = await handleStoreApiRequest(
    new Request(`https://example.com/api/store/order-status?session_id=${encodeURIComponent(DEFAULT_SESSION_ID)}`),
    { orderStore }
  );
  const statusBody = await json(statusResponse);
  if (!statusResponse.ok) {
    throw new Error(`order-status route failed: ${statusResponse.status} ${statusBody.error || ""}`.trim());
  }

  const key = fulfillmentRecordKey(DEFAULT_SESSION_ID);
  const orderItem = printfulBody?.order_items?.[0] || {};
  const result = {
    sessionId: DEFAULT_SESSION_ID,
    fulfillmentKey: key,
    fulfillmentStatus: statusBody.status,
    providerOrderId: statusBody.fulfillment?.providerOrderId || null,
    printfulCalls,
    catalogVariantId: orderItem.catalog_variant_id || null,
    placementCount: orderItem.placements?.length || 0,
    webhookReceived: webhookBody.received === true
  };

  if (result.fulfillmentStatus !== "succeeded") throw new Error(`expected succeeded fulfillment, got ${result.fulfillmentStatus}`);
  if (result.providerOrderId !== "pf_smoke_order") throw new Error("expected mocked Printful order id to be recorded");
  if (printfulCalls !== 1) throw new Error(`expected one Printful call, got ${printfulCalls}`);
  if (!result.webhookReceived) throw new Error("webhook response was not acknowledged");

  return result;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const result = await runCheckoutSmoke(args);
  console.log("Store checkout smoke test");
  console.log("");
  console.log(`ok      session ${result.sessionId}`);
  console.log(`ok      ${result.fulfillmentKey}`);
  console.log(`ok      fulfillment ${result.fulfillmentStatus}`);
  console.log(`ok      mocked Printful order ${result.providerOrderId}`);
  console.log(`ok      catalog variant ${result.catalogVariantId}, ${result.placementCount} placement(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
