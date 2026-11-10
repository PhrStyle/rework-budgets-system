import { assertSafeInteger } from './types.js';

function assertPositiveDenominator(denominator: number): void {
  assertSafeInteger(denominator, 'denominator');
  if (denominator <= 0) {
    throw new RangeError(`denominator precisa ser maior que zero, recebido: ${denominator}`);
  }
}

/**
 * Divisão inteira com arredondamento comercial (meio para cima).
 *
 * É o único ponto do cálculo em que há arredondamento: aplicar um percentual
 * exige dividir. Soma, subtração e multiplicação já são exatas com inteiros.
 *
 * Usa resto e quociente em vez de `Math.round(a / b)`, para não passar por float
 * nem multiplicar o numerador (o que poderia ultrapassar 2^53).
 *
 * @param numerator inteiro seguro, não negativo
 * @param denominator inteiro seguro, maior que zero
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'numerator');
  assertPositiveDenominator(denominator);
  if (numerator < 0) {
    throw new RangeError(`numerator não pode ser negativo, recebido: ${numerator}`);
  }

  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  // Meio para cima: arredonda para cima quando o resto é pelo menos metade do divisor.
  return remainder >= denominator - remainder ? quotient + 1 : quotient;
}

/**
 * `(f1 × f2 × …) / denominator` com arredondamento comercial, numa única divisão.
 *
 * O produto intermediário pode passar de 2^53 com valores realistas
 * (ex.: R$ 10 milhões × 1.000 un × 10000 = 10^16), então a conta é feita em BigInt.
 * Só o resultado volta para `number`, e precisa caber num inteiro seguro.
 *
 * @param factors inteiros seguros, não negativos
 * @param denominator inteiro seguro, maior que zero
 */
export function mulDivRoundHalfUp(factors: readonly number[], denominator: number): number {
  assertPositiveDenominator(denominator);

  let product = 1n;
  factors.forEach((factor, index) => {
    assertSafeInteger(factor, `factors[${index}]`);
    if (factor < 0) {
      throw new RangeError(`factors[${index}] não pode ser negativo, recebido: ${factor}`);
    }
    product *= BigInt(factor);
  });

  const d = BigInt(denominator);
  const remainder = product % d;
  const quotient = product / d;
  const result = remainder >= d - remainder ? quotient + 1n : quotient;

  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('resultado maior que o inteiro seguro (2^53 − 1)');
  }
  return Number(result);
}
