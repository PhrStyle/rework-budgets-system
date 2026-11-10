import { Controller, Get, Header, Inject, Injectable } from '@nestjs/common';

type CacheResult = 'hit' | 'miss' | 'error';

/**
 * Contadores da API no formato de texto do Prometheus. Poucos e sem biblioteca: por enquanto, só
 * o que o README precisa medir (acertos do cache). A coleta de verdade entra com o benchmark.
 */
@Injectable()
export class Metrics {
  private readonly cacheCounts = new Map<string, number>();

  cache(name: string, result: CacheResult): void {
    const key = `${name}|${result}`;
    this.cacheCounts.set(key, (this.cacheCounts.get(key) ?? 0) + 1);
  }

  cacheCount(name: string, result: CacheResult): number {
    return this.cacheCounts.get(`${name}|${result}`) ?? 0;
  }

  render(): string {
    const lines = [
      '# HELP budgets_cache_requests_total Leituras no redis-cache, por cache e resultado.',
      '# TYPE budgets_cache_requests_total counter',
    ];
    for (const [key, count] of [...this.cacheCounts].sort()) {
      const [name, result] = key.split('|');
      lines.push(`budgets_cache_requests_total{cache="${name}",result="${result}"} ${count}`);
    }
    return lines.join('\n') + '\n';
  }
}

@Controller('metrics')
export class MetricsController {
  constructor(@Inject(Metrics) private readonly metrics: Metrics) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4')
  render(): string {
    return this.metrics.render();
  }
}
