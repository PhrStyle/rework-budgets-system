import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatBRL, formatPercent, formatQuantity, toInputValue } from './format.js';
import { ParseError, parseMoney, parsePercent } from './parse.js';
import { isValidQuantity, parseQuantity } from './quantity.js';
import { bp, cents, qty } from './types.js';

describe('parseMoney', () => {
  it('aceita pt-BR, formato de máquina e o prefixo R$', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('1234,56')).toBe(123456);
    expect(parseMoney('1234.56')).toBe(123456);
    expect(parseMoney('R$ 1.234,56')).toBe(123456);
    expect(parseMoney('  12,5 ')).toBe(1250);
    expect(parseMoney('7')).toBe(700);
    expect(parseMoney('0,05')).toBe(5);
  });

  it('recusa o que é ambíguo ou inválido, com mensagem', () => {
    expect(() => parseMoney('1.234')).toThrow('no máximo 2 casas decimais'); // R$ 1,234 ou R$ 1.234?
    expect(() => parseMoney('12,345')).toThrow(ParseError);
    expect(() => parseMoney('1,2,3')).toThrow(ParseError);
    expect(() => parseMoney('12.34.56')).toThrow(ParseError);
    expect(() => parseMoney('1.23,45')).toThrow('milhar');
    expect(() => parseMoney('12,')).toThrow(ParseError);
    expect(() => parseMoney('abc')).toThrow(ParseError);
    expect(() => parseMoney('')).toThrow(ParseError);
    expect(() => parseMoney('1e3')).toThrow(ParseError);
  });

  it('recusa valor acima do inteiro seguro', () => {
    expect(() => parseMoney('99999999999999999')).toThrow('grande demais');
  });

  it('só aceita negativo quando pedido', () => {
    expect(() => parseMoney('-2,50')).toThrow('negativo');
    expect(parseMoney('-R$ 2,50', { allowNegative: true })).toBe(-250);
  });
});

describe('parsePercent', () => {
  it('aceita vírgula, ponto e o símbolo %', () => {
    expect(parsePercent('7,5')).toBe(750);
    expect(parsePercent('7.5')).toBe(750);
    expect(parsePercent('7,5%')).toBe(750);
    expect(parsePercent('100')).toBe(10_000);
  });

  it('respeita o intervalo pedido', () => {
    expect(() => parsePercent('100,01')).toThrow('entre 0% e 100%');
    expect(() => parsePercent('-1')).toThrow(ParseError);
    expect(parsePercent('-2,5', { min: -10_000, max: 10_000 })).toBe(-250); // ajuste de prazo
    expect(() => parsePercent('-100,5', { min: -10_000, max: 10_000 })).toThrow('entre -100%');
  });
});

describe('parseQuantity', () => {
  it('aceita 2 casas nas unidades fracionárias e só inteiros em "un"', () => {
    expect(parseQuantity('2,5', 'm')).toBe(250);
    expect(parseQuantity('0,75', 'kg')).toBe(75);
    expect(parseQuantity('1.5', 'l')).toBe(150);
    expect(parseQuantity('3', 'un')).toBe(300);
    expect(() => parseQuantity('2,5', 'un')).toThrow('inteiro');
    expect(() => parseQuantity('1,234', 'm')).toThrow('2 casas');
  });

  it('recusa quantidade zero ou negativa', () => {
    expect(() => parseQuantity('0', 'un')).toThrow('maior que zero');
    expect(() => parseQuantity('-1', 'm')).toThrow(ParseError);
  });

  it('valida quantidades já escaladas', () => {
    expect(isValidQuantity(qty(300), 'un')).toBe(true);
    expect(isValidQuantity(qty(250), 'un')).toBe(false);
    expect(isValidQuantity(qty(250), 'm')).toBe(true);
    expect(isValidQuantity(qty(0), 'm')).toBe(false);
  });
});

describe('formatação', () => {
  it('formata dinheiro, percentual e quantidade em pt-BR', () => {
    expect(formatBRL(cents(342590))).toBe('R$ 3.425,90');
    expect(formatBRL(cents(5))).toBe('R$ 0,05');
    expect(formatBRL(cents(-250))).toBe('-R$ 2,50');
    expect(formatBRL(cents(123456789012))).toBe('R$ 1.234.567.890,12');
    expect(formatPercent(bp(750))).toBe('7,5%');
    expect(formatPercent(bp(-250))).toBe('-2,5%');
    expect(formatPercent(bp(10_000))).toBe('100%');
    expect(formatQuantity(qty(250), 'm')).toBe('2,5 m');
    expect(formatQuantity(qty(300), 'un')).toBe('3 un');
    expect(formatQuantity(qty(150), 'l')).toBe('1,5 L');
  });

  it('gera o valor de máquina para campos numéricos', () => {
    expect(toInputValue(750)).toBe('7.5');
    expect(toInputValue(-250)).toBe('-2.5');
    expect(toInputValue(123456)).toBe('1234.56');
    expect(toInputValue(10_000)).toBe('100');
    expect(toInputValue(3, 0)).toBe('3');
  });

  it('qty() recusa quantidade negativa', () => {
    expect(() => qty(-1)).toThrow(RangeError);
  });
});

describe('ida e volta (formatar → interpretar) não perde valor', () => {
  it('dinheiro', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (v) => {
        const c = cents(v);
        return (
          parseMoney(formatBRL(c), { allowNegative: true }) === v &&
          parseMoney(toInputValue(c), { allowNegative: true }) === v
        );
      }),
    );
  });

  it('percentual de −100% a +100%', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), (v) => {
        const range = { min: -10_000, max: 10_000 };
        return (
          parsePercent(formatPercent(bp(v)), range) === v &&
          parsePercent(toInputValue(v), range) === v
        );
      }),
    );
  });

  it('quantidade', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e9 }), (v) => {
        const q = qty(v);
        return parseQuantity(formatQuantity(q, 'm').replace(' m', ''), 'm') === v;
      }),
    );
  });
});
