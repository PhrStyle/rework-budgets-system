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

export interface ApiError {
  statusCode: number;
  message: string | string[];
  /** O mesmo ID dos logs desta requisição: o suporte acha o log a partir da tela de erro. */
  requestId: string;
}
