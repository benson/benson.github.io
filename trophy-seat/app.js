import {
  SIMULATED_PICK_COUNT,
  chooseDraft,
  comparisonStats,
  deckCount,
  deckGroupCount,
  formatDraftDate,
  groupDeckCards,
  resultCopy,
  scorePicks,
  sortPackCards,
  validateDataset,
} from './model.js?v=3';

const DATA_URL = './data/drafts.json?v=2';
const SEEN_KEY = 'trophy-seat-seen-v1';
const THEME_KEY = 'trophy-seat-theme';
const PUBLIC_APP_URL = 'https://bensonperry.com/trophy-seat/';
const CARD_ZOOM_SELECTOR = '.card-button, .intro-card, .tray-slot.filled, .comparison-card, .deck-card, .watch-card';
const COLOR_NAMES = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

const elements = {
  loadingView: document.querySelector('#loading-view'),
  introView: document.querySelector('#intro-view'),
  draftView: document.querySelector('#draft-view'),
  resultsView: document.querySelector('#results-view'),
  errorView: document.querySelector('#error-view'),
  errorMessage: document.querySelector('#error-message'),
  startButton: document.querySelector('#start-button'),
  anotherButton: document.querySelector('#another-button'),
  shareButton: document.querySelector('#share-button'),
  shareDialog: document.querySelector('#share-dialog'),
  shareMeta: document.querySelector('#share-meta'),
  shareResultGrid: document.querySelector('#share-result-grid'),
  shareTextPreview: document.querySelector('#share-text-preview'),
  copyResultButton: document.querySelector('#copy-result-button'),
  aboutButton: document.querySelector('#about-button'),
  aboutDialog: document.querySelector('#about-dialog'),
  themeToggle: document.querySelector('#theme-toggle'),
  introCards: document.querySelector('#intro-cards'),
  introProof: document.querySelector('#intro-proof'),
  pickLabel: document.querySelector('#pick-label'),
  pickProgress: document.querySelector('#pick-progress'),
  packCount: document.querySelector('#pack-count'),
  cardGrid: document.querySelector('#card-grid'),
  pickTray: document.querySelector('#pick-tray'),
  yourPickCount: document.querySelector('#your-pick-count'),
  scoreNumber: document.querySelector('#score-number'),
  resultEyebrow: document.querySelector('#result-eyebrow'),
  resultTitle: document.querySelector('#result-title'),
  resultBody: document.querySelector('#result-body'),
  trophyProof: document.querySelector('#trophy-proof'),
  postgameMeta: document.querySelector('#postgame-meta'),
  resultGrid: document.querySelector('#result-grid'),
  resultStats: document.querySelector('#result-stats'),
  comparisonList: document.querySelector('#comparison-list'),
  deckTab: document.querySelector('#deck-tab'),
  watchTab: document.querySelector('#watch-tab'),
  deckView: document.querySelector('#deck-view'),
  watchView: document.querySelector('#watch-view'),
  deckSummary: document.querySelector('#deck-summary'),
  deckColumns: document.querySelector('#deck-columns'),
  watchLabel: document.querySelector('#watch-label'),
  watchChoice: document.querySelector('#watch-choice'),
  watchPrevious: document.querySelector('#watch-previous'),
  watchNext: document.querySelector('#watch-next'),
  watchPack: document.querySelector('#watch-pack'),
  revealLogButton: document.querySelector('#reveal-log-button'),
  pickLog: document.querySelector('#pick-log'),
  cardZoom: document.querySelector('#card-zoom'),
  cardZoomImage: document.querySelector('#card-zoom-image'),
  cardZoomLabel: document.querySelector('#card-zoom-label'),
  toast: document.querySelector('#toast'),
};

const state = {
  data: null,
  draft: null,
  currentPick: 0,
  userPicks: [],
  locked: false,
  watchIndex: SIMULATED_PICK_COUNT,
  toastTimer: null,
};

