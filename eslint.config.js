import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'prototype/**',
      'legacy/**',
      // client gerado pelo Prisma (prisma generate)
      'apps/api/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promises sem await fazem gravações "sumirem" em silêncio.
      '@typescript-eslint/no-floating-promises': 'error',
      // Números em template strings são comuns em mensagens de erro e logs.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Módulos do Nest são classes vazias com decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // Nos testes, um auxiliar genérico dá tipo ao JSON da resposta (`res.json<T>()`).
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-unnecessary-type-parameters': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
