import type { GroupSummary } from '@budgets/contracts';
import { useState } from 'react';

import { useGroupItems } from '../api/queries.js';
import { brl, pct, quantity } from '../format.js';
import { useOnVisible } from '../hooks.js';

/**
 * Um grupo do orçamento: fechado, mostra só o resumo (veio no detalhe). Aberto, carrega os itens
 * por página, e a próxima página vem quando o fim da lista aparece na tela.
 */
export function GroupCard({ budgetId, group }: { budgetId: number; group: GroupSummary }) {
  const [open, setOpen] = useState(false);
  const items = useGroupItems(budgetId, group.id, group.version, open);
  const sentinel = useOnVisible<HTMLDivElement>(() => {
    if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
  }, open && items.hasNextPage);
  const rows = items.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className={`card group${open ? ' open' : ''}`}>
      <div
        className="g-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        <span className="chev">▶</span>
        <span className="nome-grupo">{group.name}</span>
        <span className="cat">{group.category}</span>
        <span className="sp" />
        <span className="muted sm">{group.itemCount} itens</span>
        <span className="grupo-subtotal">{brl(group.subtotalCents)}</span>
      </div>
      {open && (
        <div className="g-body">
          <div className="it h">
            <span />
            <span>Produto</span>
            <span className="num">Qtd</span>
            <span className="num">Desc.</span>
            <span className="num unitario">Unitário</span>
            <span className="num">Total</span>
            <span />
          </div>
          {rows.map((i) => (
            <div className="it" key={i.id}>
              <span />
              <span>{i.name}</span>
              <span className="num">{quantity(i.quantity, i.unit)}</span>
              <span className="num">{i.discountBp ? pct(i.discountBp) : '—'}</span>
              <span className="num muted unitario">{brl(i.priceCents)}</span>
              <span className="num">{brl(i.totalCents)}</span>
              <span />
            </div>
          ))}
          {items.isPending && <p className="carregando">Carregando itens…</p>}
          {items.isFetchingNextPage && <p className="carregando">Carregando mais itens…</p>}
          {items.error && (
            <p className="carregando">Não foi possível carregar: {items.error.message}</p>
          )}
          <div ref={sentinel} />
        </div>
      )}
    </div>
  );
}
