import { expandRecurring } from './recurrence.js';

export function matchesGlob(pattern, str) {
  if (!pattern.includes('*')) return pattern === str;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$').test(str);
}

export function expandAndFilter(transactions, { categoryId = null, labelPattern = null, labels = [], windowEnd } = {}) {
  const end = windowEnd instanceof Date ? windowEnd : new Date();
  const lblMap = new Map(labels.map(l => [l.id, l]));
  const all = [];

  for (const tx of transactions) {
    all.push(tx);
    if (tx.recurrence) {
      all.push(...expandRecurring(tx, end));
    }
  }

  return all
    .filter(tx => {
      if (categoryId !== null && tx.categoryId !== categoryId) return false;
      if (labelPattern !== null) {
        const hasMatch = tx.labelIds.some(id => {
          const lbl = lblMap.get(id);
          return lbl && matchesGlob(labelPattern, lbl.name);
        });
        if (!hasMatch) return false;
      }
      return true;
    })
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

export function groupByCategory(transactions, categories) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const groups = new Map();

  for (const tx of transactions) {
    const key = tx.categoryId ?? null;
    if (!groups.has(key)) {
      groups.set(key, { category: catMap.get(key) ?? null, transactions: [], total: 0 });
    }
    const group = groups.get(key);
    group.transactions.push(tx);
    group.total += tx.amountInDefault;
  }

  return groups;
}

export function groupByLabel(transactions, labels) {
  const lblMap = new Map(labels.map(l => [l.id, l]));
  const groups = new Map();

  for (const tx of transactions) {
    if (tx.labelIds.length === 0) {
      const key = null;
      if (!groups.has(key)) {
        groups.set(key, { label: null, transactions: [], total: 0 });
      }
      const group = groups.get(key);
      group.transactions.push(tx);
      group.total += tx.amountInDefault;
    } else {
      for (const lid of tx.labelIds) {
        if (!groups.has(lid)) {
          groups.set(lid, { label: lblMap.get(lid) ?? null, transactions: [], total: 0 });
        }
        const group = groups.get(lid);
        group.transactions.push(tx);
        group.total += tx.amountInDefault;
      }
    }
  }

  return groups;
}
