import { Controller, Get, Inject, Query } from '@nestjs/common';
import { productSearchQuery } from '@budgets/contracts';
import type { Product, ProductSearchQuery, Ref, Unit } from '@budgets/contracts';

import { Database } from '../db/database.js';
import { SearchService } from '../search/search.service.js';

@Controller()
export class CatalogController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SearchService) private readonly search: SearchService,
  ) {}

  /** Autocomplete de produtos, pelo Elasticsearch; se ele falhar, pelo Postgres. */
  @Get('products')
  async products(
    @Query({ schema: productSearchQuery }) query: ProductSearchQuery,
  ): Promise<Product[]> {
    const found = await this.search.products(query);
    if (found) return found;

    const contains = { contains: query.search, mode: 'insensitive' } as const;
    const rows = await this.db.prisma.product.findMany({
      where: { OR: [{ name: contains }, { sku: contains }] },
      orderBy: { name: 'asc' },
      take: query.limit,
    });
    return rows.map((p) => ({ ...p, unit: p.unit as Unit }));
  }

  /** Vendedores, para o login simulado. */
  @Get('sellers')
  sellers(): Promise<Ref[]> {
    return this.db.prisma.seller.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    await this.db.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
