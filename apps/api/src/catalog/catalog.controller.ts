import { Controller, Get, Inject, Query } from '@nestjs/common';
import { productSearchQuery } from '@budgets/contracts';
import type { Product, ProductSearchQuery, Ref, Unit } from '@budgets/contracts';

import { Database } from '../db/database.js';

@Controller()
export class CatalogController {
  constructor(@Inject(Database) private readonly db: Database) {}

  /** Autocomplete de produtos. Vai para o Elasticsearch (com tolerância a erro de digitação) na etapa 7. */
  @Get('products')
  async products(
    @Query({ schema: productSearchQuery }) query: ProductSearchQuery,
  ): Promise<Product[]> {
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
