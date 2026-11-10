import { calcFromSubtotals } from '@budgets/budget-calc';
import type {
  ApiError,
  BudgetDetail,
  DraftOpInput,
  DraftOpsResult,
  GroupItemsPage,
  Item,
  SaveResult,
} from '@budgets/contracts';
import { bp, cents, itemTotal, qty } from '@budgets/money';
import { createRng } from '@budgets/seed';
import type { SeedBudget } from '@budgets/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrisma } from '../db/prisma.js';
import { verifyTotals } from '../db/verify.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { startTestApp } from '../testing/app.js';
import type { TestApp } from '../testing/app.js';
import { draftKey } from './draft.js';

const ANA = 1;
const BRUNO = 2;

let env: TestApp;
let prisma: PrismaClient;

beforeAll(async () => {
  env = await startTestApp();
  prisma = createPrisma(env.db.url);
}, 180_000);

afterAll(async () => {
  await prisma.$disconnect();
  await env.stop();
});

// ---------- auxiliares ----------

async function call<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  user?: number,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await env.request(method, url, { user, body });
  return { status: res.statusCode, body: res.json<T>() };
}

const open = (id: number, user: number) => call<BudgetDetail>('POST', `/budgets/${id}/draft`, user);
const apply = (id: number, user: number, ops: DraftOpInput[]) =>
  call<DraftOpsResult>('POST', `/budgets/${id}/draft/ops`, user, { ops });
const save = (id: number, user: number) =>
  call<SaveResult>('POST', `/budgets/${id}/draft/save`, user);
const detail = async (id: number, user?: number) =>
  (await call<BudgetDetail>('GET', `/budgets/${id}`, user)).body;

/** Todos os itens de um grupo, como o usuário vê (página por página). */
async function allItems(budgetId: number, groupId: number, user?: number): Promise<Item[]> {
  const items: Item[] = [];
  let after: number | null = null;
  do {
    const query: string = after === null ? '' : `&after=${after}`;
    const page: GroupItemsPage = (
      await call<GroupItemsPage>(
        'GET',
        `/budgets/${budgetId}/groups/${groupId}/items?limit=50${query}`,
        user,
      )
    ).body;
    items.push(...page.items);
    after = page.next;
  } while (after !== null);
  return items;
}

/** Recalcula tudo do zero a partir de todos os itens: a régua do cálculo por delta. */
async function recalculate(budgetId: number, user?: number) {
  const d = await detail(budgetId, user);
  const groups = await Promise.all(
    d.groups.map(async (g) => {
      const items = await allItems(budgetId, g.id, user);
      for (const i of items) {
        expect(i.totalCents).toBe(
          itemTotal(cents(i.priceCents), qty(i.quantity), bp(i.discountBp)),
        );
      }
      return { id: g.id, items, subtotal: items.reduce((s, i) => s + i.totalCents, 0) };
    }),
  );
  const totals = calcFromSubtotals({
    groupSubtotals: groups.map((g) => cents(g.subtotal)),
    childTotals: d.children.map((c) => cents(c.totalCents)),
    prazo: bp(d.prazoBp),
    margem: bp(d.margemBp),
  });
  return { detail: d, groups, totals };
}

const dbItem = (id: number) => prisma.item.findUniqueOrThrow({ where: { id } });

/** Um orçamento do perfil small que ainda não foi usado em outro teste. */
const used = new Set<number>();
function budget(filter: (b: SeedBudget) => boolean = () => true): SeedBudget {
  const found = env.db.dataset.budgets.find(
    (b) =>
      !used.has(b.id) &&
      b.groups.length >= 2 &&
      b.groups.every((g) => g.items.length >= 3) &&
      filter(b),
  );
  if (!found) throw new Error('nenhum orçamento disponível para o teste');
  used.add(found.id);
  if (found.parentId !== null) used.add(found.parentId);
  return found;
}

const firstItem = (b: SeedBudget) => {
  const item = b.groups[0]?.items[0];
  if (!item) throw new Error('orçamento sem item');
  return item;
};

// ---------- testes ----------

