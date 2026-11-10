import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

import type { PrismaClient } from '../generated/prisma/client.js';
import { createPrisma } from './prisma.js';

export const DATABASE_URL = Symbol('DATABASE_URL');

/** Dono da conexão com o Postgres: um PrismaClient (e um pool) por aplicação. */
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly prisma: PrismaClient;

  constructor(@Inject(DATABASE_URL) url: string) {
    this.prisma = createPrisma(url);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/** Converte um total do banco (bigint) para número, recusando o que perderia precisão. */
export function toCents(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`valor fora do intervalo seguro: ${value}`);
  return n;
}
