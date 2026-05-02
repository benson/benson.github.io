const PRESETS = new Set(['plain', 'moxfield', 'arena', 'mtgo', 'csv', 'json']);
const ALL_BOARDS = ['main', 'sideboard', 'maybe'];

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function quantity(card) {
  const qty = Number.parseInt(card?.qty, 10);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function cardName(card) {
  return clean(card?.resolvedName || card?.name);
}

function deckBoard(card) {
  const board = clean(card?.deckBoard).toLowerCase();
  return board === 'sideboard' || board === 'maybe' ? board : 'main';
}

function setCode(card) {
  return clean(card?.setCode || card?.set).toUpperCase();
}

function collectorNumber(card) {
  return clean(card?.cn || card?.collectorNumber || card?.collector_number);
}

function finishMarker(card) {
  const finish = clean(card?.finish).toLowerCase();
  if (finish === 'foil') return '*F*';
  if (finish === 'etched' || finish === 'etched foil') return '*E*';
  return '';
}

function titleSlug(deckMeta) {
  const title = clean(deckMeta?.title || deckMeta?.name || 'deck');
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
}

function normalizePreset(preset) {
  const value = clean(preset || 'plain').toLowerCase();
  return PRESETS.has(value) ? value : 'plain';
}

function selectedBoardsForPreset(preset, options) {
  if (Array.isArray(options.boards)) {
    const boards = options.boards.map(b => clean(b).toLowerCase()).filter(b => ALL_BOARDS.includes(b));
    if (boards.length) return boards;
  }
  if (preset === 'moxfield' || preset === 'csv' || preset === 'json') return [...ALL_BOARDS];
  return ['main', 'sideboard'];
}

function cloneEntry(card, qty = quantity(card)) {
  return { card, qty, name: cardName(card), board: deckBoard(card) };
}

function collapseByName(entries) {
  const byName = new Map();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.qty += entry.qty;
    else byName.set(key, { ...entry });
  }
  return [...byName.values()];
}

function lineNameCard(name) {
  return { name, resolvedName: name, qty: 1 };
}

function extractCommanderSlot(slotName, rawName, mainEntries, warnings) {
  const name = clean(rawName);
  if (!name) return null;
  const match = mainEntries.find(entry => entry.qty > 0 && entry.name === name);
  if (!match) {
    warnings.push(`${slotName} "${name}" was not found in the mainboard; exported as name-only.`);
    return { card: lineNameCard(name), qty: 1, name, board: 'commander', nameOnly: true, slot: slotName };
  }
  match.qty -= 1;
  return { card: match.card, qty: 1, name: match.name, board: 'commander', slot: slotName };
}

function entriesForText(entries, preset) {
  return preset === 'moxfield' ? entries : collapseByName(entries);
}

