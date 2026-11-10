import { BUDGET_STATUSES } from '@budgets/contracts';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useBudgets } from '../api/queries.js';
import { brl, date } from '../format.js';
import { useDebounced } from '../hooks.js';

export function BudgetList() {
  // Busca, status e página ficam na URL: o link já filtrado pode ser compartilhado, e o "voltar" funciona.
  const [params, setParams] = useSearchParams();
  const [typed, setTyped] = useState(params.get('q') ?? '');
  const search = useDebounced(typed.trim(), 250);
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const list = useBudgets({ search, status, page });

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  };
  // A busca digitada (depois da pausa) vai para a URL e volta para a página 1. Só quando muda:
  // abrir um link com `?q=…&page=3` mantém a página 3.
  useEffect(() => {
    setParams(
      (current) => {
        if ((current.get('q') ?? '') === search) return current;
        const next = new URLSearchParams(current);
        if (search) next.set('q', search);
        else next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [search, setParams]);

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="pagehead">
        <div>
          <h2>Orçamentos</h2>
          <p className="muted">
            {data ? `${data.total.toLocaleString('pt-BR')} orçamentos` : 'Carregando…'} · busca sem
            acentos, com erro de digitação e por número
          </p>
        </div>
      </div>
      <div className="filters">
        <input
          type="search"
          placeholder="Buscar por descrição, cliente ou número"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
          aria-label="Buscar orçamentos"
        />
        <select
          value={status}
          onChange={(e) => {
            update({ status: e.target.value, page: '' });
          }}
          aria-label="Status"
        >
          <option value="">Todos os status</option>
          {BUDGET_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="card" style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Descrição</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((b) => (
              <tr key={b.id}>
                <td className="id">#{b.id}</td>
                <td>
                  <Link to={`/orcamentos/${b.id}`}>{b.description}</Link>
                </td>
                <td>{b.client.name}</td>
                <td>{b.seller.name}</td>
                <td className="num">{brl(b.totalCents)}</td>
                <td>
                  <span className={`pill st-${b.status}`}>{b.status}</span>
                </td>
                <td className="muted">{date(b.createdAt)}</td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Nenhum orçamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="pager">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              update({ page: String(page - 1) });
            }}
          >
            ← Anterior
          </button>
          <span className="muted sm">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => {
              update({ page: String(page + 1) });
            }}
          >
            Próxima →
          </button>
        </div>
      </div>
      {list.error && <div className="aviso">Não foi possível carregar: {list.error.message}</div>}
    </>
  );
}
