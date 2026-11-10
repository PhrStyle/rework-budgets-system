import { createApp } from './app.js';
import { databaseUrl } from './db/url.js';

const app = await createApp({
  databaseUrl: databaseUrl(),
  redisCacheUrl: `redis://127.0.0.1:${process.env.REDIS_CACHE_PORT ?? '6379'}`,
  redisDataUrl: `redis://127.0.0.1:${process.env.REDIS_DATA_PORT ?? '6380'}`,
  draftTtlMs: 30 * 60 * 1000,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  prettyLogs: process.env.NODE_ENV !== 'production',
});
const port = Number(process.env.API_PORT ?? 3000);
await app.listen(port, '127.0.0.1');
