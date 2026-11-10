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

export function elasticsearchUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.ELASTICSEARCH_URL ?? `http://127.0.0.1:${env.ELASTICSEARCH_PORT ?? '9200'}`;
}

/** `redis-cache` e `redis-data`: o endereço inteiro por variável (containers), ou a porta local. */
export function redisCacheUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.REDIS_CACHE_URL ?? `redis://127.0.0.1:${env.REDIS_CACHE_PORT ?? '6379'}`;
}

export function redisDataUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.REDIS_DATA_URL ?? `redis://127.0.0.1:${env.REDIS_DATA_PORT ?? '6380'}`;
}
