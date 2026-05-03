import { esc } from './feedback.js';

export const VOICE_DEBOUNCE_MS = 1200;

export function createAddSpeechRecognition({
  win = window,
  micBtn,
  statusEl,
  onText,
  debounceMs = VOICE_DEBOUNCE_MS,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  let listening = false;
  let recognition = null;
  let pending = '';
  let debounce = null;
  const SR = win.SpeechRecognition || win.webkitSpeechRecognition;

  if (SR) {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text + ' ';
        else interim += text;
      }
      if (final.trim()) {
        pending += final;
        statusEl.innerHTML = '<strong>heard:</strong> ' + esc(pending.trim());
        clearTimeoutImpl(debounce);
        debounce = setTimeoutImpl(() => {
          const text = pending.trim();
          pending = '';
          if (text.length > 1) onText(text);
        }, debounceMs);
      }
      if (interim) {
        statusEl.innerHTML = '<strong>...</strong> ' + esc((pending + interim).trim());
      }
    };
    recognition.onend = () => {
      if (listening) {
        try { recognition.start(); } catch (e) {}
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        statusEl.textContent = 'mic access denied - allow and reload';
      }
    };
  }

  function start() {
    if (!recognition) {
      statusEl.textContent = 'voice not supported in this browser';
      return;
    }
    listening = true;
    recognition.start();
    micBtn.className = 'mic-btn on';
    micBtn.textContent = 'stop';
    statusEl.textContent = 'listening...';
  }

  function stop() {
    if (!recognition) return;
    listening = false;
    recognition.stop();
    micBtn.className = 'mic-btn off';
    micBtn.textContent = 'start listening';
    statusEl.textContent = 'mic off';
  }

  function toggle() {
    if (!recognition) {
      statusEl.textContent = 'voice not supported in this browser';
      return;
    }
    if (listening) stop();
    else start();
  }

  function bind() {
    micBtn.addEventListener('click', toggle);
  }

  return {
    bind,
    start,
    stop,
    toggle,
    isListening: () => listening,
    isSupported: () => !!recognition,
    getRecognition: () => recognition,
  };
}
