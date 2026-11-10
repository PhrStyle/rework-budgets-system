import type {
  ApiError,
  BudgetDetail,
  BudgetSummary,
  GroupItemsPage,
  Page,
  Product,
  Ref,
} from '@budgets/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { startTestDatabase } from './testing/database.js';
import type { TestDatabase } from './testing/database.js';

let db: TestDatabase;
let app: NestFastifyApplication;

beforeAll(async () => {
  db = await startTestDatabase();
  app = await createApp({ databaseUrl: db.url, logLevel: 'silent', prettyLogs: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

/** Requisição em memória (Fastify inject): passa por rotas, validação, filtros e logs, sem rede. */
function get(url: string, headers: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url: `/api${url}`, headers });
}

describe('listagem', () => {
  it('pagina e informa o total', async () => {
    const body = (await get('/budgets?pageSize=7&page=2')).json<Page<BudgetSummary>>();

    expect(body.total).toBe(db.dataset.budgets.length);
    expect(body.items).toHaveLength(7);
    expect(body.page).toBe(2);
  });

  it('busca pelo nome do cliente, sem diferenciar maiúsculas', async () => {
    const budget = db.dataset.budgets[0];
    const client = db.dataset.clients.find((c) => c.id === budget?.clientId);
    const body = (
      await get(`/budgets?search=${encodeURIComponent(client?.name.toUpperCase() ?? '')}`)
    ).json<Page<BudgetSummary>>();

    expect(body.items.map((b) => b.id)).toContain(budget?.id);
    expect(body.items.every((b) => b.client.name === client?.name)).toBe(true);
  });

  it('busca pelo número do orçamento', async () => {
    const body = (await get('/budgets?search=42')).json<Page<BudgetSummary>>();

    expect(body.items.map((b) => b.id)).toContain(42);
  });

  it('o total de cada orçamento é o do cálculo novo', async () => {
    const body = (await get('/budgets?pageSize=100')).json<Page<BudgetSummary>>();

    for (const b of body.items) expect(b.totalCents).toBe(db.dataset.expectedTotals[b.id]);
  });

  it('recusa um tamanho de página acima do limite, em português e com o ID da requisição', async () => {
    const res = await get('/budgets?pageSize=500');
    const body = res.json<ApiError>();

    expect(res.statusCode).toBe(400);
    expect(body.message).toEqual([expect.stringMatching(/^pageSize: .*100/)]);
    expect(body.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('abrir um orçamento', () => {
  const parent = () => {
    const child = db.dataset.budgets.find((b) => b.parentId !== null);
    if (!child?.parentId) throw new Error('o perfil small precisa ter orçamentos vinculados');
    return child.parentId;
  };

  it('traz totais, grupos e filhos, sem nenhum item', async () => {
    const id = parent();
    const seed = db.dataset.budgets.find((b) => b.id === id);
    const body = (await get(`/budgets/${id}`)).json<BudgetDetail>();

    expect(body.totals.total).toBe(db.dataset.expectedTotals[id]);
    expect(body.groups).toHaveLength(seed?.groups.length ?? -1);
    expect(body.groups[0]).not.toHaveProperty('items');
    expect(body.children.length).toBeGreaterThan(0);
    for (const c of body.children) expect(c.totalCents).toBe(db.dataset.expectedTotals[c.id]);
  });

  it('o detalhamento fecha: subtotal + prazo + margem = total', async () => {
    const body = (await get(`/budgets/${parent()}`)).json<BudgetDetail>();
    const t = body.totals;

    expect(t.subtotal).toBe(t.groupsTotal + t.childrenTotal);
    expect(t.subtotal + t.prazoAmount + t.margemAmount).toBe(t.total);
  });

  it('responde 404 para um orçamento que não existe', async () => {
    const res = await get('/budgets/999999');
    const body = res.json<ApiError>();

    expect(res.statusCode).toBe(404);
    expect(body.message).toBe('Orçamento 999999 não existe.');
  });
});

describe('itens de um grupo', () => {
  it('percorre o grupo inteiro por páginas, sem repetir nem pular', async () => {
    const seed = db.dataset.budgets.find((b) => b.groups.some((g) => g.items.length > 20));
    const group = seed?.groups.find((g) => g.items.length > 20);
    if (!seed || !group)
      throw new Error('o perfil small precisa ter um grupo com mais de 20 itens');

    const ids: number[] = [];
    let after: number | null = null;
    let pages = 0;
    do {
      const query: string = after === null ? '' : `&after=${after}`;
      const body = (
        await get(`/budgets/${seed.id}/groups/${group.id}/items?limit=7${query}`)
      ).json<GroupItemsPage>();
      ids.push(...body.items.map((i) => i.id));
      after = body.next;
      pages++;
    } while (after !== null);

    expect(ids).toEqual(group.items.map((i) => i.id));
    expect(pages).toBe(Math.ceil(group.items.length / 7));
  });

  it('não entrega um grupo pelo orçamento errado', async () => {
    const [a, b] = db.dataset.budgets;
    const res = await get(`/budgets/${b?.id}/groups/${a?.groups[0]?.id}/items`);

    expect(res.statusCode).toBe(404);
  });
});

describe('catálogo e operação', () => {
  it('autocomplete de produtos por nome ou SKU', async () => {
    const product = db.dataset.products[0];
    const byName = (await get(`/products?search=${encodeURIComponent(product?.name ?? '')}`)).json<
      Product[]
    >();
    const bySku = (await get(`/products?search=${product?.sku.toLowerCase()}`)).json<Product[]>();

    expect(byName.map((p) => p.id)).toContain(product?.id);
    expect(bySku.map((p) => p.id)).toEqual([product?.id]);
  });

  it('lista os vendedores para o login simulado', async () => {
    const body = (await get('/sellers')).json<Ref[]>();

    expect(body).toHaveLength(db.dataset.sellers.length);
  });

  it('reaproveita o x-request-id de quem chamou, se for seguro', async () => {
    const ok = await get('/health', { 'x-request-id': 'rastreio-123456' });
    const unsafe = await get('/health', { 'x-request-id': 'quebra\nde linha no log' });

    expect(ok.headers['x-request-id']).toBe('rastreio-123456');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
