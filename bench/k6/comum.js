// Comum às duas versões: os mesmos orçamentos, os mesmos usuários e as mesmas métricas.
import { Trend } from 'k6/metrics';

/** Os 16 orçamentos de "pior caso real" do gerador: 15 grupos e 1.000 itens cada. */
export const BUDGETS = [
  156, 173, 400, 1165, 1289, 1399, 1619, 1639, 1699, 1792, 1876, 2163, 2218, 2430, 2734, 3018,
];

/** Cada usuário virtual trabalha no seu orçamento, com o seu usuário (o bloqueio é por usuário). */
export const budgetOf = (vu) => BUDGETS[(vu - 1) % BUDGETS.length];
export const userOf = (vu) => ((vu - 1) % 12) + 1;

/** Tempo que o usuário espera em cada ação (do clique até a tela pronta), em ms. */
export const ops = {
  abrir: new Trend('op_abrir', true),
  grupo: new Trend('op_grupo', true),
  editar: new Trend('op_editar', true),
  salvar: new Trend('op_salvar', true),
  margem: new Trend('op_margem', true),
  busca: new Trend('op_busca', true),
  autocomplete: new Trend('op_autocomplete', true),
};
/** Bytes do corpo que o navegador envia e recebe em cada ação. */
export const enviados = {
  salvar: new Trend('bytes_enviados_salvar'),
  margem: new Trend('bytes_enviados_margem'),
};
export const recebidos = {
  salvar: new Trend('bytes_recebidos_salvar'),
  abrir: new Trend('bytes_recebidos_abrir'),
};

/** Modo "usuario": 1 usuário, ações em sequência. Modo "carga": vários usuários ao mesmo tempo. */
export function options() {
  const mode = __ENV.MODE ?? 'usuario';
  const scenario =
    mode === 'carga'
      ? {
          executor: 'constant-vus',
          vus: Number(__ENV.VUS ?? 16),
          duration: __ENV.DURATION ?? '90s',
        }
      : { executor: 'per-vu-iterations', vus: 1, iterations: Number(__ENV.ITERATIONS ?? 10) };
  return {
    scenarios: { [mode]: scenario },
    summaryTrendStats: ['med', 'p(95)', 'max', 'count'],
    thresholds: { checks: ['rate>0.99'] },
  };
}

export function summary(name, data) {
  const out = __ENV.OUT || `/results/${name}-${__ENV.MODE || 'usuario'}.json`; // OUT vazio = padrão
  return { [out]: JSON.stringify(data, null, 2), stdout: `resumo gravado em ${out}\n` };
}
