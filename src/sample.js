export function generateSampleData() {
  const categories = [
    { id: 'demo-cat-housing',   name: 'Housing',       icon: '🏠' },
    { id: 'demo-cat-food',      name: 'Food & Dining',  icon: '🍔' },
    { id: 'demo-cat-transport', name: 'Transport',      icon: '🚗' },
    { id: 'demo-cat-health',    name: 'Health',         icon: '💊' },
    { id: 'demo-cat-entertain', name: 'Entertainment',  icon: '🎬' },
    { id: 'demo-cat-shopping',  name: 'Shopping',       icon: '🛍️' },
    { id: 'demo-cat-salary',    name: 'Salary',         icon: '💼' },
    { id: 'demo-cat-freelance', name: 'Freelance',      icon: '💻' },
    { id: 'demo-cat-travel',    name: 'Travel',         icon: '✈️' },
    { id: 'demo-cat-subscr',    name: 'Subscriptions',  icon: '📱' },
  ];

  const labels = [
    { id: 'demo-lbl-essential',     name: 'essential' },
    { id: 'demo-lbl-discretionary', name: 'discretionary' },
    { id: 'demo-lbl-work',          name: 'work' },
    { id: 'demo-lbl-family',        name: 'family' },
  ];

  const E = 'demo-lbl-essential';
  const D = 'demo-lbl-discretionary';
  const W = 'demo-lbl-work';
  const F = 'demo-lbl-family';

  // Returns YYYY-MM-DD, clamped to last valid day of month
  function d(y, m, day) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const clamped = Math.min(day, lastDay);
    return `${y}-${String(m).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
  }

  function flat(date, amount, catId, desc, lblIds = []) {
    return { date, amount, currency: 'USD', amountInDefault: amount, exchangeRate: 1, categoryId: catId, description: desc, labelIds: lblIds };
  }

  function recur(date, amount, catId, desc, lblIds, endDate = null) {
    return { ...flat(date, amount, catId, desc, lblIds), recurrence: { frequency: 'monthly', interval: 1, endDate } };
  }

  const transactions = [];

  // --- Recurring entries (expanded at runtime) ---

  // Rent: full span, open-ended (ongoing beyond dataset)
  transactions.push(recur(d(2023, 1, 1), -1200, 'demo-cat-housing', 'Rent', [E]));

  // Subscriptions: full span, open-ended
  transactions.push(recur(d(2023, 1, 15), -45, 'demo-cat-subscr', 'Subscriptions', [D]));

  // Gym: from Apr 2024 onward
  transactions.push(recur(d(2024, 4, 1), -50, 'demo-cat-health', 'Gym membership', [E]));

  // Salary: four entries matching the income narrative
  transactions.push(recur(d(2023, 1, 28),  4500, 'demo-cat-salary', 'Salary', [W], d(2023, 8, 28)));
  transactions.push(recur(d(2024, 4, 28),  5000, 'demo-cat-salary', 'Salary', [W], d(2024, 12, 28)));
  transactions.push(recur(d(2025, 1, 28),  5200, 'demo-cat-salary', 'Salary', [W], d(2025, 12, 28)));
  transactions.push(recur(d(2026, 1, 28),  5500, 'demo-cat-salary', 'Salary', [W]));

  // --- Flat transactions: monthly loop Jan 2023 – Mar 2026 (39 months) ---

  for (let i = 0; i < 39; i++) {
    const totalMonths = 2023 * 12 + i; // Jan 2023 = offset 0
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;

    const isWinter = m === 11 || m === 12 || m === 1 || m === 2;
    transactions.push(flat(d(y, m, 5), isWinter ? -130 : -95, 'demo-cat-housing', 'Utilities', [E]));

    transactions.push(flat(d(y, m, 8),  -(150 + (i % 7) * 10), 'demo-cat-food', 'Groceries', [E]));
    transactions.push(flat(d(y, m, 22), -(160 + (i % 5) * 12), 'demo-cat-food', 'Groceries', [E]));

    transactions.push(flat(d(y, m, 10), -(80 + (i % 6) * 15), 'demo-cat-transport', 'Transport'));

    // Freelance income: Sep–Dec 2023 only; sporadic Apr–Dec 2024; monthly Jan 2025+
    if (i >= 8 && i <= 11) {
      transactions.push(flat(d(y, m, 20), 800 + (i - 8) * 100, 'demo-cat-freelance', 'Freelance income', [W]));
    } else if (i >= 15 && i <= 23 && i % 3 === 0) {
      transactions.push(flat(d(y, m, 20), 600 + (i % 4) * 100, 'demo-cat-freelance', 'Freelance income', [W]));
    } else if (i >= 24) {
      transactions.push(flat(d(y, m, 20), 800 + (i % 3) * 100, 'demo-cat-freelance', 'Freelance income', [W]));
    }

    // Restaurant: skip sabbatical months (i=12–14)
    if (i < 12 || i > 14) {
      transactions.push(flat(d(y, m, 18), -(60 + (i % 5) * 9), 'demo-cat-food', 'Restaurant', [D]));
    }

    // Entertainment: every other month
    if (i % 2 === 0) {
      transactions.push(flat(d(y, m, 21), -(30 + (i % 6) * 8), 'demo-cat-entertain', 'Entertainment', [D]));
    }

    // Shopping: every 3rd month
    if (i % 3 === 1) {
      transactions.push(flat(d(y, m, 14), -(80 + (i % 4) * 30), 'demo-cat-shopping', 'Shopping', [D]));
    }

    // Christmas gifts (December)
    if (m === 12) {
      transactions.push(flat(d(y, m, 20), -320, 'demo-cat-shopping', 'Christmas gifts', [F, D]));
    }

    // Annual checkup (May)
    if (m === 5) {
      transactions.push(flat(d(y, m, 15), -150, 'demo-cat-health', 'Annual checkup', [E]));
    }
  }

  // --- One-off flat transactions ---

  transactions.push(flat(d(2023, 4,  12), -200,  'demo-cat-transport', 'Car maintenance'));
  transactions.push(flat(d(2024, 5,   8), -280,  'demo-cat-transport', 'Car maintenance'));
  transactions.push(flat(d(2025, 5,  14), -360,  'demo-cat-transport', 'Car maintenance'));

  transactions.push(flat(d(2023, 11, 15), -480,  'demo-cat-health',   'Medical procedure', [E]));

  transactions.push(flat(d(2023,  7,  3), -1100, 'demo-cat-travel',   'Flights — summer vacation', [D]));
  transactions.push(flat(d(2023,  7,  5), -680,  'demo-cat-travel',   'Hotel — summer vacation',   [D]));

  transactions.push(flat(d(2023, 12, 22), -520,  'demo-cat-travel',   'Holiday travel', [F, D]));

  transactions.push(flat(d(2024,  8, 10), -950,  'demo-cat-travel',   'Summer vacation', [D]));

  transactions.push(flat(d(2024, 12, 20), -380,  'demo-cat-travel',   'Holiday travel', [F]));

  transactions.push(flat(d(2025,  7,  5), -1350, 'demo-cat-travel',   'Flights — Europe trip', [D]));
  transactions.push(flat(d(2025,  7,  8), -420,  'demo-cat-travel',   'Activities — Europe trip', [D]));

  transactions.push(flat(d(2025, 12, 21), -480,  'demo-cat-travel',   'Holiday travel', [F]));

  return { categories, labels, transactions };
}
