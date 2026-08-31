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
  strongest: document.querySelector('#strongest-moment'),
  watchout: document.querySelector('#watchout'),
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
  maxRounds: 4,
  startedAt: 0,
  timerId: 0,
  busy: false,
  result: null,
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
      [8000, 'comparing the four parts'],
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
      state.result = data.result;
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
elements.retake.addEventListener('click', () => { showScreen('intro'); window.scrollTo(0, 0); });
elements.retry.addEventListener('click', begin);
elements.about.addEventListener('click', () => elements.aboutDialog.showModal());
elements.closeAbout.addEventListener('click', () => elements.aboutDialog.close());
elements.aboutDialog.addEventListener('click', (event) => {
  if (event.target === elements.aboutDialog) elements.aboutDialog.close();
});
