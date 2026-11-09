function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} precisa ser um inteiro seguro, recebido: ${String(value)}`);
  }
}

/**
 * Divisão inteira com arredondamento comercial (meio para cima).
 *
 * É o único ponto do cálculo em que há arredondamento: aplicar um percentual
 * exige dividir (ex.: `preço × (10000 − descontoBp) / 10000`). Soma, subtração
 * e preço × quantidade já são exatas com inteiros.
 *
 * Usa resto e quociente em vez de `Math.round(a / b)`, para não passar por float
 * nem multiplicar o numerador (o que poderia ultrapassar 2^53).
 *
 * @param numerator inteiro seguro, não negativo
 * @param denominator inteiro seguro, maior que zero
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'numerator');
  assertSafeInteger(denominator, 'denominator');
  if (denominator <= 0) {
    throw new RangeError(`denominator precisa ser maior que zero, recebido: ${denominator}`);
  }
  if (numerator < 0) {
    throw new RangeError(`numerator não pode ser negativo, recebido: ${numerator}`);
  }

  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  // Meio para cima: arredonda para cima quando o resto é pelo menos metade do divisor.
  return remainder >= denominator - remainder ? quotient + 1 : quotient;
}
