import type { Id } from './types.js';

/** O mínimo que a regra precisa saber de um orçamento para validar um vínculo. */
export interface NestingNode {
  id: Id;
  /** Orçamento pai, se este já estiver dentro de outro. */
  parentId: Id | null;
  /** Quantos orçamentos este já contém. */
  childCount: number;
}

export type NestingCode =
  'SELF' | 'PARENT_IS_CHILD' | 'CHILD_HAS_CHILDREN' | 'CHILD_ALREADY_LINKED';

export interface NestingViolation {
  code: NestingCode;
  message: string;
}

/**
 * Regra de profundidade 1: um orçamento pode conter outros, mas um filho não pode ter filhos.
 * Devolve a violação (para virar 422 na API) ou `null` se o vínculo é permitido.
 */
export function validateNesting(parent: NestingNode, child: NestingNode): NestingViolation | null {
  const p = String(parent.id);
  const c = String(child.id);
  if (p === c) {
    return { code: 'SELF', message: 'Um orçamento não pode conter a si mesmo.' };
  }
  if (parent.parentId !== null) {
    return {
      code: 'PARENT_IS_CHILD',
      message: `#${p} já está dentro de #${String(parent.parentId)}. A profundidade máxima é 1 nível.`,
    };
  }
  if (child.childCount > 0) {
    return {
      code: 'CHILD_HAS_CHILDREN',
      message: `#${c} já contém outros orçamentos. A profundidade máxima é 1 nível.`,
    };
  }
  if (child.parentId !== null) {
    return {
      code: 'CHILD_ALREADY_LINKED',
      message: `#${c} já está dentro de #${String(child.parentId)}.`,
    };
  }
  return null;
}

export class NestingError extends Error {
  override name = 'NestingError';
  constructor(readonly violation: NestingViolation) {
    super(violation.message);
  }
}
