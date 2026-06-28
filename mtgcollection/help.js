import { esc } from './feedback.js';

const HELP_SECTIONS = [
  {
    id: 'start',
    label: 'start',
    title: 'Start Here',
    kicker: 'the map',
    body: [
      'Biblioplex is built around three things you already use when managing Magic cards: inventory, containers, and decklists.',
      'Inventory is the cards you physically own. Containers mirror the places those cards live. Decklists sit in the middle: they are plans for decks, because players often think deck-first even when the actual cards are stored somewhere else.',
    ],
    concepts: [
      {
        term: 'Inventory',
        text: 'The Magic cards you physically own, grouped by exact printing, finish, condition, language, quantity, tags, price, and location.',
      },
      {
        term: 'Containers',
        text: 'Named places your cards live in real life: decks, binders, and boxes. Biblioplex mirrors those containers so the app can match your shelves, bags, and binders.',
      },
      {
        term: 'Decklists',
        text: 'Deck-first planning for the cards a deck wants. Owned cards can fulfill that plan, stay stored somewhere else, or still be missing.',
      },
    ],
    diagram: [
      ['collection', 'the Magic cards you physically own'],
      ['decks', 'deck-first plans plus optional physical cards'],
      ['storage', 'binders and boxes that mirror real storage'],
      ['history', 'scoped change log with undo'],
      ['sync', 'local-first data with optional cloud sync'],
    ],
  },
  {
    id: 'inventory',
    label: 'inventory',
    title: 'Inventory',
    kicker: 'what you own',
    body: [
      'An inventory row represents a real stack of matching cards.',
      'Rows merge when the card identity, finish, condition, language, location, and deck board all match.',
    ],
    workflows: [
      'Use collection view for broad scanning, filtering, sorting, and bulk edits.',
      'Use the drawer to edit quantity, finish, condition, language, tags, location, and printing.',
      'Use visual mode when images matter more than dense table scanning.',
    ],
    reference: [
      ['finish', 'normal, foil, or etched'],
      ['condition', 'near mint, lightly played, moderately played, heavily played, or damaged'],
      ['location', 'deck:name, binder:name, or box:name'],
      ['tags', 'freeform labels shared by filters, rows, and add/edit flows'],
    ],
  },
  {
    id: 'decklists',
    label: 'decklists',
    title: 'Decklists And Ownership',
    kicker: 'the important distinction',
    body: [
      'A decklist is the plan for a deck. Inventory is the physical collection.',
      'A card can be in the decklist without claiming that you own the physical copy.',
    ],
    concepts: [
      {
        term: 'Fulfilled',
        text: 'The decklist card matches one or more owned inventory rows by Scryfall id.',
      },
      {
        term: 'Needed',
        text: 'The decklist asks for more copies than inventory can currently fulfill.',
      },
      {
        term: 'Placeholder',
        text: 'A card was added to the decklist without adding an owned inventory row.',
      },
    ],
    workflows: [
      'Use visual, text, stats, notes, and sample hand modes inside a deck.',
      'Use main, sideboard, and maybe boards to organize intent.',
      'Set commander, partner, cover, format, and notes as deck metadata.',
      'Export or share a deck without exposing the whole collection.',
    ],
  },
  {
    id: 'storage',
    label: 'storage',
    title: 'Storage',
    kicker: 'where cards live',
    body: [
      'Storage is the physical organization layer: binders and boxes.',
      'A box opens as a scoped inventory list. A binder opens as pages with optional organize mode.',
    ],
    workflows: [
      'Create binders and boxes from storage home.',
      'Open a binder to browse pages, search inside it, sort by value, or restore binder order.',
      'Switch a binder into organize mode before renaming or changing page order.',
      'Use box views for bulk inventory that does not need page layout.',
    ],
  },
  {
    id: 'search',
    label: 'search',
    title: 'Search And Filters',
    kicker: 'finding cards',
    body: [
      'Search text is tokenized. Plain words match names; field prefixes narrow the match.',
      'Filters and search stack together. A location filter also becomes the active container route when it names exactly one container.',
    ],
    reference: [
      ['lightning bolt', 'name search; multiple words all need to match'],
      ['t:creature', 'type line contains creature'],
      ['c:rg', 'colors include red and green; c:c means colorless'],
      ['ci:wug', 'color identity includes white, blue, and green'],
      ['cmc<=3', 'mana value comparison'],
      ['o:"flying"', 'oracle text contains flying'],
      ['r:mythic', 'rarity; r:c, r:u, r:r, and r:m work too'],
      ['loc:breya', 'location label contains breya'],
      ['tag:edh', 'tag contains edh'],
      ['set:fin finish:foil cond:nm', 'set, finish, and condition filters'],
      ['qty>=2 lang:ja', 'quantity and language filters'],
      ['-t:land', 'negate any clause'],
    ],
  },
  {
    id: 'import',
    label: 'import',
    title: 'Import And Add',
    kicker: 'getting cards in',
    body: [
      'Biblioplex can add one card at a time or resolve many rows through Scryfall.',
      'Imported rows become inventory; decklist imports into a deck also populate that deck container.',
    ],
    workflows: [
      'Name lookup is best when you want to choose the exact printing visually.',
      'Voice or collector-number input is best for fast entry from physical cards.',
      'CSV import auto-detects supported headers and keeps source fields for matching exports.',
      'Plain decklist paste accepts lines like "1 Sol Ring (SLD) 1011 *F*".',
    ],
  },
  {
    id: 'sync',
    label: 'sync',
    title: 'Sync, Sharing, And History',
    kicker: 'moving data safely',
    body: [
      'The app is local-first. Your browser state is saved locally, then optional cloud sync keeps devices aligned.',
      'History records recent changes and scopes itself to collection, deck, storage, or a specific container.',
    ],
    concepts: [
      {
        term: 'Cloud sync',
        text: 'Diffs local changes into operations, queues them offline, and reconciles against the cloud revision.',
      },
      {
        term: 'Deck sharing',
        text: 'Creates a read-only snapshot link for one deck and mirrors later deck changes to the same share id.',
      },
      {
        term: 'Portable archive',
        text: 'A JSON package containing app data, history, and share records for backup or transfer.',
      },
    ],
  },
  {
    id: 'assistant',
    label: 'assistant',
    title: 'Assistant',
    kicker: 'a second interface',
    body: [
      'Collection chat is an app-aware assistant. It can read the collection and stage changes for review.',
      'It should preview changes first; applying changes remains a user-confirmed action.',
    ],
    workflows: [
      'Ask for summaries, counts, expensive cards, or cards in a named container.',
      'Ask to move, edit, duplicate, delete, or add inventory and review the preview before applying.',
      'Use follow-ups like "same one" or "actually foil" while a preview is still active.',
    ],
  },
];

