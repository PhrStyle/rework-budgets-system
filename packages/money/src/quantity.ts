import { ParseError, parseScaled } from './parse.js';
import { qty } from './types.js';
import type { Qty } from './types.js';

/** Unidades de medida e quantas casas decimais cada uma aceita. */
export const UNITS = {
  un: { label: 'un', decimals: 0 },
  m: { label: 'm', decimals: 2 },
  l: { label: 'L', decimals: 2 },
  kg: { label: 'kg', decimals: 2 },
} as const;

export type Unit = keyof typeof UNITS;

/** De quanto em quanto a quantidade (em centésimos) pode variar na unidade: 100 para "un", 1 para as demais. */
function stepOf(unit: Unit): number {
  return 10 ** (2 - UNITS[unit].decimals);
}

/**
 * `"2,5"` em metros → 250; `"3"` em unidades → 300.
 * A quantidade precisa ser maior que zero e respeitar as casas decimais da unidade.
 */
export function parseQuantity(text: string, unit: Unit): Qty {
  const value = parseScaled(text, UNITS[unit].decimals) * stepOf(unit);
  if (value === 0) {
    throw new ParseError(`A quantidade precisa ser maior que zero: "${text}"`);
  }
  return qty(value);
}

/** Confere uma quantidade já escalada (ex.: vinda da API): maior que zero e no passo da unidade. */
export function isValidQuantity(quantity: Qty, unit: Unit): boolean {
  return quantity > 0 && quantity % stepOf(unit) === 0;
}
