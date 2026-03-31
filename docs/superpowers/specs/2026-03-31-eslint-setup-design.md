# ESLint Setup Design

**Date:** 2026-03-31
**Status:** Approved

## Context

Spendwich has no linter today. The two largest files (`src/ui/views/reports.js`, `src/ui/views/transactions.js`) each exceed 1,200 lines and contain security-sensitive innerHTML patterns. ESLint is being added to catch bugs, enforce CLAUDE.md security rules, and encourage consistent style — without introducing a build step or reformatting the existing codebase.

## Files to create

### `package.json`

Minimal. Dev tooling only — does not affect static serving.

```json
{
  "type": "module",
  "scripts": {
    "lint": "eslint src/ tests/"
  },
  "devDependencies": {
    "eslint": "^9",
    "@eslint/js": "^9",
    "globals": "^15"
  }
}
```

`"type": "module"` is consistent with the codebase (all files use ES module syntax) and required for `eslint.config.js` to use `import` syntax.

### `eslint.config.js`

Flat config format (ESLint 9). Base: `js.configs.recommended`.

```js
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // CDN globals loaded via importmap in index.html
        Chart: 'readonly',
        flatpickr: 'readonly',
        RemoteStorage: 'readonly',
        Widget: 'readonly',
      },
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      // Security — CLAUDE.md rules
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression[operator="+="][left.property.name="innerHTML"]',
          message: 'Forbidden: innerHTML += re-serializes the DOM and destroys event listeners. Use appendChild/createElement instead.',
        },
      ],
      // Style consistency
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
    },
  },
];
```

## Files to update

### `.gitignore`

Add `node_modules/`.

### `CLAUDE.md` — Testing section

Add a Linting subsection after the existing Testing block:

```
## Linting

- Run with: `npm run lint` (requires `npm install` once)
- `no-unused-vars` warns on dead code (`_`-prefix exempts intentional unused params)
- `no-restricted-syntax` errors on `innerHTML +=` — same rule as documented above
- CDN globals (`Chart`, `flatpickr`, `RemoteStorage`, `Widget`) are declared in `eslint.config.js`
```

### `README.md` — Development section

Add lint command alongside the existing test command:

```bash
# Run tests (requires Node 20+)
node --test tests/*.test.js

# Lint
npm run lint
```

## Known limitation

ESLint cannot track whether every `innerHTML` template literal wraps interpolated values in `escHtml()` — that requires data-flow analysis. The `no-restricted-syntax` rule catches `innerHTML +=` but not unsafe `innerHTML =` assignments. Manual code review remains necessary for full XSS coverage.

## Running

```bash
npm install   # once
npm run lint
```
