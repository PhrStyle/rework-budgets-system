import { createApp } from './app.js';
import { databaseUrl, elasticsearchUrl, redisCacheUrl, redisDataUrl } from './db/url.js';

const app = await createApp({
  databaseUrl: databaseUrl(),
  elasticsearchUrl: elasticsearchUrl(),
  redisCacheUrl: redisCacheUrl(),
  redisDataUrl: redisDataUrl(),
  draftTtlMs: 30 * 60 * 1000,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  prettyLogs: process.env.NODE_ENV !== 'production',
});
const port = Number(process.env.API_PORT ?? 3000);
// Só na máquina local por padrão; num container, API_HOST=0.0.0.0 (a rede do compose a protege).
await app.listen(port, process.env.API_HOST ?? '127.0.0.1');
