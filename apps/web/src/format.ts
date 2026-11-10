import { bp, cents, formatBRL, formatPercent, formatQuantity, qty } from '@budgets/money';
import type { Unit } from '@budgets/contracts';

// A tela só formata: os valores chegam prontos (inteiros) da API, que é quem calcula.
export const brl = (value: number): string => formatBRL(cents(value));
export const pct = (value: number): string => formatPercent(bp(value));
export const quantity = (value: number, unit: Unit): string => formatQuantity(qty(value), unit);

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
export const date = (iso: string): string => dateFormat.format(new Date(iso));
