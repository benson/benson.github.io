#!/usr/bin/env node
import process from 'node:process';
import { writeFileSync } from 'node:fs';
import worker from '../worker/worker.js';
import { applySyncOps } from '../syncReducer.js';
import { locationKey, normalizeLocation } from '../collection.js';
import { SYSTEM_PROMPT } from '../mcpChat.js';

const DEFAULT_PROVIDER = 'cloudflare';
const DEFAULT_MODEL = '@cf/openai/gpt-oss-120b';
const USER_ID = 'eval_user';
const MCP_URL = 'https://eval.local/mcp';
const DEFAULT_MUTATION_FORBIDDEN_TEXT = [
  /\b3030\s*:\s*internal server error\b/i,
  /\binternal server error\b/i,
];

function parseArgs(argv) {
  const out = {
    limit: 10,
    all: false,
    list: false,
    verbose: false,
    final: true,
    toolMode: 'category',
    maxOutput: 350,
    maxFailures: 5,
    rateLimitRetries: 2,
    maxRetrySeconds: 20,
    caseDelayMs: 250,
    provider: DEFAULT_PROVIDER,
    surface: '',
  };
  for (const arg of argv) {
    if (arg === '--all') out.all = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--no-final') out.final = false;
    else if (arg.startsWith('--limit=')) out.limit = Math.max(1, parseInt(arg.slice(8), 10) || out.limit);
    else if (arg.startsWith('--category=')) out.category = arg.slice(11);
    else if (arg.startsWith('--id=')) out.id = arg.slice(5);
    else if (arg.startsWith('--model=')) out.model = arg.slice(8);
    else if (arg.startsWith('--provider=')) out.provider = arg.slice(11).toLowerCase();
    else if (arg.startsWith('--surface=')) out.surface = arg.slice(10).toLowerCase();
    else if (arg.startsWith('--report=')) out.report = arg.slice(9);
    else if (arg.startsWith('--tool-mode=')) out.toolMode = arg.slice(12);
    else if (arg.startsWith('--max-output=')) out.maxOutput = Math.max(64, parseInt(arg.slice(13), 10) || out.maxOutput);
    else if (arg.startsWith('--max-failures=')) out.maxFailures = Math.max(0, parseInt(arg.slice(15), 10) || 0);
    else if (arg.startsWith('--rate-limit-retries=')) out.rateLimitRetries = Math.max(0, parseInt(arg.slice(21), 10) || 0);
    else if (arg.startsWith('--max-retry-seconds=')) out.maxRetrySeconds = Math.max(1, parseInt(arg.slice(20), 10) || out.maxRetrySeconds);
    else if (arg.startsWith('--case-delay-ms=')) out.caseDelayMs = Math.max(0, parseInt(arg.slice(16), 10) || 0);
  }
  if (!['cloudflare', 'groq'].includes(out.provider)) throw new Error('--provider must be cloudflare or groq');
  if (!out.surface) out.surface = out.provider === 'cloudflare' ? 'worker-chat' : 'tool-loop';
  if (!['category', 'full'].includes(out.toolMode)) throw new Error('--tool-mode must be category or full');
  if (!['worker-chat', 'tool-loop'].includes(out.surface)) throw new Error('--surface must be worker-chat or tool-loop');
  if (out.provider !== 'cloudflare' && out.surface === 'worker-chat') {
    throw new Error('--surface=worker-chat currently supports --provider=cloudflare only');
  }
  return out;
}

function fakeKv() {
  const values = new Map();
  return {
    async put(key, value) { values.set(key, value); },
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async delete(key) { values.delete(key); },
  };
}

function emptySnapshot({ collection = [], containers = {}, history = [] } = {}) {
  return {
    app: {
      schemaVersion: 1,
      collection,
      containers,
      ui: { viewMode: 'collection', viewAsList: false, selectedFormat: '', sortField: null, sortDir: 'asc' },
    },
    history,
    shares: [],
  };
}

function fakeSyncEnv(snapshot = emptySnapshot(), revision = 1) {
  const state = { snapshot, revision };
  const env = {
    SYNC_AUTH_DISABLED: '1',
    MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION: '1',
    MCP_CHANGE_TOKEN_SECRET: 'eval-secret',
    SHARES: fakeKv(),
    OAUTH_KV: fakeKv(),
    COLLECTION_SYNC: {
      idFromName(name) { return name; },
      get() {
        return {
          async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/sync/bootstrap') {
              return Response.json({
                hasCloudData: true,
                collectionId: 'user_eval',
                revision: state.revision,
                snapshot: state.snapshot,
              });
            }
            if (url.pathname === '/sync/push') {
              const body = await request.json();
              if (body.requireBaseRevision === true && body.baseRevision !== state.revision) {
                return Response.json({
                  error: 'revision conflict',
                  expectedRevision: body.baseRevision,
                  actualRevision: state.revision,
                }, { status: 409 });
              }
              const ops = Array.isArray(body.ops) ? body.ops : [];
              state.snapshot = applySyncOps(state.snapshot, ops);
              state.revision += ops.length;
              return Response.json({
                collectionId: 'user_eval',
                revision: state.revision,
                snapshot: state.snapshot,
                acceptedOpIds: ops.map(op => op.id),
              });
            }
            return Response.json({ error: 'not found' }, { status: 404 });
          },
        };
      },
    },
  };
  return { env, state };
}

function loc(type, name) {
  return { type, name };
}

function seedCard(overrides = {}) {
  const name = overrides.name || 'Sol Ring';
  return {
    name,
    resolvedName: name,
    scryfallId: overrides.scryfallId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-eval',
    setCode: overrides.setCode || 'eval',
    setName: overrides.setName || 'Eval Set',
    cn: String(overrides.cn || '1'),
    finish: overrides.finish || 'normal',
    condition: overrides.condition || 'near_mint',
    language: overrides.language || 'en',
    qty: overrides.qty || 1,
    location: overrides.location === undefined ? loc('box', 'bulk') : overrides.location,
    price: overrides.price ?? 1,
    rarity: overrides.rarity || 'rare',
    typeLine: overrides.typeLine || 'Artifact',
    tags: overrides.tags || [],
    colors: overrides.colors || [],
  };
}

