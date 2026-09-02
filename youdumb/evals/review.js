const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://youdumb-api.bensonperry.workers.dev';
const token = localStorage.getItem('youdumb-eval-token');
const runId = new URL(location.href).searchParams.get('run');
const el = Object.fromEntries([...document.querySelectorAll('[id]')].map((node) => [node.id, node]));
let reviewerId = localStorage.getItem('youdumb-reviewer-id');
if (!/^[a-f0-9-]{36}$/i.test(reviewerId ?? '')) {
  reviewerId = crypto.randomUUID();
  localStorage.setItem('youdumb-reviewer-id', reviewerId);
}
const criteria = {
  causal: '25 each: plausible alternative; concrete comparison; explains which outcomes favor which cause; recognizes limitations or mixed causes. No relevant attempt = 0.',
  updating: '12.5 each across two items. Café: uses time-of-day evidence; shifts toward reduced hours; names a concrete uncertainty; identifies further separating evidence. Checkout: uses conversion rate; weakens design claim; traffic explains count; names an isolating comparison. Count each context only if relevant.',
  deduction: '0 no attempt; 25 wrong answer; 50 Ana without valid reasoning; 75 Ana with valid but incomplete reasoning; 100 sufficient proof across all valid orders (enumeration or equivalent elimination proof).',
  estimation: '25 each: numeric estimate; two quantitative assumptions; arithmetic actually supports estimate; range or sensitivity/most-uncertain assumption. No relevant attempt = 0. There is no preferred final number.',
  communication: 'Features: understandable; conclusions connected to reasons; concise and calibrated. 0 none, 50 one, 75 two, 100 all three. Do not penalize spelling or dialect if understandable.',
};
let cases = [];
let selectedCase;
let saving = false;

async function api(method = 'GET', body) {
  const response = await fetch(`${API_BASE}/eval/runs/${encodeURIComponent(runId)}/review?reviewer=${encodeURIComponent(reviewerId)}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Eval-Token': token }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Review request failed.');
  return data;
}

function renderCase() {
  selectedCase = cases.find(({ id }) => id === el['review-case'].value);
  if (!selectedCase) return;
  el['review-error'].textContent = '';
  el['review-progress'].textContent = `${cases.filter((item) => item.review).length}/${cases.length} judgments saved · reviewer ${reviewerId.slice(0, 8)}`;
  el['review-transcript'].replaceChildren(...selectedCase.answers.map((answer, index) => {
    const row = document.createElement('section'); row.className = 'review-item';
    const question = document.createElement('p'); question.className = 'review-question'; question.textContent = `${index + 1}. ${selectedCase.questions[index]}`;
    const text = document.createElement('p'); text.textContent = answer;
    row.append(question, text); return row;
  }));
  el['review-form'].hidden = Boolean(selectedCase.review);
  el['review-ratings'].replaceChildren(...Object.entries(criteria).map(([dimension, description]) => {
    const label = document.createElement('label'); label.textContent = dimension;
    const select = document.createElement('select'); select.name = dimension; select.required = true;
    const step = dimension === 'updating' ? 12.5 : 25;
    const options = [['', 'choose a rating'], ['uncertain', 'uncertain / not assessable'], ...Array.from({ length: 100 / step + 1 }, (_, i) => [String(i * step), String(i * step)])];
    options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    const help = document.createElement('small'); help.textContent = description;
    label.append(select, help); return label;
  }));
  el['review-rationale'].value = '';
  const alreadyRevealed = localStorage.getItem(`youdumb-seen-scores:${runId}`) === 'yes';
  el['review-seen'].checked = alreadyRevealed;
  el['review-seen'].disabled = alreadyRevealed;
  renderComparison();
}

function renderComparison() {
  const panel = el['review-comparison']; panel.replaceChildren(); panel.hidden = !selectedCase.review;
  if (!selectedCase.review) return;
  const heading = document.createElement('h2'); heading.textContent = 'saved judgment vs. model mean'; panel.append(heading);
  const note = document.createElement('p'); note.textContent = selectedCase.review.rationale; panel.append(note);
  const status = document.createElement('p'); status.className = 'section-note'; status.textContent = selectedCase.review.hadSeenModelScores ? 'Prior score exposure declared; this review is not blinded.' : 'No prior score exposure declared.'; panel.append(status);
  for (const [dimension, value] of Object.entries(selectedCase.comparison)) {
    const line = document.createElement('p');
    line.textContent = `${dimension}: you ${value.human ?? 'uncertain'} · model ${value.modelMean ?? 'pending'} · absolute gap ${value.absoluteGap ?? '—'}`;
    if (value.absoluteGap >= 25) line.className = 'warning';
    panel.append(line);
  }
}

el['review-case'].addEventListener('change', renderCase);
el['review-form'].addEventListener('submit', async (event) => {
  event.preventDefault(); if (saving || selectedCase.review) return;
  saving = true; el['save-review'].disabled = true; el['review-case'].disabled = true;
  const ratings = Object.fromEntries([...el['review-ratings'].querySelectorAll('select')].map((input) => [input.name, input.value === 'uncertain' ? null : input.value === '' ? 'missing' : Number(input.value)]));
  try {
    const saved = await api('POST', { reviewerId, caseId: selectedCase.id, ratings, rationale: el['review-rationale'].value, hadSeenModelScores: el['review-seen'].checked || localStorage.getItem(`youdumb-seen-scores:${runId}`) === 'yes' });
    Object.assign(selectedCase, saved);
    renderCase();
  } catch (error) { el['review-error'].textContent = error.message; }
  finally { saving = false; el['save-review'].disabled = false; el['review-case'].disabled = false; }
});

async function start() {
  if (!token) throw new Error('Sign in on the dashboard first, then reopen this review link.');
  if (!/^[a-f0-9-]{36}$/i.test(runId ?? '')) throw new Error('Open a holdout review from a saved dashboard run.');
  const data = await api(); cases = data.cases;
  el['review-case'].replaceChildren(...cases.map((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; return option; }));
  el['review-workspace'].hidden = false;
  renderCase();
}
start().catch((error) => { el['review-error'].textContent = error.message; });
