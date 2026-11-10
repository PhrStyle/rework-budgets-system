import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { Client, estypes } from '@elastic/elasticsearch';
import type {
  BudgetListQuery,
  BudgetSummary,
  Page,
  Product,
  ProductSearchQuery,
} from '@budgets/contracts';

import { Metrics } from '../metrics/metrics.js';
import type { BudgetDocument } from '../worker/indexer.js';
import { createElastic } from './elastic.js';
import { BUDGETS, PRODUCTS } from './indices.js';

export const ELASTICSEARCH_URL = Symbol('ELASTICSEARCH_URL');

/** Com a busca fora do ar, um aviso por intervalo, não um por requisição. */
const WARN_EVERY_MS = 30_000;

/**
 * Busca no Elasticsearch: sem diferenciar maiúsculas nem acentos, com tolerância a erro de
 * digitação e por prefixo. Devolve `null` se o Elasticsearch falhar: quem chama cai para o
 * Postgres (a busca fica pior, mas a tela não quebra).
 */
@Injectable()
export class SearchService implements OnApplicationShutdown {
  private readonly logger = new Logger(SearchService.name);
  private readonly es: Client;
  private lastWarn = 0;

  constructor(
    @Inject(ELASTICSEARCH_URL) url: string,
    @Inject(Metrics) private readonly metrics: Metrics,
  ) {
    this.es = createElastic(url);
  }

  async budgets(query: BudgetListQuery): Promise<Page<BudgetSummary> | null> {
    const filter: estypes.QueryDslQueryContainer[] = [];
    if (query.status) filter.push({ term: { status: query.status } });
    if (query.sellerId) filter.push({ term: { sellerId: query.sellerId } });

    const text = query.search;
    // Texto em descrição e cliente, ou o número do orçamento (que vem primeiro).
    const should: estypes.QueryDslQueryContainer[] = text
      ? [textQuery(text, ['description', 'clientName'])]
      : [];
    if (text && /^\d{1,9}$/.test(text))
      should.push({ term: { id: { value: Number(text), boost: 10 } } });
    const must = should.length > 0 ? [{ bool: { should, minimum_should_match: 1 } }] : [];

    return this.run('budgets', async () => {
      const res = await this.es.search<BudgetDocument>({
        index: BUDGETS,
        query: { bool: { must, filter } },
        sort: text
          ? ['_score', { createdAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
        from: (query.page - 1) * query.pageSize,
        size: query.pageSize,
        track_total_hits: true,
      });
      const total = res.hits.total;
      return {
        total: typeof total === 'number' ? total : (total?.value ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        items: res.hits.hits.flatMap((hit) => {
          const d = hit._source;
          if (!d) return [];
          return [
            {
              id: d.id,
              description: d.description,
              client: { id: d.clientId, name: d.clientName },
              seller: { id: d.sellerId, name: d.sellerName },
              status: d.status,
              totalCents: d.totalCents,
              createdAt: d.createdAt,
              parentId: d.parentId,
            },
          ];
        }),
      };
    });
  }

  async products(query: ProductSearchQuery): Promise<Product[] | null> {
    return this.run('products', async () => {
      const res = await this.es.search<Product>({
        index: PRODUCTS,
        query: {
          bool: {
            should: [
              textQuery(query.search, ['name']),
              { match: { 'sku.prefix': { query: query.search, operator: 'and' } } },
            ],
            minimum_should_match: 1,
          },
        },
        sort: ['_score', { id: 'asc' }],
        size: query.limit,
      });
      return res.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []));
    });
  }

  onApplicationShutdown(): Promise<void> {
    return this.es.close();
  }

  private async run<T>(name: string, search: () => Promise<T>): Promise<T | null> {
    try {
      const result = await search();
      this.metrics.search(name, 'elasticsearch');
      return result;
    } catch (error) {
      this.metrics.search(name, 'postgres_fallback');
      if (Date.now() - this.lastWarn > WARN_EVERY_MS) {
        this.lastWarn = Date.now();
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Elasticsearch indisponível; buscando no Postgres',
        );
      }
      return null;
    }
  }
}

/**
 * Casa o texto de dois jeitos, e o melhor vence: palavra inteira com tolerância a erro de
 * digitação ("cmaera" → "câmera") e prefixo ("instal" → "instalação"). Todas as palavras precisam
 * aparecer (`and`), como o usuário espera de uma busca que vai filtrando.
 */
function textQuery(text: string, fields: string[]): estypes.QueryDslQueryContainer {
  return {
    bool: {
      should: [
        {
          multi_match: {
            query: text,
            fields: fields.map((f) => `${f}^2`),
            fuzziness: 'AUTO',
            operator: 'and',
          },
        },
        { multi_match: { query: text, fields: fields.map((f) => `${f}.prefix`), operator: 'and' } },
      ],
      minimum_should_match: 1,
    },
  };
}
