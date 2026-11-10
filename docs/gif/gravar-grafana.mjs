// Grava o painel do Grafana por SEGUNDOS segundos (enquanto outra coisa gera carga) e, ao fim,
// fotografa os alertas do Prometheus. Uso: node docs/gif/gravar-grafana.mjs 150
import { mkdirSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const playwright = await import(require.resolve('@playwright/test'));
const { chromium } = playwright.default ?? playwright;

const OUT = new URL('./out/', import.meta.url).pathname;
const SECONDS = Number(process.argv[2] ?? 150);
const SIZE = { width: 1600, height: 1160 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:3002/d/orcamentos?orgId=1&from=now-4m&to=now&refresh=5s&kiosk');
await sleep(SECONDS * 1000);

const alerts = await context.newPage();
await alerts.goto('http://127.0.0.1:9090/alerts');
await sleep(2000);
await alerts.screenshot({ path: `${OUT}alertas.png`, fullPage: true });

await context.close();
renameSync(await page.video().path(), `${OUT}grafana.webm`);
await browser.close();
console.log('gravado em', OUT);
