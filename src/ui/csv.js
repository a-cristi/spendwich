import { inferSchema, initParser } from 'udsv';
import { makeCategory, makeLabel, makeTransaction } from '../schema.js';

const REQUIRED_COLS = ['date', 'amount', 'currency', 'category', 'description'];

export function importTransactions(csvText, data) {
  if (!csvText || csvText.trim() === '') throw new Error('CSV is empty');

  const schema = inferSchema(csvText);
  const parser = initParser(schema);
  const rows = parser.stringObjs(csvText);

  if (rows.length === 0) return { categories: [], labels: [], transactions: [] };

  const headers = Object.keys(rows[0]);
  for (const col of REQUIRED_COLS) {
    if (!headers.includes(col)) throw new Error(`Missing required column: "${col}"`);
  }

  const catsByName = new Map(data.categories.map(c => [c.name.toLowerCase(), c]));
  const lblsByName = new Map(data.labels.map(l => [l.name.toLowerCase(), l]));
  const newCats = [];
  const newLbls = [];
  const transactions = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;

    const parsed = new Date(row.date);
    if (isNaN(parsed.getTime())) throw new Error(`Row ${rowNum}: invalid date "${row.date}"`);
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    row.date = `${yyyy}-${mm}-${dd}`;

    const amount = Number(row.amount);
    if (isNaN(amount)) throw new Error(`Row ${rowNum}: invalid amount "${row.amount}"`);

    if (!row.currency || row.currency.trim() === '') throw new Error(`Row ${rowNum}: currency is required`);

    const catName = row.category.trim();
    if (!catName) throw new Error(`Row ${rowNum}: category is required`);
    let cat = catsByName.get(catName.toLowerCase());
    if (!cat) {
      cat = makeCategory(catName);
      catsByName.set(cat.name.toLowerCase(), cat);
      newCats.push(cat);
    }

    const labelNames = row.labels
      ? row.labels.split(';').map(s => s.trim()).filter(Boolean)
      : [];

    const labelIds = labelNames.map(name => {
      let lbl = lblsByName.get(name.toLowerCase());
      if (!lbl) {
        lbl = makeLabel(name);
        lblsByName.set(name.toLowerCase(), lbl);
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
      categoryId: cat.id,
      labelIds,
      description: row.description ?? '',
    }));
  });

  return { categories: newCats, labels: newLbls, transactions };
}
