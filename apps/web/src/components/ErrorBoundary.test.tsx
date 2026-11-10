import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary, RouteError } from './ErrorBoundary.js';

const report = vi.hoisted(() => vi.fn());
vi.mock('../observability.js', () => ({ report }));

function Broken(): never {
  throw new Error('tela quebrou');
}

describe('quando uma tela quebra', () => {
  it('a barreira mostra o aviso em vez de uma página em branco, e envia o erro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // o React registra o erro no console
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela.');
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'tela quebrou' }),
      expect.anything(),
    );
  });

  it('erro dentro de uma rota (que o React Router captura antes) também é enviado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    report.mockClear();
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <RouteError /> },
    ]);
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado nesta tela.');
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'tela quebrou' }), {
      origem: 'rota',
    });
  });
});
