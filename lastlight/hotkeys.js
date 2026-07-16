export function isReportShortcut(event = {}) {
  const key = String(event.key || "").toLowerCase();
  return event.code === "Backquote" || key === "`" || key === "~";
}

export function shouldOpenReportShortcut(event = {}, context = {}) {
  return isReportShortcut(event)
    && !event.repeat
    && !context.isTyping
    && !context.dialogOpen;
}

export function isFpsShortcut(event = {}) {
  return event.code === "F3" && !event.repeat;
}
