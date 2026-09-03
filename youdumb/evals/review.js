import { REVIEW_GUIDE, reviewResponsesFor } from './review-guide.mjs?v=15';
import { CRITERION_KEYS, REVIEW_CRITERIA_VERSION, normalizeCriteria } from './review-criteria.mjs?v=15';
import { REVIEW_COPY, cleanDraft, firstUnfinishedDimension } from './review-flow.mjs?v=15';

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
let step = 0;
let showAll = false;
const dimensions = Object.keys(CRITERION_KEYS);
const drafts = new Map();
const draftKey = () => `youdumb-review-draft:${REVIEW_CRITERIA_VERSION}:${runId}:${reviewerId}:${selectedCase.id}`;

function collectDraft() {
  const sections = [...el['review-ratings'].querySelectorAll('.review-dimension')];
  return cleanDraft({
    decisions: Object.fromEntries(sections.map(section => [section.dataset.dimension, Object.fromEntries([...section.querySelectorAll('input[type="radio"]:checked')].map(input => [input.dataset.criterion, input.value === 'yes']))])),
    uncertain: Object.fromEntries(sections.map(section => [section.dataset.dimension, section.querySelector('.criterion-skip').checked])),
    rationale: el['review-rationale'].value, seen: el['review-seen'].checked, step,
  });
}

function persistDraft() {
  if (!selectedCase || selectedCase.review || saving) return;
  const draft = collectDraft(); drafts.set(selectedCase.id, draft);
  try { localStorage.setItem(draftKey(), JSON.stringify(draft)); el['draft-status'].textContent = 'Draft saved in this browser. Nothing is submitted until you save the review.'; }
  catch { el['draft-status'].textContent = 'Draft kept only while this page stays open; browser storage is unavailable.'; }
}

function updateNavigation() {
  const draft = collectDraft();
  let resolved = 0;
  [...el['review-steps'].children].forEach((button, index) => {
    const dimension = dimensions[index]; const keys = CRITERION_KEYS[dimension];
    const count = draft.uncertain[dimension] ? keys.length : Object.keys(draft.decisions[dimension]).length;
    resolved += count;
    button.textContent = `${index + 1}. ${REVIEW_GUIDE[dimension].title}${count === keys.length ? ' ✓' : ''}`;
    button.setAttribute('aria-current', index === step && !showAll ? 'step' : 'false');
  });
  el['step-status'].textContent = `${showAll ? 'All sections' : `Section ${step + 1} of ${dimensions.length}`} · ${resolved} / 23 checks resolved`;
  el['previous-section'].disabled = step === 0;
  el['next-section'].disabled = step === dimensions.length - 1;
  el['show-all-sections'].textContent = showAll ? 'focus one section' : 'show all sections';
}