function evalCollection() {
  return [
    seedCard({ name: 'Mana Crypt', setCode: '2xm', cn: '270', price: 180, rarity: 'mythic', typeLine: 'Artifact', location: loc('deck', 'breya artifacts'), tags: ['cedh', 'staple'] }),
    seedCard({ name: 'The One Ring', setCode: 'ltr', cn: '451', price: 85, rarity: 'mythic', typeLine: 'Legendary Artifact', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Ancient Tomb', setCode: 'tmp', cn: '315', price: 80, rarity: 'rare', typeLine: 'Land', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Mox Opal', setCode: '2xm', cn: '275', price: 70, rarity: 'mythic', typeLine: 'Legendary Artifact', location: loc('binder', 'trade binder'), tags: ['cedh', 'staple'] }),
    seedCard({ name: 'Dockside Extortionist', setCode: 'c19', cn: '24', price: 65, rarity: 'rare', typeLine: 'Creature - Goblin Pirate', location: loc('deck', 'breya artifacts'), tags: ['cedh'] }),
    seedCard({ name: 'Demonic Tutor', setCode: 'uma', cn: '93', price: 50, rarity: 'mythic', typeLine: 'Sorcery', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Fierce Guardianship', setCode: 'c20', cn: '35', price: 45, rarity: 'rare', typeLine: 'Instant', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Force of Will', setCode: '2xm', cn: '51', price: 42, rarity: 'mythic', typeLine: 'Instant', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: "Urza's Saga", setCode: 'mh2', cn: '259', price: 45, rarity: 'rare', typeLine: 'Enchantment Land - Urza', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Rhystic Study', setCode: 'wot', cn: '25', price: 40, rarity: 'rare', typeLine: 'Enchantment', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Ragavan, Nimble Pilferer', setCode: 'mul', cn: '86', price: 38, rarity: 'mythic', typeLine: 'Legendary Creature - Monkey Pirate', finish: 'foil', location: loc('binder', 'trade binder'), tags: ['trade'] }),
    seedCard({ name: 'Cyclonic Rift', setCode: 'rtr', cn: '35', price: 33, rarity: 'rare', typeLine: 'Instant', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Enlightened Tutor', setCode: 'dmr', cn: '6', price: 30, rarity: 'rare', typeLine: 'Instant', finish: 'foil', location: loc('binder', 'trade binder'), tags: ['trade'] }),
    seedCard({ name: 'Esper Sentinel', setCode: 'mh2', cn: '12', price: 25, rarity: 'rare', typeLine: 'Artifact Creature - Human Soldier', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Flooded Strand', setCode: 'ktk', cn: '233', price: 25, rarity: 'rare', typeLine: 'Land', location: loc('binder', 'trade binder'), tags: ['land'] }),
    seedCard({ name: 'Steam Vents', setCode: 'grn', cn: '257', price: 18, rarity: 'rare', typeLine: 'Land - Island Mountain', finish: 'foil', location: loc('binder', 'trade binder'), tags: ['land'] }),
    seedCard({ name: 'Fable of the Mirror-Breaker', setCode: 'neo', cn: '141', price: 15, rarity: 'rare', typeLine: 'Enchantment - Saga', location: loc('binder', 'trade binder'), tags: ['trade'] }),
    seedCard({ name: 'Breya, Etherium Shaper', setCode: 'c16', cn: '29', price: 12, rarity: 'mythic', typeLine: 'Legendary Artifact Creature - Human', finish: 'foil', location: loc('box', 'bulk'), tags: ['commander'] }),
    seedCard({ name: 'Mystic Remora', setCode: 'ice', cn: '87', price: 8, rarity: 'uncommon', typeLine: 'Enchantment', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Skullclamp', setCode: 'sld', cn: '1112', price: 8, rarity: 'uncommon', typeLine: 'Artifact - Equipment', finish: 'foil', location: loc('box', 'bulk'), tags: ['staple'] }),
    seedCard({ name: 'Arcum Dagsson', setCode: 'csp', cn: '27', price: 7, rarity: 'rare', typeLine: 'Legendary Creature - Human Artificer', location: loc('binder', 'trade binder'), tags: ['trade'] }),
    seedCard({ name: 'Lightning Greaves', setCode: 'cmm', cn: '394', price: 6, rarity: 'uncommon', typeLine: 'Artifact - Equipment', location: loc('box', 'bulk'), tags: ['staple'] }),
    seedCard({ name: 'Darksteel Citadel', setCode: 'sld', cn: '608', price: 5.2, rarity: 'uncommon', typeLine: 'Artifact Land', finish: 'foil', location: loc('binder', 'trade binder'), tags: ['land'] }),
    seedCard({ name: 'Great Furnace', setCode: 'sld', cn: '303', price: 4.5, rarity: 'uncommon', typeLine: 'Artifact Land', finish: 'foil', location: loc('box', 'bulk'), tags: ['land'] }),
    seedCard({ name: 'Fabricate', setCode: 'sld', cn: '332', price: 4, rarity: 'uncommon', typeLine: 'Sorcery', finish: 'foil', location: loc('box', 'bulk'), tags: ['trade'] }),
    seedCard({ name: 'Chandra, Torch of Defiance', setCode: 'kld', cn: '110', price: 4, rarity: 'mythic', typeLine: 'Legendary Planeswalker - Chandra', location: loc('box', 'bulk'), tags: ['trade'] }),
    seedCard({ name: 'Talisman of Dominance', setCode: 'mrd', cn: '255', price: 3.1, qty: 4, rarity: 'uncommon', typeLine: 'Artifact', location: loc('box', 'bulk'), tags: ['mana'] }),
    seedCard({ name: 'Counterspell', setCode: '2xm', cn: '47', price: 3, qty: 4, rarity: 'common', typeLine: 'Instant', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Talisman of Progress', setCode: 'mrd', cn: '256', price: 2.75, qty: 3, rarity: 'uncommon', typeLine: 'Artifact', location: loc('box', 'bulk'), tags: ['mana'] }),
    seedCard({ name: 'Sol Ring', setCode: 'cmm', cn: '703', price: 2.5, qty: 7, rarity: 'uncommon', typeLine: 'Artifact', location: loc('box', 'bulk'), tags: ['mana', 'staple'] }),
    seedCard({ name: 'Swords to Plowshares', setCode: 'sta', cn: '10', price: 2.5, qty: 5, rarity: 'uncommon', typeLine: 'Instant', location: loc('binder', 'trade binder'), tags: ['staple'] }),
    seedCard({ name: 'Lightning Bolt', setCode: 'clu', cn: '141', price: 2.25, qty: 6, rarity: 'common', typeLine: 'Instant', location: loc('box', 'red box'), tags: ['burn'] }),
    seedCard({ name: 'Path to Exile', setCode: '2xm', cn: '25', price: 1.75, qty: 3, rarity: 'uncommon', typeLine: 'Instant', location: loc('box', 'bulk'), tags: ['staple'] }),
    seedCard({ name: 'Etherium Sculptor', setCode: 'ala', cn: '44', price: 1.5, qty: 3, rarity: 'common', typeLine: 'Artifact Creature - Vedalken Artificer', location: loc('box', 'bulk'), tags: ['artifact'] }),
    seedCard({ name: 'Arcane Signet', setCode: 'cmm', cn: '928', price: 1.25, qty: 12, rarity: 'common', typeLine: 'Artifact', location: loc('box', 'bulk'), tags: ['mana'] }),
    seedCard({ name: 'Ponder', setCode: 'lrw', cn: '79', price: 1.1, qty: 4, rarity: 'common', typeLine: 'Sorcery', location: loc('box', 'bulk'), tags: ['cantrip'] }),
    seedCard({ name: 'Prismari Charm', setCode: 'sos', cn: '211', price: 0.53, rarity: 'uncommon', typeLine: 'Instant', finish: 'foil', location: loc('box', 'bulk'), tags: ['trade'] }),
    seedCard({ name: 'Command Tower', setCode: 'cmm', cn: '700', price: 0.5, qty: 10, rarity: 'common', typeLine: 'Land', location: loc('box', 'bulk'), tags: ['land'] }),
    seedCard({ name: 'Petrified Hamlet', setCode: 'sos', cn: '362', price: 0.4, rarity: 'rare', typeLine: 'Land', location: loc('box', 'bulk'), tags: ['land'] }),
    seedCard({ name: 'Ornithopter', setCode: 'm15', cn: '224', price: 0.2, qty: 8, rarity: 'common', typeLine: 'Artifact Creature - Thopter', location: loc('box', 'bulk'), tags: ['artifact'] }),
    seedCard({ name: 'Glint-Nest Crane', setCode: 'kld', cn: '50', price: 0.14, rarity: 'uncommon', typeLine: 'Creature - Bird', location: loc('box', 'bulk'), tags: ['bulk'] }),
    seedCard({ name: 'Island', setCode: 'neo', cn: '296', price: 0.05, qty: 30, rarity: 'common', typeLine: 'Basic Land - Island', location: loc('box', 'bulk'), tags: ['land'] }),
  ];
}

function evalContainers() {
  return {
    'binder:trade binder': { type: 'binder', name: 'trade binder' },
    'binder:foils binder': { type: 'binder', name: 'foils binder' },
    'box:bulk': { type: 'box', name: 'bulk' },
    'box:red box': { type: 'box', name: 'red box' },
    'deck:breya artifacts': {
      type: 'deck',
      name: 'breya artifacts',
      deck: { title: 'Breya Artifacts', format: 'commander' },
      deckList: [
        { name: 'Breya, Etherium Shaper', qty: 1, board: 'commander' },
        { name: 'Mana Crypt', qty: 1, board: 'main' },
        { name: 'Dockside Extortionist', qty: 1, board: 'main' },
      ],
    },
  };
}

function buildSnapshot() {
  return emptySnapshot({ collection: evalCollection(), containers: evalContainers() });
}

function normalizeFinish(value) {
  const raw = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'nonfoil' || raw === 'non_foil') return 'normal';
  return raw || 'normal';
}

function matchesFilter(card, filter = {}) {
  if (filter.finish && normalizeFinish(card.finish) !== normalizeFinish(filter.finish)) return false;
  if (filter.condition && card.condition !== filter.condition) return false;
  if (filter.rarity && card.rarity !== filter.rarity) return false;
  if (filter.cardType && !String(card.typeLine || '').toLowerCase().includes(String(filter.cardType).toLowerCase())) return false;
  if (filter.location && locationKey(card.location) !== locationKey(filter.location)) return false;
  if (filter.minPrice != null && Number(card.price) < filter.minPrice) return false;
  if (filter.maxPrice != null && Number(card.price) > filter.maxPrice) return false;
  if (filter.minQty != null && Number(card.qty) < filter.minQty) return false;
  if (filter.maxQty != null && Number(card.qty) > filter.maxQty) return false;
  if (filter.minTotalValue != null && Number(card.price) * Number(card.qty) < filter.minTotalValue) return false;
  if (filter.maxTotalValue != null && Number(card.price) * Number(card.qty) > filter.maxTotalValue) return false;
  if (filter.tags?.length) {
    const tags = new Set((card.tags || []).map(String));
    if (!filter.tags.every(tag => tags.has(tag))) return false;
  }
  return true;
}

function expectedCards(filter = {}, sort = {}, limit = 20) {
  const cards = evalCollection().filter(card => matchesFilter(card, filter));
  const by = sort.by || 'name';
  const dir = sort.dir === 'asc' ? 1 : -1;
  cards.sort((a, b) => {
    if (by === 'price') return dir * (Number(a.price) - Number(b.price)) || a.name.localeCompare(b.name);
    if (by === 'qty') return dir * (Number(a.qty) - Number(b.qty)) || a.name.localeCompare(b.name);
    if (by === 'totalValue') return dir * ((Number(a.price) * Number(a.qty)) - (Number(b.price) * Number(b.qty))) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  return cards.slice(0, limit).map(card => card.name);
}

function readCase(id, prompt, filter, sort = { by: 'name', dir: 'asc' }, options = {}) {
  return {
    id,
    category: options.category || 'read',
    prompt,
    expect: {
      kind: 'cards',
      anyTool: options.anyTool || ['search_inventory', 'get_container'],
      filter,
      expectedNames: expectedCards(filter, sort, options.limit || 20),
      firstName: options.firstName || null,
      sort,
      minResults: options.minResults ?? 1,
    },
  };
}

function collectionStatsCase(id, prompt, options = {}) {
  const collection = evalCollection();
  return {
    id,
    category: options.category || 'read',
    prompt,
    expect: {
      kind: 'collectionStats',
      anyTool: options.anyTool || ['get_collection_summary'],
      uniqueCards: collection.length,
      totalCards: collection.reduce((sum, card) => sum + (parseInt(card.qty, 10) || 0), 0),
      totalValue: Math.round(collection.reduce((sum, card) => sum + Number(card.price || 0) * Number(card.qty || 0), 0) * 100) / 100,
      noCards: options.noCards ?? true,
      requiredText: options.requiredText || [],
    },
  };
}

function countCase(id, prompt, location) {
  const key = locationKey(location);
  const cards = evalCollection().filter(card => locationKey(card.location) === key);
  return {
    id,
    category: 'container',
    prompt,
    expect: {
      kind: 'containerStats',
      anyTool: ['list_containers', 'get_container'],
      location,
      total: cards.reduce((sum, card) => sum + Number(card.qty || 0), 0),
      unique: cards.length,
    },
  };
}

function valueCase(id, prompt, location) {
  const key = locationKey(location);
  const cards = evalCollection().filter(card => locationKey(card.location) === key);
  return {
    id,
    category: 'container',
    prompt,
    expect: {
      kind: 'containerStats',
      anyTool: ['list_containers', 'get_container'],
      location,
      value: Math.round(cards.reduce((sum, card) => sum + Number(card.price || 0) * Number(card.qty || 0), 0) * 100) / 100,
    },
  };
}

function mutationCase(id, prompt, options = {}) {
  return {
    id,
    category: options.category || 'mutation',
    prompt,
    expect: {
      kind: 'mutation',
      anyTool: options.anyTool || [
        'search_card_printings',
        'preview_add_inventory_item',
        'preview_move_inventory_item',
        'preview_edit_inventory_item',
        'preview_delete_inventory_item',
        'preview_duplicate_inventory_item',
        'preview_replace_inventory_printing',
        'preview_decklist_change',
      ],
      statuses: options.statuses || [],
      requireStatus: !!options.requireStatus,
      requirePreview: !!options.requirePreview,
      requireDraft: !!options.requireDraft,
      previews: options.previews || [],
      forbiddenText: [...DEFAULT_MUTATION_FORBIDDEN_TEXT, ...(options.forbiddenText || [])],
      requiredText: options.requiredText || [],
      noTools: ['apply_collection_change', 'undo_last_mcp_change'],
    },
  };
}

function buildCases() {
  const trade = loc('binder', 'trade binder');
  const bulk = loc('box', 'bulk');
  const red = loc('box', 'red box');
  const deck = loc('deck', 'breya artifacts');
  const existingEditFailureText = [
    /matching real magic card.*add request/i,
    /finish.*(?:can't|cannot|can not).*changed in-place/i,
    /do you have a foil version/i,
  ];
  const cases = [
    collectionStatsCase('count-collection-unique', 'how many unique cards in my collection', {
      requiredText: [/unique/i],
    }),
    collectionStatsCase('count-collection-total', 'how many total cards do i own?', {
      requiredText: [/total/i],
    }),
    collectionStatsCase('value-collection', 'what is my collection worth?', {
      requiredText: [/\$/],
    }),
    readCase('rank-most-expensive', "what's the most expensive card in my collection?", {}, { by: 'price', dir: 'desc' }, { anyTool: ['search_inventory', 'get_container', 'get_collection_summary'], firstName: 'Mana Crypt', limit: 1 }),
    readCase('rank-cheapest', "what's my cheapest card?", {}, { by: 'price', dir: 'asc' }, { firstName: 'Island', limit: 1 }),
    readCase('rank-most-valuable-stack', 'which card stack is worth the most total money?', {}, { by: 'totalValue', dir: 'desc' }, { anyTool: ['search_inventory', 'get_container', 'get_collection_summary'], firstName: 'Mana Crypt', limit: 1 }),
    readCase('rank-most-copies', 'what card do i have the most copies of?', {}, { by: 'qty', dir: 'desc' }, { firstName: 'Island', limit: 1 }),
    readCase('rank-trade-most-expensive', "what's the most expensive card in the trade binder?", { location: trade }, { by: 'price', dir: 'desc' }, { firstName: 'The One Ring', limit: 1 }),
    readCase('rank-trade-cheapest', "what's the cheapest one in my trade binder?", { location: trade }, { by: 'price', dir: 'asc' }, { firstName: 'Swords to Plowshares', limit: 1 }),
    readCase('rank-bulk-most-expensive', "what's the most expensive card in bulk?", { location: bulk }, { by: 'price', dir: 'desc' }, { firstName: 'Breya, Etherium Shaper', limit: 1 }),
    readCase('rank-bulk-cheapest', 'cheapest card in my bulk box', { location: bulk }, { by: 'price', dir: 'asc' }, { firstName: 'Island', limit: 1 }),
    readCase('rank-deck-most-expensive', "what's the priciest card in breya artifacts?", { location: deck }, { by: 'price', dir: 'desc' }, { firstName: 'Mana Crypt', limit: 1 }),
    readCase('rank-foil-most-expensive', 'most expensive foil in my collection', { finish: 'foil' }, { by: 'price', dir: 'desc' }, { firstName: 'Ragavan, Nimble Pilferer', limit: 1 }),
    readCase('rank-nonfoil-cheapest', 'cheapest nonfoil card i own', { finish: 'normal' }, { by: 'price', dir: 'asc' }, { firstName: 'Island', limit: 1 }),
    readCase('filter-foils', 'what foils do i have?', { finish: 'foil' }, { by: 'name', dir: 'asc' }),
    readCase('filter-nonfoils', 'show me my nonfoils', { finish: 'normal' }, { by: 'name', dir: 'asc' }),
    readCase('filter-foil-trade', 'foil cards in the trade binder', { finish: 'foil', location: trade }, { by: 'name', dir: 'asc' }),
    readCase('filter-foil-bulk', 'foil cards in bulk', { finish: 'foil', location: bulk }, { by: 'name', dir: 'asc' }),
    readCase('filter-over-2', 'cards worth more than $2', { minPrice: 2 }, { by: 'price', dir: 'desc' }),
    readCase('filter-under-1', 'cards under a dollar', { maxPrice: 1 }, { by: 'price', dir: 'asc' }),
    readCase('filter-over-20', 'show cards valued over $20', { minPrice: 20 }, { by: 'price', dir: 'desc' }),
    readCase('filter-foil-over-5', 'foils worth at least $5', { finish: 'foil', minPrice: 5 }, { by: 'price', dir: 'desc' }),
    readCase('filter-trade-over-25', 'cards over $25 in trade binder', { location: trade, minPrice: 25 }, { by: 'price', dir: 'desc' }),
    readCase('filter-bulk-under-1', 'bulk cards under $1', { location: bulk, maxPrice: 1 }, { by: 'price', dir: 'asc' }),
    readCase('filter-many-copies', 'cards where i have lots of copies', { minQty: 2 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-many-worth-2', 'cards i have 4 or more copies of that are worth more than $2', { minQty: 4, minPrice: 2 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-many-under-1', 'cards i have at least 8 copies of under $1', { minQty: 8, maxPrice: 1 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-stack-value-over-10', 'stacks worth more than $10 total', { minTotalValue: 10 }, { by: 'totalValue', dir: 'desc' }),
    readCase('filter-instants', 'what instants do i have?', { cardType: 'instant' }, { by: 'name', dir: 'asc' }),
    readCase('filter-instants-trade', 'instants in my trade binder', { cardType: 'instant', location: trade }, { by: 'name', dir: 'asc' }),
    readCase('filter-instants-over-2', 'instants over $2', { cardType: 'instant', minPrice: 2 }, { by: 'price', dir: 'desc' }),
    readCase('filter-artifacts', 'show my artifacts', { cardType: 'artifact' }, { by: 'name', dir: 'asc' }),
    readCase('filter-artifacts-bulk', 'artifacts in bulk', { cardType: 'artifact', location: bulk }, { by: 'name', dir: 'asc' }),
    readCase('filter-artifacts-many', 'artifacts where i have at least 3 copies', { cardType: 'artifact', minQty: 3 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-lands', 'what lands do i own?', { cardType: 'land' }, { by: 'name', dir: 'asc' }),
    readCase('filter-lands-trade', 'lands in the trade binder', { cardType: 'land', location: trade }, { by: 'name', dir: 'asc' }),
    readCase('filter-creatures', 'show creatures', { cardType: 'creature' }, { by: 'name', dir: 'asc' }),
    readCase('filter-enchantments', 'show enchantments', { cardType: 'enchantment' }, { by: 'name', dir: 'asc' }),
    readCase('filter-sorceries', 'what sorceries do i have?', { cardType: 'sorcery' }, { by: 'name', dir: 'asc' }),
    readCase('filter-planeswalkers', 'planeswalkers in my collection', { cardType: 'planeswalker' }, { by: 'name', dir: 'asc' }),
    readCase('filter-rares', 'show rares', { rarity: 'rare' }, { by: 'name', dir: 'asc' }),
    readCase('filter-mythics', 'show mythic rares', { rarity: 'mythic' }, { by: 'name', dir: 'asc' }),
    readCase('filter-commons-many', 'commons with multiple copies', { rarity: 'common', minQty: 2 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-uncommons-foil', 'foil uncommons', { rarity: 'uncommon', finish: 'foil' }, { by: 'name', dir: 'asc' }),
    readCase('filter-staple-tag', 'cards tagged staple', { tags: ['staple'] }, { by: 'name', dir: 'asc' }),
    readCase('filter-mana-tag', 'mana tagged cards with many copies', { tags: ['mana'], minQty: 3 }, { by: 'qty', dir: 'desc' }),
    readCase('filter-nm-foil', 'near mint foils', { condition: 'near_mint', finish: 'foil' }, { by: 'name', dir: 'asc' }),
    readCase('combo-foil-instant-trade-over-20', 'foil instants in trade binder worth more than $20', { finish: 'foil', cardType: 'instant', location: trade, minPrice: 20 }, { by: 'price', dir: 'desc' }),
    readCase('combo-bulk-artifacts-over-2', 'bulk artifacts over $2', { cardType: 'artifact', location: bulk, minPrice: 2 }, { by: 'price', dir: 'desc' }),
    readCase('combo-cheap-bulk-artifacts', 'cheap bulk artifacts under $2', { cardType: 'artifact', location: bulk, maxPrice: 2 }, { by: 'price', dir: 'asc' }),
    readCase('combo-trade-rares-over-30', 'rare cards over $30 in my trade binder', { rarity: 'rare', location: trade, minPrice: 30 }, { by: 'price', dir: 'desc' }),
    readCase('combo-mythic-trade', 'mythics in the trade binder', { rarity: 'mythic', location: trade }, { by: 'price', dir: 'desc' }),
    readCase('combo-red-box', 'what is in my red box?', { location: red }, { by: 'name', dir: 'asc' }),
    countCase('count-trade', 'how many cards in my trade binder?', trade),
    countCase('count-bulk', 'how many cards are in bulk?', bulk),
    countCase('count-red-box', 'how many cards in the red box?', red),
    countCase('count-deck-physical', 'how many physical cards are in breya artifacts?', deck),
    valueCase('value-trade', 'what is my trade binder worth?', trade),
    valueCase('value-bulk', 'how much value is in bulk?', bulk),
    valueCase('value-deck', 'what is the breya artifacts deck worth?', deck),
    mutationCase('add-misspelled-rhystic', 'add a nm nonfoil rhystc study to my trade binder', { statuses: ['needs_input', 'preview'] }),
    mutationCase('add-misspelled-ragavan', 'add a foill ragavvan to trade binder', { statuses: ['needs_input', 'preview'] }),
    mutationCase('add-missing-details', 'add petrified hamlet to my collection', { statuses: ['needs_input'] }),
    mutationCase('add-exact-existing-container', 'add a nm nonfoil sol ring cmm 703 to bulk', { statuses: ['preview'] }),
    mutationCase('add-foil-existing-container', 'add a foil enlightened tutor dmr 6 to trade binder', { statuses: ['preview', 'needs_input'] }),
    mutationCase('add-missing-binder-no-create', 'add a nm nonfoil sol ring cmm 703 to staples binder', { statuses: ['missing_container', 'needs_input'] }),
    mutationCase('add-new-binder-explicit', 'create a new binder called staples and add a nm nonfoil sol ring cmm 703 there', { statuses: ['preview'] }),
    mutationCase('add-three-to-missing-binder', 'add sol ring, counterspell, and ponder to a new binder called testing binder', { statuses: ['preview', 'needs_input'] }),
    mutationCase('add-three-to-existing-binder', 'add one sol ring, one counterspell, and one ponder to trade binder', { statuses: ['preview', 'needs_input'] }),
    mutationCase('add-ambiguous-printing', 'add a foil lightning bolt to my red box', { statuses: ['needs_input', 'preview'] }),
    mutationCase('add-regular-printing-style', 'add a nm emeritus of conflict, the regular printing', {
      statuses: ['needs_input', 'preview'],
      requireStatus: true,
    }),
    mutationCase('add-two-exact-existing-container', 'add two near mint nonfoil sol ring cmm 703 to bulk', {
      anyTool: ['preview_add_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.add', name: 'Sol Ring', finish: 'normal', location: bulk, minQty: 2 }],
    }),
    mutationCase('add-two-foil-exact-existing-container', 'add 2 nm foil enlightened tutor dmr 6 to trade binder', {
      anyTool: ['preview_add_inventory_item'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
    }),
    mutationCase('add-misspelled-exact-printing', 'add a near mint nonfoil glint nest crain kld 50 to trade binder', {
      anyTool: ['search_card_printings', 'preview_add_inventory_item'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
    }),
    mutationCase('add-multiple-specific-existing-container', 'add a sol ring cmm 703, a counterspell 2xm 47, and a ponder lrw 79 to trade binder', {
      anyTool: ['preview_add_inventory_item'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('add-multiple-specific-new-container', 'make a new box called event kit and add a sol ring cmm 703 and a ponder lrw 79 there', {
      anyTool: ['preview_add_inventory_item', 'preview_create_container'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('add-multiple-slightly-off-names', 'add a sol rong cmm 703 and counterspel 2xm 47 to trade binder', {
      anyTool: ['search_card_printings', 'preview_add_inventory_item'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
    }),
    mutationCase('move-ragavan-to-bulk', 'move ragavan from trade binder to bulk', { anyTool: ['preview_move_inventory_item'], statuses: ['preview'] }),
    mutationCase('move-sol-ring-to-trade', 'move a sol ring to trade binder', { anyTool: ['preview_move_inventory_item'], statuses: ['preview', 'ambiguous'] }),
    mutationCase('move-missing-container', 'move ancient tomb to premium trades binder', { anyTool: ['preview_move_inventory_item'], statuses: ['missing_container'] }),
    mutationCase('move-create-container-explicit', 'move ancient tomb to a new binder called premium trades', { anyTool: ['preview_move_inventory_item'], statuses: ['preview'] }),
    mutationCase('move-many-copies', 'move four lightning bolts to trade binder', { anyTool: ['preview_move_inventory_item'], statuses: ['preview'] }),
    mutationCase('move-source-natural-language', 'take ragavan out of the trade binder and put it in bulk', {
      anyTool: ['preview_move_inventory_item', 'preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('move-source-destination-known-container', 'move glint nest crane from bulk to trade binder', {
      anyTool: ['preview_move_inventory_item', 'preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('move-without-destination-followup', 'take glint nest crane out of bulk', {
      anyTool: ['preview_move_inventory_item'],
      statuses: ['invalid', 'needs_input'],
      requireStatus: true,
      forbiddenText: [/preview ready/i],
    }),
    mutationCase('move-stack-quantity-natural', 'move three of my lightning bolts from red box to trade binder', {
      anyTool: ['preview_move_inventory_item', 'preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('edit-move-finish-glint', 'move my glint nest crane into my trade binder and update it to be foil', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Glint-Nest Crane', finish: 'foil', location: trade }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-move-finish-natural', 'move glint nest crane to trade binder and make it foil', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Glint-Nest Crane', finish: 'foil', location: trade }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-finish-only-existing-card', 'make my glint nest crane foil', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Glint-Nest Crane', finish: 'foil' }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-source-finish-and-location', 'move the nonfoil glint nest crane from bulk to trade binder and make it foil', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Glint-Nest Crane', finish: 'foil', location: trade }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-condition-and-move', 'move chandra torch of defiance to trade binder and mark it lightly played', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Chandra, Torch of Defiance', condition: 'lightly_played', location: trade }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-condition-only', 'mark my fabricate as moderately played', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Fabricate', condition: 'moderately_played' }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-language-and-condition', 'set my bulk fabricate to japanese and lightly played', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Fabricate', condition: 'lightly_played', language: 'ja' }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-tag-and-move', 'move chandra to trade binder and tag it planeswalker trade', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Chandra, Torch of Defiance', location: trade }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-quantity-split-condition', 'mark two talisman of dominance from bulk as lightly played', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Talisman of Dominance', condition: 'lightly_played', minQty: 2 }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('edit-multiple-fields-no-move', 'make my prismari charm nonfoil, japanese, and lightly played', {
      anyTool: ['preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Prismari Charm', finish: 'normal', condition: 'lightly_played', language: 'ja' }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('delete-card-entirely', 'remove the great furnace from my collection entirely', {
      anyTool: ['preview_delete_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.delete', name: 'Great Furnace' }],
    }),
    mutationCase('add-another-same-style', 'add another force of will same style to my collection i have 2 of them now', {
      anyTool: ['preview_duplicate_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.add', name: 'Force of Will', minQty: 1 }],
    }),
    mutationCase('swap-printing-secret-lair', 'change the printing on my cyclonic rift, i swapped it to a secret lair foil one', {
      anyTool: ['preview_replace_inventory_printing'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
      requirePreview: true,
      previews: [{ previewType: 'inventory.edit', name: 'Cyclonic Rift', setCode: 'sld', finish: 'foil' }],
      forbiddenText: existingEditFailureText,
    }),
    mutationCase('decklist-add-ambiguous', 'put counterspell in my breya deck', { category: 'deck-disambiguation', statuses: ['needs_input', 'preview', 'ambiguous'] }),
    mutationCase('decklist-add-specific', 'add counterspell to the breya artifacts decklist', { category: 'deck-disambiguation', anyTool: ['preview_decklist_change', 'search_card_printings'], statuses: ['preview', 'needs_input'] }),
    mutationCase('physical-move-to-deck', 'move my physical mana crypt into the breya artifacts deck box', { category: 'deck-disambiguation', anyTool: ['preview_move_inventory_item'], statuses: ['preview'] }),
    mutationCase('decklist-vs-physical-natural', 'put my trade binder counterspell into the breya deck box, not just the decklist', {
      category: 'deck-disambiguation',
      anyTool: ['preview_move_inventory_item', 'preview_edit_inventory_item'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('decklist-explicit-card-add', 'add counterspell to the breya artifacts decklist but do not move my physical copy', {
      category: 'deck-disambiguation',
      anyTool: ['preview_decklist_change', 'search_card_printings'],
      statuses: ['preview', 'needs_input'],
      requireStatus: true,
    }),
    mutationCase('rename-container', 'rename my red box to burn box', { category: 'mutation', anyTool: ['preview_rename_container'], statuses: ['preview'] }),
    mutationCase('delete-nonempty-box', 'delete my red box', { category: 'mutation', anyTool: ['preview_delete_container'], statuses: ['preview', 'needs_confirmation'] }),
    mutationCase('create-container', 'make a binder called maybe trades', { category: 'mutation', anyTool: ['preview_create_container'], statuses: ['preview'] }),
    mutationCase('create-box-natural-language', 'make me a box called prize support', {
      category: 'mutation',
      anyTool: ['preview_create_container'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('create-deck-container-natural-language', 'create a commander deck box called atraxa poison', {
      category: 'mutation',
      anyTool: ['preview_create_container'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('rename-binder-natural-language', 'change the foils binder name to shiny trades', {
      category: 'mutation',
      anyTool: ['preview_rename_container'],
      statuses: ['preview'],
      requireStatus: true,
      requirePreview: true,
    }),
    mutationCase('delete-empty-binder-natural-language', 'remove the foils binder container', {
      category: 'mutation',
      anyTool: ['preview_delete_container'],
      statuses: ['preview', 'needs_confirmation'],
      requireStatus: true,
    }),
  ];

  const variations = [
    ['nl-price-001', 'find cards above $10 in the trade binder', { location: trade, minPrice: 10 }, { by: 'price', dir: 'desc' }],
    ['nl-price-002', 'which foils are cheap under $5?', { finish: 'foil', maxPrice: 5 }, { by: 'price', dir: 'asc' }],
    ['nl-price-003', 'cards in bulk that are at least $4', { location: bulk, minPrice: 4 }, { by: 'price', dir: 'desc' }],
    ['nl-price-004', 'what cards do i have 5 or more of?', { minQty: 5 }, { by: 'qty', dir: 'desc' }],
    ['nl-price-005', 'trade binder instants sorted by price', { location: trade, cardType: 'instant' }, { by: 'price', dir: 'desc' }],
    ['nl-price-006', 'bulk cards with the highest total value', { location: bulk }, { by: 'totalValue', dir: 'desc' }],
    ['nl-price-007', 'nonfoil rares worth over 20', { finish: 'normal', rarity: 'rare', minPrice: 20 }, { by: 'price', dir: 'desc' }],
    ['nl-price-008', 'foil lands', { finish: 'foil', cardType: 'land' }, { by: 'name', dir: 'asc' }],
    ['nl-price-009', 'artifact creatures under 2 dollars', { cardType: 'creature', maxPrice: 2 }, { by: 'price', dir: 'asc' }],
    ['nl-price-010', 'cards tagged land in trade binder', { tags: ['land'], location: trade }, { by: 'name', dir: 'asc' }],
    ['nl-price-011', 'mana rocks with 3 or more copies', { tags: ['mana'], minQty: 3 }, { by: 'qty', dir: 'desc' }],
    ['nl-price-012', 'valuable enchantments', { cardType: 'enchantment', minPrice: 5 }, { by: 'price', dir: 'desc' }],
    ['nl-price-013', 'bulk commons with lots of copies', { location: bulk, rarity: 'common', minQty: 2 }, { by: 'qty', dir: 'desc' }],
    ['nl-price-014', 'trade binder staples over $30', { location: trade, tags: ['staple'], minPrice: 30 }, { by: 'price', dir: 'desc' }],
    ['nl-price-015', 'cards worth less than 50 cents', { maxPrice: 0.5 }, { by: 'price', dir: 'asc' }],
    ['nl-price-016', 'my most expensive common', { rarity: 'common' }, { by: 'price', dir: 'desc' }],
    ['nl-price-017', 'my cheapest rare', { rarity: 'rare' }, { by: 'price', dir: 'asc' }],
    ['nl-price-018', 'my biggest stacks in bulk', { location: bulk, minQty: 2 }, { by: 'qty', dir: 'desc' }],
    ['nl-price-019', 'cards with a stack value over $15', { minTotalValue: 15 }, { by: 'totalValue', dir: 'desc' }],
    ['nl-price-020', 'foils in trade binder by price', { finish: 'foil', location: trade }, { by: 'price', dir: 'desc' }],
    ['nl-price-021', 'bulk mana cards over a dollar', { location: bulk, tags: ['mana'], minPrice: 1 }, { by: 'price', dir: 'desc' }],
    ['nl-price-022', 'cheap lands under a dollar', { cardType: 'land', maxPrice: 1 }, { by: 'price', dir: 'asc' }],
    ['nl-price-023', 'instants where i have more than 3 copies', { cardType: 'instant', minQty: 4 }, { by: 'qty', dir: 'desc' }],
    ['nl-price-024', 'my top priced artifacts', { cardType: 'artifact' }, { by: 'price', dir: 'desc' }],
    ['nl-price-025', 'my low value bulk stuff', { location: bulk, maxPrice: 1 }, { by: 'price', dir: 'asc' }],
  ];
  for (const [id, prompt, filter, sort] of variations) cases.push(readCase(id, prompt, filter, sort));

  return cases;
}

async function issueMcpToken(env) {
  const register = await worker.fetch(new Request('https://eval.local/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Eval Client',
      redirect_uris: ['https://client.example/callback'],
    }),
  }), env);
  if (register.status !== 201) throw new Error('registration failed: ' + await register.text());
  const client = await register.json();
  const authorize = await worker.fetch(new Request(
    'https://eval.local/authorize?response_type=code'
      + '&client_id=' + encodeURIComponent(client.client_id)
      + '&redirect_uri=' + encodeURIComponent('https://client.example/callback')
      + '&scope=' + encodeURIComponent('collection.read collection.write')
      + '&state=abc'
      + '&debugUser=' + encodeURIComponent(USER_ID)
  ), env);
  if (authorize.status !== 302) throw new Error('authorize failed: ' + await authorize.text());
  const code = new URL(authorize.headers.get('Location')).searchParams.get('code');
  const token = await worker.fetch(new Request('https://eval.local/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: client.client_id,
      redirect_uri: 'https://client.example/callback',
    }),
  }), env);
  if (token.status !== 200) throw new Error('token failed: ' + await token.text());
  return token.json();
}

let rpcId = 1;
async function rpc(env, accessToken, method, params = {}) {
  const res = await worker.fetch(new Request(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  }), env);
  if (res.status !== 200) throw new Error('mcp rpc failed: ' + res.status + ' ' + await res.text());
  const data = await res.json();
  if (data.error) throw new Error('mcp rpc error: ' + data.error.message);
  return data.result;
}

async function callTool(env, accessToken, name, args = {}) {
  return rpc(env, accessToken, 'tools/call', { name, arguments: args });
}

async function toolDefinitions(env, accessToken) {
  const listed = await rpc(env, accessToken, 'tools/list');
  return (listed.tools || [])
    .filter(tool => !['apply_collection_change', 'undo_last_mcp_change'].includes(tool.name))
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
}

function toolsForCase(allTools, testCase, toolMode = 'category') {
  if (toolMode === 'full') return allTools;
  const namesByCategory = {
    read: ['search_inventory', 'list_containers', 'get_container', 'get_deck'],
    container: ['list_containers', 'get_container', 'search_inventory'],
    mutation: [
      'search_card_printings',
      'search_inventory',
      'list_containers',
      'get_container',
      'preview_add_inventory_item',
      'preview_move_inventory_item',
      'preview_edit_inventory_item',
      'preview_delete_inventory_item',
      'preview_duplicate_inventory_item',
      'preview_replace_inventory_printing',
      'preview_create_container',
      'preview_rename_container',
      'preview_delete_container',
      'preview_decklist_change',
    ],
    'deck-disambiguation': [
      'search_card_printings',
      'search_inventory',
      'list_containers',
      'get_container',
      'get_deck',
      'preview_add_inventory_item',
      'preview_move_inventory_item',
      'preview_edit_inventory_item',
      'preview_delete_inventory_item',
      'preview_duplicate_inventory_item',
      'preview_replace_inventory_printing',
      'preview_decklist_change',
    ],
  };
  const allowed = new Set(namesByCategory[testCase.category] || namesByCategory.read);
  for (const name of testCase.expect?.anyTool || []) allowed.add(name);
  return allTools.filter(tool => allowed.has(tool.function?.name));
}

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.MTGCOLLECTION_CHAT_GROQ_API_KEY || '';
}

function cloudflareCredentials() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN || '',
  };
}

async function callGroq({ apiKey, model, messages, tools, maxOutput, rateLimitRetries, maxRetrySeconds }) {
  let lastMessage = '';
  for (let attempt = 0; attempt <= rateLimitRetries; attempt += 1) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0,
        max_completion_tokens: maxOutput,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ...(data.choices?.[0]?.message || { role: 'assistant', content: '' }), usage: data.usage || null };
    lastMessage = data?.error?.message || JSON.stringify(data) || ('groq failed: ' + res.status);
    if (/request too large/i.test(lastMessage)) throw new Error(lastMessage);
    if (/\b(?:TPD|tokens per day)\b/i.test(lastMessage)) throw new Error(lastMessage);
    if (res.status !== 429) throw new Error(lastMessage);
    if (attempt >= rateLimitRetries) break;
    const parsedRetrySeconds = Number(String(lastMessage).match(/try again in ([0-9.]+)s/i)?.[1]);
    if (!Number.isFinite(parsedRetrySeconds)) throw new Error(lastMessage);
    const retrySeconds = Math.min(parsedRetrySeconds, maxRetrySeconds);
    console.log('  rate limited; retrying in ' + retrySeconds + 's');
    await new Promise(resolve => setTimeout(resolve, Math.ceil(retrySeconds * 1000) + 750));
  }
  throw new Error(lastMessage || 'Groq rate limit retry budget exhausted');
}

function cloudflareCompatibleSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'string' };
  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
    ? schema.anyOf
    : null;
  if (variants) {
    const nonNull = variants.filter(variant => variant?.type !== 'null');
    const preferred = nonNull.find(variant => variant?.type === 'boolean')
      || nonNull.find(variant => variant?.type === 'number' || variant?.type === 'integer')
      || nonNull.find(variant => variant?.type === 'string')
      || nonNull.find(variant => variant?.type === 'object')
      || nonNull[0];
    return cloudflareCompatibleSchema(preferred || { type: 'string' });
  }
  const out = { ...schema };
  if (Array.isArray(out.type)) out.type = out.type.filter(type => type !== 'null')[0] || 'string';
  delete out.oneOf;
  delete out.anyOf;
  if (out.type === 'object') {
    const properties = {};
    for (const [name, propSchema] of Object.entries(out.properties || {})) {
      properties[name] = cloudflareCompatibleSchema(propSchema);
    }
    out.properties = properties;
  }
  if (out.type === 'array') out.items = cloudflareCompatibleSchema(out.items || { type: 'string' });
  return out;
}

function cloudflareTools(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.function?.name,
      description: tool.function?.description || '',
      parameters: cloudflareCompatibleSchema(tool.function?.parameters || { type: 'object', properties: {} }),
    },
  })).filter(tool => tool.function.name);
}

function cloudflareRunUrl(accountId, model) {
  return 'https://api.cloudflare.com/client/v4/accounts/'
    + encodeURIComponent(accountId)
    + '/ai/run/'
    + String(model || '').replace(/^\/+/, '');
}

function normalizeCloudflareAssistant(data) {
  const result = data?.result && typeof data.result === 'object' ? data.result : data;
  const message = result?.choices?.[0]?.message || result;
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : Array.isArray(result?.tool_calls)
    ? result.tool_calls
    : [];
  return {
    role: 'assistant',
    content: message?.content || result?.response || result?.output_text || '',
    usage: result?.usage || message?.usage || null,
    tool_calls: calls.map((call, index) => ({
      id: String(call.id || 'cf_tool_' + index),
      type: 'function',
      function: {
        name: String(call.name || call.function?.name || ''),
        arguments: typeof call.arguments === 'string'
          ? call.arguments
          : JSON.stringify(call.arguments || call.function?.arguments || {}),
      },
    })).filter(call => call.function.name),
  };
}

async function callCloudflareRaw({ accountId, apiToken, model, messages, tools, maxOutput, rateLimitRetries, maxRetrySeconds }) {
  let lastMessage = '';
  for (let attempt = 0; attempt <= rateLimitRetries; attempt += 1) {
    const res = await fetch(cloudflareRunUrl(accountId, model), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        tools,
        temperature: 0,
        max_tokens: maxOutput,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success !== false) return data;
    const error = data?.errors?.[0] || data?.error || data;
    lastMessage = error?.message || JSON.stringify(data) || ('cloudflare failed: ' + res.status);
    if (res.status !== 429) throw new Error(lastMessage);
    if (attempt >= rateLimitRetries) break;
    const retrySeconds = Math.min(maxRetrySeconds, 5 * (attempt + 1));
    console.log('  rate limited; retrying in ' + retrySeconds + 's');
    await new Promise(resolve => setTimeout(resolve, Math.ceil(retrySeconds * 1000) + 750));
  }
  throw new Error(lastMessage || 'Cloudflare rate limit retry budget exhausted');
}

async function callCloudflare({ accountId, apiToken, model, messages, tools, maxOutput, rateLimitRetries, maxRetrySeconds }) {
  const data = await callCloudflareRaw({
    accountId,
    apiToken,
    model,
    messages,
    tools: cloudflareTools(tools),
    maxOutput,
    rateLimitRetries,
    maxRetrySeconds,
  });
  return normalizeCloudflareAssistant(data);
}

function safeParseArgs(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function compactEvalLocation(loc) {
  const normalized = normalizeLocation(loc);
  return normalized ? { type: normalized.type, name: normalized.name } : null;
}

function compactEvalCard(card) {
  if (!card || typeof card !== 'object') return null;
  return {
    itemKey: String(card.itemKey || '').trim(),
    name: String(card.name || card.resolvedName || '').trim(),
    scryfallId: String(card.scryfallId || '').trim(),
    setCode: String(card.setCode || '').trim().toLowerCase(),
    setName: String(card.setName || '').trim(),
    cn: String(card.cn || card.collectorNumber || '').trim(),
    finish: String(card.finish || 'normal').trim(),
    condition: String(card.condition || 'near_mint').trim(),
    language: String(card.language || card.lang || 'en').trim(),
    qty: parseInt(card.qty, 10) || 0,
    location: compactEvalLocation(card.location),
    rarity: String(card.rarity || '').trim(),
    typeLine: String(card.typeLine || '').trim(),
    price: Number(card.price) || 0,
    totalValue: Number(card.totalValue) || 0,
  };
}

function compactEvalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const args = candidate.previewAddArgs || {};
  return {
    itemKey: String(candidate.itemKey || '').trim(),
    name: String(candidate.name || '').trim(),
    scryfallId: String(candidate.scryfallId || args.scryfallId || '').trim(),
    setCode: String(candidate.setCode || args.setCode || '').trim().toLowerCase(),
    setName: String(candidate.setName || '').trim(),
    collectorNumber: String(candidate.collectorNumber || candidate.cn || args.cn || '').trim(),
    finishes: Array.isArray(candidate.finishes) ? candidate.finishes.map(String).slice(0, 4) : [],
    requestedFinish: String(candidate.requestedFinish || args.finish || '').trim(),
    qty: parseInt(candidate.qty || args.qty, 10) || undefined,
    location: compactEvalLocation(candidate.location || args.location),
    previewAddArgs: candidate.previewAddArgs ? {
      scryfallId: String(args.scryfallId || candidate.scryfallId || '').trim(),
      name: String(args.name || candidate.name || '').trim(),
      setCode: String(args.setCode || candidate.setCode || '').trim().toLowerCase(),
      cn: String(args.cn || candidate.collectorNumber || '').trim(),
      finish: String(args.finish || candidate.requestedFinish || '').trim(),
      condition: String(args.condition || '').trim(),
      language: String(args.language || args.lang || '').trim(),
      qty: parseInt(args.qty, 10) || undefined,
      location: compactEvalLocation(args.location),
    } : undefined,
  };
}

function compactEvalToolResult(name, data) {
  if (!data || typeof data !== 'object') return data || {};
  if (String(name || '').startsWith('preview_')) {
    return {
      status: data.status,
      previewType: data.previewType,
      summary: data.summary || data.message || data.error || '',
      missingFields: Array.isArray(data.missingFields) ? data.missingFields.map(String) : undefined,
      card: compactEvalCard(data.card),
      candidates: Array.isArray(data.candidates) ? data.candidates.slice(0, 8).map(compactEvalCandidate).filter(Boolean) : undefined,
      missingContainer: compactEvalLocation(data.missingContainer),
      totalsAfter: data.totalsAfter || undefined,
    };
  }
  if (name === 'search_inventory') {
    const results = Array.isArray(data.results) ? data.results : [];
    return { revision: data.revision, count: results.length, limit: data.limit, results: results.slice(0, 20).map(compactEvalCard).filter(Boolean), truncatedForModel: results.length > 20 };
  }
  if (name === 'search_card_printings') {
    return {
      status: data.status,
      query: data.query,
      resolvedName: data.resolvedName,
      requestedFinish: data.requestedFinish,
      totalCount: data.totalCount,
      truncated: data.truncated,
      candidates: Array.isArray(data.candidates) ? data.candidates.slice(0, 12).map(compactEvalCandidate).filter(Boolean) : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(String).slice(0, 8) : [],
      message: data.message || '',
    };
  }
  if (name === 'get_collection_summary') {
    return {
      revision: data.revision,
      uniqueCards: data.uniqueCards,
      totalCards: data.totalCards,
      totalValue: data.totalValue,
      pricedEntries: data.pricedEntries,
      unpricedEntries: data.unpricedEntries,
      containers: data.containers || null,
    };
  }
  return data;
}

function evalToolMessageContent(name, result, error) {
  const content = error ? { error } : compactEvalToolResult(name, result || {});
  const text = JSON.stringify(content, null, 2);
  return text.length <= 12000 ? text : JSON.stringify({ status: result?.status || 'ok', summary: result?.summary || '', truncatedForModel: true });
}

async function runModelCase({
  env,
  accessToken,
  allTools,
  apiKey,
  model,
  testCase,
  includeFinal,
  toolMode,
  maxOutput,
  rateLimitRetries,
  maxRetrySeconds,
  provider,
  cloudflare,
}) {
  const tools = toolsForCase(allTools, testCase, toolMode);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + ' You are being evaluated: use tools whenever collection data or collection edits are needed.' },
    { role: 'user', content: testCase.prompt },
  ];
  const toolCalls = [];
  const usage = [];
  let finalText = '';

  for (let turn = 0; turn < 6; turn += 1) {
    const assistant = provider === 'cloudflare'
      ? await callCloudflare({
        accountId: cloudflare.accountId,
        apiToken: cloudflare.apiToken,
        model,
        messages,
        tools,
        maxOutput,
        rateLimitRetries,
        maxRetrySeconds,
      })
      : await callGroq({
        apiKey,
        model,
        messages,
        tools,
        maxOutput,
        rateLimitRetries,
        maxRetrySeconds,
      });
    if (assistant.usage) usage.push(assistant.usage);
    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    if (!calls.length) {
      finalText = assistant.content || '';
      break;
    }
    if (provider === 'cloudflare') {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: calls,
      });
    } else {
      messages.push({
        role: 'assistant',
        content: assistant.content || null,
        tool_calls: calls,
      });
    }
    for (const call of calls) {
      const name = call.function?.name || '';
      const args = safeParseArgs(call.function?.arguments);
      let result = null;
      let error = null;
      try {
        result = await callTool(env, accessToken, name, args);
      } catch (e) {
        error = e.message || String(e);
      }
      toolCalls.push({ name, args, result: result?.structuredContent || null, error });
      const content = evalToolMessageContent(name, result?.structuredContent || {}, error);
      messages.push(provider === 'cloudflare'
        ? { role: 'tool', tool_call_id: call.id, content }
        : { role: 'tool', tool_call_id: call.id, name, content });
    }
    if (!includeFinal) break;
  }
  return { toolCalls, finalText, usage };
}

function cloudflareAiBinding({ cloudflare, maxOutput, rateLimitRetries, maxRetrySeconds }) {
  return {
    async run(model, payload = {}) {
      return callCloudflareRaw({
        accountId: cloudflare.accountId,
        apiToken: cloudflare.apiToken,
        model,
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        tools: Array.isArray(payload.tools) ? payload.tools : [],
        maxOutput: payload.max_tokens || maxOutput,
        rateLimitRetries,
        maxRetrySeconds,
      });
    },
  };
}

function toolCallsFromWorkerChatData(data) {
  const output = Array.isArray(data?.raw?.output) ? data.raw.output : [];
  return output
    .filter(item => item?.type === 'mcp_call' && item.name)
    .map(item => ({
      name: String(item.name || ''),
      args: {},
      result: item.result?.structuredContent || null,
      error: item.result?.isError ? item.result?.content?.[0]?.text || 'tool error' : null,
    }));
}

async function runWorkerChatCase({
  env,
  cloudflare,
  model,
  testCase,
  maxOutput,
  rateLimitRetries,
  maxRetrySeconds,
}) {
  env.AI = cloudflareAiBinding({ cloudflare, maxOutput, rateLimitRetries, maxRetrySeconds });
  env.MTGCOLLECTION_CHAT_PROVIDER = 'cloudflare';
  env.MTGCOLLECTION_CHAT_DAILY_LIMIT = env.MTGCOLLECTION_CHAT_DAILY_LIMIT || '100000';
  const res = await worker.fetch(new Request('https://eval.local/mcp/chat?debugUser=' + encodeURIComponent(USER_ID), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-User': USER_ID,
    },
    body: JSON.stringify({
      provider: 'cloudflare',
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: testCase.prompt },
      ],
    }),
  }), env);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('worker chat failed: ' + res.status));
  return {
    toolCalls: toolCallsFromWorkerChatData(data),
    finalText: String(data.text || ''),
    usage: data.usage ? [data.usage] : [],
    chatData: data,
  };
}

function collectCardsFromValue(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectCardsFromValue(item, out, seen);
    return out;
  }
  if (value.itemKey && value.name && value.qty) out.push(value);
  for (const child of Object.values(value)) collectCardsFromValue(child, out, seen);
  return out;
}

function collectCards(toolCalls, run = {}) {
  const out = [];
  for (const call of toolCalls) collectCardsFromValue(call.result, out);
  for (const card of run.chatData?.cards || []) collectCardsFromValue(card, out);
  const seen = new Set();
  return out.filter(card => {
    const key = card.itemKey || card.name + ':' + card.setCode + ':' + card.cn;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectCollectionSummaries(toolCalls) {
  return toolCalls
    .map(call => call.result)
    .filter(result => result && typeof result === 'object' && (result.uniqueCards != null || result.totalCards != null || result.totalValue != null));
}

function collectStatuses(toolCalls) {
  return toolCalls
    .map(call => call.result?.status)
    .filter(Boolean);
}

function collectPreviewsFromValue(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPreviewsFromValue(item, out, seen);
    return out;
  }
  if (value.status === 'preview' && value.changeToken) out.push(value);
  for (const child of Object.values(value)) collectPreviewsFromValue(child, out, seen);
  return out;
}

function collectPreviews(run) {
  const out = [];
  for (const call of run.toolCalls || []) collectPreviewsFromValue(call.result, out);
  for (const preview of run.chatData?.previews || []) collectPreviewsFromValue(preview, out);
  const seen = new Set();
  return out.filter(preview => {
    const key = preview.changeToken || preview.summary || JSON.stringify(preview.card || preview);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectDraftsFromValue(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectDraftsFromValue(item, out, seen);
    return out;
  }
  const status = String(value.status || '').toLowerCase();
  if (['needs_input', 'needs_selection'].includes(status) && Array.isArray(value.candidates) && value.candidates.length) out.push(value);
  for (const child of Object.values(value)) collectDraftsFromValue(child, out, seen);
  return out;
}

function collectDrafts(run) {
  const out = [];
  for (const call of run.toolCalls || []) collectDraftsFromValue(call.result, out);
  for (const draft of run.chatData?.drafts || []) collectDraftsFromValue(draft, out);
  return out;
}

function expectationRegex(pattern) {
  return pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
}

function normalizedScalar(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeLanguageForEval(value) {
  const raw = normalizedScalar(value);
  if (['japanese', 'jp', 'jpn'].includes(raw)) return 'ja';
  if (['english', 'eng'].includes(raw)) return 'en';
  return raw;
}

function previewLocationKey(preview) {
  return locationKey(preview?.card?.location || preview?.location || null);
}

function previewName(preview) {
  return String(preview?.card?.name || preview?.name || '').trim();
}

function previewMatchesExpectation(preview, expected = {}) {
  if (expected.previewType && preview.previewType !== expected.previewType) return false;
  if (expected.name && normalizedScalar(previewName(preview)) !== normalizedScalar(expected.name)) return false;
  if (expected.setCode && normalizedScalar(preview?.card?.setCode || preview?.setCode) !== normalizedScalar(expected.setCode)) return false;
  if (expected.finish && normalizeFinish(preview?.card?.finish || preview?.finish) !== normalizeFinish(expected.finish)) return false;
  if (expected.condition && normalizedScalar(preview?.card?.condition || preview?.condition) !== normalizedScalar(expected.condition)) return false;
  if (expected.language && normalizeLanguageForEval(preview?.card?.language || preview?.language) !== normalizeLanguageForEval(expected.language)) return false;
  if (expected.location && previewLocationKey(preview) !== locationKey(expected.location)) return false;
  if (expected.minQty != null && Number(preview?.card?.qty || preview?.qty || 0) < Number(expected.minQty)) return false;
  return true;
}

function scoreCase(testCase, run) {
  const failures = [];
  const tools = run.toolCalls.map(call => call.name);
  const expect = testCase.expect || {};
  const finalText = String(run.finalText || '');
  if (expect.anyTool?.length && !tools.some(name => expect.anyTool.includes(name))) {
    failures.push('expected one of tools [' + expect.anyTool.join(', ') + '], got [' + tools.join(', ') + ']');
  }
  for (const forbidden of expect.noTools || []) {
    if (tools.includes(forbidden)) failures.push('forbidden tool was called: ' + forbidden);
  }
  if (run.toolCalls.some(call => call.error)) {
    failures.push('tool error: ' + run.toolCalls.find(call => call.error).error);
  }

  if (expect.kind === 'cards') {
    const cards = collectCards(run.toolCalls, run);
    const names = cards.map(card => card.name);
    if (cards.length < (expect.minResults || 0)) failures.push('expected card results, got none');
    if (expect.firstName && !names.includes(expect.firstName) && !run.finalText.toLowerCase().includes(expect.firstName.toLowerCase())) {
      failures.push('expected top card "' + expect.firstName + '", got [' + (names.join(', ') || 'none') + ']');
    }
    if (!expect.firstName) {
      const mismatched = cards.filter(card => !matchesFilter(card, expect.filter || {})).map(card => card.name);
      if (mismatched.length) failures.push('cards did not match expected filter: ' + mismatched.slice(0, 5).join(', '));
    }
  } else if (expect.kind === 'collectionStats') {
    const summary = collectCollectionSummaries(run.toolCalls)[0] || null;
    if (!summary) {
      failures.push('did not return collection summary');
    } else {
      if (expect.uniqueCards != null && Number(summary.uniqueCards) !== expect.uniqueCards) {
        failures.push('expected uniqueCards ' + expect.uniqueCards + ', got ' + summary.uniqueCards);
      }
      if (expect.totalCards != null && Number(summary.totalCards) !== expect.totalCards) {
        failures.push('expected totalCards ' + expect.totalCards + ', got ' + summary.totalCards);
      }
      if (expect.totalValue != null && Math.abs(Number(summary.totalValue) - expect.totalValue) > 0.01) {
        failures.push('expected totalValue ' + expect.totalValue + ', got ' + summary.totalValue);
      }
    }
    if (expect.noCards && run.chatData?.cards?.length) {
      failures.push('expected no rendered card rows, got ' + run.chatData.cards.length);
    }
    for (const pattern of expect.requiredText || []) {
      if (!expectationRegex(pattern).test(finalText)) failures.push('final text did not include ' + expectationRegex(pattern));
    }
  } else if (expect.kind === 'containerStats') {
    const statsResults = run.toolCalls.map(call => call.result).filter(Boolean);
    const matching = statsResults.find(result => {
      if (result.container && locationKey(result.container) === locationKey(expect.location)) return true;
      if (Array.isArray(result.containers)) return result.containers.some(container => locationKey(container) === locationKey(expect.location));
      return false;
    });
    if (!matching) failures.push('did not return stats for ' + locationKey(expect.location));
    const stats = matching?.stats
      || matching?.containers?.find(container => locationKey(container) === locationKey(expect.location))?.stats
      || null;
    if (stats && expect.total != null && Number(stats.total) !== expect.total) failures.push('expected total ' + expect.total + ', got ' + stats.total);
    if (stats && expect.unique != null && Number(stats.unique) !== expect.unique) failures.push('expected unique ' + expect.unique + ', got ' + stats.unique);
    if (stats && expect.value != null && Math.abs(Number(stats.value) - expect.value) > 0.01) failures.push('expected value ' + expect.value + ', got ' + stats.value);
  } else if (expect.kind === 'mutation') {
    const statuses = collectStatuses(run.toolCalls);
    const previews = collectPreviews(run);
    const drafts = collectDrafts(run);
    if (expect.statuses?.length && expect.requireStatus && !statuses.length) {
      failures.push('expected one of statuses [' + expect.statuses.join(', ') + '], got none');
    }
    if (expect.statuses?.length && statuses.length && !statuses.some(status => expect.statuses.includes(status))) {
      failures.push('expected one of statuses [' + expect.statuses.join(', ') + '], got [' + statuses.join(', ') + ']');
    }
    if (expect.requirePreview && !previews.length) failures.push('expected at least one preview, got none');
    if (expect.requireDraft && !drafts.length) failures.push('expected an app-renderable draft, got none');
    for (const previewExpectation of expect.previews || []) {
      if (!previews.some(preview => previewMatchesExpectation(preview, previewExpectation))) {
        failures.push('missing expected preview ' + JSON.stringify(previewExpectation));
      }
    }
    for (const pattern of expect.requiredText || []) {
      if (!expectationRegex(pattern).test(finalText)) failures.push('final text did not include ' + expectationRegex(pattern));
    }
    for (const pattern of expect.forbiddenText || []) {
      if (expectationRegex(pattern).test(finalText)) failures.push('final text included forbidden text ' + expectationRegex(pattern));
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    tools,
    finalText,
  };
}

function selectCases(allCases, args) {
  let selected = allCases;
  if (args.category) selected = selected.filter(testCase => testCase.category === args.category);
  if (args.id) selected = selected.filter(testCase => testCase.id === args.id);
  if (!args.all && !args.id) selected = selected.slice(0, args.limit);
  return selected;
}

function reportPayload({ args, model, provider, results, stoppedEarly = false, stopReason = '' }) {
  const passed = results.filter(result => result.score.ok).length;
  const failed = results.length - passed;
  return {
    provider,
    model,
    surface: args.surface,
    toolMode: args.toolMode,
    includeFinal: args.final,
    maxOutput: args.maxOutput,
    maxFailures: args.maxFailures,
    rateLimitRetries: args.rateLimitRetries,
    generatedAt: new Date().toISOString(),
    stoppedEarly,
    stopReason,
    passed,
    failed,
    total: results.length,
    results,
  };
}

function writeReport(reportPath, payload) {
  if (!reportPath) return;
  writeFileSync(reportPath, JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = buildCases();
  const selected = selectCases(cases, args);
  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    console.log('\nInterrupt received; stopping after the current case and writing the partial report.');
  });
  process.once('SIGTERM', () => {
    interrupted = true;
    console.log('\nTerminate received; stopping after the current case and writing the partial report.');
  });

  if (args.list) {
    for (const testCase of selected) {
      console.log(testCase.id.padEnd(34), testCase.category.padEnd(20), testCase.prompt);
    }
    console.log('\n' + selected.length + ' shown / ' + cases.length + ' total cases');
    return;
  }

  const apiKey = groqKey();
  const cloudflare = cloudflareCredentials();
  if (args.provider === 'groq' && !apiKey) {
    console.error('Set GROQ_API_KEY or MTGCOLLECTION_CHAT_GROQ_API_KEY to run Groq live model evals.');
    console.error('Use --list to inspect the ' + cases.length + ' generated cases without calling the model.');
    process.exitCode = 2;
    return;
  }
  if (args.provider === 'cloudflare' && (!cloudflare.accountId || !cloudflare.apiToken)) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to run Cloudflare live model evals.');
    console.error('Use --list to inspect the ' + cases.length + ' generated cases without calling the model.');
    process.exitCode = 2;
    return;
  }

  const model = args.model
    || (args.provider === 'cloudflare'
      ? process.env.MTGCOLLECTION_CHAT_CLOUDFLARE_MODEL
      : process.env.MTGCOLLECTION_CHAT_GROQ_MODEL)
    || DEFAULT_MODEL;
  const { env } = fakeSyncEnv(buildSnapshot(), 100);
  const token = args.surface === 'tool-loop' ? await issueMcpToken(env) : null;
  const allTools = token ? await toolDefinitions(env, token.access_token) : [];
  const results = [];
  let stoppedEarly = false;
  let stopReason = '';

  console.log('Running ' + selected.length + ' MTG chat evals with ' + args.provider + ' ' + model + ' (' + args.surface + ', ' + args.toolMode + ' tool mode)...');
  for (const [index, testCase] of selected.entries()) {
    if (interrupted) {
      stoppedEarly = true;
      stopReason = 'interrupted before case ' + (index + 1);
      break;
    }
    let run = null;
    let scored = null;
    try {
      run = args.surface === 'worker-chat'
        ? await runWorkerChatCase({
          env,
          cloudflare,
          model,
          testCase,
          maxOutput: args.maxOutput,
          rateLimitRetries: args.rateLimitRetries,
          maxRetrySeconds: args.maxRetrySeconds,
        })
        : await runModelCase({
          env,
          accessToken: token.access_token,
          allTools,
          apiKey,
          model,
          testCase,
          includeFinal: args.final,
          toolMode: args.toolMode,
          maxOutput: args.maxOutput,
          rateLimitRetries: args.rateLimitRetries,
          maxRetrySeconds: args.maxRetrySeconds,
          provider: args.provider,
          cloudflare,
        });
      scored = scoreCase(testCase, run);
    } catch (error) {
      run = { toolCalls: [], finalText: '', usage: [] };
      scored = { ok: false, failures: [error.message || String(error)], tools: [], finalText: '' };
    }
    results.push({ ...testCase, run, score: scored });
    const mark = scored.ok ? 'PASS' : 'FAIL';
    console.log((index + 1) + '/' + selected.length, mark, testCase.id, '[' + scored.tools.join(', ') + ']');
    if (!scored.ok || args.verbose) {
      for (const failure of scored.failures) console.log('  - ' + failure);
      if (args.verbose && scored.finalText) console.log('  final: ' + scored.finalText.replace(/\s+/g, ' ').slice(0, 240));
    }
    const failedSoFar = results.filter(result => !result.score.ok).length;
    writeReport(args.report, reportPayload({ args, model, provider: args.provider, results }));
    if (args.maxFailures && failedSoFar >= args.maxFailures) {
      stoppedEarly = true;
      stopReason = 'max failures reached (' + failedSoFar + ')';
      console.log('Stopping early: ' + stopReason);
      break;
    }
    if (args.caseDelayMs) await new Promise(resolve => setTimeout(resolve, args.caseDelayMs));
  }

  const passed = results.filter(result => result.score.ok).length;
  const failed = results.length - passed;
  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + results.length + ' total.');
  if (stoppedEarly && stopReason) console.log('Stopped early: ' + stopReason);
  if (args.report) {
    writeReport(args.report, reportPayload({ args, model, provider: args.provider, results, stoppedEarly, stopReason }));
    console.log('Wrote report to ' + args.report);
  }
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
