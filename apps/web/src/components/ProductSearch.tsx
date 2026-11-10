import type { Product } from '@budgets/contracts';
import { useState } from 'react';

import { useProductSearch } from '../api/queries.js';
import { brl } from '../format.js';
import { useDebounced } from '../hooks.js';

/** Autocomplete de produtos (Elasticsearch: sem acento, com erro de digitação, por prefixo). */
export function ProductSearch({
  onPick,
  onCancel,
  autoFocus,
  className,
}: {
  onPick: (product: Product) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const term = useDebounced(text.trim(), 200);
  const found = useProductSearch(term);
  const options = term.length >= 2 ? (found.data ?? []) : [];

  const pick = (p: Product | undefined) => {
    if (!p) return;
    onPick(p);
    setText('');
    setActive(0);
  };

  return (
    <div className={`add ${className ?? ''}`}>
      <input
        autoFocus={autoFocus}
        placeholder="Adicionar produto: nome ou SKU (sem acento e com erro de digitação também acha)"
        aria-label="Buscar produto"
        role="combobox"
        aria-expanded={options.length > 0}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === 'Escape') {
            setText('');
            onCancel?.();
          }
        }}
      />
      <ul className="sugestoes" role="listbox">
        {options.map((p, i) => (
          <li
            key={p.id}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'ativo' : undefined}
            onMouseDown={(e) => {
              // mousedown, não click: o click viria depois do blur do campo
              e.preventDefault();
              pick(p);
            }}
          >
            {p.name}{' '}
            <span className="muted sm">
              · {p.sku} · {brl(p.priceCents)}/{p.unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
