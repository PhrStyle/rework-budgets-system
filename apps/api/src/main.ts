import { createApp } from './app.js';
import { databaseUrl } from './db/url.js';

const app = await createApp({
  databaseUrl: databaseUrl(),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  prettyLogs: process.env.NODE_ENV !== 'production',
});
const port = Number(process.env.API_PORT ?? 3000);
await app.listen(port, '127.0.0.1');