let activeZoomTarget = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function showOnly(view) {
  for (const candidate of [
    elements.loadingView,
    elements.introView,
    elements.draftView,
    elements.resultsView,
    elements.errorView,
  ]) {
    candidate.classList.toggle('hidden', candidate !== view);
  }
  document.body.dataset.view = view.id.replace('-view', '');
}

function storedJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function initializeTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  elements.themeToggle.checked = dark;
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1d191d' : '#f7f2ea';
}

function setTheme(dark) {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1d191d' : '#f7f2ea';
}

function selectDraft() {
  const requestedId = new URLSearchParams(location.search).get('seat');
  const requested = state.data.drafts.find(draft => draft.id === requestedId);
  if (requested) return requested;
  const seen = storedJson(SEEN_KEY, []);
  return chooseDraft(state.data.drafts, Array.isArray(seen) ? seen : []);
}

function rememberDraft(draftId) {
  const existing = storedJson(SEEN_KEY, []);
  const next = [...new Set([...(Array.isArray(existing) ? existing : []), draftId])].slice(-64);
  localStorage.setItem(SEEN_KEY, JSON.stringify(next));
}

function updateSeatUrl(draftId) {
  const url = new URL(location.href);
  url.searchParams.set('seat', draftId);
  history.replaceState(null, '', url);
}

function publicSeatUrl() {
  const url = new URL(PUBLIC_APP_URL);
  url.searchParams.set('seat', state.draft.id);
  return url.href;
}

function cardDetails(name) {
  return state.data.cards[name] || { name, typeLine: '', manaValue: 0 };
}

function imageMarkup(name, className = 'card-image', loading = 'lazy') {
  const card = cardDetails(name);
  const image = safeUrl(card.imageNormal || card.imageSmall);
  if (!image) return `<span class="card-fallback">${escapeHtml(name)}</span>`;
  return `<img class="${className}" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="${loading}" decoding="async">`;
}

function renderIntro() {
  const firstPack = state.draft.picks[0];
  const choiceIndex = firstPack.cards.indexOf(firstPack.choice);
  const fanNames = [
    firstPack.cards[(choiceIndex + 3) % firstPack.cards.length],
    firstPack.choice,
    firstPack.cards[(choiceIndex + 8) % firstPack.cards.length],
  ];
  elements.introCards.innerHTML = fanNames.map(name => (
    `<div class="intro-card">${imageMarkup(name, 'card-image', 'eager')}</div>`
  )).join('');
  elements.introProof.innerHTML = `
    <span><span class="proof-record">${escapeHtml(state.data.set.name)}</span> · Premier Draft</span>
    <span>${escapeHtml(formatDraftDate(state.draft.date))} · anonymous ${escapeHtml(state.draft.record)} run</span>
  `;
}

function resetRun() {
  state.currentPick = 0;
  state.userPicks = [];
  state.locked = false;
  state.watchIndex = SIMULATED_PICK_COUNT;
  elements.pickLog.classList.add('hidden');
  elements.revealLogButton.textContent = 'show the full pick log';
  renderIntro();
  renderProgress();
  renderPickTray();
}

function renderProgress() {
  elements.pickProgress.innerHTML = Array.from({ length: SIMULATED_PICK_COUNT }, (_, index) => {
    const classes = [
      'progress-dot',
      index < state.currentPick ? 'complete' : '',
      index === state.currentPick ? 'current' : '',
    ].filter(Boolean).join(' ');
    return `<span class="${classes}"></span>`;
  }).join('');
  elements.pickProgress.setAttribute('aria-label', `${state.currentPick} of ${SIMULATED_PICK_COUNT} picks complete`);
}

