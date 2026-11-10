import { calcBudget } from '@budgets/budget-calc';
import type { BudgetInput } from '@budgets/budget-calc';
import { bp, cents, divRoundHalfUp, qty } from '@budgets/money';
import type { Unit } from '@budgets/money';

import { generateCatalog } from './catalog.js';
import type { Category, Product } from './catalog.js';
import { generateClients, generateSellers } from './people.js';
import type { Client, Seller } from './people.js';
import { createRng } from './random.js';
import type { Rng } from './random.js';

export type Size = 'pequeno' | 'medio' | 'grande' | 'pior-caso' | 'estresse';
export type Status = 'Rascunho' | 'Enviado' | 'Aprovado' | 'Perdido';

export interface SeedItem {
  id: number;
  productId: number;
  /** Nome e preço guardados no item: o catálogo muda, o orçamento não. */
  name: string;
  unit: Unit;
  /** Centavos por unidade. */
  price: number;
  /** Centésimos da unidade (3 un = 300; 2,5 m = 250). */
  quantity: number;
  /** Pontos-base (7,5% = 750). */
  discount: number;
  position: number;
}

export interface SeedGroup {
  id: number;
  name: string;
  category: string;
  position: number;
  items: SeedItem[];
}

export interface SeedBudget {
  id: number;
  description: string;
  clientId: number;
  sellerId: number;
  status: Status;
  /** Pontos-base, de −10000 a 10000. */
  prazo: number;
  /** Pontos-base, de 0 a 10000. */
  margem: number;
  createdAt: string;
  /** Orçamento que contém este (a versão mais nova), se houver. */
  parentId: number | null;
  size: Size;
  /** `true` só no perfil de estresse, que está acima do que o sistema real teve. */
  synthetic: boolean;
  groups: SeedGroup[];
}

export interface Profile {
  budgets: number;
  products: number;
  clients: number;
  sellers: number;
  /** Fração dos orçamentos que contém uma versão anterior. */
  linkedShare: number;
  /** Fração de cada tamanho; o resto é "pequeno". */
  mix: { medio: number; grande: number; 'pior-caso': number };
  stress: boolean;
}

export const PROFILES = {
  full: {
    budgets: 3200,
    products: 5500,
    clients: 2200,
    sellers: 12,
    linkedShare: 0.4,
    mix: { medio: 0.3, grande: 0.095, 'pior-caso': 0.005 },
    stress: true,
  },
  small: {
    budgets: 60,
    products: 400,
    clients: 40,
    sellers: 4,
    linkedShare: 0.4,
    mix: { medio: 0.3, grande: 0.05, 'pior-caso': 0.02 },
    stress: false,
  },
} as const satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;

/** Grupos e itens de cada tamanho. */
const SHAPES: Record<
  Size,
  { groups: readonly [number, number]; items: readonly [number, number] }
> = {
  pequeno: { groups: [1, 4], items: [5, 60] },
  medio: { groups: [5, 10], items: [60, 300] },
  grande: { groups: [12, 12], items: [300, 800] },
  'pior-caso': { groups: [15, 15], items: [1000, 1000] },
  estresse: { groups: [15, 15], items: [5000, 5000] },
};

const GROUPS: readonly (readonly [string, Category])[] = [
  ['Infraestrutura de rede', 'Rede'],
  ['Cabeamento', 'Rede'],
  ['Telefonia', 'Rede'],
  ['Equipamentos de TI', 'TI'],
  ['Automação', 'TI'],
  ['Elétrica', 'Elétrica'],
  ['Iluminação', 'Elétrica'],
  ['Climatização', 'Elétrica'],
  ['Segurança / CFTV', 'Segurança'],
  ['Controle de acesso', 'Segurança'],
  ['Obra civil', 'Construção'],
  ['Acabamento', 'Construção'],
  ['Mão de obra', 'Serviços'],
  ['Configuração e testes', 'Serviços'],
  ['Projeto e documentação', 'Serviços'],
];

const SERVICES = [
  'Reforma do datacenter',
  'Cabeamento estruturado',
  'Retrofit elétrico',
  'Projeto de CFTV',
  'Expansão da filial',
  'Laboratório de informática',
  'Migração de rede',
  'Adequação elétrica',
  'Manutenção preventiva',
  'Ampliação do galpão',
  'Modernização da recepção',
  'Sala de servidores',
];

