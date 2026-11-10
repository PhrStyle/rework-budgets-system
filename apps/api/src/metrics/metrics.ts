import { Controller, Get, Header, Inject, Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

type CacheResult = 'hit' | 'miss' | 'error';

/**
 * Métricas no formato do Prometheus (`GET /api/metrics`), coletadas pelo Prometheus do compose
 * (perfil "observabilidade"). Um registro por aplicação, não o global da biblioteca: os testes
 * sobem várias APIs no mesmo processo.
 */
@Injectable()
export class Metrics {
  readonly registry = new Registry();

  /** Latência por rota. A rota é o modelo (`/api/budgets/:id`), não a URL: um id por série não escala. */
  readonly http = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Tempo de resposta da API, por método, rota e status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    // De 5 ms a 2,5 s: a faixa em que as ações da tela caem (ver o benchmark).
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  private readonly cacheRequests = new Counter({
    name: 'budgets_cache_requests_total',
    help: 'Leituras no redis-cache, por cache e resultado.',
    labelNames: ['cache', 'result'] as const,
    registers: [this.registry],
  });

  private readonly searchRequests = new Counter({
    name: 'budgets_search_requests_total',
    help: 'Buscas, por tipo e por motor que respondeu (o Postgres só quando o Elasticsearch falha).',
    labelNames: ['search', 'engine'] as const,
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'api' });
    // CPU, memória, atraso do event loop, coleta de lixo: o básico de qualquer processo Node.
    collectDefaultMetrics({ register: this.registry });
  }

  cache(name: string, result: CacheResult): void {
    this.cacheRequests.inc({ cache: name, result });
  }

  search(name: string, engine: 'elasticsearch' | 'postgres_fallback'): void {
    this.searchRequests.inc({ search: name, engine });
  }
}

@Controller('metrics')
export class MetricsController {
  constructor(@Inject(Metrics) private readonly metrics: Metrics) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
