import type {
  ApiError,
  BudgetDetail,
  BudgetSummary,
  GroupItemsPage,
  Page,
  Product,
  Ref,
} from '@budgets/contracts';

import { currentUser } from '../session.js';

/** Erro da API, com o formato padrão dela (inclui o ID da requisição, para achar o log). */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(Array.isArray(body.message) ? body.message.join('; ') : body.message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const user = currentUser();
  // `Headers` aceita objeto, lista de pares ou outro `Headers`; espalhar (`...`) perderia os dois últimos.
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (user) headers.set('x-user-id', String(user.id));
  const res = await fetch(`/api${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiFailure(
      res.status,
      (body as ApiError | null) ?? {
        statusCode: res.status,
        message: `Erro ${res.status}`,
        requestId: res.headers.get('x-request-id') ?? '',
      },
    );
  }
  return body;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number] => e[1] !== undefined && e[1] !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

// Uma função por endpoint, com os tipos de `packages/contracts`: se a API mudar um campo,
// a tela não compila (na legada, os DTOs eram copiados à mão no front).

export interface BudgetFilters {
  search?: string;
  status?: string;
  page?: number;
}

export const api = {
  sellers: async () => (await request('/sellers')) as Ref[],
  budgets: async (f: BudgetFilters) =>
    (await request(
      `/budgets${qs({ search: f.search, status: f.status, page: f.page })}`,
    )) as Page<BudgetSummary>,
  budget: async (id: number) => (await request(`/budgets/${id}`)) as BudgetDetail,
  groupItems: async (budgetId: number, groupId: number, after?: number) =>
    (await request(
      `/budgets/${budgetId}/groups/${groupId}/items${qs({ after, limit: 100 })}`,
    )) as GroupItemsPage,
  products: async (search: string) =>
    (await request(`/products${qs({ search, limit: 10 })}`)) as Product[],
};