function setStep(index, focus = false) {
  step = index;
  [...el['review-ratings'].children].forEach((section, i) => { section.hidden = !showAll && i !== step; });
  updateNavigation();
  if (focus) el['review-ratings'].children[step].querySelector('legend').focus();
}

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
  let draft = drafts.get(selectedCase.id);
  if (!draft && !selectedCase.review) {
    try { draft = JSON.parse(localStorage.getItem(draftKey()) ?? 'null'); } catch { /* Ignore invalid or unavailable local drafts. */ }
  }
  draft = cleanDraft(draft);
  step = draft.step;
  el['review-steps'].replaceChildren(...dimensions.map((dimension, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', () => { showAll = false; setStep(index, true); persistDraft(); });
    return button;
  }));
  el['review-ratings'].replaceChildren(...Object.entries(REVIEW_GUIDE).map(([dimension, guide]) => {
    const section = document.createElement('fieldset'); section.className = 'review-dimension';
    section.dataset.dimension = dimension;
    const legend = document.createElement('legend'); legend.textContent = guide.title; legend.tabIndex = -1;
    const scope = document.createElement('p'); scope.className = 'review-scope'; scope.textContent = guide.scope;
    const layout = document.createElement('div'); layout.className = 'review-dimension-layout';
    const responses = document.createElement('div'); responses.className = 'review-evidence'; responses.append(...renderResponses(dimension));
    const grading = document.createElement('div'); grading.className = 'review-grading';
    const rule = document.createElement('p'); rule.id = `rule-${dimension}`; rule.className = 'section-note'; rule.textContent = guide.rule;
    const criteria = document.createElement('div'); criteria.className = 'criterion-list';
    guide.criteria.forEach((text, index) => {
      const key = CRITERION_KEYS[dimension][index];
      const row = document.createElement('div'); row.className = 'criterion-row'; row.setAttribute('role', 'radiogroup');
      const copy = document.createElement('div');
      const description = document.createElement('p'); description.id = `criterion-${dimension}-${key}`; description.textContent = REVIEW_COPY[dimension][index][0];
      const help = document.createElement('details'); help.className = 'criterion-help';
      const helpLabel = document.createElement('summary'); helpLabel.textContent = 'what counts?';
      const explanation = document.createElement('p'); explanation.textContent = REVIEW_COPY[dimension][index][1];
      help.append(helpLabel, explanation); copy.append(description, help);
      row.setAttribute('aria-labelledby', description.id);
      const choices = document.createElement('div'); choices.className = 'criterion-choices';
      for (const value of ['yes', 'no']) {
        const label = document.createElement('label');
        const input = document.createElement('input'); input.type = 'radio'; input.name = `${dimension}-${key}`; input.value = value; input.required = true;
        input.dataset.criterion = key;
        input.checked = typeof draft.decisions[dimension][key] === 'boolean' && draft.decisions[dimension][key] === (value === 'yes');
        label.append(input, document.createTextNode(value)); choices.append(label);
      }
      row.append(copy, choices); criteria.append(row);
    });
    const uncertain = document.createElement('label'); uncertain.className = 'criterion-uncertain';
    const skip = document.createElement('input'); skip.type = 'checkbox'; skip.className = 'criterion-skip';
    skip.checked = draft.uncertain[dimension];
    uncertain.append(skip, document.createTextNode(`I can’t reliably judge ${guide.title} from this text.`));
    const progress = document.createElement('p'); progress.className = 'criterion-progress section-note'; progress.setAttribute('aria-live', 'polite');
    const examples = document.createElement('details'); examples.className = 'review-examples';
    const summary = document.createElement('summary'); summary.textContent = 'examples & scoring notes'; examples.append(summary);
    guide.examples.forEach(([title, text]) => { const heading = document.createElement('h3'); heading.textContent = title; const paragraph = document.createElement('p'); paragraph.textContent = text; examples.append(heading, paragraph); });
    grading.append(rule, criteria, progress, uncertain, examples);
    layout.append(responses, grading);
    if (dimension === 'updating') {
      // Align each set of four checks with its own answer, instead of requiring
      // the reviewer to mentally match two responses to a single eight-row list.
      const secondLayout = document.createElement('div'); secondLayout.className = 'review-dimension-layout';
      const secondResponse = document.createElement('div'); secondResponse.className = 'review-evidence'; secondResponse.append(responses.children[1]);
      const secondGrading = document.createElement('div'); secondGrading.className = 'review-grading';
      const secondCriteria = document.createElement('div'); secondCriteria.className = 'criterion-list';
      [...criteria.children].slice(4).forEach(row => secondCriteria.append(row));
      secondGrading.append(secondCriteria, progress, uncertain, examples);
      secondLayout.append(secondResponse, secondGrading);
      section.append(legend, scope, layout, secondLayout);
    } else section.append(legend, scope, layout);
    // Include both updating groups when toggling uncertainty or counting checks.
    const refreshChoices = () => {
      section.querySelectorAll('input[type="radio"]').forEach(input => { input.disabled = skip.checked; });
      section.querySelectorAll('.criterion-list').forEach(list => list.classList.toggle('is-uncertain', skip.checked));
      progress.textContent = skip.checked ? 'Marked uncertain; no score will be assigned to this dimension.' : `${section.querySelectorAll('input[type="radio"]:checked').length} / ${guide.criteria.length} criteria answered`;
    };
    section.addEventListener('change', refreshChoices);
    refreshChoices();
    return section;
  }));
  el['review-rationale'].value = draft.rationale;
  const alreadyRevealed = localStorage.getItem(`youdumb-seen-scores:${runId}`) === 'yes';
  el['review-seen'].checked = alreadyRevealed || draft.seen;
  el['review-seen'].disabled = alreadyRevealed;
  renderComparison();
  setStep(step);
  el['draft-status'].textContent = 'Drafts stay in this browser until you save the review. Notes are optional.';
}

