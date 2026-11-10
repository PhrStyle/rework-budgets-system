import { parsePercent, parseQuantity } from '@budgets/money';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './Field.js';

function setup(value = '4', parse: (t: string) => number = (t) => parseQuantity(t, 'un')) {
  const onCommit = vi.fn();
  render(<Field label="Quantidade" value={value} parse={parse} onCommit={onCommit} />);
  return { input: screen.getByLabelText('Quantidade'), onCommit, user: userEvent.setup() };
}

describe('Field', () => {
  it('grava ao sair do campo, uma vez, com o valor já lido pelas regras da API', async () => {
    const { input, onCommit, user } = setup();

    await user.clear(input);
    await user.type(input, '12');
    expect(onCommit).not.toHaveBeenCalled(); // nada a cada tecla
    await user.tab();

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(1200); // 12 un = 1200 centésimos
  });

  it('Enter também grava', async () => {
    const { input, onCommit, user } = setup('7,5', (t) => parsePercent(t));

    await user.clear(input);
    await user.type(input, '10{Enter}');

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it('texto inválido fica marcado, com o motivo, e não é enviado', async () => {
    const { input, onCommit, user } = setup();

    await user.clear(input);
    await user.type(input, '1,5{Enter}');

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.title).toMatch(/inteiro/);
  });

  it('sem mudança, não envia nada', async () => {
    const { input, onCommit, user } = setup();

    await user.click(input);
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Esc desfaz o que foi digitado', async () => {
    const { input, user } = setup();

    await user.clear(input);
    await user.type(input, '99{Escape}');

    expect(input).toHaveValue('4');
  });
});
