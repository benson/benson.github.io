import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  ensureCommanderEntryInDeck,
  readDeckMetadataForm,
  saveDeckMetadataFromForm,
} from '../deckMetadataForm.js';

function formFromHtml(html) {
  const win = new Window();
  win.document.body.innerHTML = `<form id="deckMetadataForm">${html}</form>`;
  global.FormData = win.FormData;
  return win.document.getElementById('deckMetadataForm');
}

function scryfallCard(id, name, opts = {}) {
  return {
    id,
    name,
    set: opts.set || 'c16',
    collector_number: opts.collector_number || '1',
    image_uris: { normal: opts.imageUrl || `${id}-front` },
    card_faces: [
      { image_uris: { normal: opts.imageUrl || `${id}-front` } },
      { image_uris: { normal: opts.backImageUrl || `${id}-back` } },
    ],
  };
}

test('readDeckMetadataForm: preserves commander metadata for commander decks', () => {
  const form = formFromHtml(`
    <input name="title" value="  ">
    <input name="formatPreset" value="commander">
    <input name="commander" value="Breya, Etherium Shaper" data-meta-ac="commander" data-meta-ac-scryfall-id="cmd-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/cmd-1" data-meta-ac-image="front.jpg" data-meta-ac-back-image="back.jpg">
    <input name="partner" value="Silas Renn" data-meta-ac="partner" data-meta-ac-scryfall-id="partner-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/partner-1" data-meta-ac-image="partner.jpg">
    <input name="companion" value="Lurrus">
    <textarea name="description">Artifact pile</textarea>
  `);

  const result = readDeckMetadataForm(form, 'breya');

  assert.equal(result.isCommander, true);
  assert.equal(result.metadata.title, 'breya');
  assert.equal(result.metadata.format, 'commander');
  assert.equal(result.metadata.commander, 'Breya, Etherium Shaper');
  assert.equal(result.metadata.commanderScryfallId, 'cmd-1');
  assert.equal(result.metadata.commanderScryfallUri, 'https://scryfall.test/card/cmd-1');
  assert.equal(result.metadata.commanderImageUrl, 'front.jpg');
  assert.equal(result.metadata.commanderBackImageUrl, 'back.jpg');
  assert.equal(result.metadata.partner, 'Silas Renn');
  assert.equal(result.metadata.partnerScryfallId, 'partner-1');
  assert.equal(result.metadata.partnerScryfallUri, 'https://scryfall.test/card/partner-1');
  assert.equal(result.metadata.companion, 'Lurrus');
  assert.equal(result.metadata.description, 'Artifact pile');
});

test('readDeckMetadataForm: clears commander fields outside commander format', () => {
  const form = formFromHtml(`
    <input name="title" value="breya">
    <input name="formatPreset" value="custom">
    <input name="formatCustom" value="standard-ish">
    <input name="commander" value="Breya" data-meta-ac="commander" data-meta-ac-scryfall-id="cmd-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/cmd-1" data-meta-ac-image="front.jpg">
    <input name="partner" value="Silas Renn" data-meta-ac="partner" data-meta-ac-scryfall-id="partner-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/partner-1" data-meta-ac-image="partner.jpg">
  `);

  const result = readDeckMetadataForm(form, 'breya');

  assert.equal(result.isCommander, false);
  assert.equal(result.metadata.format, 'standard-ish');
  assert.equal(result.metadata.commander, '');
  assert.equal(result.metadata.commanderScryfallId, '');
  assert.equal(result.metadata.commanderScryfallUri, '');
  assert.equal(result.metadata.commanderImageUrl, '');
  assert.equal(result.metadata.partner, '');
  assert.equal(result.metadata.partnerScryfallId, '');
  assert.equal(result.metadata.partnerScryfallUri, '');
});

test('ensureCommanderEntryInDeck: adds one commander placeholder and records the event', () => {
  const deck = { type: 'deck', name: 'breya', deckList: [] };
  const events = [];
  const card = scryfallCard('cmd-1', 'Breya, Etherium Shaper');

  assert.equal(ensureCommanderEntryInDeck('cmd-1', deck, card, {
    recordEventImpl: event => events.push(event),
  }), 'cmd-1');

  assert.equal(deck.deckList.length, 1);
  assert.equal(deck.deckList[0].scryfallId, 'cmd-1');
  assert.equal(deck.deckList[0].qty, 1);
  assert.equal(deck.deckList[0].board, 'main');
  assert.equal(deck.deckList[0].name, 'Breya, Etherium Shaper');
  assert.equal(deck.deckList[0].setCode, 'c16');
  assert.equal(deck.deckList[0].cn, '1');
  assert.equal(deck.deckList[0].imageUrl, 'cmd-1-front');
  assert.equal(deck.deckList[0].backImageUrl, 'cmd-1-back');
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, 'Added {card} as commander to {loc:deck:breya}');

  assert.equal(ensureCommanderEntryInDeck('cmd-1', deck, card, {
    recordEventImpl: event => events.push(event),
  }), null);
  assert.equal(deck.deckList.length, 1);
  assert.equal(events.length, 1);
});

test('saveDeckMetadataFromForm: saves metadata and auto-adds commander cards', () => {
  const form = formFromHtml(`
    <input name="title" value="Breya deck">
    <input name="formatPreset" value="commander">
    <input name="commander" value="Breya" data-meta-ac="commander" data-meta-ac-scryfall-id="cmd-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/cmd-1">
    <input name="partner" value="Silas Renn" data-meta-ac="partner" data-meta-ac-scryfall-id="partner-1" data-meta-ac-scryfall-uri="https://scryfall.test/card/partner-1">
    <textarea name="description">Tokens and artifacts</textarea>
  `);
  const deck = { type: 'deck', name: 'breya', deckList: [] };
  const cards = new Map([
    ['cmd-1', scryfallCard('cmd-1', 'Breya, Etherium Shaper')],
    ['partner-1', scryfallCard('partner-1', 'Silas Renn, Seeker Adept', { collector_number: '2' })],
  ]);
  const events = [];

  const result = saveDeckMetadataFromForm({
    form,
    deck,
    getCardById: id => cards.get(id),
    now: () => 12345,
    recordEventImpl: event => events.push(event),
  });

  assert.equal(result.added, 2);
  assert.equal(deck.updatedAt, 12345);
  assert.equal(deck.deck.title, 'Breya deck');
  assert.equal(deck.deck.format, 'commander');
  assert.equal(deck.deck.commanderScryfallId, 'cmd-1');
  assert.equal(deck.deck.commanderScryfallUri, 'https://scryfall.test/card/cmd-1');
  assert.equal(deck.deck.partnerScryfallId, 'partner-1');
  assert.equal(deck.deck.partnerScryfallUri, 'https://scryfall.test/card/partner-1');
  assert.equal(deck.deck.description, 'Tokens and artifacts');
  assert.deepEqual(deck.deckList.map(entry => entry.scryfallId), ['cmd-1', 'partner-1']);
  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'deck-update');
  assert.equal(events[0].deckLocation, 'deck:breya');
});
