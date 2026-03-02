import { makeCategory, makeLabel, makeTransaction } from './schema.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_COLS = ['date', 'amount', 'currency', 'category', 'description'];

export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0 || lines[0].trim() === '') throw new Error('CSV is empty');

  const headers = splitRow(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const values = splitRow(lines[i]);
    if (values.length !== headers.length) {
      throw new Error(`Row ${i + 1}: expected ${headers.length} columns, got ${values.length}`);
    }
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }

  return rows;
}

function splitRow(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;
    } else {
      let field = '';
      while (i < line.length && line[i] !== ',') field += line[i++];
      fields.push(field);
      if (line[i] === ',') i++;
    }
  }
  return fields;
}

export function importTransactions(csvText, data) {
  const rows = parseCSV(csvText);

  if (rows.length === 0) return { categories: [], labels: [], transactions: [] };

  const headers = Object.keys(rows[0]);
  for (const col of REQUIRED_COLS) {
    if (!headers.includes(col)) throw new Error(`Missing required column: "${col}"`);
  }

  const catsByName = new Map(data.categories.map(c => [c.name, c]));
  const lblsByName = new Map(data.labels.map(l => [l.name, l]));
  const newCats = [];
  const newLbls = [];
  const transactions = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;

    if (!DATE_RE.test(row.date)) {
      throw new Error(`Row ${rowNum}: invalid date "${row.date}" (expected YYYY-MM-DD)`);
    }

    const amount = Number(row.amount);
    if (isNaN(amount)) {
      throw new Error(`Row ${rowNum}: invalid amount "${row.amount}"`);
    }

    if (!row.currency || row.currency.trim() === '') {
      throw new Error(`Row ${rowNum}: currency is required`);
    }

    const catName = row.category.trim();
    let cat = catsByName.get(catName);
    if (!cat && catName) {
      cat = makeCategory(catName);
      catsByName.set(cat.name, cat);
      newCats.push(cat);
    }

    const labelNames = row.labels
      ? row.labels.split(';').map(s => s.trim()).filter(Boolean)
      : [];

    const labelIds = labelNames.map(name => {
      let lbl = lblsByName.get(name);
      if (!lbl) {
        lbl = makeLabel(name);
        lblsByName.set(name, lbl);
        newLbls.push(lbl);
      }
      return lbl.id;
    });

    transactions.push(makeTransaction({
      date: row.date,
      amount,
      currency: row.currency.trim(),
      amountInDefault: amount,
      exchangeRate: 1,
      categoryId: cat ? cat.id : null,
      labelIds,
      description: row.description ?? '',
    }));
  });

  return { categories: newCats, labels: newLbls, transactions };
}
