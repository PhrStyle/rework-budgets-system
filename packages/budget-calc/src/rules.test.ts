import { describe, expect, it } from 'vitest';

import { checkLimit, LIMITS } from './limits.js';
import { validateNesting } from './nesting.js';
import type { NestingNode } from './nesting.js';

const free = (id: number): NestingNode => ({ id, parentId: null, childCount: 0 });

describe('validateNesting (profundidade máxima 1)', () => {
  it('permite vincular dois orçamentos livres', () => {
    expect(validateNesting(free(1), free(2))).toBeNull();
  });

  it('permite que um pai que já tem filhos receba mais um', () => {
    expect(validateNesting({ ...free(1), childCount: 2 }, free(4))).toBeNull();
  });

  it('recusa cada violação com o código certo', () => {
    expect(validateNesting(free(1), free(1))?.code).toBe('SELF');
    expect(validateNesting({ ...free(2), parentId: 1 }, free(3))?.code).toBe('PARENT_IS_CHILD');
    expect(validateNesting(free(1), { ...free(2), childCount: 1 })?.code).toBe(
      'CHILD_HAS_CHILDREN',
    );
    expect(validateNesting(free(1), { ...free(2), parentId: 9 })?.code).toBe(
      'CHILD_ALREADY_LINKED',
    );
  });

  it('a mensagem diz o motivo', () => {
    expect(validateNesting(free(1), { ...free(2), childCount: 1 })?.message).toContain(
      'profundidade máxima é 1 nível',
    );
  });
});

describe('limites de negócio', () => {
  it('aceita os extremos de cada campo', () => {
    for (const field of ['discount', 'prazo', 'margem'] as const) {
      expect(checkLimit(field, LIMITS[field].min)).toBeNull();
      expect(checkLimit(field, LIMITS[field].max)).toBeNull();
    }
  });

  it('recusa fora dos limites, com mensagem legível', () => {
    expect(checkLimit('prazo', -10_001)?.message).toBe('prazo precisa estar entre -100% e 100%');
    expect(checkLimit('margem', -1)?.message).toBe('margem precisa estar entre 0% e 100%');
    expect(checkLimit('discount', 10_001)?.field).toBe('discount');
  });
});
