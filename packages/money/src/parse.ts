import { BP_SCALE, bp, cents } from './types.js';
import type { Bp, Cents } from './types.js';

/** Texto que não representa um número válido para o campo. A mensagem pode ir direto para a tela. */
export class ParseError extends Error {
  override name = 'ParseError';
}

interface ScaledOptions {
  allowNegative?: boolean;
}

/**
 * Converte texto decimal num inteiro escalado por 10^decimals, sem passar por float.
 *
 * Aceita dois formatos, sem adivinhar:
 * - pt-BR: `1.234,56` (vírgula decimal; ponto só como separador de milhar, em grupos de 3)
 * - máquina: `1234.56` (ponto decimal, sem milhar), como entrega um `<input type="number">`
 *
 * Por isso `"1.234"` com 2 casas é recusado (3 casas decimais) em vez de virar 1,234 ou 1234.
 */
export function parseScaled(text: string, decimals: number, options: ScaledOptions = {}): number {
  let s = text.trim();
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trimStart();
  }

  let intPart: string;
  let fracPart: string;
  let hasSeparator: boolean;
  if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length !== 2) throw new ParseError(`Número inválido: "${text}"`);
    [intPart, fracPart] = parts as [string, string];
    hasSeparator = true;
    if (intPart.includes('.')) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) {
        throw new ParseError(`Separador de milhar inválido: "${text}"`);
      }
      intPart = intPart.replaceAll('.', '');
    }
  } else {
    const parts = s.split('.');
    if (parts.length > 2) throw new ParseError(`Número inválido: "${text}"`);
    intPart = parts[0] ?? '';
    fracPart = parts[1] ?? '';
    hasSeparator = parts.length === 2;
  }

  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart) || (hasSeparator && fracPart === '')) {
    throw new ParseError(`Número inválido: "${text}"`);
  }
  if (fracPart.length > decimals) {
    throw new ParseError(
      decimals === 0
        ? `Use um número inteiro: "${text}"`
        : `Use no máximo ${decimals} casas decimais: "${text}"`,
    );
  }

  const value = Number(intPart + fracPart.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(value)) {
    throw new ParseError(`Valor grande demais: "${text}"`);
  }
  if (negative && value !== 0) {
    if (!options.allowNegative) throw new ParseError(`Valor negativo não permitido: "${text}"`);
    return -value;
  }
  return value;
}

/** `"R$ 1.234,56"`, `"1234,56"` ou `"1234.56"` → 123456 centavos. */
export function parseMoney(text: string, options: ScaledOptions = {}): Cents {
  let s = text.trim();
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1).trimStart();
  s = s.replace(/^R\$\s*/, '');
  return cents(parseScaled((negative ? '-' : '') + s, 2, options));
}

interface PercentOptions {
  /** Mínimo em pontos-base. Padrão: 0. */
  min?: number;
  /** Máximo em pontos-base. Padrão: 10000 (100%). */
  max?: number;
}

/** `"7,5"`, `"7.5"` ou `"7,5%"` → 750 pontos-base, dentro do intervalo pedido. */
export function parsePercent(text: string, { min = 0, max = BP_SCALE }: PercentOptions = {}): Bp {
  const s = text.trim().replace(/\s*%$/, '');
  const value = parseScaled(s, 2, { allowNegative: min < 0 });
  if (value < min || value > max) {
    throw new ParseError(
      `Use um percentual entre ${formatRange(min)}% e ${formatRange(max)}%: "${text}"`,
    );
  }
  return bp(value);
}

function formatRange(value: number): string {
  return String(value / 100).replace('.', ',');
}