function renderPickTray() {
  elements.pickTray.innerHTML = Array.from({ length: SIMULATED_PICK_COUNT }, (_, index) => {
    const name = state.userPicks[index];
    if (!name) return `<div class="tray-slot"><span>${index + 1}</span></div>`;
    return `
      <div class="tray-slot filled" title="pick ${index + 1}: ${escapeHtml(name)}">
        ${imageMarkup(name, 'mini-card-image')}
      </div>
    `;
  }).join('');
  elements.yourPickCount.textContent = String(state.userPicks.length);
}

function renderCurrentPack() {
  const pick = state.draft.picks[state.currentPick];
  const sortedCards = sortPackCards(pick.cards, state.data.cards);
  state.locked = false;
  elements.pickLabel.textContent = `pack ${pick.pack} · pick ${pick.pick}`;
  elements.packCount.textContent = `${pick.cards.length} cards · rarity order`;
  elements.cardGrid.innerHTML = sortedCards.map((name, index) => `
    <button
      class="card-button"
      type="button"
      data-card-name="${escapeHtml(name)}"
      aria-label="pick ${escapeHtml(name)}"
      style="animation-delay: ${Math.min(index * 22, 180)}ms"
    >
      ${imageMarkup(name, 'card-image', index < 7 ? 'eager' : 'lazy')}
    </button>
  `).join('');

  for (const button of elements.cardGrid.querySelectorAll('.card-button')) {
    button.addEventListener('click', () => chooseCard(button.dataset.cardName, button));
  }

  renderProgress();
  preloadNextPack();
  window.scrollTo({ top: 0, behavior: state.currentPick ? 'smooth' : 'auto' });
}

function preloadNextPack() {
  const nextPick = state.draft.picks[state.currentPick + 1];
  if (!nextPick) return;
  for (const name of nextPick.cards) {
    const card = cardDetails(name);
    const url = safeUrl(card.imageNormal || card.imageSmall);
    if (url) new Image().src = url;
  }
}

