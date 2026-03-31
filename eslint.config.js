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
      // Security — enforces CLAUDE.md rule against innerHTML +=
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
