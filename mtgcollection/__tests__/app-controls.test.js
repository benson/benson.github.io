import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindAppControls,
  CHROME_KEY,
  loadChromePreferences,
  TEXT_CASE_KEY,
  TEXT_SIZE_KEY,
} from '../appControls.js';
import { state } from '../state.js';
import { createFakeStorage, createTestDocument, resetStateAfterEach } from './testUtils.js';

function setupDocument() {
  return createTestDocument(`
    <footer class="app-footer"></footer>
    <select id="formatSelect">
      <option value=""></option>
      <option value="commander"></option>
      <option value="modern"></option>
    </select>
    <div id="emptyState">
      <button type="button" data-empty-action="new-deck"></button>
      <button type="button" data-empty-action="new-container"></button>
      <button type="button" data-empty-action="open-import"></button>
      <button type="button" data-empty-action="load-sample"></button>
      <button type="button" data-empty-action="load-test"></button>
    </div>
    <input id="locationsCreateName">
    <details id="addDetails"></details>
    <button type="button" data-add-mode="import"></button>
    <button type="button" id="loadSampleBtn"></button>
    <button type="button" id="loadTestDataBtn"></button>
    <button type="button" id="resetAppBtn"></button>
    <button type="button" id="settingsToggleBtn" aria-expanded="false" aria-controls="settingsPopover"></button>
    <div id="settingsPopover" hidden>
      <button type="button" data-settings-key="text-case" data-settings-value="lower" aria-pressed="false"></button>
      <button type="button" data-settings-key="text-case" data-settings-value="proper" aria-pressed="false"></button>
      <button type="button" data-settings-key="chrome" data-settings-value="soft" aria-pressed="false"></button>
      <button type="button" data-settings-key="chrome" data-settings-value="classic" aria-pressed="false"></button>
      <button type="button" data-settings-key="text-size" data-settings-value="compact" aria-pressed="false"></button>
      <button type="button" data-settings-key="text-size" data-settings-value="default" aria-pressed="false"></button>
      <button type="button" data-settings-key="text-size" data-settings-value="large" aria-pressed="false"></button>
    </div>
  `);
}

resetStateAfterEach();

test('loadChromePreferences: applies stored body classes', () => {
  const documentObj = setupDocument();
  loadChromePreferences({
    documentObj,
    storage: createFakeStorage([
      [TEXT_CASE_KEY, 'proper'],
      [CHROME_KEY, 'classic'],
      [TEXT_SIZE_KEY, 'large'],
    ]),
  });

  assert.equal(documentObj.body.classList.contains('proper-case'), true);
  assert.equal(documentObj.body.classList.contains('chrome-classic'), true);
  assert.equal(documentObj.body.classList.contains('text-size-large'), true);
  assert.equal(documentObj.body.classList.contains('text-size-compact'), false);
});

test('bindAppControls: format selector persists state and syncs loaded values', () => {
  const documentObj = setupDocument();
  const calls = { saves: 0, renders: 0, legality: 0 };
  state.detailIndex = 3;
  const controls = bindAppControls({
    documentObj,
    saveImpl: () => calls.saves++,
    renderImpl: () => calls.renders++,
    renderDetailLegalityImpl: () => calls.legality++,
  });

  const select = documentObj.getElementById('formatSelect');
  select.value = 'commander';
  select.dispatchEvent(new documentObj.defaultView.Event('change', { bubbles: true }));

  assert.equal(state.selectedFormat, 'commander');
  assert.equal(documentObj.querySelector('.app-footer').classList.contains('format-active'), true);
  assert.deepEqual(calls, { saves: 1, renders: 1, legality: 1 });

  state.selectedFormat = 'modern';
  controls.syncFormatSelect();

  assert.equal(select.value, 'modern');
});

