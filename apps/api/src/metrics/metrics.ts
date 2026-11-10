import { Controller, Get, Header, Inject, Injectable } from '@nestjs/common';

type CacheResult = 'hit' | 'miss' | 'error';

/**
 * Contadores da API no formato de texto do Prometheus. Poucos e sem biblioteca: por enquanto, só
 * o que o README precisa medir (acertos do cache). A coleta de verdade entra com o benchmark.
 */
@Injectable()
export class Metrics {
  private readonly cacheCounts = new Map<string, number>();
  private readonly searchCounts = new Map<string, number>();

  /** Por qual motor cada busca foi atendida (o Postgres só quando o Elasticsearch falha). */
  search(name: string, engine: 'elasticsearch' | 'postgres_fallback'): void {
    const key = `${name}|${engine}`;
    this.searchCounts.set(key, (this.searchCounts.get(key) ?? 0) + 1);
  }

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
    lines.push(
      '# HELP budgets_search_requests_total Buscas, por tipo e por motor que respondeu.',
      '# TYPE budgets_search_requests_total counter',
    );
    for (const [key, count] of [...this.searchCounts].sort()) {
      const [name, engine] = key.split('|');
      lines.push(`budgets_search_requests_total{search="${name}",engine="${engine}"} ${count}`);
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
