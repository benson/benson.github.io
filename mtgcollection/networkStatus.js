export function isBrowserOffline(nav = globalThis.navigator) {
  return nav?.onLine === false;
}

export function isLikelyNetworkError(error, nav = globalThis.navigator) {
  if (isBrowserOffline(nav)) return true;
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return name === 'typeerror'
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('offline')
    || message.includes('load failed');
}

export function scryfallNetworkMessage(error, nav = globalThis.navigator) {
  if (isLikelyNetworkError(error, nav)) {
    return 'scryfall lookup needs a network connection. collection edits you can make without lookup will still sync later.';
  }
  return '';
}
