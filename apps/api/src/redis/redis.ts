import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_DATA_URL = Symbol('REDIS_DATA_URL');

/**
 * Conexão com o `redis-data` (noeviction + AOF): guarda rascunhos, que são trabalho do usuário
 * e não podem ser despejados nem reconstruídos a partir do Postgres.
 */
@Injectable()
export class RedisData implements OnApplicationShutdown {
  readonly client: Redis;

  constructor(@Inject(REDIS_DATA_URL) url: string) {
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