function navHtml() {
  return HELP_SECTIONS.map(section =>
    '<button class="help-nav-btn" type="button" data-help-section="' + esc(section.id) + '">' + esc(section.label) + '</button>'
  ).join('');
}

function conceptHtml(items = []) {
  if (!items.length) return '';
  return '<div class="help-concepts">' + items.map(item =>
    '<article class="help-card"><h4>' + esc(item.term) + '</h4><p>' + esc(item.text) + '</p></article>'
  ).join('') + '</div>';
}

function workflowHtml(items = []) {
  if (!items.length) return '';
  return '<ul class="help-list">' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>';
}

function referenceHtml(items = []) {
  if (!items.length) return '';
  return '<dl class="help-reference">' + items.map(([term, text]) =>
    '<div><dt><code>' + esc(term) + '</code></dt><dd>' + esc(text) + '</dd></div>'
  ).join('') + '</dl>';
}

function diagramHtml(items = []) {
  if (!items.length) return '';
  return '<div class="help-map">' + items.map(([term, text]) =>
    '<div class="help-map-row"><span>' + esc(term) + '</span><p>' + esc(text) + '</p></div>'
  ).join('') + '</div>';
}

function sectionHtml(section) {
  return '<section class="help-doc-section" id="help-' + esc(section.id) + '" data-help-panel="' + esc(section.id) + '">' +
    '<div class="help-kicker">' + esc(section.kicker) + '</div>' +
    '<h3>' + esc(section.title) + '</h3>' +
    section.body.map(text => '<p>' + esc(text) + '</p>').join('') +
    diagramHtml(section.diagram) +
    conceptHtml(section.concepts) +
    workflowHtml(section.workflows) +
    referenceHtml(section.reference) +
  '</section>';
}

