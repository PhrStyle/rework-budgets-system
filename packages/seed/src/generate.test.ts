import { checkLimit } from '@budgets/budget-calc';
import { isValidQuantity, qty } from '@budgets/money';
import { describe, expect, it } from 'vitest';

import { generate, PROFILES } from './generate.js';
import type { Dataset, Size } from './generate.js';
import { manifest, serialize, sha256 } from './serialize.js';

const SEED = 20_261_110;
const small = generate('small', SEED);

const hashes = (d: Dataset): Record<string, string> =>
  Object.fromEntries(
    Object.entries(serialize(d)).map(([name, content]) => [name, sha256(content)]),
  );

describe('determinismo', () => {
  it('a mesma semente gera os mesmos bytes', () => {
    expect(hashes(generate('small', SEED))).toEqual(hashes(small));
  });

  it('outra semente gera outros dados', () => {
    expect(hashes(generate('small', SEED + 1))['budgets.ndjson']).not.toBe(
      hashes(small)['budgets.ndjson'],
    );
  });

  it('a saída é a mesma em qualquer máquina (hash de referência)', () => {
    // Se este teste quebrar, o gerador mudou: os dados de todos os benchmarks mudam junto.
    // Atualize o hash só se a mudança for intencional (e aumente GENERATOR_VERSION).
    expect(hashes(small)['budgets.ndjson']).toMatchInlineSnapshot(
      `"a3b4538e32face67337209282f09e5da7e9bbbb0d51f194f0970332748fb611e"`,
    );
  });
});

/**
 * Confere as regras de negócio em todos os orçamentos e itens. Coleta as violações e faz um único
 * `expect` no fim: com 426 mil itens, um `expect` por campo levaria segundos, e a lista de
 * violações diz exatamente o que quebrou e onde.
 */
function violations(d: Dataset): string[] {
  const out: string[] = [];
  const fail = (where: string, what: string): void => {
    if (out.length < 20) out.push(`${where}: ${what}`);
  };
  const products = new Map(d.products.map((p) => [p.id, p]));
  const budgets = new Map(d.budgets.map((b) => [b.id, b]));
  const parents = new Set(d.budgets.map((b) => b.parentId).filter((p) => p !== null));

  d.budgets.forEach((b, index) => {
    const at = `orçamento ${String(b.id)}`;
    if (b.id !== index + 1) fail(at, 'id fora de sequência');
    if (checkLimit('prazo', b.prazo)) fail(at, `prazo ${String(b.prazo)} fora do limite`);
    if (checkLimit('margem', b.margem)) fail(at, `margem ${String(b.margem)} fora do limite`);
    if (!Number.isSafeInteger(d.expectedTotals[b.id])) fail(at, 'sem total esperado');

    if (b.parentId !== null) {
      const parent = budgets.get(b.parentId);
      if (!parent) fail(at, `pai ${String(b.parentId)} inexistente`);
      if (b.parentId <= b.id) fail(at, 'o pai precisa ser a versão mais nova');
      if (parent && parent.parentId !== null) fail(at, 'profundidade > 1: o pai também é filho');
      if (parents.has(b.id)) fail(at, 'profundidade > 1: o filho tem filhos');
      if (b.synthetic) fail(at, 'orçamento sintético vinculado');
    }

    for (const g of b.groups) {
      for (const item of g.items) {
        const where = `${at}, item ${String(item.id)}`;
        const product = products.get(item.productId);
        if (!product) fail(where, 'produto inexistente');
        else if (item.unit !== product.unit) fail(where, 'unidade diferente da do produto');
        if (!Number.isSafeInteger(item.price) || item.price <= 0) fail(where, 'preço inválido');
        if (!isValidQuantity(qty(item.quantity), item.unit))
          fail(where, `quantidade ${String(item.quantity)} inválida para ${item.unit}`);
        if (checkLimit('discount', item.discount)) fail(where, 'desconto fora do limite');
      }
    }
  });
  return out;
}

describe('manifest', () => {
  it('registra resumo, unidades e o hash de cada arquivo', () => {
    const files = serialize(small);
    const m = JSON.parse(manifest(small, files)) as {
      seed: number;
      summary: { budgets: number; items: number };
      units: Record<string, string>;
      files: Record<string, { bytes: number; sha256: string }>;
    };
    expect(m.seed).toBe(SEED);
    expect(m.summary.budgets).toBe(60);
    expect(m.summary.items).toBe(
      small.budgets.reduce((s, b) => s + b.groups.reduce((t, g) => t + g.items.length, 0), 0),
    );
    expect(m.units.price).toContain('centavos');
    for (const [name, content] of Object.entries(files)) {
      expect(m.files[name]?.sha256).toBe(sha256(content));
    }
  });
});

describe('perfil small (testes e CI)', () => {
  it('respeita as regras de negócio em todos os orçamentos e itens', () => {
    expect(violations(small)).toEqual([]);
  });

  it('o verificador acusa violações de verdade', () => {
    const broken = structuredClone(small);
    const item = broken.budgets[0]?.groups[0]?.items[0];
    const child = broken.budgets.find((b) => b.parentId !== null);
    if (!item || !child) throw new Error('perfil small sem item ou sem vínculo');
    item.discount = 10_001;
    item.quantity = 150;
    item.unit = 'un';
    child.parentId = child.id; // pai que não é mais novo
    expect(violations(broken).join(' | ')).toMatch(/desconto fora do limite/);
    expect(violations(broken).join(' | ')).toMatch(/quantidade 150 inválida para un/);
    expect(violations(broken).join(' | ')).toMatch(/o pai precisa ser a versão mais nova/);
  });

  it('tem os tamanhos pedidos', () => {
    const count = (size: Size): number => small.budgets.filter((b) => b.size === size).length;
    expect(small.budgets).toHaveLength(PROFILES.small.budgets);
    expect(count('pior-caso')).toBeGreaterThanOrEqual(1);
    expect(count('estresse')).toBe(0);
  });
});

describe('perfil full (o usado nos benchmarks)', () => {
  const full = generate('full', SEED);
  const of = (size: Size) => full.budgets.filter((b) => b.size === size);
  const items = (b: Dataset['budgets'][number]) => b.groups.reduce((s, g) => s + g.items.length, 0);

  it('tem os volumes do sistema original', () => {
    expect(full.budgets.filter((b) => !b.synthetic)).toHaveLength(3200);
    expect(full.products).toHaveLength(5500);
    expect(full.clients).toHaveLength(2200);
    expect(new Set(full.budgets.map((b) => b.parentId).filter((p) => p !== null)).size).toBe(1280); // 40%
  });

  it('tem a mistura de tamanhos com quantidades exatas', () => {
    expect(of('pequeno')).toHaveLength(1920);
    expect(of('medio')).toHaveLength(960);
    expect(of('grande')).toHaveLength(304);
    expect(of('pior-caso')).toHaveLength(16);
    expect(of('pior-caso').every((b) => b.groups.length === 15 && items(b) === 1000)).toBe(true);
  });

  it('tem um único orçamento de estresse, marcado como sintético', () => {
    const stress = of('estresse');
    expect(stress).toHaveLength(1);
    expect(stress[0]?.synthetic).toBe(true);
    expect(stress[0] && items(stress[0])).toBe(5000);
  });

  it('respeita as regras de negócio em todos os orçamentos e itens', () => {
    expect(violations(full)).toEqual([]);
  });
});
