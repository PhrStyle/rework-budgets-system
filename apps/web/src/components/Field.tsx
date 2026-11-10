import { useState } from 'react';

/**
 * Campo que grava ao sair (ou Enter), não a cada tecla: uma edição vira uma operação no rascunho.
 * Lê o texto com as mesmas regras da API (`packages/money`); texto inválido fica marcado e não vai.
 * O pai passa `key={value}` para o campo voltar ao valor salvo quando ele muda por fora.
 */
export function Field<T>({
  value,
  parse,
  onCommit,
  className,
  label,
  disabled,
}: {
  value: string;
  parse: (text: string) => T;
  onCommit: (parsed: T) => void;
  className?: string;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);

  const commit = () => {
    if (text.trim() === value.trim()) return;
    try {
      const parsed = parse(text);
      setProblem(null);
      onCommit(parsed);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <input
      className={`${className ?? ''}${problem ? ' invalido' : ''}`}
      aria-label={label}
      aria-invalid={problem !== null}
      title={problem ?? undefined}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        setProblem(null);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          setProblem(null);
        }
      }}
    />
  );
}