describe('bloqueio', () => {
  it('quem abre trava para os outros, que veem quem está editando', async () => {
    const b = budget();
    const opened = (await open(b.id, ANA)).body;
    expect(opened.draft?.mine).toBe(true);
    expect(opened.draft?.ownerId).toBe(ANA);

    const other = await call<ApiError>('POST', `/budgets/${b.id}/draft`, BRUNO);
    expect(other.status).toBe(423);
    expect(other.body.details).toMatchObject({ lock: { ownerId: ANA, mine: false } });

    const asBruno = await detail(b.id, BRUNO);
    expect(asBruno.draft).toMatchObject({ ownerId: ANA, mine: false });
    const edit = await call<ApiError>('POST', `/budgets/${b.id}/draft/ops`, BRUNO, {
      ops: [{ op: 'header', margemBp: 0 }],
    });
    expect(edit.status).toBe(423);
  });

  it('outra aba do mesmo usuário retoma o mesmo rascunho', async () => {
    const b = budget();
    await open(b.id, ANA);
    await apply(b.id, ANA, [{ op: 'header', prazoBp: 500 }]);

    const secondTab = await open(b.id, ANA);
    expect(secondTab.body.prazoBp).toBe(500);
    expect(secondTab.body.draft?.changes).toBe(1);
  });

  it('cada edição renova o prazo do rascunho (e do bloqueio)', async () => {
    const b = budget();
    await open(b.id, ANA);
    await env.redisClient().pexpire(draftKey(b.id), 5_000);

    await apply(b.id, ANA, [{ op: 'header', margemBp: 100 }]);

    expect(await env.redisClient().pttl(draftKey(b.id))).toBeGreaterThan(29 * 60 * 1000);
  });
});

