// Direct Scryfall lookups for resolving printings on `add` and `import`.
// Direct (not via the server's MCP tool) so bulk imports aren't throttled by the
// worker's 60/60s MCP limit; we apply our own polite delay instead. Scryfall is
// already the product's card-data source.
import { VERSION } from './constants.mjs';
import { CliError } from './errors.mjs';

const SCRYFALL = 'https://api.scryfall.com';
const USER_AGENT = `biblioplex-cli/${VERSION} (+https://biblioplex.bensonperry.com)`;

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sfGet(path, fetchImpl) {
  const res = await fetchImpl(SCRYFALL + path, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw new CliError('scryfall rate limit — slow down and retry', 4);
  if (!res.ok) throw new CliError('scryfall error: ' + (data.details || res.status));
  return data;
}

export function getById(id, fetchImpl = fetch) {
  return sfGet('/cards/' + encodeURIComponent(id), fetchImpl);
}

export function getBySetCn(set, cn, fetchImpl = fetch) {
  return sfGet(`/cards/${encodeURIComponent(String(set).toLowerCase())}/${encodeURIComponent(cn)}`, fetchImpl);
}

export function getByName(name, { set, fetchImpl = fetch } = {}) {
  const q = new URLSearchParams({ fuzzy: name });
  if (set) q.set('set', String(set).toLowerCase());
  return sfGet('/cards/named?' + q.toString(), fetchImpl);
}

// Resolve the most specific identifier available to a Scryfall card object.
export async function resolvePrinting({ scryfallId, set, cn, name, fetchImpl = fetch }) {
  let card = null;
  if (scryfallId) card = await getById(scryfallId, fetchImpl);
  else if (set && cn) card = await getBySetCn(set, cn, fetchImpl);
  else if (name) card = await getByName(name, { set, fetchImpl });
  if (!card || card.object === 'error') return null;
  return card;
}

// Map a Scryfall card to the resolved-field shape normalizeCollectionEntry
// expects (handles double-faced cards for colors/image/oracle).
export function cardToFields(card, finish = 'normal') {
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  const front = faces[0] || {};
  const back = faces[1];
  const colors = card.colors ?? (faces.length ? [...new Set(faces.flatMap(f => f.colors || []))] : []);
  const oracleText = card.oracle_text ?? (faces.length ? faces.map(f => f.oracle_text || '').join('\n//\n') : '');
  const prices = card.prices || {};
  const rawPrice = finish === 'foil' ? prices.usd_foil : finish === 'etched' ? prices.usd_etched : prices.usd;
  return {
    scryfallId: card.id,
    setCode: card.set,
    setName: card.set_name,
    cn: card.collector_number,
    name: card.name,
    rarity: card.rarity,
    cmc: card.cmc,
    colors,
    colorIdentity: card.color_identity || [],
    typeLine: card.type_line || front.type_line || '',
    oracleText,
    legalities: card.legalities || {},
    finishes: card.finishes || [],
    imageUrl: card.image_uris?.normal || front.image_uris?.normal || null,
    backImageUrl: back?.image_uris?.normal || null,
    resolvedName: card.name,
    scryfallUri: card.scryfall_uri || null,
    price: rawPrice != null ? Number(rawPrice) : null,
    priceFallback: false,
  };
}
