import { UNITS } from './quantity.js';
import type { Unit } from './quantity.js';
import { assertSafeInteger } from './types.js';
import type { Bp, Cents, Qty } from './types.js';

/**
 * Divide um inteiro escalado em parte inteira e fração, por quociente e resto (sem float).
 * Ex.: (123456, 2) → { negative: false, int: "1234", frac: "56" }.
 */
function split(value: number, decimals: number): { negative: boolean; int: string; frac: string } {
  assertSafeInteger(value, 'value');
  const scale = 10 ** decimals;
  const abs = Math.abs(value);
  const frac = abs % scale;
  const int = (abs - frac) / scale;
  return {
    negative: value < 0,
    int: String(int),
    frac: decimals === 0 ? '' : String(frac).padStart(decimals, '0'),
  };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 342590 → `"R$ 3.425,90"`; −250 → `"-R$ 2,50"`. */
export function formatBRL(value: Cents): string {
  const { negative, int, frac } = split(value, 2);
  return `${negative ? '-' : ''}R$ ${groupThousands(int)},${frac}`;
}

/** Remove zeros à direita da fração: "50" → "5", "00" → "". */
function trimFraction(frac: string): string {
  return frac.replace(/0+$/, '');
}

/** 750 → `"7,5%"`; −250 → `"-2,5%"`; 10000 → `"100%"`. */
export function formatPercent(value: Bp): string {
  const { negative, int, frac } = split(value, 2);
  const f = trimFraction(frac);
  return `${negative ? '-' : ''}${int}${f ? `,${f}` : ''}%`;
}

/**
 * 250 em metros → `"2,5 m"`; 300 em unidades → `"3 un"`.
 *
 * Sem separador de milhar: `"1.234 m"` seria ambíguo para o parser (1.234 m ou 1,234 m?),
 * então a quantidade é sempre escrita de um jeito que volta ao mesmo valor.
 */
export function formatQuantity(value: Qty, unit: Unit): string {
  const { int, frac } = split(value, 2);
  const f = trimFraction(frac);
  return `${int}${f ? `,${f}` : ''} ${UNITS[unit].label}`;
}

/**
 * Valor no formato de máquina, para preencher um `<input type="number">`:
 * 750 → `"7.5"`; −250 → `"-2.5"`; 123456 → `"1234.56"`.
 */
export function toInputValue(value: number, decimals = 2): string {
  const { negative, int, frac } = split(value, decimals);
  const f = trimFraction(frac);
  return `${negative ? '-' : ''}${int}${f ? `.${f}` : ''}`;
}
