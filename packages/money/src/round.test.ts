import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { divRoundHalfUp, mulDivRoundHalfUp } from './round.js';

/** Referência: arredondamento comercial em aritmética exata. */
function halfUpBig(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

describe('divRoundHalfUp', () => {
  it('mantém divisões exatas', () => {
    expect(divRoundHalfUp(10, 5)).toBe(2);
    expect(divRoundHalfUp(0, 7)).toBe(0);
  });

  it('arredonda para baixo abaixo da metade e para cima a partir da metade', () => {
    expect(divRoundHalfUp(14, 10)).toBe(1); // 1,4 → 1
    expect(divRoundHalfUp(15, 10)).toBe(2); // 1,5 → 2 (meio para cima)
    expect(divRoundHalfUp(16, 10)).toBe(2); // 1,6 → 2
    expect(divRoundHalfUp(5, 10)).toBe(1); // 0,5 → 1
    expect(divRoundHalfUp(4, 10)).toBe(0); // 0,4 → 0
  });

  it('é exato perto do limite de inteiros seguros', () => {
    const max = Number.MAX_SAFE_INTEGER; // 9007199254740991
    expect(divRoundHalfUp(max, 1)).toBe(max);
    expect(divRoundHalfUp(max, 2)).toBe(4503599627370496); // ...495,5 → ...496
    expect(divRoundHalfUp(max - 1, 2)).toBe(4503599627370495);
  });

  it('bate com a referência exata para quaisquer inteiros seguros', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        (n, d) => divRoundHalfUp(n, d) === Number(halfUpBig(BigInt(n), BigInt(d))),
      ),
    );
  });

  it('rejeita entradas que não são inteiros seguros', () => {
    expect(() => divRoundHalfUp(1.5, 10)).toThrow(RangeError);
    expect(() => divRoundHalfUp(10, 2.5)).toThrow(RangeError);
    expect(() => divRoundHalfUp(Number.MAX_SAFE_INTEGER + 1, 10)).toThrow(RangeError);
    expect(() => divRoundHalfUp(Number.NaN, 10)).toThrow(RangeError);
  });

  it('rejeita divisor zero ou negativo e numerador negativo', () => {
    expect(() => divRoundHalfUp(10, 0)).toThrow(RangeError);
    expect(() => divRoundHalfUp(10, -2)).toThrow(RangeError);
    expect(() => divRoundHalfUp(-10, 3)).toThrow(RangeError);
  });
});

describe('mulDivRoundHalfUp', () => {
  it('suporta produtos intermediários acima de 2^53', () => {
    // R$ 10 milhões × 1.000 un × 10000 = 10^16, acima de 2^53 ≈ 9 × 10^15
    expect(mulDivRoundHalfUp([1_000_000_000, 100_000, 10_000], 1_000_000)).toBe(1_000_000_000_000);
  });

  it('bate com a referência exata', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (factors, d) => {
          const product = factors.reduce((p, f) => p * BigInt(f), 1n);
          const expected = halfUpBig(product, BigInt(d));
          fc.pre(expected <= BigInt(Number.MAX_SAFE_INTEGER));
          return mulDivRoundHalfUp(factors, d) === Number(expected);
        },
      ),
    );
  });

  it('recusa resultado que não cabe num inteiro seguro', () => {
    expect(() => mulDivRoundHalfUp([Number.MAX_SAFE_INTEGER, 10], 1)).toThrow(RangeError);
  });

  it('recusa fator negativo', () => {
    expect(() => mulDivRoundHalfUp([10, -1], 1)).toThrow(RangeError);
  });
});
