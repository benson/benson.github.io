export function orderReturnMessage(orderStatus = {}) {
  if (orderStatus.status === "succeeded") return "order received. fulfillment is queued.";
  if (orderStatus.status === "processing") return "order received. fulfillment is processing.";
  if (orderStatus.status === "failed") return "order received. fulfillment needs attention.";
  if (orderStatus.status === "unavailable") return "order received. fulfillment status is unavailable.";
  return "order received. fulfillment record is pending.";
}

export function shouldPollFulfillmentStatus(orderStatus = {}) {
  return !["succeeded", "failed"].includes(orderStatus.status);
}
