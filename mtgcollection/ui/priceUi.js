export function formatPrice(c) {
  if (!c.price) return '';
  const base = '$' + c.price.toFixed(2);
  if (!c.priceFallback) return base;
  return base + '<span class="price-fallback-mark" title="regular usd shown when exact finish price is unavailable">*</span>';
}
