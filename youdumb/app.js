const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://youdumb-api.bensonperry.workers.dev';

const screens = {
  intro: document.querySelector('#intro-screen'),
  test: document.querySelector('#test-screen'),
  result: document.querySelector('#result-screen'),
  error: document.querySelector('#error-screen'),
};

const elements = {
  start: document.querySelector('#start-button'),
  form: document.querySelector('#answer-form'),
  input: document.querySelector('#answer-input'),
  send: document.querySelector('#send-button'),
  conversation: document.querySelector('#conversation'),
  round: document.querySelector('#round-label'),
  progress: document.querySelector('#progress-fill'),
  timer: document.querySelector('#timer'),
  score: document.querySelector('#score-number'),
  resultTitle: document.querySelector('#result-title'),
  resultRead: document.querySelector('#result-read'),
  dimensions: document.querySelector('#dimensions'),
  responseDepth: document.querySelector('#response-depth'),
  scoreAnalysis: document.querySelector('#score-analysis'),
  dimensionAnalysis: document.querySelector('#dimension-analysis'),
  strongest: document.querySelector('#strongest-moment'),
  watchout: document.querySelector('#watchout'),
  donationPanel: document.querySelector('#donation-panel'),
  donationFeedback: document.querySelector('#donation-feedback'),
  donationConsent: document.querySelector('#donation-consent'),
  donate: document.querySelector('#donate-button'),
  donationStatus: document.querySelector('#donation-status'),
  deletionReceipt: document.querySelector('#deletion-receipt'),
  deletionCode: document.querySelector('#deletion-code'),
  copyDeletionCode: document.querySelector('#copy-deletion-code'),
  share: document.querySelector('#share-button'),
  retake: document.querySelector('#retake-button'),
  retry: document.querySelector('#retry-button'),
  errorMessage: document.querySelector('#error-message'),
  about: document.querySelector('#about-button'),
  aboutDialog: document.querySelector('#about-dialog'),
  closeAbout: document.querySelector('#close-about'),
};

const state = {
  transcript: [],
  round: 0,
  maxRounds: 5,
  startedAt: 0,
  timerId: 0,
  busy: false,
  result: null,
  donationToken: null,
  deletionReceipt: null,
  elapsedSeconds: 0,
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => screen.classList.toggle('is-active', key === name));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function formatElapsed(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function startTimer() {
  clearInterval(state.timerId);
  state.startedAt = Date.now();
  elements.timer.textContent = '00:00';
  state.timerId = setInterval(() => {
    elements.timer.textContent = formatElapsed(Date.now() - state.startedAt);
  }, 1000);
}

function updateProgress() {
  elements.round.textContent = `${String(state.round + 1).padStart(2, '0')} / ${String(state.maxRounds).padStart(2, '0')}`;
  elements.progress.style.width = `${((state.round + 1) / state.maxRounds) * 100}%`;
}

function addMessage(role, content) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const speaker = document.createElement('span');
  speaker.className = 'speaker';
  speaker.textContent = role === 'assistant' ? 'youdumb' : 'you';
  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  article.append(speaker, paragraph);
  elements.conversation.append(article);
  article.scrollIntoView({ behavior: 'auto', block: 'center' });
}

function addThinking(isFinal = false) {
  const article = document.createElement('article');
  article.className = `message assistant thinking-message${isFinal ? ' scoring-message' : ''}`;
  const speaker = document.createElement('span');
  speaker.className = 'speaker';
  speaker.textContent = isFinal ? 'scoring your answers' : 'thinking allegedly';
  article.setAttribute('role', 'status');
  article.setAttribute('aria-live', 'polite');

  let statusTimer = 0;
  if (isFinal) {
    const note = document.createElement('p');
    note.className = 'scoring-note';
    note.textContent = 'checking each answer against the same rubric';
    const track = document.createElement('span');
    track.className = 'scoring-track';
    track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'scoring-fill';
    track.append(fill);
    article.append(speaker, note, track);

    const updates = [
      [8000, 'comparing the five parts'],
      [18000, 'still working — the grader can take up to a minute'],
      [32000, 'still working — your answers were submitted'],
    ];
    let updateIndex = 0;
    const scheduleUpdate = () => {
      if (updateIndex >= updates.length) return;
      const [delay, text] = updates[updateIndex];
      const previousDelay = updateIndex === 0 ? 0 : updates[updateIndex - 1][0];
      statusTimer = window.setTimeout(() => {
        note.textContent = text;
        updateIndex += 1;
        scheduleUpdate();
      }, delay - previousDelay);
    };
    scheduleUpdate();
  } else {
    article.append(speaker);
  }

  elements.conversation.append(article);
  article.scrollIntoView({ behavior: 'auto', block: 'center' });
  return {
    remove() {
      window.clearTimeout(statusTimer);
      article.remove();
    },
  };
}

