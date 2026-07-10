(() => {
  const trigger = document.querySelector("#build-history-button");
  const dialog = document.querySelector("#build-history-dialog");
  const closeButton = document.querySelector("#build-history-close");
  const shippedAt = document.querySelector(".build-shipped-at");

  if (!trigger || !dialog || !closeButton) return;

  if (shippedAt) {
    const rawTimestamp = shippedAt.dataset.buildShippedAt;
    if (rawTimestamp) {
      const releaseDate = new Date(rawTimestamp);
      if (!Number.isNaN(releaseDate.getTime())) {
        shippedAt.dateTime = rawTimestamp;
        shippedAt.textContent = `Shipped ${new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(releaseDate)}`;
      }
    }
  }

  const openHistory = () => {
    if (!dialog.open) dialog.showModal();
  };

  const closeHistory = () => {
    if (dialog.open) dialog.close();
  };

  trigger.addEventListener("click", openHistory);
  closeButton.addEventListener("click", closeHistory);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeHistory();
  });
  dialog.addEventListener("close", () => trigger.focus({ preventScroll: true }));
})();
