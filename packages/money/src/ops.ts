import { mulDivRoundHalfUp } from './round.js';
import { assertSafeInteger, BP_SCALE, cents, QTY_SCALE } from './types.js';
import type { Bp, Cents, Qty } from './types.js';

/**
 * Total de um item: `preço × quantidade × (100% − desconto)`.
 *
 * Uma única divisão (por 100 × 10000) no fim, então um único arredondamento por item:
 * o erro máximo é de meio centavo.
 *
 * @param price preço por unidade, em centavos (não negativo)
 * @param quantity quantidade em centésimos da unidade
 * @param discount desconto do item, de 0 a 10000 (0% a 100%)
 */
export function itemTotal(price: Cents, quantity: Qty, discount: Bp): Cents {
  if (price < 0) {
    throw new RangeError(`price não pode ser negativo, recebido: ${price}`);
  }
  if (discount < 0 || discount > BP_SCALE) {
    throw new RangeError(`discount precisa estar entre 0 e ${BP_SCALE}, recebido: ${discount}`);
  }
  return cents(mulDivRoundHalfUp([price, quantity, BP_SCALE - discount], QTY_SCALE * BP_SCALE));
}

/**
 * Aplica uma taxa sobre um valor: `valor × (100% + taxa)`.
 * Usada para o ajuste de prazo (que pode ser negativo) e para a margem.
 *
 * @param value valor em centavos (não negativo)
 * @param rate taxa em pontos-base, a partir de −10000 (−100%)
 */
export function applyRate(value: Cents, rate: Bp): Cents {
  if (value < 0) {
    throw new RangeError(`value não pode ser negativo, recebido: ${value}`);
  }
  if (rate < -BP_SCALE) {
    throw new RangeError(`rate não pode ser menor que −${BP_SCALE} (−100%), recebido: ${rate}`);
  }
  return cents(mulDivRoundHalfUp([value, BP_SCALE + rate], BP_SCALE));
}

/** Soma valores em centavos. Exata: soma de inteiros não arredonda. */
export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    total += value;
    assertSafeInteger(total, 'sum');
  }
  return cents(total);
}