function renderComparison() {
  const panel = el['review-comparison']; panel.replaceChildren(); panel.hidden = !selectedCase.review;
  if (!selectedCase.review) return;
  const heading = document.createElement('h2'); heading.textContent = 'saved judgment vs. model mean'; panel.append(heading);
  if (selectedCase.review.rationale) { const note = document.createElement('p'); note.textContent = selectedCase.review.rationale; panel.append(note); }
  const guidance = document.createElement('p'); guidance.className = 'section-note'; guidance.textContent = 'Differences are things to inspect, not corrections to your answers. The model is not the answer key.'; panel.append(guidance);
  const status = document.createElement('p'); status.className = 'section-note'; status.textContent = selectedCase.review.hadSeenModelScores ? 'Prior score exposure declared; this review is not blinded.' : 'No prior score exposure declared.'; panel.append(status);
  if (selectedCase.review.criteriaJudgments) {
    const savedChoices = document.createElement('details'); savedChoices.className = 'review-examples';
    const summary = document.createElement('summary'); summary.textContent = 'your saved yes/no judgments'; savedChoices.append(summary);
    for (const [dimension, keys] of Object.entries(CRITERION_KEYS)) {
      const values = selectedCase.review.criteriaJudgments[dimension];
      const heading = document.createElement('h3'); heading.textContent = REVIEW_GUIDE[dimension].title; savedChoices.append(heading);
      if (values === null) { const note = document.createElement('p'); note.textContent = 'uncertain'; savedChoices.append(note); continue; }
      keys.forEach((key, index) => { const item = document.createElement('p'); item.textContent = `${values[key] ? 'yes' : 'no'} — ${REVIEW_GUIDE[dimension].criteria[index]}`; savedChoices.append(item); });
    }
    panel.append(savedChoices);
  }
  for (const [dimension, value] of Object.entries(selectedCase.comparison)) {
    const line = document.createElement('p');
    line.textContent = `${dimension}: you ${value.human ?? 'uncertain'} · model ${value.modelMean ?? 'pending'} · absolute gap ${value.absoluteGap ?? '—'}`;
    panel.append(line);
  }
  const next = cases.find(item => !item.review);
  if (next) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'review next case';
    button.addEventListener('click', () => { el['review-case'].value = next.id; renderCase(); el['review-steps'].scrollIntoView({ block: 'start' }); }); panel.append(button);
  }
}

el['review-case'].addEventListener('change', () => { persistDraft(); renderCase(); });
el['review-form'].addEventListener('change', () => { persistDraft(); updateNavigation(); });
el['review-rationale'].addEventListener('input', persistDraft);
el['previous-section'].addEventListener('click', () => { showAll = false; setStep(Math.max(0, step - 1), true); persistDraft(); });
el['next-section'].addEventListener('click', () => { showAll = false; setStep(Math.min(dimensions.length - 1, step + 1), true); persistDraft(); });
el['show-all-sections'].addEventListener('click', () => { showAll = !showAll; setStep(step); });
el['review-form'].addEventListener('submit', async (event) => {
  event.preventDefault(); if (saving || selectedCase.review) return;
  const unfinished = firstUnfinishedDimension(collectDraft());
  if (unfinished !== -1) {
    showAll = false; setStep(unfinished, true);
    el['review-error'].textContent = `Finish the yes/no checks in ${REVIEW_GUIDE[dimensions[unfinished]].title}, or mark that section uncertain. Notes are optional.`;
    return;
  }
  saving = true; el['save-review'].disabled = true; el['review-case'].disabled = true;
  try {
    const criteriaJudgments = normalizeCriteria(Object.fromEntries([...el['review-ratings'].querySelectorAll('.review-dimension')].map(section => [section.dataset.dimension, section.querySelector('.criterion-skip').checked ? null : Object.fromEntries([...section.querySelectorAll('input[type="radio"]:checked')].map(input => [input.dataset.criterion, input.value === 'yes']))])));
    const saved = await api('POST', { reviewerId, caseId: selectedCase.id, criteriaVersion: REVIEW_CRITERIA_VERSION, criteriaJudgments, rationale: el['review-rationale'].value, hadSeenModelScores: el['review-seen'].checked || localStorage.getItem(`youdumb-seen-scores:${runId}`) === 'yes' });
    drafts.delete(selectedCase.id);
    try { localStorage.removeItem(draftKey()); } catch { /* The saved server review takes precedence over any stale local draft. */ }
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
