import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { generate, PROFILES } from './generate.js';
import type { ProfileName } from './generate.js';
import { manifest, serialize, summarize } from './serialize.js';

/** Semente padrão: trocá-la muda todos os dados (e o hash de referência dos testes). */
export const DEFAULT_SEED = 20_261_110;

const { values } = parseArgs({
  // o pnpm repassa um "--" literal para o script
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    profile: { type: 'string', default: 'full' },
    seed: { type: 'string', default: String(DEFAULT_SEED) },
    out: { type: 'string', default: 'data/seed' },
  },
});

const profile = values.profile as ProfileName;
if (!(profile in PROFILES)) {
  console.error(
    `perfil desconhecido: ${values.profile} (use: ${Object.keys(PROFILES).join(', ')})`,
  );
  process.exit(1);
}
const seed = Number(values.seed);
if (!Number.isSafeInteger(seed)) {
  console.error(`semente inválida: ${values.seed}`);
  process.exit(1);
}

// pnpm --filter roda o script dentro do pacote: a saída padrão é relativa à raiz do repositório.
const outDir = resolve(process.env.INIT_CWD ?? process.cwd(), values.out, profile);
const started = performance.now();
const dataset = generate(profile, seed);
const files = serialize(dataset);

await mkdir(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  await writeFile(join(outDir, name), content, 'utf8');
}
await writeFile(join(outDir, 'manifest.json'), manifest(dataset, files), 'utf8');

console.log(
  `perfil ${profile}, semente ${String(seed)}, em ${String(Math.round(performance.now() - started))} ms`,
);
console.log(summarize(dataset));
console.log(`arquivos em ${outDir}`);
