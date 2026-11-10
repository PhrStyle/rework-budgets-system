import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { databaseUrl } from './url.js';

/** Prisma 7 fala com o Postgres pelo driver `pg` (driver adapter), sem binário de query engine. */
export function createPrisma(url: string = databaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
