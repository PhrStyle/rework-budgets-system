import { LIMITS } from '@budgets/budget-calc';
import { z } from 'zod';

import { BUDGET_STATUSES } from './constants.js';

// Validação da entrada da API (Standard Schema, no Nest 12). Fica numa entrada separada
// (`@budgets/contracts/schemas`): a tela importa só tipos e constantes e não leva o Zod no JS.

// Mensagens de validação em português (devolvidas ao cliente no 400).
z.config(z.locales.pt());

const id = z.coerce.number().int().positive().max(2_147_483_647);

export const idParam = id;

export const budgetListQuery = z.object({
  /** Descrição, nome do cliente ou número do orçamento. */
  search: z.string().trim().max(100).optional(),
  status: z.enum(BUDGET_STATUSES).optional(),
  sellerId: id.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type BudgetListQuery = z.infer<typeof budgetListQuery>;

export const groupItemsQuery = z.object({
  /** Cursor: a `position` do último item recebido; a próxima página começa depois dele. */
  after: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type GroupItemsQuery = z.infer<typeof groupItemsQuery>;

export const productSearchQuery = z.object({
  search: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ProductSearchQuery = z.infer<typeof productSearchQuery>;

// ---------- edição (rascunho) ----------

/** Id de grupo ou item. Negativo = criado no rascunho, ainda não salvo. */
const ref = z
  .number()
  .int()
  .refine((n) => n !== 0, 'id inválido');
const name = z.string().trim().min(1).max(120);
/** Centésimos da unidade; o passo de cada unidade ("un" sem fração) é conferido na API. */
const quantity = z.number().int().positive().max(1_000_000_000);
const discountBp = z.number().int().min(LIMITS.discount.min).max(LIMITS.discount.max);
/** Onde inserir: antes ou depois de um item; sem nenhum, vai para o fim do grupo. */
const anchor = { before: ref.optional(), after: ref.optional() };

export const draftOp = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('header'),
    description: z.string().trim().min(1).max(200).optional(),
    status: z.enum(BUDGET_STATUSES).optional(),
    prazoBp: z.number().int().min(LIMITS.prazo.min).max(LIMITS.prazo.max).optional(),
    margemBp: z.number().int().min(LIMITS.margem.min).max(LIMITS.margem.max).optional(),
  }),
  z.object({ op: z.literal('addGroup'), name, category: name }),
  z.object({
    op: z.literal('updateGroup'),
    groupId: ref,
    name: name.optional(),
    category: name.optional(),
  }),
  z.object({ op: z.literal('removeGroup'), groupId: ref }),
  z.object({
    op: z.literal('addItem'),
    groupId: ref,
    productId: id,
    quantity,
    discountBp: discountBp.default(0),
    ...anchor,
  }),
  z.object({
    op: z.literal('updateItem'),
    itemId: ref,
    quantity: quantity.optional(),
    discountBp: discountBp.optional(),
  }),
  z.object({ op: z.literal('removeItem'), itemId: ref }),
  z.object({ op: z.literal('moveItem'), itemId: ref, ...anchor }),
]);
/** Operação já validada (como a API recebe, com os valores padrão preenchidos). */
export type DraftOp = z.infer<typeof draftOp>;
/** Operação como o cliente envia (`discountBp` é opcional, padrão 0). */
export type DraftOpInput = z.input<typeof draftOp>;

/** Várias operações de uma vez (a tela agrupa o que o usuário fez em sequência). */
export const draftOpsBody = z.object({ ops: z.array(draftOp).min(1).max(100) });
export type DraftOpsBody = z.infer<typeof draftOpsBody>;
