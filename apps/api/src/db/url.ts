/**
 * Connection string do banco da versão nova. `DATABASE_URL` tem prioridade (testes, CI);
 * sem ela, monta a partir das mesmas variáveis do `.env` que sobem o Postgres do compose.
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(env.POSTGRES_USER ?? 'budgets');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
  const port = env.POSTGRES_PORT ?? '54320';
  return `postgresql://${user}:${password}@127.0.0.1:${port}/budgets_v2`;
}
