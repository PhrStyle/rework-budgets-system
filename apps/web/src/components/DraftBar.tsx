import type { BudgetDetail } from '@budgets/contracts';

import type { DraftActions } from '../api/draft.js';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Barra do rascunho: o que ainda não foi salvo, até quando o rascunho (e o bloqueio) vale sem
 * nova edição, e as duas saídas, Salvar ou Descartar. Não há salvamento automático (ADR 0004).
 */
export function DraftBar({ budget, draft }: { budget: BudgetDetail; draft: DraftActions }) {
  const info = budget.draft;

  if (!info) {
    return (
      <div className="card barra">
        <span className="dot" />
        <span>
          Somente leitura. Editar abre um rascunho só seu: nada vai para o orçamento até salvar.
        </span>
        <span className="sp" />
        <button type="button" className="primary" disabled={draft.busy} onClick={draft.open}>
          Editar
        </button>
      </div>
    );
  }
  if (!info.mine) return null; // o aviso de quem está editando aparece acima

  return (
    <div className="card barra fixa" role="status">
      <span className={`dot${info.changes > 0 ? ' warn' : ''}`} />
      <span>
        <b>
          {info.changes === 0
            ? 'Rascunho aberto, sem alterações'
            : `${info.changes} ${info.changes === 1 ? 'alteração' : 'alterações'} no rascunho`}
        </b>{' '}
        <span className="muted">
          · guardado no servidor (sobrevive a fechar o navegador) · vale até {time(info.expiresAt)}{' '}
          sem nova edição
        </span>
      </span>
      {draft.busy && <span className="muted sm">atualizando…</span>}
      <span className="sp" />
      <button
        type="button"
        disabled={draft.busy}
        onClick={() => {
          if (info.changes === 0 || confirm('Descartar todas as alterações do rascunho?'))
            draft.discard();
        }}
      >
        Descartar
      </button>
      <button
        type="button"
        className="primary"
        disabled={draft.busy || info.changes === 0}
        onClick={draft.save}
      >
        {draft.saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
      {draft.error && (
        <div className="erro" role="alert">
          {draft.error}{' '}
          <button type="button" className="ghost" onClick={draft.clearError}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
