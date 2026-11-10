import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { Redis } from 'ioredis';

import { createApp } from '../app.js';
import { RedisData } from '../redis/redis.js';
import { startTestDatabase } from './database.js';
import { NO_ELASTICSEARCH } from './elasticsearch.js';
import type { TestDatabase } from './database.js';
import { startTestRedis } from './redis.js';
import type { TestRedis } from './redis.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDatabase;
  redis: TestRedis;
  cache: TestRedis;
  /** O cliente Redis da própria aplicação (para inspecionar TTL e chaves). */
  redisClient: () => Redis;
  /** Um cliente novo para o `redis-cache` (inspecionar chaves). */
  cacheClient: () => Redis;
  /** Requisição em memória (Fastify inject): rotas, validação, guardas e filtros, sem rede. */
  request: (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    options?: { user?: number; body?: unknown; headers?: Record<string, string> },
  ) => ReturnType<NestFastifyApplication['inject']>;
  stop: () => Promise<void>;
}

/** A aplicação montada pela mesma `createApp` da produção, sobre Postgres e Redis descartáveis. */
export async function startTestApp(options: { elasticsearchUrl?: string } = {}): Promise<TestApp> {
  const [db, redis, cache] = await Promise.all([
    startTestDatabase(),
    startTestRedis('data'),
    startTestRedis('cache'),
  ]);
  const app = await createApp({
    databaseUrl: db.url,
    elasticsearchUrl: options.elasticsearchUrl ?? NO_ELASTICSEARCH,
    redisCacheUrl: cache.url(),
    redisDataUrl: redis.url(),
    draftTtlMs: 30 * 60 * 1000,
    logLevel: 'silent',
    prettyLogs: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    db,
    redis,
    cache,
    redisClient: () => app.get(RedisData).client,
    cacheClient: () => new Redis(cache.url()),
    request: (method, url, options = {}) =>
      app.inject({
        method,
        url: `/api${url}`,
        headers: {
          ...options.headers,
          ...(options.user === undefined ? {} : { 'x-user-id': String(options.user) }),
        },
        ...(options.body === undefined ? {} : { payload: options.body as object }),
      }),
    stop: async () => {
      await app.close();
      // allSettled: um teste pode ter derrubado um dos serviços de propósito.
      await Promise.allSettled([db.stop(), redis.stop(), cache.stop()]);
    },
  };
}
