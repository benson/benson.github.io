import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createAddSpeechRecognition } from '../addSpeechRecognition.js';

function installDom() {
  const win = new Window();
  win.document.body.innerHTML = `
    <button id="mic" class="mic-btn off" type="button">start listening</button>
    <div id="status"></div>
  `;
  return {
    micBtn: win.document.getElementById('mic'),
    statusEl: win.document.getElementById('status'),
  };
}

function fakeResult(text, isFinal) {
  const result = [{ transcript: text }];
  result.isFinal = isFinal;
  return result;
}

function makeFakeSpeechWindow() {
  const instances = [];
  class FakeRecognition {
    constructor() {
      this.startCalls = 0;
      this.stopCalls = 0;
      instances.push(this);
    }
    start() {
      this.startCalls++;
    }
    stop() {
      this.stopCalls++;
    }
  }
  return { win: { SpeechRecognition: FakeRecognition }, instances };
}

test('createAddSpeechRecognition: reports unsupported browsers on click', () => {
  const { micBtn, statusEl } = installDom();
  const speech = createAddSpeechRecognition({ win: {}, micBtn, statusEl, onText: () => {} });

  speech.bind();
  micBtn.click();

  assert.equal(speech.isSupported(), false);
  assert.equal(statusEl.textContent, 'voice not supported in this browser');
});

test('createAddSpeechRecognition: configures recognition and toggles listening', () => {
  const { micBtn, statusEl } = installDom();
  const { win, instances } = makeFakeSpeechWindow();
  const speech = createAddSpeechRecognition({ win, micBtn, statusEl, onText: () => {} });

  const recognition = instances[0];
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, true);
  assert.equal(recognition.lang, 'en-US');

  speech.bind();
  micBtn.click();
  assert.equal(speech.isListening(), true);
  assert.equal(recognition.startCalls, 1);
  assert.equal(micBtn.textContent, 'stop');
  assert.equal(statusEl.textContent, 'listening...');

  micBtn.click();
  assert.equal(speech.isListening(), false);
  assert.equal(recognition.stopCalls, 1);
  assert.equal(micBtn.textContent, 'start listening');
  assert.equal(statusEl.textContent, 'mic off');
});

test('createAddSpeechRecognition: debounces final text before parsing', () => {
  const { micBtn, statusEl } = installDom();
  const { win, instances } = makeFakeSpeechWindow();
  const heard = [];
  let timeoutFn = null;
  createAddSpeechRecognition({
    win,
    micBtn,
    statusEl,
    onText: (text) => heard.push(text),
    setTimeoutImpl: (fn) => { timeoutFn = fn; return 1; },
    clearTimeoutImpl: () => {},
  });

  instances[0].onresult({
    resultIndex: 0,
    results: [fakeResult('fin 142', true)],
  });

  assert.equal(statusEl.textContent, 'heard: fin 142');
  assert.deepEqual(heard, []);
  timeoutFn();
  assert.deepEqual(heard, ['fin 142']);
});

test('createAddSpeechRecognition: shows interim text without parsing', () => {
  const { micBtn, statusEl } = installDom();
  const { win, instances } = makeFakeSpeechWindow();
  const heard = [];
  createAddSpeechRecognition({
    win,
    micBtn,
    statusEl,
    onText: (text) => heard.push(text),
  });

  instances[0].onresult({
    resultIndex: 0,
    results: [fakeResult('sol r', false)],
  });

  assert.equal(statusEl.textContent, '... sol r');
  assert.deepEqual(heard, []);
});

test('createAddSpeechRecognition: restarts recognition after browser end while listening', () => {
  const { micBtn, statusEl } = installDom();
  const { win, instances } = makeFakeSpeechWindow();
  const speech = createAddSpeechRecognition({ win, micBtn, statusEl, onText: () => {} });
  const recognition = instances[0];

  speech.start();
  recognition.onend();

  assert.equal(recognition.startCalls, 2);
});

test('createAddSpeechRecognition: surfaces microphone permission errors', () => {
  const { micBtn, statusEl } = installDom();
  const { win, instances } = makeFakeSpeechWindow();
  createAddSpeechRecognition({ win, micBtn, statusEl, onText: () => {} });

  instances[0].onerror({ error: 'not-allowed' });

  assert.equal(statusEl.textContent, 'mic access denied - allow and reload');
});