function sectionLines(label, entries, options = {}) {
  if (!entries.length) return [];
  return [label, ...entries.map(entry => formatDeckTextLine({ ...entry.card, qty: entry.qty }, options))];
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRows(sections) {
  const rows = [['board', 'quantity', 'name', 'setCode', 'cn', 'finish']];
  for (const board of ['commander', ...ALL_BOARDS]) {
    for (const entry of sections[board] || []) {
      rows.push([
        board,
        entry.qty,
        entry.name,
        clean(entry.card?.setCode || entry.card?.set),
        collectorNumber(entry.card),
        clean(entry.card?.finish || 'normal'),
      ]);
    }
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

export function defaultDeckExportOptions(preset) {
  const normalized = normalizePreset(preset);
  return {
    preset: normalized,
    boards: selectedBoardsForPreset(normalized, {}),
    includeCommander: true,
    collapsePrintings: !['moxfield', 'csv', 'json'].includes(normalized),
  };
}

export function buildDeckExportSections(list, deckMeta = {}, options = {}) {
  const preset = normalizePreset(options.preset);
  const selectedBoards = selectedBoardsForPreset(preset, options);
  const warnings = [];
  const sections = { commander: [], main: [], sideboard: [], maybe: [] };

  for (const card of list || []) {
    const name = cardName(card);
    if (!name) continue;
    const board = deckBoard(card);
    if (!selectedBoards.includes(board)) continue;
    sections[board].push(cloneEntry(card));
  }

  if (options.includeCommander !== false) {
    const commander = extractCommanderSlot('commander', deckMeta?.commander, sections.main, warnings);
    const partner = extractCommanderSlot('partner', deckMeta?.partner, sections.main, warnings);
    sections.commander = [commander, partner].filter(Boolean);
    sections.main = sections.main.filter(entry => entry.qty > 0);
  }

  if (options.collapsePrintings ?? defaultDeckExportOptions(preset).collapsePrintings) {
    for (const board of ALL_BOARDS) sections[board] = collapseByName(sections[board]);
  }

  return { sections, warnings, boards: selectedBoards, preset };
}

export function formatDeckTextLine(card, options = {}) {
  const preset = normalizePreset(options.preset);
  const qty = quantity(card);
  const name = cardName(card);
  if (preset !== 'moxfield') return `${qty} ${name}`;

  const parts = [`${qty} ${name}`];
  const set = setCode(card);
  const cn = collectorNumber(card);
  if (set && cn) parts.push(`(${set}) ${cn}`);
  const marker = finishMarker(card);
  if (marker) parts.push(marker);
  return parts.join(' ');
}

export function buildDeckExport(list, deckMeta = {}, options = {}) {
  const preset = normalizePreset(options.preset);
  const opts = { ...defaultDeckExportOptions(preset), ...options, preset };
  const { sections, warnings } = buildDeckExportSections(list, deckMeta, opts);
  const filenameBase = titleSlug(deckMeta);

  if (preset === 'json') {
    const output = {
      preset,
      metadata: { ...deckMeta },
      boards: Object.fromEntries(
        ['commander', ...ALL_BOARDS].map(board => [
          board,
          (sections[board] || []).map(entry => ({ quantity: entry.qty, name: entry.name, card: entry.card })),
        ]),
      ),
      warnings,
    };
    const body = JSON.stringify(output, null, 2);
    return { body, mime: 'application/json', filename: `${filenameBase}.json`, output, warnings };
  }

  if (preset === 'csv') {
    const body = csvRows(sections);
    return { body, mime: 'text/csv', filename: `${filenameBase}.csv`, output: sections, warnings };
  }

  const lines = [];
  if (sections.commander.length) {
    lines.push(...sectionLines('Commander', entriesForText(sections.commander, preset), opts), '');
  }

  if (preset === 'arena') {
    lines.push(...sectionLines('Deck', entriesForText(sections.main, preset), opts));
    if (sections.sideboard.length) lines.push('', ...sectionLines('Sideboard', entriesForText(sections.sideboard, preset), opts));
  } else if (preset === 'mtgo') {
    lines.push(...entriesForText(sections.main, preset).map(entry => formatDeckTextLine({ ...entry.card, qty: entry.qty }, opts)));
    lines.push(...entriesForText(sections.sideboard, preset).map(entry => `SB: ${formatDeckTextLine({ ...entry.card, qty: entry.qty }, opts)}`));
  } else {
    lines.push(...sectionLines('Mainboard', entriesForText(sections.main, preset), opts));
    if (sections.sideboard.length) lines.push('', ...sectionLines('Sideboard', entriesForText(sections.sideboard, preset), opts));
    if ((preset === 'moxfield' || opts.boards.includes('maybe')) && sections.maybe.length) {
      lines.push('', ...sectionLines('Maybeboard', entriesForText(sections.maybe, preset), opts));
    }
  }

  const body = lines.join('\n').replace(/\n+$/g, '');
  return { body, mime: 'text/plain', filename: `${filenameBase}-${preset}.txt`, output: sections, warnings };
}
