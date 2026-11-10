import { createHash } from 'node:crypto';

import type { Dataset, Size } from './generate.js';

export const GENERATOR_VERSION = 1;

/**
 * Transforma o dataset nos arquivos de saída. JSON compacto e chaves sempre na mesma ordem:
 * a mesma semente gera os mesmos bytes, e o hash prova isso.
 * Orçamentos em NDJSON (um por linha): os carregadores leem um de cada vez, sem 50 MB na memória.
 */
export function serialize(dataset: Dataset): Record<string, string> {
  return {
    'catalog.json': JSON.stringify(dataset.products),
    'clients.json': JSON.stringify(dataset.clients),
    'sellers.json': JSON.stringify(dataset.sellers),
    'budgets.ndjson': dataset.budgets.map((b) => JSON.stringify(b)).join('\n') + '\n',
    'expected-totals.json': JSON.stringify(dataset.expectedTotals),
  };
}

export const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

export function summarize(dataset: Dataset): Record<string, unknown> {
  const sizes: Record<Size, number> = {
    pequeno: 0,
    medio: 0,
    grande: 0,
    'pior-caso': 0,
    estresse: 0,
  };
  let items = 0;
  let groups = 0;
  for (const b of dataset.budgets) {
    sizes[b.size]++;
    groups += b.groups.length;
    for (const g of b.groups) items += g.items.length;
  }
  return {
    budgets: dataset.budgets.length,
    groups,
    items,
    products: dataset.products.length,
    clients: dataset.clients.length,
    sellers: dataset.sellers.length,
    containingPreviousVersion: new Set(
      dataset.budgets.map((b) => b.parentId).filter((p) => p !== null),
    ).size,
    sizes,
  };
}

export function manifest(dataset: Dataset, files: Record<string, string>): string {
  return (
    JSON.stringify(
      {
        generatorVersion: GENERATOR_VERSION,
        profile: dataset.profile,
        seed: dataset.seed,
        units: {
          price: 'centavos por unidade',
          quantity: 'centésimos da unidade (3 un = 300; 2,5 m = 250)',
          discount: 'pontos-base (7,5% = 750)',
          prazo: 'pontos-base, de −10000 a 10000',
          margem: 'pontos-base, de 0 a 10000',
          expectedTotals: 'centavos, pela regra nova (packages/budget-calc)',
        },
        summary: summarize(dataset),
        files: Object.fromEntries(
          Object.entries(files).map(([name, content]) => [
            name,
            { bytes: Buffer.byteLength(content, 'utf8'), sha256: sha256(content) },
          ]),
        ),
      },
      null,
      2,
    ) + '\n'
  );
}
