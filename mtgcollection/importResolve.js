import { SCRYFALL_API } from './state.js';
import { applyScryfallCardResolution } from './collection.js';

let progressEl;

export function setImportProgressElement(element) {
  progressEl = element;
}

// ---- Scryfall resolve ----
export async function resolveCards(entries) {
  // Batch Scryfall /cards/collection requests, up to 75 per call
  const BATCH = 75;
  let resolved = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const identifiers = batch.map(e => {
      if (e.scryfallId) return { id: e.scryfallId };
      if (e.setCode && e.cn) return { set: e.setCode, collector_number: e.cn };
      if (e.name && e.setCode) return { name: e.name, set: e.setCode };
      if (e.name) return { name: e.name };
      return { name: 'UNRESOLVABLE' };
    });
    try {
      const resp = await fetch(SCRYFALL_API + '/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const found = data.data || [];
      for (let j = 0; j < batch.length; j++) {
        const entry = batch[j];
        const ident = identifiers[j];
        let card = null;
        if (ident.id) card = found.find(c => c.id === ident.id);
        else if (ident.set && ident.collector_number) {
          card = found.find(c => c.set === ident.set && c.collector_number === ident.collector_number);
        } else if (ident.name) {
          card = found.find(c => c.name.toLowerCase() === ident.name.toLowerCase() && (!ident.set || c.set === ident.set))
              || found.find(c => c.name.toLowerCase().includes(ident.name.toLowerCase()));
        }
        if (card) {
          applyScryfallCardResolution(entry, card);
          resolved++;
        }
      }
    } catch (e) {
      // leave unresolved; skip batch
    }
    if (progressEl) progressEl.textContent = 'resolved ' + resolved + ' / ' + entries.length;
    if (i + BATCH < entries.length) await new Promise(r => setTimeout(r, 120));
  }
  if (progressEl) progressEl.textContent = '';
}
