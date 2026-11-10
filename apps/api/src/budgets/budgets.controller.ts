import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { budgetListQuery, groupItemsQuery, idParam } from '@budgets/contracts';
import type {
  BudgetDetail,
  BudgetListQuery,
  BudgetSummary,
  GroupItemsPage,
  GroupItemsQuery,
  Page,
} from '@budgets/contracts';

import { USER_HEADER } from '../auth/current-user.js';
import { BudgetsService } from './budgets.service.js';

/** Quem está vendo (opcional na leitura): o dono do rascunho vê as próprias alterações. */
const viewer = (header?: string): number | null =>
  header && /^\d{1,9}$/.test(header) ? Number(header) : null;

@Controller('budgets')
export class BudgetsController {
  constructor(@Inject(BudgetsService) private readonly budgets: BudgetsService) {}

  @Get()
  list(@Query({ schema: budgetListQuery }) query: BudgetListQuery): Promise<Page<BudgetSummary>> {
    return this.budgets.list(query);
  }

  @Get(':id')
  detail(
    @Param('id', { schema: idParam }) id: number,
    @Headers(USER_HEADER) user?: string,
  ): Promise<BudgetDetail> {
    return this.budgets.detail(id, viewer(user));
  }

  @Get(':id/groups/:groupId/items')
  groupItems(
    @Param('id', { schema: idParam }) id: number,
    @Param('groupId', { schema: idParam }) groupId: number,
    @Query({ schema: groupItemsQuery }) query: GroupItemsQuery,
    @Headers(USER_HEADER) user?: string,
  ): Promise<GroupItemsPage> {
    return this.budgets.groupItems(id, groupId, query, viewer(user));
  }
}
