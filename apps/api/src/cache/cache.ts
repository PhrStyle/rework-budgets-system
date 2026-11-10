import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { Metrics } from '../metrics/metrics.js';

export const REDIS_CACHE_URL = Symbol('REDIS_CACHE_URL');

/** Validade de segurança: o LRU já despeja o que não é lido, mas nada fica para sempre. */
const TTL_SECONDS = 60 * 60;
/** Um cache lento é pior que nenhum: passou disso, a leitura segue pelo Postgres. */
const COMMAND_TIMEOUT_MS = 200;
/** Com o Redis fora do ar, um aviso por intervalo, não um por requisição. */
const WARN_EVERY_MS = 30_000;

/**
 * Cache-aside no `redis-cache` (LRU, sem persistência): só cópias reconstruíveis do Postgres.
 *
 * As chaves levam a versão do dado (a `version` do grupo, a hora da última gravação do
 * orçamento). Gravar muda a versão, então a leitura seguinte procura outra chave: não há
 * "apagar do cache ao salvar" nem a corrida em que uma leitura lenta devolve o valor velho
 * logo depois. A chave antiga para de ser lida e o LRU a despeja.
 *
 * Falha no Redis nunca derruba a leitura: vira um "erro" na métrica e a resposta vem do banco.
 */
@Injectable()
export class Cache implements OnApplicationShutdown {
  private readonly logger = new Logger(Cache.name);
  private readonly client: Redis;
  private lastWarn = 0;

  constructor(
    @Inject(REDIS_CACHE_URL) url: string,
    @Inject(Metrics) private readonly metrics: Metrics,
  ) {
    this.client = new Redis(url, {
      commandTimeout: COMMAND_TIMEOUT_MS,
      // Sem fila offline: com o Redis fora, o comando falha na hora em vez de esperar.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    this.client.on('error', (error: Error) => {
      this.warn(error);
    });
  }

  /** Lê do cache; sem acerto, carrega da fonte e guarda para a próxima. */
  async getOrLoad<T>(name: string, key: string, load: () => Promise<T>): Promise<T> {
    const cached = await this.read(key);
    this.metrics.cache(name, cached.result);
    if (cached.result === 'hit') return JSON.parse(cached.value) as T;

    const value = await load();
    // Com o Redis fora do ar, nem tenta gravar: a próxima leitura também vai ao banco.
    if (cached.result === 'miss') await this.write(key, JSON.stringify(value));
    return value;
  }

  /** Apaga tudo (só depois de recarregar os dados do zero: os ids voltam a ser os mesmos). */
  async flush(): Promise<void> {
    await this.client.flushdb();
  }

  onApplicationShutdown(): void {
    this.client.disconnect();
  }

  private async read(
    key: string,
  ): Promise<{ result: 'hit'; value: string } | { result: 'miss' | 'error' }> {
    try {
      const value = await this.client.get(key);
      return value === null ? { result: 'miss' } : { result: 'hit', value };
    } catch (error) {
      this.warn(error);
      return { result: 'error' };
    }
  }

  private async write(key: string, value: string): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', TTL_SECONDS);
    } catch (error) {
      this.warn(error);
    }
  }

  private warn(error: unknown): void {
    if (Date.now() - this.lastWarn < WARN_EVERY_MS) return;
    this.lastWarn = Date.now();
    this.logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'redis-cache indisponível; lendo do Postgres',
    );
  }
}
