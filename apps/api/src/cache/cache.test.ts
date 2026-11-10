import type { BudgetDetail, DraftOpInput, GroupItemsPage } from '@budgets/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp } from '../testing/app.js';
import type { TestApp } from '../testing/app.js';

const ANA = 1;

let env: TestApp;

beforeAll(async () => {
  env = await startTestApp();
}, 180_000);

afterAll(() => env.stop());

async function metric(cache: string, result: 'hit' | 'miss' | 'error'): Promise<number> {
  const text = (await env.request('GET', '/metrics')).body;
  const line = text
    .split('\n')
    .find(
      (l) =>
        l.startsWith('budgets_cache_requests_total{') &&
        l.includes(`cache="${cache}"`) &&
        l.includes(`result="${result}"`),
    );
  return Number(line?.split(' ').at(-1) ?? 0);
}

const items = async (budgetId: number, groupId: number, user?: number) =>
  (
    await env.request('GET', `/budgets/${budgetId}/groups/${groupId}/items?limit=500`, { user })
  ).json<GroupItemsPage>();
const detail = async (id: number, user?: number) =>
  (await env.request('GET', `/budgets/${id}`, { user })).json<BudgetDetail>();
const ops = (id: number, list: DraftOpInput[]) =>
  env.request('POST', `/budgets/${id}/draft/ops`, { user: ANA, body: { ops: list } });

const pick = (n: number) => {
  const b = env.db.dataset.budgets[n];
  const g = b?.groups[0];
  const i = g?.items[0];
  if (!b || !g || !i) throw new Error('dados do perfil small mudaram');
  return { budget: b, group: g, item: i };
};

describe('cache-aside com a versão na chave', () => {
  it('a segunda leitura de um grupo vem do cache, igual à primeira', async () => {
    const { budget, group } = pick(3);
    const [missBefore, hitBefore] = [
      await metric('group_items', 'miss'),
      await metric('group_items', 'hit'),
    ];

    const first = await items(budget.id, group.id);
    const second = await items(budget.id, group.id);

    expect(second).toEqual(first);
    expect(await metric('group_items', 'miss')).toBe(missBefore + 1);
    expect(await metric('group_items', 'hit')).toBe(hitBefore + 1);
  });

  it('depois de salvar, a leitura traz o dado novo; a chave velha nem é apagada, só deixa de ser lida', async () => {
    const { budget, group, item } = pick(4);
    const before = await items(budget.id, group.id);
    await detail(budget.id); // aquece o cache do detalhe também

    await env.request('POST', `/budgets/${budget.id}/draft`, { user: ANA });
    await ops(budget.id, [{ op: 'updateItem', itemId: item.id, quantity: item.quantity + 100 }]);
    await env.request('POST', `/budgets/${budget.id}/draft/save`, { user: ANA });

    const after = await items(budget.id, group.id);
    expect(after.version).toBe(before.version + 1);
    expect(after.items.find((i) => i.id === item.id)?.quantity).toBe(item.quantity + 100);
    expect((await detail(budget.id)).groups.find((g) => g.id === group.id)?.version).toBe(
      before.version + 1,
    );

    const client = env.cacheClient();
    const keys = await client.keys(`group:${group.id}:*`).finally(() => {
      client.disconnect();
    });
    expect(keys.sort()).toEqual([
      `group:${group.id}:v${before.version}:items`,
      `group:${group.id}:v${before.version + 1}:items`,
    ]);
  });

  it('o dono do rascunho vê as alterações por cima do que veio do cache', async () => {
    const { budget, group, item } = pick(5);
    await items(budget.id, group.id); // grupo no cache
    await env.request('POST', `/budgets/${budget.id}/draft`, { user: ANA });
    await ops(budget.id, [{ op: 'updateItem', itemId: item.id, discountBp: 4321 }]);

    const hitBefore = await metric('group_items', 'hit');
    const mine = await items(budget.id, group.id, ANA);
    const others = await items(budget.id, group.id);

    expect(await metric('group_items', 'hit')).toBe(hitBefore + 2);
    expect(mine.items.find((i) => i.id === item.id)?.discountBp).toBe(4321);
    expect(others.items.find((i) => i.id === item.id)?.discountBp).toBe(item.discount);
  });

  it('com o redis-cache fora do ar, as leituras continuam pelo Postgres', async () => {
    const { budget, group } = pick(6);
    const expected = await items(budget.id, group.id);
    const errorsBefore = await metric('group_items', 'error');

    await env.cache.container.stop();
    const res = await env.request(
      'GET',
      `/budgets/${budget.id}/groups/${group.id}/items?limit=500`,
    );
    const d = await env.request('GET', `/budgets/${budget.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json<GroupItemsPage>()).toEqual(expected);
    expect(d.statusCode).toBe(200);
    expect(await metric('group_items', 'error')).toBe(errorsBefore + 1);
  });
});
