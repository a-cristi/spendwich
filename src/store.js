import { emptyData, makeCategory, makeLabel, makeTransaction, validate, migrate } from './schema.js';

let _data = emptyData();

export function _reset() {
  _data = emptyData();
}

export function getData() {
  return JSON.parse(JSON.stringify(_data));
}

export function loadData(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const migrated = migrate(parsed);
  validate(migrated);
  _data = migrated;
}

export function exportData() {
  return JSON.stringify(_data, null, 2);
}

export function addCategory(name, icon) {
  const cat = makeCategory(name, icon);
  _data.categories.push(cat);
  return cat;
}

export function updateCategory(id, fields) {
  const cat = _data.categories.find(c => c.id === id);
  if (!cat) throw new Error(`Category not found: ${id}`);
  Object.assign(cat, fields);
}

export function deleteCategory(id) {
  const idx = _data.categories.findIndex(c => c.id === id);
  if (idx === -1) throw new Error(`Category not found: ${id}`);
  _data.categories.splice(idx, 1);
}

export function addLabel(name) {
  const lbl = makeLabel(name);
  _data.labels.push(lbl);
  return lbl;
}

export function updateLabel(id, fields) {
  const lbl = _data.labels.find(l => l.id === id);
  if (!lbl) throw new Error(`Label not found: ${id}`);
  Object.assign(lbl, fields);
}

export function deleteLabel(id) {
  const idx = _data.labels.findIndex(l => l.id === id);
  if (idx === -1) throw new Error(`Label not found: ${id}`);
  _data.labels.splice(idx, 1);
}

export function addTransaction(fields) {
  const tx = makeTransaction(fields);
  _data.transactions.push(tx);
  return tx;
}

export function updateTransaction(id, fields) {
  const tx = _data.transactions.find(t => t.id === id);
  if (!tx) throw new Error(`Transaction not found: ${id}`);
  Object.assign(tx, fields);
}

export function deleteTransaction(id) {
  const idx = _data.transactions.findIndex(t => t.id === id);
  if (idx === -1) throw new Error(`Transaction not found: ${id}`);
  _data.transactions.splice(idx, 1);
}

export function importBulk(categories, labels, transactions) {
  for (const cat of categories) {
    if (!_data.categories.find(c => c.id === cat.id)) {
      _data.categories.push(cat);
    }
  }
  for (const lbl of labels) {
    if (!_data.labels.find(l => l.id === lbl.id)) {
      _data.labels.push(lbl);
    }
  }
  for (const tx of transactions) {
    _data.transactions.push(makeTransaction(tx));
  }
}

export function updateSettings(fields) {
  Object.assign(_data.settings, fields);
}