test('bindAppControls: empty-state actions route or trigger their target controls', () => {
  const documentObj = setupDocument();
  const calls = { modes: [], saves: 0, renders: 0, importClicks: 0, sampleClicks: 0, testClicks: 0 };
  documentObj.querySelector('[data-add-mode="import"]').addEventListener('click', () => calls.importClicks++);
  documentObj.getElementById('loadSampleBtn').addEventListener('click', () => calls.sampleClicks++);
  documentObj.getElementById('loadTestDataBtn').addEventListener('click', () => calls.testClicks++);
  bindAppControls({
    documentObj,
    saveImpl: () => calls.saves++,
    renderImpl: () => calls.renders++,
    setTopLevelViewModeImpl: mode => calls.modes.push(mode),
  });

  documentObj.querySelector('[data-empty-action="new-deck"]').click();
  documentObj.querySelector('[data-empty-action="new-container"]').click();
  documentObj.querySelector('[data-empty-action="open-import"]').click();
  documentObj.querySelector('[data-empty-action="load-sample"]').click();
  documentObj.querySelector('[data-empty-action="load-test"]').click();

  assert.deepEqual(calls.modes, ['decks', 'storage']);
  assert.equal(calls.saves, 2);
  assert.equal(calls.renders, 2);
  assert.equal(documentObj.getElementById('addDetails').open, true);
  assert.equal(calls.importClicks, 1);
  assert.equal(calls.sampleClicks, 1);
  assert.equal(calls.testClicks, 1);
});

test('bindAppControls: reset and settings preferences stay behind one boundary', () => {
  const documentObj = setupDocument();
  const storage = createFakeStorage();
  const calls = { clears: 0, modes: [], saves: 0, renders: 0, paths: [] };
  state.detailIndex = 5;
  bindAppControls({
    documentObj,
    storage,
    clearAllFiltersImpl: () => calls.clears++,
    setTopLevelViewModeImpl: mode => calls.modes.push(mode),
    saveImpl: () => calls.saves++,
    renderImpl: () => calls.renders++,
    historyObj: { replaceState: (stateArg, titleArg, path) => calls.paths.push(path) },
    locationObj: { pathname: '/mtgcollection/' },
  });

  documentObj.getElementById('resetAppBtn').click();
  const settingsToggle = documentObj.getElementById('settingsToggleBtn');
  const settingsPopover = documentObj.getElementById('settingsPopover');
  const settingButton = (key, value) => documentObj.querySelector(`[data-settings-key="${key}"][data-settings-value="${value}"]`);

  assert.equal(settingButton('text-case', 'lower').getAttribute('aria-pressed'), 'true');
  assert.equal(settingButton('chrome', 'soft').getAttribute('aria-pressed'), 'true');
  assert.equal(settingButton('text-size', 'default').getAttribute('aria-pressed'), 'true');

  settingsToggle.click();
  assert.equal(settingsPopover.hidden, false);
  assert.equal(settingsToggle.getAttribute('aria-expanded'), 'true');

  settingButton('text-case', 'proper').click();
  settingButton('chrome', 'classic').click();
  settingButton('text-size', 'large').click();
  settingButton('text-size', 'compact').click();
  settingButton('text-size', 'default').click();

  documentObj.body.click();
  assert.equal(settingsPopover.hidden, true);
  assert.equal(settingsToggle.getAttribute('aria-expanded'), 'false');

  settingsToggle.click();
  documentObj.dispatchEvent(new documentObj.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(settingsPopover.hidden, true);
  assert.equal(settingsToggle.getAttribute('aria-expanded'), 'false');

  assert.equal(calls.clears, 1);
  assert.deepEqual(calls.modes, ['collection']);
  assert.equal(state.detailIndex, -1);
  assert.equal(calls.saves, 1);
  assert.equal(calls.renders, 1);
  assert.deepEqual(calls.paths, ['/mtgcollection/']);
  assert.equal(storage.values.get(TEXT_CASE_KEY), 'proper');
  assert.equal(storage.values.get(CHROME_KEY), 'classic');
  assert.equal(storage.values.get(TEXT_SIZE_KEY), 'default');
  assert.equal(documentObj.body.classList.contains('proper-case'), true);
  assert.equal(documentObj.body.classList.contains('chrome-classic'), true);
  assert.equal(documentObj.body.classList.contains('text-size-large'), false);
  assert.equal(documentObj.body.classList.contains('text-size-compact'), false);
  assert.equal(settingButton('text-case', 'proper').getAttribute('aria-pressed'), 'true');
  assert.equal(settingButton('chrome', 'classic').getAttribute('aria-pressed'), 'true');
  assert.equal(settingButton('text-size', 'default').getAttribute('aria-pressed'), 'true');
});
