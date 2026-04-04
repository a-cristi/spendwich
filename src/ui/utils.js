export function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function comparisonChip(pct) {
  if (pct === null || pct === undefined) return '';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  const absPct = Math.min(Math.abs(Math.round(pct)), 999);
  return `<span class="card-delta">${arrow} ${absPct}%</span>`;
}

export function rollingMonthStart(year, month, day) {
  const prevMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, prevMonthLastDay);
  return new Date(Date.UTC(year, month - 2, clampedDay + 1));
}

export function formatAmountShort(absAmount, currency) {
  let currencySymbol = currency;
  let currencyFirst = false;
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0);
    currencySymbol = parts.find(p => p.type === 'currency')?.value ?? currency;
    currencyFirst = parts.findIndex(p => p.type === 'currency') < parts.findIndex(p => p.type === 'integer');
  } catch { /* fall back to raw code, suffix position */ }

  const cSpan = `<span class="approx-currency">${escHtml(currencySymbol)}</span>`;

  if (absAmount === 0) {
    return currencyFirst ? `${cSpan}0` : `0${cSpan}`;
  }

  const UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [threshold, suffix] of UNITS) {
    if (absAmount >= threshold) {
      const n = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(absAmount / threshold);
      const uSpan = `<span class="approx-unit">${suffix}</span>`;
      return currencyFirst ? `${cSpan}${n}${uSpan}` : `${n}${uSpan}${cSpan}`;
    }
  }
  return escHtml(formatAmount(absAmount, currency));
}

export function buildSparklinePath(transactions, from, to, isIncome) {
  const startMs = new Date(from + 'T00:00:00Z').getTime();
  const endMs   = new Date(to   + 'T00:00:00Z').getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  const buckets = new Array(totalDays).fill(0);
  for (const tx of transactions) {
    const amt = tx.amountInDefault;
    if (isIncome ? amt > 0 : amt < 0) {
      const idx = Math.round((new Date(tx.date + 'T00:00:00Z').getTime() - startMs) / 86400000);
      if (idx >= 0 && idx < totalDays) buckets[idx] += Math.abs(amt);
    }
  }

  const maxVal = Math.max(...buckets, 0);
  if (maxVal === 0) return 'M0 38 L100 38';

  const step = totalDays === 1 ? 0 : 100 / (totalDays - 1);
  const pts = buckets.map((v, i) => `${(i * step).toFixed(1)} ${(40 - (v / maxVal) * 36).toFixed(1)}`);
  return `M${pts.join(' L')}`;
}
