import { afterEach } from 'node:test';
import { Window } from 'happy-dom';
import { resetState } from '../state.js';

export function createFakeStorage(initial = {}) {
  const entries = Array.isArray(initial) ? initial : Object.entries(initial);
  const values = new Map(entries);

  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

export function installLocalStorage(initial = {}) {
  const originalLocalStorage = globalThis.localStorage;
  const storage = createFakeStorage(initial);
  globalThis.localStorage = storage;

  return {
    storage,
    restore() {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
    },
  };
}

export function createTestDocument(bodyHtml = '') {
  const win = new Window();
  win.document.body.innerHTML = bodyHtml;
  return win.document;
}

export function resetStateAfterEach() {
  afterEach(() => {
    resetState();
  });
}
