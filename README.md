# spendwich

A personal expense tracker that runs entirely in your browser — no account, no server, no nonsense.

## Features

### Transactions

Track income and expenses across user-defined categories. Each transaction has:

- a category
- one or more labels (optional)
- a description (optional)
- a date
- an amount

Transactions can be edited or deleted at any time.

### Categories & Labels

Organize your spending however makes sense to you. Both categories and labels are fully user-defined. Labels are shared across all transactions. When you delete a category or label, you can choose to reassign existing transactions or keep them as-is — they just won't be available for new ones.

### Multi-currency

Set a default currency for all transactions. When adding a transaction in a different currency, spendwich suggests an exchange rate based on the transaction date. You can override it at any time, or enter one manually if no data is available.

### Recurring Transactions

Mark any transaction as recurring — for example, a monthly subscription. spendwich automatically shows it on the right dates. If a recurrence falls on a day that doesn't exist in a given month (e.g. the 31st in February), it falls on the last valid day instead.

### Filtering

Filter transactions by category, label, or both. Filtering supports:

- **Flat view** — all matching transactions in a list
- **Hierarchical view** — totals broken down by `category -> label` or `label -> category`, with the ability to drill down

Label filtering supports wildcards. For example, `*-hotel` matches `London-hotel`, `Paris-hotel`, and so on.

### Reports

View monthly and yearly summaries with a breakdown by category and charts. Filter by income, expenses, or both. Use the default monthly/yearly views or define a custom date range.

### CSV Import

Import transactions from a CSV file. If the file can't be parsed, you'll get a clear error message explaining why.

## Your Data

Your data is stored as a plain JSON file that you own. It's human-readable and can be opened or edited in any text editor. You can import and export it at any time.

## Out of Scope

- Setting budgets
