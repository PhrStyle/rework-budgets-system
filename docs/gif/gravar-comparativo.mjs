// Grava as duas versões lado a lado, fazendo a mesma coisa, no ambiente "VPS" (rede de 150 ms):
// abrir o orçamento de pior caso (1.000 itens), abrir um grupo, mudar uma quantidade, salvar e
// mudar a margem. Cada janela mostra a etapa e quanto cada ação levou (medido aqui).
//
//   docker compose -f compose.yaml -f compose.vps.yaml --profile vps up -d && bash bench/vps/rede.sh
//   node docs/gif/gravar-comparativo.mjs && bash docs/gif/montar.sh
import { mkdirSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

// O Playwright está instalado na tela (apps/web), não aqui.
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const playwright = await import(require.resolve('@playwright/test'));
const { chromium } = playwright.default ?? playwright;

const OUT = new URL('./out/', import.meta.url).pathname;
const BUDGET = 1165; // pior caso real: 15 grupos, 1.000 itens
const PAUSE = 1400; // o "usuário" lendo a tela entre uma ação e outra
const SIZE = { width: 1000, height: 760 };

mkdirSync(OUT, { recursive: true });

// Legenda no canto: sobrevive aos recarregamentos de página da legada (sessionStorage).
const overlay = () => {
  const render = () => {
    let el = document.getElementById('demo-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-overlay';
      Object.assign(el.style, {
        position: 'fixed',
        right: '14px',
        bottom: '14px',
        zIndex: '99999',
        minWidth: '330px',
        background: 'rgba(15,15,22,.94)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '12px',
        font: '500 15px/1.5 system-ui, sans-serif',
        boxShadow: '0 8px 28px rgba(0,0,0,.45)',
      });
      document.documentElement.appendChild(el);
    }
    const s = JSON.parse(sessionStorage.getItem('demo') || '{"passo":"","linhas":[]}');
    el.innerHTML =
      `<div style="color:#a5b4fc;font-weight:600;margin-bottom:4px">${s.passo}</div>` +
      s.linhas
        .map(
          ([a, b]) =>
            `<div style="display:flex;justify-content:space-between;gap:24px"><span>${a}</span><b>${b}</b></div>`,
        )
        .join('');
  };
  window.__demo = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
};

async function show(page, passo, linha) {
  await page.evaluate(
    ([p, l]) => {
      const s = JSON.parse(sessionStorage.getItem('demo') || '{"passo":"","linhas":[]}');
      s.passo = p;
      if (l) s.linhas.push(l);
      sessionStorage.setItem('demo', JSON.stringify(s));
      window.__demo?.();
    },
    [passo, linha ?? null],
  );
}

const ms = (t0) => `${((performance.now() - t0) / 1000).toFixed(2).replace('.', ',')} s`;

async function legada(page) {
  const base = 'http://127.0.0.1:15081';
  let t0 = performance.now();
  await page.goto(`${base}/Orcamento/${BUDGET}`);
  await page.locator('#orcamento').waitFor();
  await show(page, 'Legada: Razor Pages + jQuery', ['Abrir o orçamento', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Abrindo um grupo…');
  t0 = performance.now();
  await page.locator('.grupo-cabecalho').first().click();
  await page.locator('.grupo.open .item').first().waitFor();
  await show(page, 'Grupo aberto', ['Abrir um grupo', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Mudando uma quantidade (só na página)…');
  const qtd = page.locator('.grupo.open .item .qtd').first();
  t0 = performance.now();
  await qtd.fill(String(Number(await qtd.inputValue()) + 1));
  await qtd.press('Tab');
  await show(page, 'Total em prévia (float, no navegador)', ['Editar 1 item', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Salvando o orçamento inteiro e recarregando…');
  t0 = performance.now();
  await Promise.all([page.waitForEvent('load'), page.locator('#salvar').click()]);
  await page.locator('#orcamento').waitFor();
  await show(page, 'Salvo (a página recarregou; o grupo fechou)', ['Salvar', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Mudando a margem: salva tudo e recarrega…');
  t0 = performance.now();
  const margem = page.locator('#margem');
  await margem.fill(String(Number(await margem.inputValue()) + 1));
  await Promise.all([page.waitForEvent('load'), margem.press('Tab')]);
  await page.locator('#orcamento').waitFor();
  await show(page, 'Pronto', ['Mudar a margem', ms(t0)]);
  await sleep(PAUSE * 2);
}

async function nova(page) {
  const base = 'http://127.0.0.1:18080';
  let t0 = performance.now();
  await page.goto(`${base}/orcamentos/${BUDGET}`);
  await page.getByRole('button', { name: 'Editar' }).waitFor();
  await show(page, 'Nova: React + API', ['Abrir o orçamento', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Abrindo um grupo…');
  t0 = performance.now();
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByText('Rascunho aberto, sem alterações').waitFor();
  await page.locator('.g-head').first().click();
  await page
    .getByLabel(/^Quantidade de /)
    .first()
    .waitFor();
  await show(page, 'Grupo aberto, editando em rascunho', ['Editar + abrir um grupo', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Mudando uma quantidade…');
  const qtd = page.getByLabel(/^Quantidade de /).first();
  t0 = performance.now();
  await qtd.fill(String(Number(await qtd.inputValue()) + 1));
  await qtd.press('Enter');
  await page.getByText('1 alteração no rascunho').waitFor();
  await show(page, 'Total calculado pela API', ['Editar 1 item', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Salvando só o que mudou…');
  t0 = performance.now();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByText(/^Somente leitura/).waitFor();
  await show(page, 'Salvo (sem recarregar; o grupo continua aberto)', ['Salvar', ms(t0)]);
  await sleep(PAUSE);

  await show(page, 'Mudando a margem…');
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByText('Rascunho aberto, sem alterações').waitFor();
  const margem = page.getByLabel('Margem');
  t0 = performance.now();
  await margem.fill(String(Number(await margem.inputValue()) + 1));
  await margem.press('Enter');
  await page.getByText('1 alteração no rascunho').waitFor();
  await show(page, 'Pronto', ['Mudar a margem', ms(t0)]);
  await sleep(PAUSE * 2);
  await page.getByRole('button', { name: 'Descartar' }).click(); // deixa o orçamento como estava
}

const browser = await chromium.launch();
async function gravar(nome, base, preparar, roteiro) {
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await context.addInitScript(overlay);
  await preparar(context, base);
  const page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await roteiro(page);
  await context.close();
  renameSync(await page.video().path(), `${OUT}${nome}.webm`);
}

await Promise.all([
  gravar(
    'legada',
    'http://127.0.0.1:15081',
    (ctx, base) =>
      ctx.addCookies([
        { name: 'legado_usuario', value: '1', url: base },
        { name: 'legado_nome', value: 'Marina Costa', url: base },
      ]),
    legada,
  ),
  gravar(
    'nova',
    'http://127.0.0.1:18080',
    (ctx) =>
      ctx.addInitScript(() =>
        localStorage.setItem('budgets.user', JSON.stringify({ id: 1, name: 'Marina Costa' })),
      ),
    nova,
  ),
]);
await browser.close();
console.log('vídeos em', OUT);
