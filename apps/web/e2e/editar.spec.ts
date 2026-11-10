import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Entra com o primeiro usuário da lista e abre o primeiro orçamento sem rascunho de ninguém. */
async function openBudget(page: Page): Promise<number> {
  await page.goto('/');
  await page.getByRole('button').first().click(); // tela de login: o primeiro usuário
  await expect(page.getByRole('heading', { name: 'Orçamentos' })).toBeVisible();

  const links = page.locator('tbody a');
  await expect(links.first()).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await links.nth(i).click();
    // Espera o orçamento abrir; só então vê se está livre (isVisible não espera nada).
    await expect(page.getByRole('heading', { name: /^Orçamento #/ })).toBeVisible();
    await expect(page.locator('.barra, .aviso').first()).toBeVisible();
    if ((await page.getByRole('button', { name: 'Editar' }).count()) > 0) {
      return Number(page.url().split('/').pop());
    }
    await page.goBack();
  }
  throw new Error('nenhum orçamento livre para editar');
}

const total = (page: Page) => page.locator('.tot b').innerText();

test('editar, salvar e recarregar: o total da tela é o total salvo', async ({ page }) => {
  await openBudget(page);
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByText('Rascunho aberto, sem alterações')).toBeVisible();

  await page.locator('.g-head').first().click();
  const quantity = page.getByLabel(/^Quantidade de /).first();
  const current = await quantity.inputValue();
  const next = current === '7' ? '8' : '7';
  const before = await total(page);

  await quantity.fill(next);
  await quantity.press('Enter');
  await expect(page.getByText('1 alteração no rascunho')).toBeVisible();
  await expect.poll(() => total(page)).not.toBe(before);
  const shown = await total(page);

  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText(/^Somente leitura/)).toBeVisible();
  expect(await total(page)).toBe(shown);

  await page.reload();
  await expect(page.locator('.tot b')).toHaveText(shown);
  await page.locator('.g-head').first().click();
  await expect(
    page.locator('.group.open .it:not(.h)').first().locator('span.num').first(),
  ).toHaveText(new RegExp(`^${next} `));
});

test('descartar volta tudo como estava salvo', async ({ page }) => {
  await openBudget(page);
  const saved = await total(page);
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Margem').fill('42');
  await page.getByLabel('Margem').press('Enter');
  await expect(page.getByText('1 alteração no rascunho')).toBeVisible();
  await expect.poll(() => total(page)).not.toBe(saved);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Descartar' }).click();

  await expect(page.getByText(/^Somente leitura/)).toBeVisible();
  await expect(page.locator('.tot b')).toHaveText(saved);
});

test('cache depois do deploy: arquivos com hash ficam em cache, o index.html sempre revalida', async ({
  page,
  request,
}) => {
  const scripts: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/assets/') && res.url().endsWith('.js')) scripts.push(res.url());
  });
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  const index = await request.get('/');
  const version = await request.get('/version.json');
  const script = await request.get(scripts[0] ?? '');

  expect(scripts[0]).toMatch(/\/assets\/index-[\w-]+\.js$/); // hash do conteúdo no nome
  expect(script.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(index.headers()['cache-control']).toBe('no-cache');
  expect(version.headers()['cache-control']).toBe('no-cache');
  expect(await version.json()).toEqual({ version: expect.stringMatching(/^\w+-\d{8}T\d{6}$/) });
});
