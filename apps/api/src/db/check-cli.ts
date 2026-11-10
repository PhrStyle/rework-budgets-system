import { createPrisma } from './prisma.js';
import { verifyTotals } from './verify.js';

// Uso: pnpm v2:check
// Conferência de drift: recalcula do zero, a partir dos itens, cada total guardado (item, grupo e
// orçamento) e aponta o que divergir. Os totais guardados são mantidos por delta e regravados a
// cada salvamento; esta é a régua independente. Vira tarefa periódica com a fila (etapa 7).

const prisma = createPrisma();
try {
  const started = performance.now();
  const stored = await prisma.budget.findMany({ select: { id: true, totalCents: true } });
  const expected = Object.fromEntries(stored.map((s) => [s.id, Number(s.totalCents)]));
  const report = await verifyTotals(prisma, expected);
  const ms = Math.round(performance.now() - started);

  if (report.mismatches.length > 0) {
    console.error(`${report.mismatches.length} divergências em ${ms} ms:`);
    for (const line of report.mismatches.slice(0, 50)) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log(
      `sem drift: ${report.budgets} orçamentos e ${report.items} itens recalculados do zero ` +
        `batem com os totais guardados (${ms} ms)`,
    );
  }
} finally {
  await prisma.$disconnect();
}
