const USD_SCALE = 100000000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegative(value) {
  return Math.max(0, finiteNumber(value));
}

function roundUsd(value) {
  return Math.round((finiteNumber(value) + Number.EPSILON) * USD_SCALE) / USD_SCALE;
}

function priceValue(price, key, aliases) {
  for (const field of [key, ...aliases]) {
    if (price?.[field] !== undefined) return nonNegative(price[field]);
  }
  return 0;
}

function normalizedPrice(price = {}) {
  return {
    in: priceValue(price, 'in', ['priceIn', 'price_in_per_m']),
    cachedIn: priceValue(price, 'cachedIn', ['priceCachedIn', 'price_cached_in_per_m']),
    out: priceValue(price, 'out', ['priceOut', 'price_out_per_m']),
  };
}

function estimateMax({ inputTokens, maxOutputTokens, price }) {
  const rates = normalizedPrice(price);
  return roundUsd(
    (nonNegative(inputTokens) * rates.in + nonNegative(maxOutputTokens) * rates.out) / 1000000,
  );
}

function actual({ usage = {}, price }) {
  const rates = normalizedPrice(price);
  return roundUsd((
    nonNegative(usage.input) * rates.in
    + nonNegative(usage.cachedInput) * rates.cachedIn
    + nonNegative(usage.output) * rates.out
  ) / 1000000);
}

function sumUsage(usages = []) {
  return usages.reduce((total, usage = {}) => ({
    input: total.input + nonNegative(usage.input),
    cachedInput: total.cachedInput + nonNegative(usage.cachedInput),
    output: total.output + nonNegative(usage.output),
    thinking: total.thinking + nonNegative(usage.thinking),
  }), { input: 0, cachedInput: 0, output: 0, thinking: 0 });
}

module.exports = { estimateMax, actual, sumUsage, roundUsd, normalizedPrice };
