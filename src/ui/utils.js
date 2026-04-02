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
