// ---- Lowest-level utilities: HTML escape + feedback bar ----

let feedbackEl;

export function initFeedback() {
  feedbackEl = document.getElementById('feedback');
}

export function showFeedback(html, type = 'info') {
  feedbackEl.innerHTML = html;
  feedbackEl.className = 'feedback active ' + type;
}

export function hideFeedback() {
  feedbackEl.className = 'feedback';
}

export function getFeedbackEl() {
  return feedbackEl;
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
