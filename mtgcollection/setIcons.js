// Cache of setCode → icon_svg_uri from Scryfall's /sets endpoint.
// Lookup is sync via getSetIconUrl (falls back to a constructed URL when the
// cache hasn't loaded yet); refreshSetIcons() populates it on app boot.

const KEY = 'mtgcollection_set_icons_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cache = null;
let cacheTs = 0;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.icons && typeof d.icons === 'object') {
        cache = d.icons;
        cacheTs = d.ts || 0;
        return cache;
      }
    }
  } catch (e) {}
  cache = {};
  cacheTs = 0;
  return cache;
}

export function getSetIconUrl(setCode) {
  load();
  const code = (setCode || '').toLowerCase();
  if (!code) return '';
  if (cache[code]) return cache[code];
  return `https://svgs.scryfall.io/sets/${code}.svg`;
}

export async function refreshSetIcons({ force = false } = {}) {
  load();
  if (!force && Object.keys(cache).length > 0 && (Date.now() - cacheTs) < TTL_MS) {
    return false;
  }
  try {
    let url = 'https://api.scryfall.com/sets';
    const icons = {};
    while (url) {
      const r = await fetch(url);
      if (!r.ok) break;
      const data = await r.json();
      if (Array.isArray(data.data)) {
        for (const set of data.data) {
          if (set.code && set.icon_svg_uri) icons[set.code] = set.icon_svg_uri;
        }
      }
      url = data.has_more ? data.next_page : null;
    }
    if (Object.keys(icons).length > 0) {
      cache = icons;
      cacheTs = Date.now();
      try {
        localStorage.setItem(KEY, JSON.stringify({ ts: cacheTs, icons }));
      } catch (e) {}
      return true;
    }
  } catch (e) {}
  return false;
}
