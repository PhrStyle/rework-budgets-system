import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { budgetListQuery, groupItemsQuery, idParam } from '@budgets/contracts';
import type {
  BudgetDetail,
  BudgetListQuery,
  BudgetSummary,
  GroupItemsPage,
  GroupItemsQuery,
  Page,
} from '@budgets/contracts';

import { BudgetsService } from './budgets.service.js';

@Controller('budgets')
export class BudgetsController {
  constructor(@Inject(BudgetsService) private readonly budgets: BudgetsService) {}

  @Get()
  list(@Query({ schema: budgetListQuery }) query: BudgetListQuery): Promise<Page<BudgetSummary>> {
    return this.budgets.list(query);
  }

  @Get(':id')
  detail(@Param('id', { schema: idParam }) id: number): Promise<BudgetDetail> {
    return this.budgets.detail(id);
  }

  @Get(':id/groups/:groupId/items')
  groupItems(
    @Param('id', { schema: idParam }) id: number,
    @Param('groupId', { schema: idParam }) groupId: number,
    @Query({ schema: groupItemsQuery }) query: GroupItemsQuery,
  ): Promise<GroupItemsPage> {
    return this.budgets.groupItems(id, groupId, query);
  }
}
