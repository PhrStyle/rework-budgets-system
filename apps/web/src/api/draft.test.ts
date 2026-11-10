import type { BudgetDetail } from '@budgets/contracts';
import { describe, expect, it } from 'vitest';

import { isNewer } from './draft.js';

const detail = (changes: number | null) =>
  ({
    draft:
      changes === null
        ? null
        : { ownerId: 1, ownerName: 'Ana', expiresAt: '', changes, mine: true },
  }) as BudgetDetail;

describe('respostas fora de ordem', () => {
  it('a resposta de uma edição anterior, chegando por último, não substitui a mais nova', () => {
    expect(isNewer(detail(5), detail(4))).toBe(false);
  });

  it('a mais nova (ou a mesma) substitui', () => {
    expect(isNewer(detail(4), detail(5))).toBe(true);
    expect(isNewer(detail(5), detail(5))).toBe(true);
  });

  it('sem rascunho de um dos lados (abriu, salvou, descartou), vale a que chegou', () => {
    expect(isNewer(undefined, detail(0))).toBe(true);
    expect(isNewer(detail(3), detail(null))).toBe(true);
    expect(isNewer(detail(null), detail(1))).toBe(true);
  });
});
