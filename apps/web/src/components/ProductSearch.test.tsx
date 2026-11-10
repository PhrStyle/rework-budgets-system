import type { Product } from '@budgets/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductSearch } from './ProductSearch.js';

const products: Product[] = [
  {
    id: 6,
    sku: 'SKU-10005',
    name: 'Câmera IP Plus S300',
    category: 'Segurança',
    unit: 'un',
    priceCents: 210269,
  },
  {
    id: 8,
    sku: 'SKU-10007',
    name: 'Câmera IP Básico S800',
    category: 'Segurança',
    unit: 'un',
    priceCents: 183122,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(products))));
  vi.stubGlobal('fetch', fetch);
  const onPick = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductSearch onPick={onPick} />
    </QueryClientProvider>,
  );
  return { fetch, onPick, input: screen.getByLabelText('Buscar produto'), user: userEvent.setup() };
}

describe('ProductSearch', () => {
  it('busca depois da pausa na digitação, não a cada tecla', async () => {
    const { fetch, input, user } = setup();

    await user.type(input, 'cmaera');

    expect(await screen.findByText('Câmera IP Plus S300')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/products?search=cmaera&limit=10', expect.anything());
  });

  it('setas e Enter escolhem a sugestão', async () => {
    const { input, onPick, user } = setup();

    await user.type(input, 'camera');
    await screen.findByText('Câmera IP Básico S800');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledExactlyOnceWith(products[1]);
    expect(input).toHaveValue('');
  });

  it('com menos de 2 letras, não busca', async () => {
    const { fetch, input, user } = setup();

    await user.type(input, 'c');
    await new Promise((r) => setTimeout(r, 300));

    expect(fetch).not.toHaveBeenCalled();
  });
});