describe('editar', () => {
  it('não escreve nada no Postgres; só o dono vê a alteração', async () => {
    const b = budget();
    const item = firstItem(b);
    const before = await dbItem(item.id);
    const savedTotal = (await detail(b.id)).totals.total;

    await open(b.id, ANA);
    const result = await apply(b.id, ANA, [
      { op: 'updateItem', itemId: item.id, quantity: before.quantity + 100 },
    ]);

    expect(await dbItem(item.id)).toEqual(before);
    expect(result.body.items[0]?.quantity).toBe(before.quantity + 100);
    expect((await detail(b.id)).totals.total).toBe(savedTotal);
    expect((await detail(b.id, ANA)).totals.total).toBe(result.body.detail.totals.total);
    expect(result.body.detail.totals.total).not.toBe(savedTotal);
  });

  it('um lote de operações vale todo ou nada', async () => {
    const b = budget();
    const item = firstItem(b);
    const unit = b.groups[0]?.items.find((i) => i.unit === 'un');
    if (!unit) throw new Error('grupo sem item em "un"');
    await open(b.id, ANA);

    const res = await call<ApiError>('POST', `/budgets/${b.id}/draft/ops`, ANA, {
      ops: [
        { op: 'updateItem', itemId: item.id, discountBp: 1234 },
        { op: 'updateItem', itemId: unit.id, quantity: 150 }, // 1,5 un
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Quantidade em "un" não aceita fração.');
    const d = await detail(b.id, ANA);
    expect(d.draft?.changes).toBe(0);
    const seen = await allItems(b.id, b.groups[0]?.id ?? 0, ANA);
    expect(seen.find((i) => i.id === item.id)?.discountBp).toBe(item.discount);
  });

  it('inserir acima e abaixo mantém a ordem, mesmo quando as posições esgotam', async () => {
    const b = budget();
    const group = b.groups[0];
    const anchor = group?.items[1];
    if (!group || !anchor) throw new Error('grupo pequeno');
    await open(b.id, ANA);

    // 12 inserções seguidas no mesmo ponto: a folga de 1024 acaba na 11ª e o grupo é renumerado.
    const added: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await apply(b.id, ANA, [
        { op: 'addItem', groupId: group.id, productId: 1 + i, quantity: 100, before: anchor.id },
      ]);
      const created = res.body.items.find((x) => x.id < 0 && !added.includes(x.id));
      if (!created) throw new Error('item criado não voltou');
      added.push(created.id);
    }
    const below = await apply(b.id, ANA, [
      { op: 'addItem', groupId: group.id, productId: 50, quantity: 100, after: anchor.id },
    ]);
    const belowId = below.body.items.find((x) => x.productId === 50 && x.id < 0)?.id;

    const expected = [
      group.items[0]?.id,
      ...added,
      anchor.id,
      belowId,
      ...group.items.slice(2).map((i) => i.id),
    ];
    expect((await allItems(b.id, group.id, ANA)).map((i) => i.id)).toEqual(expected);

    const saved = await save(b.id, ANA);
    expect(saved.status).toBe(200);
    const real = (id: number | undefined) =>
      id !== undefined && id < 0 ? saved.body.createdIds.items[id] : id;
    expect((await allItems(b.id, group.id)).map((i) => i.id)).toEqual(expected.map(real));
  });

  it('duas abas editando ao mesmo tempo não perdem a edição uma da outra', async () => {
    const b = budget((x) => (x.groups[0]?.items.length ?? 0) >= 10);
    const items = b.groups[0]?.items.slice(0, 10) ?? [];
    await open(b.id, ANA);

    const results = await Promise.all(
      items.map((i) => apply(b.id, ANA, [{ op: 'updateItem', itemId: i.id, discountBp: 700 }])),
    );

    expect(results.map((r) => r.status)).toEqual(items.map(() => 200));
    const d = await detail(b.id, ANA);
    expect(d.draft?.changes).toBe(10);
    const seen = await allItems(b.id, b.groups[0]?.id ?? 0, ANA);
    for (const i of items) expect(seen.find((s) => s.id === i.id)?.discountBp).toBe(700);
  });
});

describe('salvar e descartar', () => {
  it('80 edições aleatórias: o total por delta bate com o recálculo completo, antes e depois de salvar', async () => {
    const b = budget((x) => x.groups.length >= 4);
    const rng = createRng(2026);
    await open(b.id, ANA);

    for (let step = 0; step < 80; step++) {
      const d = await detail(b.id, ANA);
      const group = rng.pick(d.groups);
      const items = await allItems(b.id, group.id, ANA);
      const item = items.length > 0 ? rng.pick(items) : null;
      const kind = rng.weighted([
        ['updateItem', 5],
        ['addItem', 3],
        ['removeItem', 2],
        ['moveItem', 2],
        ['header', 1],
        ['addGroup', 0.3],
        ['removeGroup', 0.2],
      ] as const);

      let op: DraftOpInput;
      if (kind === 'header') {
        op = { op: 'header', prazoBp: rng.int(-2000, 2000), margemBp: rng.int(0, 3000) };
      } else if (kind === 'addGroup') {
        op = { op: 'addGroup', name: `Grupo ${step}`, category: 'Serviços' };
      } else if (kind === 'removeGroup' && d.groups.length > 2) {
        op = { op: 'removeGroup', groupId: group.id };
      } else if (kind === 'addItem' || !item) {
        const product = rng.pick(env.db.dataset.products);
        op = {
          op: 'addItem',
          groupId: group.id,
          productId: product.id,
          quantity: product.unit === 'un' ? rng.int(1, 20) * 100 : rng.int(1, 5000),
          discountBp: rng.pick([0, 0, 500, 1250]),
          ...(item ? { [rng.pick(['before', 'after'] as const)]: item.id } : {}),
        };
      } else if (kind === 'removeItem') {
        op = { op: 'removeItem', itemId: item.id };
      } else if (kind === 'moveItem' && items.length > 1) {
        const other = rng.pick(items.filter((i) => i.id !== item.id));
        op = {
          op: 'moveItem',
          itemId: item.id,
          [rng.pick(['before', 'after'] as const)]: other.id,
        };
      } else {
        op = {
          op: 'updateItem',
          itemId: item.id,
          quantity: item.unit === 'un' ? rng.int(1, 30) * 100 : rng.int(1, 9000),
          discountBp: rng.int(0, 10_000),
        };
      }
      const res = await apply(b.id, ANA, [op]);
      expect(res.status, JSON.stringify({ step, op, body: res.body })).toBe(200);
    }

    const draft = await recalculate(b.id, ANA);
    expect(draft.detail.totals).toEqual(draft.totals);
    for (const g of draft.groups) {
      expect(draft.detail.groups.find((x) => x.id === g.id)?.subtotalCents).toBe(g.subtotal);
    }

    const saved = await save(b.id, ANA);
    expect(saved.status).toBe(200);
    expect(saved.body.detail.draft).toBeNull();
    expect(saved.body.detail.totals).toEqual(draft.totals);

    const after = await recalculate(b.id);
    expect(after.totals).toEqual(draft.totals);
    expect(
      after.groups.map((g) => g.items.map((i) => [i.productId, i.quantity, i.discountBp])),
    ).toEqual(draft.groups.map((g) => g.items.map((i) => [i.productId, i.quantity, i.discountBp])));

    // O banco inteiro continua coerente: em todo orçamento (inclusive os salvos pelos outros
    // testes), itens, subtotais e totais guardados batem com o recálculo a partir dos itens.
    const stored = await prisma.budget.findMany({ select: { id: true, totalCents: true } });
    const expected = Object.fromEntries(stored.map((s) => [s.id, Number(s.totalCents)]));
    expect((await verifyTotals(prisma, expected)).mismatches).toEqual([]);
  });

  it('salvar um orçamento que está dentro de outro atualiza o total do pai', async () => {
    const b = budget((x) => x.parentId !== null);
    const parentId = b.parentId ?? 0;
    const parentBefore = await detail(parentId);
    await open(b.id, ANA);
    await apply(b.id, ANA, [{ op: 'header', margemBp: 5000 }]);

    const saved = await save(b.id, ANA);

    const parent = await detail(parentId);
    expect(parent.children.find((c) => c.id === b.id)?.totalCents).toBe(
      saved.body.detail.totals.total,
    );
    expect(parent.totals.total).not.toBe(parentBefore.totals.total);
    expect(parent.totals).toEqual((await recalculate(parentId)).totals);
  });

  it('descartar não grava nada e libera o orçamento para os outros', async () => {
    const b = budget();
    const item = firstItem(b);
    const before = await dbItem(item.id);
    await open(b.id, ANA);
    await apply(b.id, ANA, [{ op: 'removeItem', itemId: item.id }]);

    const discarded = await call<BudgetDetail>('DELETE', `/budgets/${b.id}/draft`, ANA);

    expect(discarded.status).toBe(200);
    expect(discarded.body.draft).toBeNull();
    expect(await dbItem(item.id)).toEqual(before);
    expect((await open(b.id, BRUNO)).status).toBe(200);
  });

  it('recusa salvar um grupo que mudou fora do rascunho, sem gravar nada', async () => {
    const b = budget();
    const item = firstItem(b);
    const before = await dbItem(item.id);
    await open(b.id, ANA);
    await apply(b.id, ANA, [{ op: 'updateItem', itemId: item.id, discountBp: 900 }]);
    await env.db.pool.query('UPDATE groups SET version = version + 1 WHERE id = $1', [
      before.groupId,
    ]);

    const res = await call<ApiError>('POST', `/budgets/${b.id}/draft/save`, ANA);

    expect(res.status).toBe(409);
    expect(res.body.details).toEqual({ groups: [before.groupId] });
    expect(await dbItem(item.id)).toEqual(before);
    // O rascunho continua lá, e editável.
    expect((await apply(b.id, ANA, [{ op: 'header', margemBp: 0 }])).status).toBe(200);
  });

  it('sem rascunho, salvar responde 410', async () => {
    const b = budget();
    expect((await call<ApiError>('POST', `/budgets/${b.id}/draft/save`, ANA)).status).toBe(410);
  });

  it('editar exige o usuário', async () => {
    const b = budget();
    expect((await call<ApiError>('POST', `/budgets/${b.id}/draft`)).status).toBe(401);
  });
});