/** Data-base fixa: o gerador nunca usa a data atual. */
const BASE_TIME = Date.UTC(2024, 0, 2, 12, 0, 0);
const SPAN_MS = 730 * 24 * 60 * 60 * 1000;
const POSITION_GAP = 1024; // espaço entre posições para inserir no meio sem renumerar

function quantityFor(rng: Rng, unit: Unit): number {
  switch (unit) {
    case 'un':
      return (
        rng.weighted([
          [rng.int(1, 5), 60],
          [rng.int(6, 50), 35],
          [rng.int(51, 500), 5],
        ]) * 100
      );
    case 'm':
      return rng.step(50, 50_000, 50); // 0,5 m a 500 m
    case 'kg':
      return rng.step(25, 200_000, 25); // 0,25 kg a 2.000 kg
    case 'l':
      return rng.step(50, 20_000, 50); // 0,5 L a 200 L
  }
}

function discountFor(rng: Rng): number {
  return rng.weighted<() => number>([
    [() => 0, 70],
    [() => rng.step(500, 1000, 50), 20],
    [() => rng.step(1000, 3000, 50), 9],
    [() => 10_000, 1], // brinde: 100% de desconto
  ])();
}

function distribute(rng: Rng, total: number, parts: number): number[] {
  const counts: number[] = Array.from({ length: parts }, () => (total >= parts ? 1 : 0));
  for (let left = total - counts.reduce((s, c) => s + c, 0); left > 0; left--) {
    const k = rng.int(0, parts - 1);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export interface Dataset {
  profile: ProfileName;
  seed: number;
  products: Product[];
  clients: Client[];
  sellers: Seller[];
  budgets: SeedBudget[];
  /** Total esperado de cada orçamento pela regra nova (packages/budget-calc), em centavos. */
  expectedTotals: Record<number, number>;
}

export function generate(profileName: ProfileName, seed: number): Dataset {
  const profile: Profile = PROFILES[profileName];
  const rng = createRng(seed);
  const products = generateCatalog(rng, profile.products);
  const clients = generateClients(rng, profile.clients);
  const sellers = generateSellers(profile.sellers);

  const byCategory = new Map<Category, Product[]>();
  for (const p of products) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);

  // Tamanhos com quantidades exatas, embaralhados entre os orçamentos.
  const n = profile.budgets;
  const counts: [Size, number][] = [
    ['pior-caso', Math.max(1, Math.round(n * profile.mix['pior-caso']))],
    ['grande', Math.round(n * profile.mix.grande)],
    ['medio', Math.round(n * profile.mix.medio)],
  ];
  const sizes: Size[] = counts.flatMap(([size, c]) => Array.from({ length: c }, () => size));
  while (sizes.length < n) sizes.push('pequeno');
  const shuffledSizes = rng.shuffle(sizes);
  if (profile.stress) shuffledSizes.push('estresse');

  let groupId = 0;
  let itemId = 0;
  const budgets: SeedBudget[] = shuffledSizes.map((size, index) => {
    const id = index + 1;
    const shape = SHAPES[size];
    const groupCount = rng.int(shape.groups[0], shape.groups[1]);
    const itemCount = rng.int(shape.items[0], shape.items[1]);
    const perGroup = distribute(rng, itemCount, groupCount);
    const groupNames = rng.shuffle(GROUPS).slice(0, groupCount);

    const groups: SeedGroup[] = groupNames.map(([name, category], g) => ({
      id: ++groupId,
      name,
      category,
      position: (g + 1) * POSITION_GAP,
      items: Array.from({ length: perGroup[g] ?? 0 }, (_, i) => {
        const pool = rng.chance(0.7) ? (byCategory.get(category) ?? products) : products;
        const product = rng.pick(pool);
        // Em 20% dos itens o preço guardado difere do catálogo atual (o preço mudou depois).
        const price = rng.chance(0.2)
          ? divRoundHalfUp(product.price * (100 + rng.int(-15, 15)), 100)
          : product.price;
        return {
          id: ++itemId,
          productId: product.id,
          name: product.name,
          unit: product.unit,
          price,
          quantity: quantityFor(rng, product.unit),
          discount: discountFor(rng),
          position: (i + 1) * POSITION_GAP,
        };
      }),
    }));

    const client = rng.pick(clients);
    return {
      id,
      description:
        size === 'estresse'
          ? 'Perfil de estresse (sintético, acima do real)'
          : `${rng.pick(SERVICES)} — ${client.name}`,
      clientId: client.id,
      sellerId: rng.pick(sellers).id,
      status: rng.weighted<Status>([
        ['Rascunho', 25],
        ['Enviado', 30],
        ['Aprovado', 30],
        ['Perdido', 15],
      ]),
      prazo: rng.weighted<() => number>([
        [() => 0, 65],
        [() => rng.step(100, 800, 50), 25],
        [() => -rng.step(50, 500, 50), 10],
      ])(),
      margem: rng.weighted<() => number>([
        [() => 0, 20],
        [() => rng.step(500, 2500, 100), 80],
      ])(),
      createdAt: new Date(
        BASE_TIME +
          Math.floor((index * SPAN_MS) / shuffledSizes.length) +
          rng.int(0, 6 * 3600 * 1000),
      ).toISOString(),
      parentId: null,
      size,
      synthetic: size === 'estresse',
      groups,
    };
  });

  linkVersions(rng, budgets, Math.round(n * profile.linkedShare));
  return {
    profile: profileName,
    seed,
    products,
    clients,
    sellers,
    budgets,
    expectedTotals: expectedTotals(budgets),
  };
}

/**
 * Vincula orçamentos como no sistema real: quando um orçamento envelhecia, abria-se um novo
 * que continha o antigo. O pai é sempre mais novo, do mesmo cliente quando possível, e herda
 * cliente e vendedor. Profundidade 1: quem tem filho nunca vira filho, e vice-versa.
 */
function linkVersions(rng: Rng, budgets: SeedBudget[], target: number): void {
  const real = budgets.filter((b) => !b.synthetic);
  const hasChildren = new Set<number>();
  const byClient = new Map<number, SeedBudget[]>();
  for (const b of real) byClient.set(b.clientId, [...(byClient.get(b.clientId) ?? []), b]);

  const free = (b: SeedBudget): boolean => b.parentId === null && !hasChildren.has(b.id);
  let linked = 0;
  for (const parent of rng.shuffle(real)) {
    if (linked >= target) break;
    if (parent.parentId !== null || parent.id === 1) continue;

    const sameClient = (byClient.get(parent.clientId) ?? [])
      .filter((b) => b.id < parent.id && b !== parent && free(b))
      .at(-1);
    let child = sameClient;
    for (let attempt = 0; child === undefined && attempt < 20; attempt++) {
      const candidate = real[rng.int(0, parent.id - 2)];
      if (candidate && candidate.id < parent.id && free(candidate)) child = candidate;
    }
    if (child === undefined) continue;

    child.parentId = parent.id;
    hasChildren.add(parent.id);
    parent.clientId = child.clientId;
    parent.sellerId = child.sellerId;
    parent.description = `${child.description.replace(/ \(revisão\)$/, '')} (revisão)`;
    linked++;
  }
}

function toInput(budget: SeedBudget, childrenOf: Map<number, SeedBudget[]>): BudgetInput {
  return {
    id: budget.id,
    prazo: bp(budget.prazo),
    margem: bp(budget.margem),
    groups: budget.groups.map((g) => ({
      id: g.id,
      items: g.items.map((i) => ({
        id: i.id,
        price: cents(i.price),
        quantity: qty(i.quantity),
        discount: bp(i.discount),
      })),
    })),
    children: (childrenOf.get(budget.id) ?? []).map((c) => toInput(c, childrenOf)),
  };
}

function expectedTotals(budgets: SeedBudget[]): Record<number, number> {
  const childrenOf = new Map<number, SeedBudget[]>();
  for (const b of budgets) {
    if (b.parentId !== null) childrenOf.set(b.parentId, [...(childrenOf.get(b.parentId) ?? []), b]);
  }
  const totals: Record<number, number> = {};
  for (const b of budgets) totals[b.id] = calcBudget(toInput(b, childrenOf)).total;
  return totals;
}
