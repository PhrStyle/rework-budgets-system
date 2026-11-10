import { BUDGET_STATUSES } from '@budgets/contracts';
import type { BudgetStatus } from '@budgets/contracts';
import { bp, parsePercent } from '@budgets/money';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { useDraft, useSyncAcrossTabs } from '../api/draft.js';
import type { DraftActions } from '../api/draft.js';
import { useBudget } from '../api/queries.js';
import { DraftBar } from '../components/DraftBar.js';
import { Field } from '../components/Field.js';
import { GroupCard } from '../components/GroupCard.js';
import { brl, date, pct } from '../format.js';

/** Percentual como se digita: "7,5" (sem o %). */
const percentText = (value: number) => pct(value).replace('%', '');

export function BudgetPage() {
  const id = Number(useParams().id);
  const budget = useBudget(id);
  const draft = useDraft(id);
  useSyncAcrossTabs(id);

  if (budget.isPending) return <p className="carregando">Carregando orçamento…</p>;
  if (budget.error) {
    return (
      <div className="aviso">
        <h3>Não foi possível abrir o orçamento #{id}</h3>
        <p>{budget.error.message}</p>
      </div>
    );
  }
  const b = budget.data;
  const lockedByOther = b.draft && !b.draft.mine ? b.draft : null;
  const editing = b.draft?.mine === true;

  return (
    <>
      <p className="sm">
        <Link to="/">← Orçamentos</Link>
      </p>
      <div className="pagehead">
        <div>
          <h2>
            Orçamento #{b.id} <span className={`pill st-${b.status}`}>{b.status}</span>
          </h2>
          <p className="muted">
            Criado em {date(b.createdAt)} · os totais são calculados pela API (a tela não calcula
            nada)
          </p>
        </div>
      </div>

      {lockedByOther && (
        <div className="aviso">
          <b>{lockedByOther.ownerName}</b> está editando este orçamento: você vê a versão salva. O
          bloqueio vale até {new Date(lockedByOther.expiresAt).toLocaleTimeString('pt-BR')} sem nova
          edição.
        </div>
      )}

      <DraftBar budget={b} draft={draft} />

      <div className="card">
        {editing ? (
          <div className="hdr">
            <label className="s5">
              Descrição
              <Field
                key={b.description}
                label="Descrição"
                value={b.description}
                parse={(text) => {
                  if (!text.trim()) throw new Error('A descrição não pode ficar vazia.');
                  return text.trim();
                }}
                onCommit={(description) => {
                  draft.apply({ op: 'header', description });
                }}
              />
            </label>
            <ReadOnly className="s3" label="Cliente" value={b.client.name} />
            <ReadOnly className="s2" label="Vendedor" value={b.seller.name} />
            <label className="s2">
              Status
              <select
                value={b.status}
                onChange={(e) => {
                  draft.apply({ op: 'header', status: e.target.value as BudgetStatus });
                }}
              >
                {BUDGET_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="s2">
              Ajuste de prazo (%)
              <Field
                key={`p${b.prazoBp}`}
                label="Ajuste de prazo"
                value={percentText(b.prazoBp)}
                parse={(text) => parsePercent(text, { min: -10_000 })}
                onCommit={(v) => {
                  draft.apply({ op: 'header', prazoBp: bp(v) });
                }}
              />
            </label>
            <label className="s2">
              Margem (%)
              <Field
                key={`m${b.margemBp}`}
                label="Margem"
                value={percentText(b.margemBp)}
                parse={(text) => parsePercent(text)}
                onCommit={(v) => {
                  draft.apply({ op: 'header', margemBp: bp(v) });
                }}
              />
            </label>
            <ReadOnly
              className="s3"
              label="Orçamento pai"
              value={b.parent ? `#${b.parent.id} · ${b.parent.description}` : '—'}
            />
          </div>
        ) : (
          <div className="hdr">
            <ReadOnly className="s5" label="Descrição" value={b.description} />
            <ReadOnly className="s3" label="Cliente" value={b.client.name} />
            <ReadOnly className="s2" label="Vendedor" value={b.seller.name} />
            <ReadOnly className="s2" label="Status" value={b.status} />
            <ReadOnly className="s2" label="Ajuste de prazo" value={pct(b.prazoBp)} />
            <ReadOnly className="s2" label="Margem" value={pct(b.margemBp)} />
            <ReadOnly
              className="s3"
              label="Orçamento pai"
              value={b.parent ? `#${b.parent.id} · ${b.parent.description}` : '—'}
            />
          </div>
        )}
        <div className="stats">
          <div>
            <small>Subtotal</small>
            <b>{brl(b.totals.subtotal)}</b>
          </div>
          <div>
            <small>Ajuste de prazo ({pct(b.prazoBp)})</small>
            <b>{brl(b.totals.prazoAmount)}</b>
          </div>
          <div>
            <small>Margem ({pct(b.margemBp)})</small>
            <b>{brl(b.totals.margemAmount)}</b>
          </div>
          <div className="tot">
            <small>Total</small>
            <b>{brl(b.totals.total)}</b>
          </div>
        </div>
      </div>

      <div className="groups" style={{ marginTop: 16 }}>
        {b.groups.map((g) => (
          <GroupCard key={g.id} budgetId={b.id} group={g} draft={draft} editing={editing} />
        ))}
        {editing && <NewGroup draft={draft} />}
      </div>

      {b.children.length > 0 && (
        <div className="card links">
          <div className="lh">
            <h3>Orçamentos dentro deste</h3>
          </div>
          {b.children.map((c) => (
            <div className="lr" key={c.id}>
              <Link to={`/orcamentos/${c.id}`}>
                #{c.id} · {c.description}
              </Link>
              <span className="sp" />
              <b className="num">{brl(c.totalCents)}</b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function NewGroup({ draft }: { draft: DraftActions }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const ready = name.trim() !== '' && category.trim() !== '';
  return (
    <form
      className="card novo-grupo"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        draft.apply({ op: 'addGroup', name: name.trim(), category: category.trim() });
        setName('');
        setCategory('');
      }}
    >
      <input
        placeholder="Novo grupo"
        aria-label="Nome do novo grupo"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <input
        placeholder="Categoria"
        aria-label="Categoria do novo grupo"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
        }}
      />
      <button type="submit" disabled={!ready}>
        Adicionar grupo
      </button>
    </form>
  );
}

function ReadOnly({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <label className={className}>
      {label}
      <input value={value} disabled readOnly />
    </label>
  );
}
