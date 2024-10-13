// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'], // Only apply to TypeScript files
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json', // Path to your tsconfig.json
      },
    },
    rules: {
      // Disable the no-explicit-any rule
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  eslint.configs.recommended, // Keep your eslint configuration
  ...tseslint.configs.recommended, // Keep your ts-eslint configuration
];