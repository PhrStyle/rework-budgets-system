import { LIMITS } from '@budgets/budget-calc';
import { z } from 'zod';

// Contratos da API nova. A entrada é validada com estes schemas (Standard Schema, no Nest 12);
// as respostas são tipos, usados pela API e pela tela. Uma mudança incompatível quebra o build,
// não o usuário (problema 13: na legada, os DTOs eram copiados à mão no front).
//
// Unidades: *Cents = centavos; *Bp = pontos-base (7,5% = 750); quantity = centésimos (2,5 m = 250).

export const BUDGET_STATUSES = ['Rascunho', 'Enviado', 'Aprovado', 'Perdido'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const UNITS = ['un', 'm', 'l', 'kg'] as const;
export type Unit = (typeof UNITS)[number];

// Mensagens de validação em português (devolvidas ao cliente no 400).
z.config(z.locales.pt());

const id = z.coerce.number().int().positive().max(2_147_483_647);

// ---------- entrada ----------

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

// ---------- respostas ----------

export interface Ref {
  id: number;
  name: string;
}

export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface BudgetSummary {
  id: number;
  description: string;
  client: Ref;
  seller: Ref;
  status: BudgetStatus;
  totalCents: number;
  createdAt: string;
  /** Orçamento que contém este, se houver. */
  parentId: number | null;
}

/** Totais do orçamento, em centavos. Sempre vale `subtotal + prazoAmount + margemAmount === total`. */
export interface BudgetTotals {
  groupsTotal: number;
  childrenTotal: number;
  subtotal: number;
  prazoAmount: number;
  afterPrazo: number;
  margemAmount: number;
  total: number;
}

export interface GroupSummary {
  id: number;
  name: string;
  category: string;
  position: number;
  /** Sobe a cada gravação do grupo: o salvamento que partiu de uma versão antiga é recusado. */
  version: number;
  subtotalCents: number;
  itemCount: number;
}

/** Rascunho aberto: quem está editando e até quando o bloqueio vale sem nova edição. */
export interface DraftInfo {
  ownerId: number;
  ownerName: string;
  expiresAt: string;
  /** Operações aplicadas desde que o rascunho foi aberto. */
  changes: number;
  /** `true` quando quem pediu é o dono: a resposta já mostra o rascunho. */
  mine: boolean;
}

export interface BudgetDetail {
  id: number;
  description: string;
  client: Ref;
  seller: Ref;
  status: BudgetStatus;
  prazoBp: number;
  margemBp: number;
  createdAt: string;
  updatedAt: string;
  parent: { id: number; description: string } | null;
  totals: BudgetTotals;
  /** Só o resumo de cada grupo: os itens vêm sob demanda, por página. */
  groups: GroupSummary[];
  children: { id: number; description: string; totalCents: number }[];
  /** Rascunho aberto neste orçamento (por qualquer usuário), ou `null`. */
  draft: DraftInfo | null;
}

export interface Item {
  id: number;
  productId: number;
  name: string;
  unit: Unit;
  priceCents: number;
  quantity: number;
  discountBp: number;
  position: number;
  totalCents: number;
}

export interface GroupItemsPage {
  groupId: number;
  version: number;
  itemCount: number;
  items: Item[];
  /** Cursor da próxima página (`after`), ou `null` na última. */
  next: number | null;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  priceCents: number;
}

export interface DraftOpsResult {
  detail: BudgetDetail;
  /** Itens criados ou alterados por estas operações, com o total recalculado. */
  items: Item[];
  removedItemIds: number[];
}

export interface SaveResult {
  detail: BudgetDetail;
  /** Ids definitivos dos grupos e itens criados no rascunho (id negativo → id do banco). */
  createdIds: { groups: Record<string, number>; items: Record<string, number> };
  written: { groups: number; items: number };
  ms: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  /** O mesmo ID dos logs desta requisição: o suporte acha o log a partir da tela de erro. */
  requestId: string;
  /** Dados extras do erro (ex.: quem segura o bloqueio, grupos em conflito). */
  details?: unknown;
}
