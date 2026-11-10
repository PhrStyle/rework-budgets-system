import { Link, useParams } from 'react-router';

import { useBudget } from '../api/queries.js';
import { GroupCard } from '../components/GroupCard.js';
import { brl, date, pct } from '../format.js';

export function BudgetPage() {
  const id = Number(useParams().id);
  const budget = useBudget(id);

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

      <div className="card">
        <div className="hdr">
          <Field className="s5" label="Descrição" value={b.description} />
          <Field className="s3" label="Cliente" value={b.client.name} />
          <Field className="s2" label="Vendedor" value={b.seller.name} />
          <Field className="s2" label="Status" value={b.status} />
          <Field className="s2" label="Ajuste de prazo" value={pct(b.prazoBp)} />
          <Field className="s2" label="Margem" value={pct(b.margemBp)} />
          <Field
            className="s3"
            label="Orçamento pai"
            value={b.parent ? `#${b.parent.id} · ${b.parent.description}` : '—'}
          />
        </div>
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
          <GroupCard key={g.id} budgetId={b.id} group={g} />
        ))}
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

function Field({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <label className={className}>
      {label}
      <input value={value} disabled readOnly />
    </label>
  );
}
