const assert = require("node:assert/strict");
const test = require("node:test");

async function orderReturnModule() {
  return import("../../store/order-return.mjs");
}

test("order return messages cover fulfillment states", async () => {
  const { orderReturnMessage } = await orderReturnModule();

  assert.equal(orderReturnMessage({ status: "succeeded" }), "order received. fulfillment is queued.");
  assert.equal(orderReturnMessage({ status: "processing" }), "order received. fulfillment is processing.");
  assert.equal(orderReturnMessage({ status: "failed" }), "order received. fulfillment needs attention.");
  assert.equal(orderReturnMessage({ status: "unavailable" }), "order received. fulfillment status is unavailable.");
  assert.equal(orderReturnMessage({ status: "pending" }), "order received. fulfillment record is pending.");
});

test("order return polling continues until fulfillment settles", async () => {
  const { shouldPollFulfillmentStatus } = await orderReturnModule();

  assert.equal(shouldPollFulfillmentStatus({ status: "pending" }), true);
  assert.equal(shouldPollFulfillmentStatus({ status: "processing" }), true);
  assert.equal(shouldPollFulfillmentStatus({ status: "unavailable" }), true);
  assert.equal(shouldPollFulfillmentStatus({ status: "succeeded" }), false);
  assert.equal(shouldPollFulfillmentStatus({ status: "failed" }), false);
});
