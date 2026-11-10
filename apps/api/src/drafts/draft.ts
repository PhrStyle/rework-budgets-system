import type { BudgetStatus, GroupSummary, Item, Unit } from '@budgets/contracts';

/**
 * Rascunho de edição de um orçamento, guardado no Redis como um JSON só.
 *
 * Guarda **só o que mudou**: cada grupo ou item tocado, no estado atual (não a operação). Editar
 * 3 itens de um orçamento de 1.000 deixa 3 itens aqui. A leitura sobrepõe isto ao Postgres.
 * Ids negativos são grupos e itens criados no rascunho; viram ids do banco ao salvar.
 */
export interface Draft {
  budgetId: number;
  ownerId: number;
  ownerName: string;
  createdAt: string;
  /** Operações aplicadas desde a abertura. */
  changes: number;
  /** Revisão: sobe a cada gravação. A gravação só vale se ninguém gravou depois da leitura. */
  rev: number;
  /**
   * Início do salvamento em curso: enquanto isso, novas operações são recusadas. É uma hora, não
   * um booleano, para não travar o rascunho se o processo cair no meio (vence em 60 s).
   */
  savingSince: string | null;
  header: Partial<{ description: string; status: BudgetStatus; prazoBp: number; margemBp: number }>;
  groups: Record<string, DraftGroup>;
  items: Record<string, DraftItem>;
  /** Próximo id temporário (−1, −2, …). */
  nextTempId: number;
}

export interface DraftGroup extends GroupSummary {
  /** Versão do grupo no banco quando o rascunho o tocou; `null` para grupo novo. */
  baseVersion: number | null;
  deleted: boolean;
}

export interface DraftItem extends Item {
  groupId: number;
  /** Posição no banco antes da edição; `null` para item novo. */
  basePosition: number | null;
  deleted: boolean;
}

export const draftKey = (budgetId: number): string => `draft:budget:${budgetId}`;

export function newDraft(budgetId: number, owner: { id: number; name: string }): Draft {
  return {
    budgetId,
    ownerId: owner.id,
    ownerName: owner.name,
    createdAt: new Date().toISOString(),
    changes: 0,
    rev: 0,
    savingSince: null,
    header: {},
    groups: {},
    items: {},
    nextTempId: -1,
  };
}

export const isUnit = (value: string): value is Unit => ['un', 'm', 'l', 'kg'].includes(value);

const SAVE_TIMEOUT_MS = 60_000;

export function isSaving(draft: Draft, now = Date.now()): boolean {
  return draft.savingSince !== null && now - Date.parse(draft.savingSince) < SAVE_TIMEOUT_MS;
}
