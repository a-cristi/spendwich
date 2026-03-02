export const CURRENT_VERSION = 1;

export function emptyData() {
  return {
    version: CURRENT_VERSION,
    settings: { defaultCurrency: 'USD' },
    categories: [],
    labels: [],
    transactions: [],
  };
}

export function makeCategory(name, color = '#6366f1') {
  return { id: crypto.randomUUID(), name, color };
}

export function makeLabel(name) {
  return { id: crypto.randomUUID(), name };
}

export function makeTransaction(fields) {
  const {
    date,
    amount,
    currency,
    amountInDefault = amount,
    exchangeRate = 1,
    categoryId = null,
    labelIds = [],
    description = '',
    recurrence = null,
  } = fields;
  return {
    id: fields.id ?? crypto.randomUUID(),
    date,
    amount,
    currency,
    amountInDefault,
    exchangeRate,
    categoryId,
    labelIds,
    description,
    recurrence,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

export function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Data must be an object');
  if (!Array.isArray(data.categories)) throw new Error('data.categories must be an array');
  if (!Array.isArray(data.labels)) throw new Error('data.labels must be an array');
  if (!Array.isArray(data.transactions)) throw new Error('data.transactions must be an array');
  if (!data.settings || typeof data.settings !== 'object') throw new Error('data.settings must be an object');
  if (typeof data.settings.defaultCurrency !== 'string') throw new Error('settings.defaultCurrency must be a string');

  for (const tx of data.transactions) {
    if (!tx.id) throw new Error(`Transaction missing id`);
    if (!DATE_RE.test(tx.date)) throw new Error(`Transaction ${tx.id}: invalid date "${tx.date}"`);
    if (typeof tx.amount !== 'number') throw new Error(`Transaction ${tx.id}: amount must be a number`);
    if (typeof tx.currency !== 'string') throw new Error(`Transaction ${tx.id}: currency must be a string`);
    if (typeof tx.amountInDefault !== 'number') throw new Error(`Transaction ${tx.id}: amountInDefault must be a number`);
    if (typeof tx.exchangeRate !== 'number' || tx.exchangeRate <= 0) throw new Error(`Transaction ${tx.id}: exchangeRate must be a positive number`);
    if (!Array.isArray(tx.labelIds)) throw new Error(`Transaction ${tx.id}: labelIds must be an array`);
    if (tx.recurrence !== null && tx.recurrence !== undefined) {
      const r = tx.recurrence;
      if (!FREQUENCIES.includes(r.frequency)) throw new Error(`Transaction ${tx.id}: unknown recurrence frequency "${r.frequency}"`);
      if (typeof r.interval !== 'number' || r.interval < 1) throw new Error(`Transaction ${tx.id}: recurrence interval must be a positive number`);
      if (r.endDate != null && !DATE_RE.test(r.endDate)) throw new Error(`Transaction ${tx.id}: recurrence endDate must be YYYY-MM-DD`);
    }
  }

  return data;
}

export function migrate(data) {
  const version = data.version ?? 0;
  if (version > CURRENT_VERSION) {
    console.warn(`spendwich: data version ${version} is newer than app version ${CURRENT_VERSION}. Some data may be ignored.`);
  }
  // future: if (version < 1) { /* v0→v1 migrations */ }
  return { ...data, version: Math.min(version, CURRENT_VERSION) };
}
