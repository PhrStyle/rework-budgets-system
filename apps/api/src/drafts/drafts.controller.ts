import { Body, Controller, Delete, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { draftOpsBody, idParam } from '@budgets/contracts/schemas';
import type {
  BudgetDetail,
  DraftOpsBody,
  DraftOpsResult,
  Ref,
  SaveResult,
} from '@budgets/contracts';

import { CurrentUser, UserGuard } from '../auth/current-user.js';
import { DraftsService } from './drafts.service.js';

/**
 * Edição em rascunho: abrir, editar (só no Redis), salvar (o changeset no Postgres) ou descartar.
 * Não há salvamento automático: só "Salvar alterações" torna a mudança oficial (ADR 0004).
 */
@Controller('budgets/:id/draft')
@UseGuards(UserGuard)
export class DraftsController {
  constructor(@Inject(DraftsService) private readonly drafts: DraftsService) {}

  @Post()
  @HttpCode(200)
  open(
    @Param('id', { schema: idParam }) id: number,
    @CurrentUser() user: Ref,
  ): Promise<BudgetDetail> {
    return this.drafts.open(id, user);
  }

  @Post('ops')
  @HttpCode(200)
  apply(
    @Param('id', { schema: idParam }) id: number,
    @CurrentUser() user: Ref,
    @Body({ schema: draftOpsBody }) body: DraftOpsBody,
  ): Promise<DraftOpsResult> {
    return this.drafts.apply(id, user, body.ops);
  }

  @Post('save')
  @HttpCode(200)
  save(
    @Param('id', { schema: idParam }) id: number,
    @CurrentUser() user: Ref,
  ): Promise<SaveResult> {
    return this.drafts.save(id, user);
  }

  @Delete()
  discard(
    @Param('id', { schema: idParam }) id: number,
    @CurrentUser() user: Ref,
  ): Promise<BudgetDetail> {
    return this.drafts.discard(id, user);
  }
}
