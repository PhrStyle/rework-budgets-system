// Contratos da API nova: tipos das respostas e da entrada, usados pela API e pela tela (a
// validação com Zod fica em `./schemas`). Uma mudança incompatível quebra o build,
// não o usuário (problema 13: na legada, os DTOs eram copiados à mão no front).
//
// Unidades: *Cents = centavos; *Bp = pontos-base (7,5% = 750); quantity = centésimos (2,5 m = 250).

import type { BudgetStatus, Unit } from './constants.js';

export { BUDGET_STATUSES, UNITS } from './constants.js';
export type { BudgetStatus, Unit } from './constants.js';
export type {
  BudgetListQuery,
  DraftOp,
  DraftOpInput,
  DraftOpsBody,
  GroupItemsQuery,
  ProductSearchQuery,
} from './schemas.js';

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