function helpHtml() {
  return '<div class="help-shell">' +
    '<nav class="help-nav" aria-label="help sections">' + navHtml() + '</nav>' +
    '<div class="help-docs">' + HELP_SECTIONS.map(sectionHtml).join('') + '</div>' +
  '</div>';
}

export function initHelp({
  documentObj = globalThis.document,
  locationObj = globalThis.location,
  historyObj = globalThis.history,
} = {}) {
  const panel = documentObj?.getElementById('helpPanel');
  const body = documentObj?.getElementById('helpBody');
  const openButtons = Array.from(documentObj?.querySelectorAll('[data-help-open]') || []);
  const legacyOpenLinks = Array.from(documentObj?.querySelectorAll('.help-fab[href], a[href$="help.html"]') || []);
  const closeButtons = Array.from(documentObj?.querySelectorAll('[data-help-close]') || []);
  if (!panel || !body || (openButtons.length === 0 && legacyOpenLinks.length === 0)) return;

  body.innerHTML = helpHtml();

  const sectionButtons = Array.from(body.querySelectorAll('[data-help-section]'));
  const sections = Array.from(body.querySelectorAll('[data-help-panel]'));

  const activate = id => {
    const target = HELP_SECTIONS.some(section => section.id === id) ? id : HELP_SECTIONS[0].id;
    sectionButtons.forEach(button => {
      const active = button.dataset.helpSection === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    sections.forEach(section => section.classList.toggle('active', section.dataset.helpPanel === target));
  };

  const setOpen = (isOpen, sectionId = '') => {
    panel.classList.toggle('visible', isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    documentObj.body?.classList.toggle('help-open', isOpen);
    openButtons.forEach(button => button.setAttribute('aria-expanded', isOpen ? 'true' : 'false'));
    legacyOpenLinks.forEach(link => link.setAttribute('aria-expanded', isOpen ? 'true' : 'false'));
    if (isOpen) {
      activate(sectionId || panel.dataset.activeHelpSection || HELP_SECTIONS[0].id);
      panel.querySelector('.help-close')?.focus?.();
    }
  };

  const updateHash = sectionId => {
    if (!historyObj || !locationObj) return;
    const url = new URL(locationObj.href);
    url.hash = 'help' + (sectionId ? '-' + sectionId : '');
    historyObj.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  const closeHelp = () => {
    setOpen(false);
    if (historyObj && locationObj && /^#help/.test(locationObj.hash || '')) {
      historyObj.replaceState(null, '', locationObj.pathname + locationObj.search);
    }
  };

  const openHelp = sectionId => {
    const target = sectionId || HELP_SECTIONS[0].id;
    panel.dataset.activeHelpSection = target;
    setOpen(true, target);
    updateHash(target);
  };

  openButtons.forEach(button => {
    button.addEventListener('click', () => openHelp(button.dataset.helpOpen || ''));
  });

  legacyOpenLinks.forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', panel.id || 'helpPanel');
    link.setAttribute('aria-expanded', 'false');
    link.addEventListener('click', event => {
      event.preventDefault();
      openHelp(link.dataset.helpOpen || HELP_SECTIONS[0].id);
    });
  });

  closeButtons.forEach(button => {
    button.addEventListener('click', closeHelp);
  });

  body.addEventListener('click', event => {
    const button = event.target.closest('[data-help-section]');
    if (!button) return;
    const sectionId = button.dataset.helpSection;
    panel.dataset.activeHelpSection = sectionId;
    activate(sectionId);
    updateHash(sectionId);
  });

  panel.addEventListener('click', event => {
    if (event.target === panel) closeHelp();
  });

  documentObj.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !panel.classList.contains('visible')) return;
    closeHelp();
  });

  const initialHash = String(locationObj?.hash || '');
  if (initialHash.startsWith('#help')) {
    const sectionId = initialHash.replace(/^#help-?/, '') || HELP_SECTIONS[0].id;
    setOpen(true, sectionId);
  } else {
    activate(HELP_SECTIONS[0].id);
  }
}
