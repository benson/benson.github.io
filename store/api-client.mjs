export function storeApiBases({ primary = "", fallback = "" } = {}) {
  return [primary, fallback]
    .map((base) => String(base || "").replace(/\/+$/, ""))
    .filter((base, index, all) => all.indexOf(base) === index);
}

export function shouldTryNextApiBase(response) {
  const contentType = response.headers.get("content-type") || "";
  if (response.ok && contentType && !contentType.includes("application/json")) return true;
  return response.status === 404 || response.status === 405;
}

export function apiUrl(base, path) {
  return `${base}${path}`;
}

export async function fetchStoreApiFromBases(path, options = {}, { bases = [""], fetchImpl = fetch } = {}) {
  let lastResponse = null;
  let lastError = null;

  for (const base of bases) {
    try {
      const response = await fetchImpl(apiUrl(base, path), options);
      if (!shouldTryNextApiBase(response)) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("checkout backend is unavailable.");
}
