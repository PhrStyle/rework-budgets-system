import type { BudgetDetail, DraftOpInput } from '@budgets/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useUser } from '../session.js';
import { ApiFailure, api } from './client.js';
import { keys } from './queries.js';

/**
 * A resposta de uma edição pode chegar depois da resposta de uma edição posterior. Só vale mostrar
 * se ela for tão ou mais nova que a atual, pelo contador de alterações do rascunho.
 */
export function isNewer(current: BudgetDetail | undefined, incoming: BudgetDetail): boolean {
  if (!current?.draft || !incoming.draft) return true;
  return incoming.draft.changes >= current.draft.changes;
}

/** Avisa as outras abas do mesmo orçamento (mesmo navegador) que algo mudou. */
function channel(budgetId: number): BroadcastChannel {
  return new BroadcastChannel(`orcamento:${budgetId}`);
}

/** Outra aba editou ou salvou este orçamento: esta recarrega do servidor (do rascunho). */
export function useSyncAcrossTabs(budgetId: number): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const ch = channel(budgetId);
    ch.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
      void queryClient.invalidateQueries({ queryKey: ['groupItems', budgetId] });
    };
    return () => {
      ch.close();
    };
  }, [budgetId, queryClient]);
}

/**
 * Ações do rascunho: abrir, editar, salvar e descartar. A tela nunca calcula: mostra o que a API
 * devolveu. Edições rápidas podem voltar fora de ordem; o contador `changes` do rascunho decide
 * qual resposta é a mais nova.
 */
export function useDraft(budgetId: number) {
  const queryClient = useQueryClient();
  const viewer = useUser()?.id;
  const detailKey = keys.budget(budgetId, viewer);
  const [error, setError] = useState<string | null>(null);

  const showDetail = (detail: BudgetDetail) => {
    if (isNewer(queryClient.getQueryData<BudgetDetail>(detailKey), detail)) {
      queryClient.setQueryData(detailKey, detail);
    }
  };
  const refreshItems = () =>
    queryClient.invalidateQueries({ queryKey: ['groupItems', budgetId, viewer] });
  const notifyTabs = () => {
    const ch = channel(budgetId);
    ch.postMessage('mudou');
    ch.close();
  };
  const onError = (e: Error) => {
    setError(
      e instanceof ApiFailure ? `${e.message} (código ${e.body.requestId.slice(0, 8)})` : e.message,
    );
    // Bloqueio de outra pessoa (423) ou rascunho que expirou (410): mostra o estado real.
    void queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
  };
  const ok = () => {
    setError(null);
    notifyTabs();
  };

  const open = useMutation({
    mutationFn: () => api.openDraft(budgetId),
    onSuccess: (detail) => {
      queryClient.setQueryData(detailKey, detail);
      void refreshItems();
      ok();
    },
    onError,
  });

  const apply = useMutation({
    mutationFn: (ops: DraftOpInput[]) => api.applyOps(budgetId, ops),
    onSuccess: (result) => {
      showDetail(result.detail);
      void refreshItems();
      ok();
    },
    onError,
  });

  const save = useMutation({
    mutationFn: () => api.saveDraft(budgetId),
    onSuccess: (result) => {
      queryClient.setQueryData(detailKey, result.detail);
      // As versões dos grupos salvos mudaram: as listas antigas ficam para trás no cache.
      queryClient.removeQueries({ queryKey: ['groupItems', budgetId] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      ok();
    },
    onError,
  });

  const discard = useMutation({
    mutationFn: () => api.discardDraft(budgetId),
    onSuccess: (detail) => {
      queryClient.setQueryData(detailKey, detail);
      queryClient.removeQueries({ queryKey: ['groupItems', budgetId] });
      ok();
    },
    onError,
  });

  return {
    open: () => {
      open.mutate();
    },
    apply: (...ops: DraftOpInput[]) => {
      apply.mutate(ops);
    },
    save: () => {
      save.mutate();
    },
    discard: () => {
      discard.mutate();
    },
    busy: open.isPending || apply.isPending || save.isPending || discard.isPending,
    saving: save.isPending,
    error,
    clearError: () => {
      setError(null);
    },
  };
}

export type DraftActions = ReturnType<typeof useDraft>;
