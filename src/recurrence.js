export function nextOccurrenceAfter(dateStr, recurrence) {
  const { frequency, interval = 1 } = recurrence;
  const d = new Date(dateStr + 'T00:00:00Z');
  const originDay = parseInt(dateStr.slice(8, 10), 10);
  if (frequency === 'daily')
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + interval))
      .toISOString().slice(0, 10);
  if (frequency === 'weekly')
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + interval * 7))
      .toISOString().slice(0, 10);
  if (frequency === 'monthly') {
    const m = d.getUTCMonth() + interval;
    return clampToMonth(d.getUTCFullYear() + Math.floor(m / 12), ((m % 12) + 12) % 12, originDay)
      .toISOString().slice(0, 10);
  }
  if (frequency === 'yearly')
    return clampToMonth(d.getUTCFullYear() + interval, d.getUTCMonth(), originDay)
      .toISOString().slice(0, 10);
  return null;
}

export function clampToMonth(year, month, day) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}

export function expandRecurring(transaction, windowEnd) {
  const { recurrence } = transaction;
  if (!recurrence) return [];

  const { frequency, interval = 1, endDate } = recurrence;
  const stop = endDate
    ? new Date(Math.min(new Date(endDate + 'T00:00:00Z').getTime(), windowEnd.getTime()))
    : windowEnd;

  const originDay = parseInt(transaction.date.slice(8, 10), 10);
  const virtuals = [];
  let current = new Date(transaction.date + 'T00:00:00Z');

  while (true) {
    let next;
    if (frequency === 'daily') {
      next = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate() + interval,
      ));
    } else if (frequency === 'weekly') {
      next = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate() + interval * 7,
      ));
    } else if (frequency === 'monthly') {
      const y = current.getUTCFullYear();
      const m = current.getUTCMonth() + interval;
      next = clampToMonth(y + Math.floor(m / 12), ((m % 12) + 12) % 12, originDay);
    } else if (frequency === 'yearly') {
      const y = current.getUTCFullYear() + interval;
      const m = current.getUTCMonth();
      next = clampToMonth(y, m, originDay);
    } else {
      break;
    }

    if (next > stop) break;
    current = next;

    const dateStr = current.toISOString().slice(0, 10);
    virtuals.push({
      ...transaction,
      id: transaction.id + '-' + dateStr,
      isVirtual: true,
      sourceId: transaction.id,
      date: dateStr,
    });
  }

  return virtuals;
}
