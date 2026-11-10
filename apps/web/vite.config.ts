import { execSync } from 'node:child_process';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Versão do build: o commit e a hora. Cada deploy tem uma, e a tela compara com a publicada. */
function buildVersion(): string {
  let commit = 'local';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // fora de um repositório git: segue com "local"
  }
  return `${commit}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
}

const version = buildVersion();

/**
 * Problema 9 (front velho em cache depois do deploy):
 * - o Vite já põe o hash do conteúdo no nome de cada arquivo (`index-Bq9eE8pU.js`): versão nova,
 *   nome novo, o navegador é obrigado a baixar;
 * - `version.json` diz qual versão está publicada; a tela consulta e avisa quando mudou;
 * - os cabeçalhos de cache abaixo valem para o `vite preview` (a etapa 9 repete no nginx).
 */
function deployVersion(): Plugin {
  return {
    name: 'deploy-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version }),
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        // Nome com hash nunca muda de conteúdo: pode ficar em cache por um ano, sem revalidar.
        // O resto (index.html, version.json) revalida sempre: é ele que aponta para os nomes novos.
        res.setHeader(
          'Cache-Control',
          req.url?.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), deployVersion()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Endereço fixo em IPv4: "localhost" pode resolver para ::1 (IPv6) em algumas máquinas, como o
  // runner do CI, e aí quem espera em 127.0.0.1 (o Playwright) nunca encontra o servidor.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // A tela e a API na mesma origem: sem CORS, e o navegador fala com uma API só (problema 13).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
