import { buildDeckExport } from './deckExport.js';
import { deckExportOptionsFromForm } from './deckPreferences.js';

export function moxfieldDeckText(list, metadata) {
  return buildDeckExport(list, metadata, { preset: 'moxfield' }).body;
}

export function downloadDeckExport(result, {
  documentRef = globalThis.document,
  BlobImpl = globalThis.Blob,
  URLImpl = globalThis.URL,
} = {}) {
  const blob = new BlobImpl([result.body], { type: result.mime || 'text/plain' });
  const url = URLImpl.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = result.filename || 'deck.txt';
  anchor.click();
  URLImpl.revokeObjectURL(url);
  return { blob, url, filename: anchor.download };
}

export async function copyTextWithFeedback(text, {
  clipboard = globalThis.navigator?.clipboard,
  showFeedback = () => {},
  successMessage = 'copied',
} = {}) {
  try {
    await clipboard.writeText(text);
    showFeedback(successMessage, 'success');
    return true;
  } catch (err) {
    showFeedback('clipboard unavailable: ' + err.message, 'error');
    return false;
  }
}

export async function runDeckExportAction({
  action,
  form,
  list,
  metadata,
  showFeedback = () => {},
  clipboard,
  documentRef,
  BlobImpl,
  URLImpl,
} = {}) {
  if (!form) return null;
  const result = buildDeckExport(list, metadata, deckExportOptionsFromForm(form));
  if (action === 'download') {
    downloadDeckExport(result, { documentRef, BlobImpl, URLImpl });
    showFeedback('deck export downloaded', 'success');
  } else {
    await copyTextWithFeedback(result.body, {
      clipboard,
      showFeedback,
      successMessage: 'deck export copied',
    });
  }
  if (result.warnings?.length) showFeedback(result.warnings.join(' '), 'info');
  return result;
}

export async function copyDecklist({
  list,
  metadata,
  clipboard,
  showFeedback = () => {},
} = {}) {
  return copyTextWithFeedback(moxfieldDeckText(list, metadata), {
    clipboard,
    showFeedback,
    successMessage: 'decklist copied',
  });
}
