export function formatMoney(value) {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function summarizeCards(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  return {
    unique: list.length,
    qty: list.reduce((sum, card) => sum + (parseInt(card?.qty, 10) || 0), 0),
    value: list.reduce((sum, card) => sum + ((Number(card?.price) || 0) * (parseInt(card?.qty, 10) || 0)), 0),
  };
}

function numberText(value) {
  return (Number(value) || 0).toLocaleString('en-US');
}

function scopedText(current, total, filteredActive, formatter = numberText) {
  const currentText = formatter(current);
  if (!filteredActive) return currentText;
  return currentText + ' of ' + formatter(total);
}

function part(value, label) {
  return `<span><strong>${value}</strong> ${label}</span>`;
}

function joinParts(parts) {
  return parts.filter(Boolean).join('<span class="sep">&middot;</span>');
}

export function renderCollectionTotals(filteredCards = [], allCards = filteredCards, options = {}) {
  const filteredActive = Boolean(options.filteredActive);
  const current = summarizeCards(filteredCards);
  const total = summarizeCards(allCards);
  return joinParts([
    part(scopedText(current.unique, total.unique, filteredActive), 'unique'),
    part(scopedText(current.qty, total.qty, filteredActive), 'qty'),
    part(scopedText(current.value, total.value, filteredActive, formatMoney), 'value'),
  ]);
}

export function renderDeckTotals(stats = {}) {
  return joinParts([
    part(numberText(stats.main), 'main'),
    part(numberText(stats.sideboard), 'side'),
    part(numberText(stats.maybe), 'maybe'),
    part(formatMoney(stats.value), 'value'),
  ]);
}

export function renderCountValueTotals({
  label = 'items',
  count = 0,
  totalCount = count,
  value = 0,
  totalValue = value,
  filteredActive = false,
} = {}) {
  return joinParts([
    part(scopedText(count, totalCount, filteredActive), label),
    part(scopedText(value, totalValue, filteredActive, formatMoney), 'value'),
  ]);
}
