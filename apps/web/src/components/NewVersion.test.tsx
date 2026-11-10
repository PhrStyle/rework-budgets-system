import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewVersion } from './NewVersion.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const published = (version: string) => {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version }))));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('aviso de versão nova (no lugar do Ctrl+F5)', () => {
  it('avisa quando a versão publicada é outra', async () => {
    const fetch = published('abc123-20261110');
    render(<NewVersion />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Uma versão nova do sistema foi publicada',
    );
    expect(fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('não avisa quando é a mesma versão', async () => {
    const fetch = published('teste'); // a versão desta tela nos testes (vitest.config)
    render(<NewVersion />);

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
