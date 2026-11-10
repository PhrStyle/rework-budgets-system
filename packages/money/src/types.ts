declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Valor em centavos: R$ 12,34 = 1234. Pode ser negativo (ex.: o delta de uma edição). */
export type Cents = Brand<number, 'Cents'>;

/** Percentual em pontos-base: 7,5% = 750; 100% = 10000. */
export type Bp = Brand<number, 'Bp'>;

/** Quantidade em centésimos da unidade: 2,5 m = 250; 3 un = 300. */
export type Qty = Brand<number, 'Qty'>;

/** 100% em pontos-base. */
export const BP_SCALE = 10_000;

/** Uma unidade inteira em centésimos. */
export const QTY_SCALE = 100;

export function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} precisa ser um inteiro seguro, recebido: ${String(value)}`);
  }
}

/** Marca um inteiro como centavos. Rejeita float, NaN e valores fora do intervalo seguro. */
export function cents(value: number): Cents {
  assertSafeInteger(value, 'cents');
  return value as Cents;
}

/** Marca um inteiro como pontos-base. */
export function bp(value: number): Bp {
  assertSafeInteger(value, 'bp');
  return value as Bp;
}

/** Marca um inteiro não negativo como quantidade em centésimos. */
export function qty(value: number): Qty {
  assertSafeInteger(value, 'qty');
  if (value < 0) {
    throw new RangeError(`qty não pode ser negativa, recebido: ${value}`);
  }
  return value as Qty;
}
