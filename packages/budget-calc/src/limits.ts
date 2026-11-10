/** Limites de negócio, em pontos-base. Os mesmos para a API, a tela e os testes. */
export const LIMITS = {
  discount: { min: 0, max: 10_000 }, // 0% a 100%
  prazo: { min: -10_000, max: 10_000 }, // −100% a +100%
  margem: { min: 0, max: 10_000 }, // 0% a +100%
} as const;

export type LimitedField = keyof typeof LIMITS;

export interface LimitViolation {
  field: LimitedField;
  value: number;
  message: string;
}

function pct(bp: number): string {
  return `${String(bp / 100).replace('.', ',')}%`;
}

/** Confere um valor contra o limite do campo. Devolve a violação (para virar 422 na API) ou `null`. */
export function checkLimit(field: LimitedField, value: number): LimitViolation | null {
  const { min, max } = LIMITS[field];
  if (value >= min && value <= max) return null;
  return { field, value, message: `${field} precisa estar entre ${pct(min)} e ${pct(max)}` };
}

export function assertWithinLimit(field: LimitedField, value: number): void {
  const violation = checkLimit(field, value);
  if (violation) throw new RangeError(violation.message);
}
