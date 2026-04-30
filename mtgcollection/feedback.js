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
  if (s == null) return '';
  // Manual escape covers attribute contexts too (textContent/innerHTML
  // round-trip leaves `"` and `'` raw, which breaks attribute interpolation
  // for user-controlled values like tags).
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
