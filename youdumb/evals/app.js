const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://youdumb-api.bensonperry.workers.dev';
const TOKEN_KEY = 'youdumb-eval-token';

const el = Object.fromEntries([...document.querySelectorAll('[id]')].map((node) => [node.id, node]));
const state = { token: localStorage.getItem(TOKEN_KEY) || '', config: null, runs: [], selectedRun: null, research: [], processing: false, starting: false };

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Eval-Token': state.token, ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function setAuthenticated(authenticated) {
  el['login-view'].hidden = authenticated;
  el.dashboard.hidden = !authenticated;
  el['forget-key'].hidden = !authenticated;
}

function choice({ id, label, description, tier }, type, checked) {
  const wrapper = document.createElement('label');
  wrapper.className = 'choice';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = type;
  input.value = id;
  input.checked = checked;
  const strong = document.createElement('strong');
  strong.textContent = label || id;
  const small = document.createElement('small');
  small.textContent = description || tier;
  wrapper.append(input, strong, small);
  return wrapper;
}

function selected(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(({ value }) => value);
}

function updatePlan() {
  const conversations = selected('model').length * selected('profile').length * Number(el.replicates.value);
  const modelCount = selected('model').length;
  const questionCount = state.config?.questionCount ?? 5;
  el['call-plan'].textContent = `${conversations} conversations · ${conversations * questionCount} respondent calls + up to ${modelCount} preflights · ${conversations} scorer calls`;
  el['start-run'].disabled = !state.config?.connected || conversations === 0 || conversations > (state.config?.limits.maxJobs ?? 48) || state.processing || state.starting;
}

function renderConfig() {
  el['model-choices'].replaceChildren(...state.config.models.map((model, index) => choice(model, 'model', index < 3)));
  const defaults = new Set(['careful-generalist', 'first-plausible-answer', 'verbal-but-unnumerate', 'polished-confabulator']);
  el['profile-choices'].replaceChildren(...state.config.profiles.map((profile) => choice({ ...profile, label: profile.id }, 'profile', defaults.has(profile.id))));
  el['connection-status'].textContent = state.config.connected ? 'openrouter connected' : 'openrouter not connected';
  el['connection-status'].className = `connection ${state.config.connected ? 'connected' : 'disconnected'}`;
  document.querySelectorAll('#run-form input, #replicates').forEach((input) => input.addEventListener('change', updatePlan));
  updatePlan();
}

function renderRuns() {
  if (!state.runs.length) {
    el['run-list'].innerHTML = '<div class="empty">no runs yet.</div>';
    return;
  }
  el['run-list'].replaceChildren(...state.runs.map((run) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `run-row${state.selectedRun?.id === run.id ? ' selected' : ''}`;
    const title = document.createElement('strong');
    title.textContent = formatDate(run.createdAt);
    const detail = document.createElement('span');
    detail.textContent = `${run.total} conversations · ${run.models?.length ?? 0} models`;
    button.append(title, detail);
    button.addEventListener('click', () => loadRun(run.id));
    return button;
  }));
}

function renderActive(run) {
  const progress = run.progress;
  const finished = progress.completed + progress.failed;
  const isDone = finished === progress.total;
  el['active-panel'].hidden = isDone && !state.processing;
  el['active-title'].textContent = isDone ? 'run finished' : 'running';
  el['active-count'].textContent = `${finished} / ${progress.total}`;
  el['active-progress'].style.width = `${progress.total ? (finished / progress.total) * 100 : 0}%`;
  el['active-detail'].textContent = progress.failed
    ? `${progress.completed} complete · ${progress.failed} failed · ${progress.running} currently working`
    : `${progress.completed} complete · ${progress.running} currently working`;
  const unfinished = run.jobs.some((job) => job.status !== 'complete');
  el['resume-run'].hidden = !unfinished || state.processing;
}

