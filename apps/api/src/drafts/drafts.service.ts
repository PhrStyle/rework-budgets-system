import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { DraftOp, DraftOpsResult, Ref, SaveResult } from '@budgets/contracts';

import { BudgetsService, itemOf } from '../budgets/budgets.service.js';
import { Database } from '../db/database.js';
import { isSaving } from './draft.js';
import type { Draft } from './draft.js';
import { DraftEditor } from './draft-editor.js';
import { DraftSaver } from './draft-saver.js';
import { DraftStore } from './draft.store.js';

@Injectable()
export class DraftsService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(DraftStore) private readonly store: DraftStore,
    @Inject(DraftSaver) private readonly saver: DraftSaver,
    @Inject(BudgetsService) private readonly budgets: BudgetsService,
  ) {}

  /** Abre (ou retoma) o rascunho do usuário: daqui em diante, os outros só leem. */
  async open(budgetId: number, user: Ref) {
    await this.budgets.detail(budgetId); // 404 antes de criar rascunho de orçamento inexistente
    await this.store.open(budgetId, user);
    return this.budgets.detail(budgetId, user.id);
  }

  /**
   * Aplica as operações ao rascunho, todas ou nenhuma: se uma falhar, o rascunho fica como
   * estava. Nada vai para o Postgres.
   */
  async apply(budgetId: number, user: Ref, ops: DraftOp[]): Promise<DraftOpsResult> {
    const { draft, result: editor } = await this.store.update(budgetId, user.id, async (d) => {
      assertNotSaving(d);
      const editor = new DraftEditor(this.db.prisma, d);
      for (const op of ops) await editor.apply(op);
      return editor;
    });

    return {
      detail: await this.budgets.detail(budgetId, user.id),
      items: [...editor.touchedItems].flatMap((id) => {
        const item = draft.items[id];
        return item && !item.deleted ? [itemOf(item)] : [];
      }),
      removedItemIds: [...editor.removedItems],
    };
  }

  /** "Salvar alterações": grava o changeset no Postgres e encerra o rascunho (e o bloqueio). */
  async save(budgetId: number, user: Ref): Promise<SaveResult> {
    const started = performance.now();
    const { draft } = await this.store.update(budgetId, user.id, (d) => {
      assertNotSaving(d);
      d.savingSince = new Date().toISOString();
      return Promise.resolve();
    });

    let outcome;
    try {
      outcome = await this.saver.save(draft);
    } catch (error) {
      // Nada foi gravado: o rascunho continua, sem a marca de "salvando".
      await this.store.update(budgetId, user.id, (d) => {
        d.savingSince = null;
        return Promise.resolve();
      });
      throw error;
    }
    await this.store.delete(budgetId);

    return {
      detail: await this.budgets.detail(budgetId, user.id),
      ...outcome,
      ms: Math.round(performance.now() - started),
    };
  }

  /** "Descartar": apaga o rascunho sem gravar nada. */
  async discard(budgetId: number, user: Ref) {
    const draft = await this.store.require(budgetId, user.id);
    assertNotSaving(draft);
    await this.store.delete(budgetId);
    return this.budgets.detail(budgetId, user.id);
  }
}

function assertNotSaving(draft: Draft): void {
  if (isSaving(draft)) throw new ConflictException('O rascunho está sendo salvo; aguarde.');
}
