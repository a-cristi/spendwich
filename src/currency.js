const _cache = new Map();

export async function fetchRate(fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return 1;

  const key = `${fromCurrency}-${toCurrency}-${date}`;
  if (_cache.has(key)) return _cache.get(key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://api.frankfurter.app/${date}?from=${fromCurrency}&to=${toCurrency}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json.rates?.[toCurrency];
    if (typeof rate !== 'number') return null;
    _cache.set(key, rate);
    return rate;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function convertAmount(amount, rate) {
  return Math.round(amount * rate * 100) / 100;
}