function renderResults(run) {
  el['empty-results'].hidden = true;
  el.results.hidden = false;
  el['download-run'].hidden = false;
  el['selected-run-date'].textContent = formatDate(run.createdAt);
  const complete = run.jobs.filter((job) => job.status === 'complete');
  const jobCost = complete.reduce((sum, job) => sum + Number(job.usage?.cost ?? 0), 0);
  const preflightCost = (run.preflight ?? []).reduce((sum, check) => sum + Number(check.usage?.cost ?? 0), 0);
  const cost = jobCost + preflightCost;
  const mean = complete.length ? complete.reduce((sum, job) => sum + job.result.index, 0) / complete.length : 0;
  el['run-summary'].innerHTML = `<span>${complete.length}/${run.jobs.length} complete</span><span>overall mean ${mean.toFixed(1)}</span><span>reported model cost $${cost.toFixed(4)}</span><span>assessment ${run.assessmentVersion}</span>`;
  if (run.unavailableModels?.length) {
    const skipped = document.createElement('span');
    skipped.className = 'warning';
    skipped.textContent = `Skipped unavailable models after preflight: ${run.unavailableModels.map(({ model }) => model).join(', ')}.`;
    el['run-summary'].append(skipped);
  }
  for (const warning of run.diagnostics?.warnings ?? []) {
    const item = document.createElement('span');
    item.className = 'warning';
    item.textContent = warning;
    el['run-summary'].append(item);
  }
  el['summary-body'].replaceChildren(...(run.summary ?? []).map((group) => {
    const row = document.createElement('tr');
    [group.model, group.profile, group.mean, `${group.min}–${group.max}`, group.standardDeviation].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
  el['job-results'].replaceChildren(...run.jobs.map((job) => {
    const details = document.createElement('details');
    details.className = `job${job.status === 'failed' ? ' failed' : ''}`;
    const summary = document.createElement('summary');
    const model = document.createElement('span');
    model.textContent = job.model;
    const profile = document.createElement('span');
    profile.textContent = `${job.profile} · #${job.replicate}`;
    const score = document.createElement('span');
    score.textContent = job.status === 'complete' ? job.result.index : job.status;
    summary.append(model, profile, score);
    const body = document.createElement('div');
    body.className = 'job-body';
    if (job.status === 'complete') {
      const meta = document.createElement('p');
      meta.className = 'job-meta';
      meta.textContent = `${Math.round(job.latencyMs.respondent / 1000)}s respondent · ${Math.round(job.latencyMs.scorer / 1000)}s scorer · ${job.usage.promptTokens + job.usage.completionTokens} tokens`;
      body.append(meta);
      job.answers.forEach((answer, index) => {
        const row = document.createElement('div');
        row.className = 'answer';
        const label = document.createElement('span');
        label.textContent = `answer ${index + 1}`;
        const text = document.createElement('p');
        text.textContent = answer;
        row.append(label, text);
        body.append(row);
      });
      const dimensions = document.createElement('div');
      dimensions.className = 'dimensions';
      Object.entries(job.result.dimensions).forEach(([name, value]) => {
        const item = document.createElement('span');
        item.textContent = `${name} ${value}`;
        dimensions.append(item);
      });
      body.append(dimensions);
    } else {
      body.textContent = job.error || 'not completed yet';
    }
    details.append(summary, body);
    return details;
  }));
  renderActive(run);
  renderRuns();
}

function downloadSelectedRun() {
  if (!state.selectedRun) return;
  const blob = new Blob([`${JSON.stringify(state.selectedRun, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `youdumb-eval-${state.selectedRun.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderResearch() {
  const submissions = state.research;
  el['research-empty'].hidden = submissions.length > 0;
  el['download-research'].hidden = submissions.length === 0;
  el['research-summary'].replaceChildren();
  if (submissions.length) {
    const count = document.createElement('span');
    count.textContent = `${submissions.length} active donation${submissions.length === 1 ? '' : 's'}`;
    el['research-summary'].append(count);
  }
  el['research-results'].replaceChildren(...submissions.map((submission) => {
    const details = document.createElement('details');
    details.className = 'job research-submission';
    const summary = document.createElement('summary');
    const date = document.createElement('span');
    date.textContent = formatDate(submission.donatedAt);
    const version = document.createElement('span');
    version.textContent = `assessment ${submission.assessmentVersion}`;
    const score = document.createElement('span');
    score.textContent = submission.result?.index ?? '—';
    summary.append(date, version, score);

    const body = document.createElement('div');
    body.className = 'job-body';
    const meta = document.createElement('p');
    meta.className = 'job-meta';
    meta.textContent = `${submission.elapsedBucket} · expires ${formatDate(submission.expiresAt)}`;
    body.append(meta);
    if (submission.feedback) {
      const feedback = document.createElement('div');
      feedback.className = 'answer research-feedback';
      const label = document.createElement('span');
      label.textContent = 'felt wrong';
      const text = document.createElement('p');
      text.textContent = submission.feedback;
      feedback.append(label, text);
      body.append(feedback);
    }
    submission.transcript.filter(({ role }) => role === 'user').forEach((message, index) => {
      const row = document.createElement('div');
      row.className = 'answer';
      const label = document.createElement('span');
      label.textContent = `answer ${index + 1}`;
      const text = document.createElement('p');
      text.textContent = message.content;
      row.append(label, text);
      body.append(row);
    });
    const dimensions = document.createElement('div');
    dimensions.className = 'dimensions';
    Object.entries(submission.result?.dimensions ?? {}).forEach(([name, value]) => {
      const item = document.createElement('span');
      item.textContent = `${name} ${value}`;
      dimensions.append(item);
    });
    if (submission.result?.engagement) {
      const effort = document.createElement('span');
      effort.textContent = `response depth ${submission.result.engagement.score} (not scored)`;
      dimensions.append(effort);
    }
    body.append(dimensions);
    details.append(summary, body);
    return details;
  }));
}

function downloadResearch() {
  const blob = new Blob([`${JSON.stringify({ exportedAt: new Date().toISOString(), submissions: state.research }, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `youdumb-human-donations-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadRuns() {
  const data = await api('/eval/runs');
  state.runs = data.runs;
  renderRuns();
}

async function loadResearch() {
  const data = await api('/eval/research/submissions');
  state.research = data.submissions ?? [];
  renderResearch();
}

async function loadRun(id) {
  const data = await api(`/eval/runs/${id}`);
  state.selectedRun = data.run;
  renderResults(data.run);
  return data.run;
}

async function processRun(run) {
  if (state.processing) return;
  state.processing = true;
  el['start-run'].disabled = true;
  el['resume-run'].hidden = true;
  const jobs = run.jobs.filter((job) => job.status !== 'complete');
  const workerCount = Math.min(2, jobs.length);
  const initiallyRunning = new Set(jobs.slice(0, workerCount).map((job) => job.id));
  state.selectedRun = {
    ...run,
    progress: { ...run.progress, running: workerCount },
    jobs: run.jobs.map((job) => initiallyRunning.has(job.id) ? { ...job, status: 'running' } : job),
  };
  renderResults(state.selectedRun);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        await api(`/eval/runs/${run.id}/jobs/${job.id}/run`, { method: 'POST' });
      } catch (error) {
        console.error(error);
      }
      await loadRun(run.id);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  state.processing = false;
  await Promise.all([loadRun(run.id), loadRuns()]);
  updatePlan();
}

async function authenticate(token) {
  state.token = token.trim();
  const [config] = await Promise.all([api('/eval/config'), api('/eval/runs')]);
  state.config = config;
  localStorage.setItem(TOKEN_KEY, state.token);
  setAuthenticated(true);
  renderConfig();
  await Promise.all([loadRuns(), loadResearch()]);
}

el['login-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  el['login-error'].textContent = '';
  try { await authenticate(el['token-input'].value); }
  catch (error) { el['login-error'].textContent = error.message; }
});

el['run-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  el['run-error'].textContent = '';
  state.starting = true;
  el['start-run'].textContent = 'checking models…';
  updatePlan();
  try {
    const data = await api('/eval/runs', {
      method: 'POST',
      body: JSON.stringify({ models: selected('model'), profiles: selected('profile'), replicates: Number(el.replicates.value) }),
    });
    state.selectedRun = data.run;
    await loadRuns();
    renderResults(data.run);
    processRun(data.run);
  } catch (error) {
    el['run-error'].textContent = error.message;
  } finally {
    state.starting = false;
    el['start-run'].textContent = 'start run';
    updatePlan();
  }
});

el['resume-run'].addEventListener('click', () => state.selectedRun && processRun(state.selectedRun));
el['refresh-runs'].addEventListener('click', loadRuns);
el['download-run'].addEventListener('click', downloadSelectedRun);
el['refresh-research'].addEventListener('click', loadResearch);
el['download-research'].addEventListener('click', downloadResearch);
el['forget-key'].addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  state.token = '';
  setAuthenticated(false);
  el['token-input'].value = '';
});

if (state.token) {
  authenticate(state.token).catch(() => {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
    setAuthenticated(false);
  });
} else {
  setAuthenticated(false);
}
