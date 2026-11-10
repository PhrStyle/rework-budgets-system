import type { GroupSummary, Item, Product } from '@budgets/contracts';
import { bp, parsePercent, parseQuantity, qty } from '@budgets/money';
import { useState } from 'react';

import type { DraftActions } from '../api/draft.js';
import { useGroupItems } from '../api/queries.js';
import { brl, pct, quantity } from '../format.js';
import { useOnVisible } from '../hooks.js';
import { Field } from './Field.js';
import { ProductSearch } from './ProductSearch.js';

/** Quantidade como se digita: "2,5" (sem a unidade). */
const quantityText = (i: Item) => quantity(i.quantity, i.unit).split(' ')[0] ?? '';
/** Desconto como se digita: "7,5" (sem o %). */
const discountText = (i: Item) => (i.discountBp ? pct(i.discountBp).replace('%', '') : '0');

/** Uma unidade do produto (1 un, 1,00 m…), a quantidade inicial ao adicionar. */
const ONE = 100;

/**
 * Um grupo do orçamento: fechado, mostra só o resumo (veio no detalhe). Aberto, carrega os itens
 * por página, e a próxima página vem quando o fim da lista se aproxima. No modo de edição, cada
 * alteração vira uma operação no rascunho, e os valores mostrados são os que a API devolveu.
 */
export function GroupCard({
  budgetId,
  group,
  draft,
  editing,
}: {
  budgetId: number;
  group: GroupSummary;
  draft: DraftActions;
  editing: boolean;
}) {
  const [open, setOpen] = useState(group.id < 0); // grupo recém-criado já abre
  const [inserting, setInserting] = useState<{ itemId: number; side: 'before' | 'after' } | null>(
    null,
  );
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const items = useGroupItems(budgetId, group.id, group.version, open);
  const sentinel = useOnVisible<HTMLDivElement>(() => {
    if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
  }, open && items.hasNextPage);
  const rows = items.data?.pages.flatMap((p) => p.items) ?? [];

  const add = (product: Product, anchor?: { before?: number; after?: number }) => {
    draft.apply({
      op: 'addItem',
      groupId: group.id,
      productId: product.id,
      quantity: ONE,
      ...anchor,
    });
    setInserting(null);
  };
  const toggle = () => {
    setOpen(!open);
  };

  return (
    <div className={`card group${open ? ' open' : ''}`}>
      <div
        className="g-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="chev">▶</span>
        <span className="nome-grupo">{group.name}</span>
        <span className="cat">{group.category}</span>
        <span className="sp" />
        <span className="muted sm">{group.itemCount} itens</span>
        <span className="grupo-subtotal">{brl(group.subtotalCents)}</span>
        {editing && (
          <button
            type="button"
            className="remover-grupo"
            title="Remover o grupo e os itens dele"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remover o grupo "${group.name}" e os ${group.itemCount} itens dele?`)) {
                draft.apply({ op: 'removeGroup', groupId: group.id });
              }
            }}
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="g-body">
          <div className="it h">
            <span />
            <span>Produto</span>
            <span className="num">Qtd</span>
            <span className="num">Desc. %</span>
            <span className="num unitario">Unitário</span>
            <span className="num">Total</span>
            <span />
          </div>
          {rows.map((i) => (
            <div key={i.id}>
              {inserting?.itemId === i.id && inserting.side === 'before' && (
                <InlineSearch
                  onPick={(p) => {
                    add(p, { before: i.id });
                  }}
                  onCancel={() => {
                    setInserting(null);
                  }}
                />
              )}
              <div
                className={`it${dragging === i.id ? ' arrastando' : ''}${over === i.id ? ' sobre' : ''}`}
                draggable={editing}
                onDragStart={() => {
                  setDragging(i.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onDragOver={(e) => {
                  if (dragging === null || dragging === i.id) return;
                  e.preventDefault();
                  setOver(i.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging === null || dragging === i.id) return;
                  // Soltou na metade de cima: vai antes; na de baixo: depois.
                  const box = e.currentTarget.getBoundingClientRect();
                  const side = e.clientY < box.top + box.height / 2 ? 'before' : 'after';
                  draft.apply({ op: 'moveItem', itemId: dragging, [side]: i.id });
                  setDragging(null);
                  setOver(null);
                }}
              >
                <span className="drag" title={editing ? 'Arrastar para reordenar' : undefined}>
                  {editing ? '⠿' : ''}
                </span>
                <span>{i.name}</span>
                {editing ? (
                  <>
                    <Field
                      key={`q${i.quantity}`}
                      label={`Quantidade de ${i.name}`}
                      value={quantityText(i)}
                      parse={(text) => parseQuantity(text, i.unit)}
                      onCommit={(q) => {
                        draft.apply({ op: 'updateItem', itemId: i.id, quantity: qty(q) });
                      }}
                    />
                    <Field
                      key={`d${i.discountBp}`}
                      label={`Desconto de ${i.name}`}
                      value={discountText(i)}
                      parse={(text) => parsePercent(text)}
                      onCommit={(d) => {
                        draft.apply({ op: 'updateItem', itemId: i.id, discountBp: bp(d) });
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span className="num">{quantity(i.quantity, i.unit)}</span>
                    <span className="num">{i.discountBp ? pct(i.discountBp) : '—'}</span>
                  </>
                )}
                <span className="num muted unitario">{brl(i.priceCents)}</span>
                <span className="num">{brl(i.totalCents)}</span>
                {editing ? (
                  <button
                    type="button"
                    className="remover"
                    title="Remover item"
                    onClick={() => {
                      draft.apply({ op: 'removeItem', itemId: i.id });
                    }}
                  >
                    ✕
                  </button>
                ) : (
                  <span />
                )}
                {editing && (
                  <>
                    <button
                      type="button"
                      className="ins acima"
                      title="Inserir produto acima"
                      onClick={() => {
                        setInserting({ itemId: i.id, side: 'before' });
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ins abaixo"
                      title="Inserir produto abaixo"
                      onClick={() => {
                        setInserting({ itemId: i.id, side: 'after' });
                      }}
                    >
                      +
                    </button>
                  </>
                )}
              </div>
              {inserting?.itemId === i.id && inserting.side === 'after' && (
                <InlineSearch
                  onPick={(p) => {
                    add(p, { after: i.id });
                  }}
                  onCancel={() => {
                    setInserting(null);
                  }}
                />
              )}
            </div>
          ))}
          {items.isPending && <p className="carregando">Carregando itens…</p>}
          {items.isFetchingNextPage && <p className="carregando">Carregando mais itens…</p>}
          {items.error && (
            <p className="carregando">Não foi possível carregar: {items.error.message}</p>
          )}
          <div ref={sentinel} />
          {editing && !items.hasNextPage && (
            <ProductSearch
              onPick={(p) => {
                add(p);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InlineSearch(props: { onPick: (p: Product) => void; onCancel: () => void }) {
  return <ProductSearch className="inline" autoFocus {...props} />;
}
