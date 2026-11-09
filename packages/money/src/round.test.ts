import { describe, expect, it } from 'vitest';

import { divRoundHalfUp } from './round.js';

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

  it('calcula um item com desconto em centavos: R$ 1.234,56 × 3 com 7,5%', () => {
    // 123456 × 3 × (10000 − 750) / 10000 = 342590,4 → 342590 (R$ 3.425,90)
    expect(divRoundHalfUp(123456 * 3 * (10000 - 750), 10000)).toBe(342590);
  });

  it('é exato perto do limite de inteiros seguros', () => {
    const max = Number.MAX_SAFE_INTEGER; // 9007199254740991
    expect(divRoundHalfUp(max, 1)).toBe(max);
    expect(divRoundHalfUp(max, 2)).toBe(4503599627370496); // ...495,5 → ...496
    expect(divRoundHalfUp(max - 1, 2)).toBe(4503599627370495);
  });

  it('nunca erra mais de meio divisor (conferido contra BigInt)', () => {
    for (let numerator = 0; numerator <= 2000; numerator += 7) {
      for (const denominator of [1, 2, 3, 7, 10, 100, 10000]) {
        const n = BigInt(numerator);
        const d = BigInt(denominator);
        const expected = (2n * n + d) / (2n * d); // meio para cima, em aritmética exata
        expect(divRoundHalfUp(numerator, denominator)).toBe(Number(expected));
      }
    }
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
