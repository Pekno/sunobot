// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'], // Only apply to TypeScript files
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json', // Path to your tsconfig.json
      },
    }
  },
  eslint.configs.recommended, // Keep eslint configuration
  ...tseslint.configs.recommended, // Keep ts-eslint configuration
  {
    files: ['**/*.ts', '**/*.tsx'], // Enforce rules specific to TypeScript files
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Make sure this stays off here
    },
  },
];