function setBusy(busy, label = 'hmm') {
  state.busy = busy;
  elements.input.disabled = busy;
  elements.send.disabled = busy;
  elements.send.querySelector('span:first-child').textContent = busy ? label : 'send';
}

async function request(payload) {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function begin() {
  if (state.busy) return;
  state.busy = true;
  elements.start.disabled = true;
  const startLabel = elements.start.querySelector('.button-label');
  startLabel.textContent = 'ha.';
  await new Promise((resolve) => setTimeout(resolve, 280));

  try {
    const data = await request({ action: 'start' });
    state.transcript = [];
    state.round = data.round;
    state.maxRounds = data.maxRounds;
    state.result = null;
    state.donationToken = null;
    state.deletionReceipt = null;
    state.elapsedSeconds = 0;
    elements.conversation.replaceChildren();
    elements.input.value = '';
    showScreen('test');
    updateProgress();
    addMessage('assistant', data.question);
    state.transcript.push({ role: 'assistant', content: data.question });
    startTimer();
    setBusy(false);
    elements.input.focus();
  } catch (error) {
    showError(error);
  } finally {
    startLabel.textContent = 'yes';
    elements.start.disabled = false;
    state.busy = false;
  }
}

async function submitAnswer(event) {
  event.preventDefault();
  if (state.busy) return;
  const answer = elements.input.value.trim();
  if (!answer) return;

  addMessage('user', answer);
  state.transcript.push({ role: 'user', content: answer });
  elements.input.value = '';
  const isFinal = state.round >= state.maxRounds - 1;
  setBusy(true, isFinal ? 'scoring' : 'hmm');
  const thinking = addThinking(isFinal);

  try {
    const data = await request({
      action: 'answer',
      round: state.round,
      transcript: state.transcript,
    });
    thinking.remove();

    if (data.complete) {
      clearInterval(state.timerId);
      state.elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
      state.result = data.result;
      state.donationToken = data.donationToken || null;
      renderResult(data.result);
      showScreen('result');
      return;
    }

    state.round = data.round;
    updateProgress();
    addMessage('assistant', data.question);
    state.transcript.push({ role: 'assistant', content: data.question });
    setBusy(false);
    elements.input.focus();
  } catch (error) {
    thinking.remove();
    showError(error);
  }
}

function animateScore(target) {
  elements.score.textContent = target;
}

function renderResult(result) {
  animateScore(result.index);
  elements.resultTitle.textContent = result.verdict;
  elements.resultRead.textContent = result.read;
  elements.strongest.textContent = result.strongestMoment;
  elements.watchout.textContent = result.watchout;
  elements.dimensions.replaceChildren();

  Object.entries(result.dimensions).forEach(([name, value], index) => {
    const row = document.createElement('div');
    row.className = 'dimension';
    const label = document.createElement('span');
    label.textContent = name;
    const track = document.createElement('div');
    track.className = 'dimension-track';
    const fill = document.createElement('div');
    fill.className = 'dimension-fill';
    track.append(fill);
    const number = document.createElement('span');
    number.className = 'dimension-value';
    number.textContent = value;
    row.append(label, track, number);
    elements.dimensions.append(row);
    setTimeout(() => { fill.style.width = `${value}%`; }, 100 + index * 60);
  });

  const engagement = result.engagement;
  elements.responseDepth.hidden = !engagement;
  if (engagement) {
    elements.responseDepth.textContent = `response depth ${engagement.score} · ${engagement.developedAnswers} of 5 answers showed their reasoning · not part of the score`;
  }

  renderDimensionAnalysis(result.dimensionAnalysis);
  resetDonationPanel();
}

function resetDonationPanel() {
  elements.donationPanel.hidden = !state.donationToken;
  elements.donationFeedback.value = '';
  elements.donationConsent.checked = false;
  elements.donate.disabled = true;
  elements.donate.textContent = 'donate my answers';
  elements.donationStatus.textContent = '';
  elements.deletionReceipt.hidden = true;
  elements.deletionCode.textContent = '';
}

async function donateAnswers() {
  if (!state.donationToken || !elements.donationConsent.checked || state.deletionReceipt) return;
  elements.donate.disabled = true;
  elements.donate.textContent = 'encrypting…';
  elements.donationStatus.textContent = 'removing common contact details and encrypting the transcript';
  try {
    const response = await fetch(`${API_BASE}/research/donate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donationToken: state.donationToken,
        transcript: state.transcript,
        elapsedSeconds: state.elapsedSeconds,
        feedback: elements.donationFeedback.value.trim(),
        consentAdult: true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The answers could not be donated.');
    state.deletionReceipt = data.deletionReceipt;
    elements.donationStatus.textContent = `donated. it will expire by ${new Date(data.expiresAt).toLocaleDateString()}.`;
    elements.deletionCode.textContent = data.deletionReceipt;
    elements.deletionReceipt.hidden = false;
    elements.donate.textContent = 'answers donated';
  } catch (error) {
    elements.donationStatus.textContent = error.message;
    elements.donate.textContent = 'try donation again';
    elements.donate.disabled = false;
  }
}

async function copyDeletionReceipt() {
  if (!state.deletionReceipt) return;
  try {
    await navigator.clipboard.writeText(state.deletionReceipt);
    elements.copyDeletionCode.textContent = 'copied';
    setTimeout(() => { elements.copyDeletionCode.textContent = 'copy receipt'; }, 1600);
  } catch {
    window.prompt('Save this deletion receipt:', state.deletionReceipt);
  }
}

function renderDimensionAnalysis(analysis) {
  const entries = Object.entries(analysis ?? {});
  elements.dimensionAnalysis.replaceChildren();
  elements.scoreAnalysis.hidden = entries.length === 0;
  if (!entries.length) return;

  const scores = entries.map(([, detail]) => Number(detail.score));
  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);
  const initiallyOpen = new Set();
  initiallyOpen.add(entries.find(([, detail]) => Number(detail.score) === highest)?.[0]);
  if (lowest !== highest) initiallyOpen.add(entries.find(([, detail]) => Number(detail.score) === lowest)?.[0]);

  entries.forEach(([name, detail]) => {
    const disclosure = document.createElement('details');
    disclosure.className = 'score-detail';
    disclosure.open = initiallyOpen.has(name);

    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.textContent = name;
    const score = document.createElement('span');
    score.className = 'score-detail-value';
    score.textContent = `${Number(detail.score) * 25} · ${detail.score}/4`;
    summary.append(label, score);

    const body = document.createElement('div');
    body.className = 'score-detail-body';
    const why = document.createElement('p');
    why.className = 'score-detail-why';
    why.textContent = detail.why;

    const examples = document.createElement('div');
    examples.className = 'score-examples';
    const full = document.createElement('article');
    const fullLabel = document.createElement('span');
    fullLabel.className = 'meta-label';
    fullLabel.textContent = 'one 4/4 response';
    const fullText = document.createElement('p');
    fullText.textContent = detail.fullExample;
    full.append(fullLabel, fullText);

    const lower = document.createElement('article');
    const lowerLabel = document.createElement('span');
    lowerLabel.className = 'meta-label';
    lowerLabel.textContent = 'one lower-scoring response';
    const lowerText = document.createElement('p');
    lowerText.textContent = detail.lowerExample;
    lower.append(lowerLabel, lowerText);

    examples.append(full, lower);
    body.append(why, examples);
    disclosure.append(summary, body);
    elements.dimensionAnalysis.append(disclosure);
  });
}

function showError(error) {
  clearInterval(state.timerId);
  state.busy = false;
  elements.errorMessage.textContent = error?.message || 'Something broke before we could judge you. Convenient.';
  showScreen('error');
}

async function shareResult() {
  if (!state.result) return;
  const text = `I got ${state.result.index}/100ish on youdumb: “${state.result.verdict}”\n\nTake the very unofficial test: https://bensonperry.com/youdumb/`;
  try {
    await navigator.clipboard.writeText(text);
    elements.share.querySelector('.button-label').textContent = 'copied. devastating.';
    setTimeout(() => { elements.share.querySelector('.button-label').textContent = 'copy my result'; }, 1800);
  } catch {
    window.prompt('Copy your result:', text);
  }
}

elements.start.addEventListener('click', begin);
elements.form.addEventListener('submit', submitAnswer);
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});
elements.share.addEventListener('click', shareResult);
elements.donationConsent.addEventListener('change', () => {
  elements.donate.disabled = !elements.donationConsent.checked || Boolean(state.deletionReceipt);
});
elements.donate.addEventListener('click', donateAnswers);
elements.copyDeletionCode.addEventListener('click', copyDeletionReceipt);
elements.retake.addEventListener('click', () => { showScreen('intro'); window.scrollTo(0, 0); });
elements.retry.addEventListener('click', begin);
elements.about.addEventListener('click', () => elements.aboutDialog.showModal());
elements.closeAbout.addEventListener('click', () => elements.aboutDialog.close());
elements.aboutDialog.addEventListener('click', (event) => {
  if (event.target === elements.aboutDialog) elements.aboutDialog.close();
});
