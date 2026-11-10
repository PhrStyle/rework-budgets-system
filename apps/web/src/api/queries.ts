import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useUser } from '../session.js';
import { api } from './client.js';
import type { BudgetFilters } from './client.js';

/**
 * O cache da tela é o TanStack Query, em memória, por aba: no lugar do `localStorage` da legada
 * (por navegador, sem validade, com chaves órfãs depois de salvar).
 *
 * O usuário entra na chave: o mesmo orçamento aparece diferente para o dono do rascunho (com as
 * alterações dele) e para os outros (o salvo). Trocar de usuário nunca mostra a visão do anterior.
 */
export const keys = {
  sellers: ['sellers'] as const,
  budgets: (f: BudgetFilters) => ['budgets', f] as const,
  budget: (id: number, viewer: number | undefined) => ['budget', id, viewer] as const,
  // A versão do grupo vai na chave, como no redis-cache: salvar muda a versão, e a tela busca a
  // lista nova. Para o dono do rascunho, a lista também muda a cada edição (invalidada então).
  groupItems: (budgetId: number, viewer: number | undefined, groupId: number, version: number) =>
    ['groupItems', budgetId, viewer, groupId, version] as const,
  products: (search: string) => ['products', search] as const,
};

export const useSellers = () =>
  useQuery({ queryKey: keys.sellers, queryFn: api.sellers, staleTime: Infinity });

export const useBudgets = (filters: BudgetFilters) =>
  useQuery({
    queryKey: keys.budgets(filters),
    queryFn: () => api.budgets(filters),
    // Enquanto a próxima página ou busca carrega, a tabela continua mostrando a anterior.
    placeholderData: keepPreviousData,
  });

export function useBudget(id: number) {
  const viewer = useUser()?.id;
  return useQuery({ queryKey: keys.budget(id, viewer), queryFn: () => api.budget(id) });
}

export function useGroupItems(
  budgetId: number,
  groupId: number,
  version: number,
  enabled: boolean,
) {
  const viewer = useUser()?.id;
  return useInfiniteQuery({
    queryKey: keys.groupItems(budgetId, viewer, groupId, version),
    queryFn: ({ pageParam }) => api.groupItems(budgetId, groupId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: Infinity,
    enabled,
  });
}

export const useProductSearch = (search: string) =>
  useQuery({
    queryKey: keys.products(search),
    queryFn: () => api.products(search),
    enabled: search.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
