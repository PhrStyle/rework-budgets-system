import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import type { Redis } from 'ioredis';

import { createApp } from '../app.js';
import { RedisData } from '../redis/redis.js';
import { startTestDatabase } from './database.js';
import type { TestDatabase } from './database.js';
import { startTestRedis } from './redis.js';
import type { TestRedis } from './redis.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDatabase;
  redis: TestRedis;
  /** O cliente Redis da própria aplicação (para inspecionar TTL e chaves). */
  redisClient: () => Redis;
  /** Requisição em memória (Fastify inject): rotas, validação, guardas e filtros, sem rede. */
  request: (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    options?: { user?: number; body?: unknown; headers?: Record<string, string> },
  ) => ReturnType<NestFastifyApplication['inject']>;
  stop: () => Promise<void>;
}

/** A aplicação montada pela mesma `createApp` da produção, sobre Postgres e Redis descartáveis. */
export async function startTestApp(): Promise<TestApp> {
  const [db, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
  const app = await createApp({
    databaseUrl: db.url,
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
    redisClient: () => app.get(RedisData).client,
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
      await Promise.all([db.stop(), redis.stop()]);
    },
  };
}