function chooseCard(name, selectedButton) {
  if (state.locked || state.currentPick >= SIMULATED_PICK_COUNT) return;
  hideCardZoom();
  state.locked = true;
  state.userPicks.push(name);
  renderPickTray();

  for (const button of elements.cardGrid.querySelectorAll('.card-button')) {
    button.disabled = true;
    button.classList.add(button === selectedButton ? 'chosen' : 'not-chosen');
  }

  window.setTimeout(() => {
    state.currentPick += 1;
    if (state.currentPick >= SIMULATED_PICK_COUNT) showResults();
    else renderCurrentPack();
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 360);
}

function startDraft() {
  showOnly(elements.draftView);
  renderCurrentPack();
  elements.cardGrid.querySelector('.card-button')?.focus({ preventScroll: true });
}

function comparisonMarkup(pick, index) {
  const userChoice = state.userPicks[index];
  const matched = userChoice === pick.choice;
  return `
    <article class="comparison-item ${matched ? 'match' : 'split'}">
      <span class="comparison-pick-label">p1p${index + 1}</span>
      <div class="comparison-card">
        ${imageMarkup(userChoice)}
        <span title="${escapeHtml(userChoice)}">you · ${escapeHtml(userChoice)}</span>
      </div>
      <span class="comparison-marker" aria-label="${matched ? 'same pick' : 'different pick'}">${matched ? '✓' : '→'}</span>
      <div class="comparison-card">
        ${imageMarkup(pick.choice)}
        <span title="${escapeHtml(pick.choice)}">them · ${escapeHtml(pick.choice)}</span>
      </div>
    </article>
  `;
}

function renderDeck() {
  const { deck } = state.draft;
  const groups = groupDeckCards(deck, state.data.cards);
  const colors = [...new Set([...(deck.mainColors || []), ...(deck.splashColors || [])])];
  const sideboardCount = (deck.sideboard || []).reduce((sum, card) => sum + card.count, 0);
  elements.deckSummary.innerHTML = `
    <span><strong>${deckCount(deck)} cards</strong> · last recorded build · ${sideboardCount} in sideboard</span>
    <span class="deck-summary-actions">
      <span class="color-pips" aria-label="deck colors: ${colors.map(color => COLOR_NAMES[color]).join(', ')}">
        ${colors.map(color => `<span class="color-pip ${color}" title="${COLOR_NAMES[color]}">${color}</span>`).join('')}
      </span>
      ${safeUrl(state.draft.sourceUrl) ? `<a class="source-link" href="${escapeHtml(safeUrl(state.draft.sourceUrl))}" target="_blank" rel="noreferrer">original draft ↗</a>` : ''}
    </span>
  `;
  elements.deckColumns.innerHTML = groups.map(group => `
    <section class="deck-column">
      <div class="deck-column-head"><span>${group.label}</span><span>${deckGroupCount(group)}</span></div>
      <div class="deck-card-stack">
        ${group.cards.map((card, index) => {
          const target = safeUrl(card.scryfall);
          const image = imageMarkup(card.name);
          const count = card.count > 1 ? `<span class="deck-card-count" aria-label="${card.count} copies">${card.count}</span>` : '';
          return `<div class="deck-card" style="--stack-index:${index}" title="${escapeHtml(card.name)}">${target ? `<a href="${escapeHtml(target)}" target="_blank" rel="noreferrer">${image}</a>` : image}${count}</div>`;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function renderPickLog() {
  elements.pickLog.innerHTML = state.draft.picks.map(pick => `
    <li>
      <span>p${pick.pack}p${pick.pick}</span>
      <strong title="${escapeHtml(pick.choice)}">${escapeHtml(pick.choice)}</strong>
    </li>
  `).join('');
}

function renderWatchPick() {
  const pick = state.draft.picks[state.watchIndex];
  const sortedCards = sortPackCards(pick.cards, state.data.cards);
  elements.watchLabel.textContent = `pack ${pick.pack} · pick ${pick.pick} · ${state.watchIndex + 1} of ${state.draft.picks.length}`;
  elements.watchChoice.textContent = `they took ${pick.choice}`;
  elements.watchPack.innerHTML = sortedCards.map(name => `
    <div class="watch-card ${name === pick.choice ? 'chosen' : ''}">
      ${imageMarkup(name)}
      ${name === pick.choice ? '<span class="watch-choice-label">their pick</span>' : ''}
    </div>
  `).join('');
  elements.watchPrevious.disabled = state.watchIndex <= SIMULATED_PICK_COUNT;
  const atEnd = state.watchIndex >= state.draft.picks.length - 1;
  elements.watchNext.disabled = atEnd;
  elements.watchNext.textContent = atEnd ? 'end of draft' : 'next pick';
}

function setOutcomeView(view) {
  const showDeck = view === 'deck';
  elements.deckView.classList.toggle('hidden', !showDeck);
  elements.watchView.classList.toggle('hidden', showDeck);
  elements.deckTab.classList.toggle('active', showDeck);
  elements.watchTab.classList.toggle('active', !showDeck);
  elements.deckTab.setAttribute('aria-selected', String(showDeck));
  elements.watchTab.setAttribute('aria-selected', String(!showDeck));
  if (!showDeck) renderWatchPick();
}

function resultGridMarkup(outcomes) {
  return outcomes.map((matched, index) => `
    <span class="result-tile ${matched ? 'same' : 'different'}" aria-label="pick ${index + 1}: ${matched ? 'same pick' : 'different pick'}">
      ${index + 1}
    </span>
  `).join('');
}

function statMarkup(stats) {
  const firstSplit = stats.firstSplit ? `p1p${stats.firstSplit}` : 'none';
  const streakLabel = stats.longestMatchStreak === 1 ? 'pick' : 'picks';
  return `
    <div><dt>same picks</dt><dd>${stats.matches} / ${stats.total}</dd></div>
    <div><dt>first split</dt><dd>${firstSplit}</dd></div>
    <div><dt>longest shared run</dt><dd>${stats.longestMatchStreak} ${streakLabel}</dd></div>
    <div><dt>same rarity tier</dt><dd>${stats.rarityMatches} / ${stats.total}</dd></div>
  `;
}

function buildShareText(stats) {
  const grid = stats.outcomes.map(matched => matched ? '🟩' : '🟨').join('');
  const firstSplit = stats.firstSplit ? `first split p1p${stats.firstSplit}` : 'no splits';
  const streakLabel = stats.longestMatchStreak === 1 ? 'pick' : 'picks';
  return [
    `trophy seat — ${state.data.set.name} — ${formatDraftDate(state.draft.date)}`,
    `I matched ${stats.matches}/8 picks with a ${state.draft.record} drafter.`,
    '',
    grid,
    `same rarity ${stats.rarityMatches}/8 · ${firstSplit} · longest shared run ${stats.longestMatchStreak} ${streakLabel}`,
    '',
    'Can you beat my line? Draft the same seat:',
    publicSeatUrl(),
  ].join('\n');
}

function renderPostgame(stats) {
  const meta = `${state.data.set.name} · ${formatDraftDate(state.draft.date)} · reference ${state.draft.record}`;
  elements.postgameMeta.textContent = meta;
  elements.resultGrid.innerHTML = resultGridMarkup(stats.outcomes);
  elements.resultStats.innerHTML = statMarkup(stats);
  elements.shareMeta.textContent = meta;
  elements.shareResultGrid.innerHTML = resultGridMarkup(stats.outcomes);
  elements.shareTextPreview.textContent = buildShareText(stats);
  elements.copyResultButton.textContent = 'copy result + challenge';
}

function showResults() {
  rememberDraft(state.draft.id);
  const score = scorePicks(state.userPicks, state.draft.picks);
  const stats = comparisonStats(state.userPicks, state.draft.picks, state.data.cards);
  const copy = resultCopy(score);
  elements.scoreNumber.textContent = String(score);
  elements.resultEyebrow.textContent = copy.eyebrow;
  elements.resultTitle.textContent = copy.title;
  elements.resultBody.textContent = copy.body;
  elements.trophyProof.innerHTML = `
    <span class="proof-trophy" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M9 6h14l-2 7c-.8 3-2.6 5-5 6-2.4-1-4.2-3-5-6L9 6Zm2 2H6v3c0 3.1 1.9 5 5.2 5M21 8h5v3c0 3.1-1.9 5-5.2 5M16 19v6m-5 2h10"/></svg>
    </span>
    <span class="proof-copy"><strong>${escapeHtml(state.draft.record)}</strong><span>${escapeHtml(state.draft.rank)} · ${escapeHtml(state.data.set.name)}</span><span>${escapeHtml(formatDraftDate(state.draft.date))}</span></span>
  `;
  renderPostgame(stats);
  elements.comparisonList.innerHTML = state.draft.picks
    .slice(0, SIMULATED_PICK_COUNT)
    .map(comparisonMarkup)
    .join('');
  renderDeck();
  renderPickLog();
  setOutcomeView('deck');
  showOnly(elements.resultsView);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function anotherSeat() {
  const currentId = state.draft.id;
  const storedSeen = storedJson(SEEN_KEY, []);
  const seen = [...new Set([...(Array.isArray(storedSeen) ? storedSeen : []), currentId])];
  state.draft = chooseDraft(state.data.drafts, seen);
  updateSeatUrl(state.draft.id);
  resetRun();
  startDraft();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

async function copyResult() {
  const stats = comparisonStats(state.userPicks, state.draft.picks, state.data.cards);
  try {
    await navigator.clipboard.writeText(buildShareText(stats));
    elements.copyResultButton.textContent = 'copied — send it to a friend';
    showToast('result and challenge copied');
  } catch {
    showToast('copy failed — select the preview text');
  }
}

function openShareDialog() {
  const stats = comparisonStats(state.userPicks, state.draft.picks, state.data.cards);
  renderPostgame(stats);
  elements.shareDialog.showModal();
}

function hideCardZoom() {
  activeZoomTarget = null;
  elements.cardZoom.classList.remove('show');
  elements.cardZoom.setAttribute('aria-hidden', 'true');
}

function positionCardZoom() {
  const bounds = elements.cardZoom.getBoundingClientRect();
  const targetBounds = activeZoomTarget?.getBoundingClientRect();
  if (!targetBounds) return;
  const gap = 22;
  const edge = 14;
  let left = targetBounds.right + gap;
  if (left + bounds.width > window.innerWidth - edge) left = targetBounds.left - bounds.width - gap;
  const targetCenter = targetBounds.top + (targetBounds.height / 2);
  const top = Math.max(edge, Math.min(targetCenter - (bounds.height / 2), window.innerHeight - bounds.height - edge));
  elements.cardZoom.style.left = `${Math.max(edge, left)}px`;
  elements.cardZoom.style.top = `${top}px`;
}

function bindCardZoom() {
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.addEventListener('pointerover', event => {
    if (!canHover.matches || (event.pointerType && event.pointerType !== 'mouse')) return;
    const target = event.target.closest?.(CARD_ZOOM_SELECTOR);
    const image = target?.querySelector('img');
    if (!target || !image?.currentSrc) return;
    activeZoomTarget = target;
    elements.cardZoomImage.src = image.currentSrc;
    elements.cardZoomImage.alt = image.alt;
    elements.cardZoomLabel.textContent = image.alt;
    elements.cardZoom.classList.add('show');
    elements.cardZoom.setAttribute('aria-hidden', 'false');
    positionCardZoom();
  });
  document.addEventListener('pointerout', event => {
    const target = event.target.closest?.(CARD_ZOOM_SELECTOR);
    if (!target || target !== activeZoomTarget) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    hideCardZoom();
  });
  window.addEventListener('scroll', hideCardZoom, { passive: true });
}

function bindEvents() {
  elements.startButton.addEventListener('click', startDraft);
  elements.anotherButton.addEventListener('click', anotherSeat);
  elements.shareButton.addEventListener('click', openShareDialog);
  elements.copyResultButton.addEventListener('click', copyResult);
  elements.aboutButton.addEventListener('click', () => elements.aboutDialog.showModal());
  elements.themeToggle.addEventListener('change', event => setTheme(event.target.checked));
  elements.deckTab.addEventListener('click', () => setOutcomeView('deck'));
  elements.watchTab.addEventListener('click', () => setOutcomeView('watch'));
  elements.watchPrevious.addEventListener('click', () => {
    state.watchIndex = Math.max(SIMULATED_PICK_COUNT, state.watchIndex - 1);
    renderWatchPick();
  });
  elements.watchNext.addEventListener('click', () => {
    state.watchIndex = Math.min(state.draft.picks.length - 1, state.watchIndex + 1);
    renderWatchPick();
  });
  elements.revealLogButton.addEventListener('click', () => {
    const hidden = elements.pickLog.classList.toggle('hidden');
    elements.revealLogButton.textContent = hidden ? 'show the full pick log' : 'hide the full pick log';
  });
  document.addEventListener('keydown', event => {
    if (elements.draftView.classList.contains('hidden') || state.locked) return;
    const number = Number(event.key);
    if (number < 1 || number > 9) return;
    const button = elements.cardGrid.querySelectorAll('.card-button')[number - 1];
    if (button) button.click();
  });
  bindCardZoom();
}

async function initialize() {
  initializeTheme();
  bindEvents();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Draft data returned ${response.status}.`);
    state.data = validateDataset(await response.json());
    state.draft = selectDraft();
    updateSeatUrl(state.draft.id);
    resetRun();
    showOnly(elements.introView);
  } catch (error) {
    console.error(error);
    elements.errorMessage.textContent = error.message || 'Try refreshing the page.';
    showOnly(elements.errorView);
  }
}

initialize();
