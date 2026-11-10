import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from './client.js';
import type { BudgetFilters } from './client.js';

/**
 * O cache da tela é o TanStack Query, em memória, por aba: no lugar do `localStorage` da legada
 * (por navegador, sem validade, com chaves órfãs depois de salvar).
 */
export const keys = {
  sellers: ['sellers'] as const,
  budgets: (f: BudgetFilters) => ['budgets', f] as const,
  budget: (id: number) => ['budget', id] as const,
  // A versão do grupo vai na chave, como no redis-cache: salvar muda a versão, e a tela busca a
  // lista nova em vez de mostrar a velha. Por versão, os itens não mudam: nunca ficam "velhos".
  groupItems: (budgetId: number, groupId: number, version: number) =>
    ['groupItems', budgetId, groupId, version] as const,
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

export const useBudget = (id: number) =>
  useQuery({ queryKey: keys.budget(id), queryFn: () => api.budget(id) });

export const useGroupItems = (
  budgetId: number,
  groupId: number,
  version: number,
  enabled: boolean,
) =>
  useInfiniteQuery({
    queryKey: keys.groupItems(budgetId, groupId, version),
    queryFn: ({ pageParam }) => api.groupItems(budgetId, groupId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: Infinity,
    enabled,
  });
