import { REVIEW_GUIDE, ratingOptions, reviewResponsesFor } from './review-guide.mjs?v=13';

const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://youdumb-api.bensonperry.workers.dev';
const token = localStorage.getItem('youdumb-eval-token');
const runId = new URL(location.href).searchParams.get('run');
const el = Object.fromEntries([...document.querySelectorAll('[id]')].map((node) => [node.id, node]));
let reviewerId = localStorage.getItem('youdumb-reviewer-id');
if (!/^[a-f0-9-]{36}$/i.test(reviewerId ?? '')) {
  reviewerId = crypto.randomUUID();
  localStorage.setItem('youdumb-reviewer-id', reviewerId);
}
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

function renderResponses(dimension) {
  return reviewResponsesFor(dimension, selectedCase).map(({ number, question, answer }) => {
    const row = document.createElement('section'); row.className = 'review-item';
    const prompt = document.createElement('p'); prompt.className = 'review-question'; prompt.textContent = `${number}. ${question}`;
    const caption = document.createElement('p'); caption.className = 'review-answer-label'; caption.textContent = 'response';
    const text = document.createElement('p'); text.className = 'review-response-text'; text.textContent = answer;
    row.append(prompt, caption, text); return row;
  });
}

function renderCase() {
  selectedCase = cases.find(({ id }) => id === el['review-case'].value);
  if (!selectedCase) return;
  el['review-error'].textContent = '';
  el['review-progress'].textContent = `${cases.filter((item) => item.review).length}/${cases.length} judgments saved · reviewer ${reviewerId.slice(0, 8)}`;
  el['review-transcript'].hidden = !selectedCase.review;
  el['review-transcript'].replaceChildren(...(selectedCase.review ? renderResponses('communication') : []));
  el['review-form'].hidden = Boolean(selectedCase.review);
  el['review-ratings'].replaceChildren(...Object.entries(REVIEW_GUIDE).map(([dimension, guide]) => {
    const section = document.createElement('fieldset'); section.className = 'review-dimension';
    section.dataset.dimension = dimension;
    const legend = document.createElement('legend'); legend.textContent = guide.title;
    const scope = document.createElement('p'); scope.className = 'review-scope'; scope.textContent = guide.scope;
    const layout = document.createElement('div'); layout.className = 'review-dimension-layout';
    const responses = document.createElement('div'); responses.className = 'review-evidence'; responses.append(...renderResponses(dimension));
    const grading = document.createElement('div'); grading.className = 'review-grading';
    const rule = document.createElement('p'); rule.id = `rule-${dimension}`; rule.textContent = guide.rule;
    const criteria = document.createElement('ul');
    guide.criteria.forEach((text) => { const item = document.createElement('li'); item.textContent = text; criteria.append(item); });
    const examples = document.createElement('details'); examples.className = 'review-examples';
    const summary = document.createElement('summary'); summary.textContent = 'examples & scoring notes'; examples.append(summary);
    guide.examples.forEach(([title, text]) => { const heading = document.createElement('h3'); heading.textContent = title; const paragraph = document.createElement('p'); paragraph.textContent = text; examples.append(heading, paragraph); });
    const label = document.createElement('label'); label.htmlFor = `rating-${dimension}`; label.textContent = `your ${guide.title} rating`;
    const select = document.createElement('select'); select.id = label.htmlFor; select.name = dimension; select.required = true; select.setAttribute('aria-describedby', rule.id);
    ratingOptions(dimension).forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    grading.append(rule, criteria, label, select, examples);
    layout.append(responses, grading);
    section.append(legend, scope, layout); return section;
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
