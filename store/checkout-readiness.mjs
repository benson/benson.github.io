export function checkoutReadiness(config = null) {
  if (!config) {
    return {
      ready: false,
      status: "loading",
      message: "checking checkout...",
      methods: []
    };
  }

  const methods = [
    {
      id: "card",
      label: "card",
      ready: config.payments?.card?.status === "configured",
      status: config.payments?.card?.status || "missing"
    },
    {
      id: "apple-pay",
      label: "apple pay",
      ready: config.payments?.wallets?.applePay?.status === "eligible",
      status: config.payments?.wallets?.applePay?.status || "missing"
    },
    {
      id: "google-pay",
      label: "google pay",
      ready: config.payments?.wallets?.googlePay?.status === "eligible",
      status: config.payments?.wallets?.googlePay?.status || "missing"
    },
    {
      id: "link",
      label: "link",
      ready: config.payments?.wallets?.link?.status === "eligible",
      status: config.payments?.wallets?.link?.status || "missing"
    }
  ];

  if (config.payments?.shopPay?.status === "ready") {
    methods.push({
      id: "shop-pay",
      label: "shop pay",
      ready: true,
      status: config.payments.shopPay.status || "configured"
    });
  }

  const paymentReady = Boolean(config.configured && methods.some((method) => method.id === "card" && method.ready));
  const fulfillmentReady = config.fulfillmentReady === true || config.fulfillment?.status === "configured";
  const ready = Boolean(paymentReady && fulfillmentReady);
  const message = ready
    ? "checkout ready"
    : paymentReady && !fulfillmentReady
      ? "fulfillment setup pending"
      : "checkout setup pending";

  return {
    ready,
    status: ready ? "ready" : "pending",
    message,
    methods
  };
}

export function checkoutReadinessFromError(error) {
  return {
    ready: false,
    status: "unavailable",
    message: error?.message || "checkout status unavailable",
    methods: []
  };
}
