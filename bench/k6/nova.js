// A versão nova como a tela React usa: a API direto (pelo nginx), uma operação por edição, e o
// salvar sem corpo (o changeset já está no rascunho). Entra pelo Toxiproxy, como a legada.
import { check, sleep } from 'k6';
import http from 'k6/http';

import { budgetOf, enviados, ops, options as opts, recebidos, summary, userOf } from './comum.js';

const BASE = __ENV.BASE ?? 'http://toxiproxy:18080';
export const options = opts();

export default function () {
  const id = budgetOf(__VU);
  // Como a tela: o Content-Type só vai quando há corpo (o Fastify recusa JSON vazio).
  const headers = { 'x-user-id': String(userOf(__VU)) };
  const json = { ...headers, 'Content-Type': 'application/json' };
  const get = (path, name) => http.get(`${BASE}/api${path}`, { headers, tags: { name } });
  const post = (path, body, name) =>
    body === undefined
      ? http.post(`${BASE}/api${path}`, null, { headers, tags: { name } })
      : http.post(`${BASE}/api${path}`, JSON.stringify(body), { headers: json, tags: { name } });

  // Abrir o orçamento e clicar em Editar (o detalhe, depois o rascunho).
  const inicio = Date.now();
  const detalhe = get(`/budgets/${id}`, 'detalhe');
  const rascunho = post(`/budgets/${id}/draft`, undefined, 'abrir-rascunho');
  check(rascunho, { 'rascunho aberto': (r) => r.status === 200 });
  ops.abrir.add(Date.now() - inicio);
  recebidos.abrir.add(detalhe.body.length + rascunho.body.length);
  const grupo0 = rascunho.json().groups[0];

  // Abrir o primeiro grupo: as páginas de itens, até o fim do grupo.
  let tempoGrupo = 0;
  let after = null;
  let primeiro = null;
  do {
    const q = after === null ? '' : `&after=${after}`;
    const page = get(`/budgets/${id}/groups/${grupo0.id}/items?limit=100${q}`, 'itens');
    check(page, { 'itens vieram': (r) => r.status === 200 });
    tempoGrupo += page.timings.duration;
    const body = page.json();
    primeiro = primeiro ?? body.items[0];
    after = body.next;
  } while (after !== null);
  ops.grupo.add(tempoGrupo);

  // Editar 1 item: uma operação no rascunho; a tela mostra o total que a API devolveu.
  const ops1 = [
    {
      op: 'updateItem',
      itemId: primeiro.id,
      quantity: primeiro.quantity + (primeiro.unit === 'un' ? 100 : 1),
    },
  ];
  const editar = post(`/budgets/${id}/draft/ops`, { ops: ops1 }, 'editar');
  check(editar, { editou: (r) => r.status === 200 });
  ops.editar.add(editar.timings.duration);

  // Salvar: sem corpo; o servidor grava o que está no rascunho.
  const salvar = post(`/budgets/${id}/draft/save`, undefined, 'salvar');
  check(salvar, { salvou: (r) => r.status === 200 });
  ops.salvar.add(salvar.timings.duration);
  enviados.salvar.add(JSON.stringify({ ops: ops1 }).length); // o que a edição enviou; o salvar não envia nada
  recebidos.salvar.add(salvar.body.length);

  // Mudar a margem (editando de novo): uma operação, sem recarregar nada.
  post(`/budgets/${id}/draft`, undefined, 'abrir-rascunho');
  const margemOps = [{ op: 'header', margemBp: 1000 + (__ITER % 50) * 10 }];
  const margem = post(`/budgets/${id}/draft/ops`, { ops: margemOps }, 'margem');
  check(margem, { margem: (r) => r.status === 200 });
  ops.margem.add(margem.timings.duration);
  enviados.margem.add(JSON.stringify({ ops: margemOps }).length);
  http.del(`${BASE}/api/budgets/${id}/draft`, null, { headers, tags: { name: 'descartar' } });

  // Buscar orçamentos e o autocomplete de produtos (Elasticsearch).
  const busca = get('/budgets?search=hospital', 'busca');
  check(busca, { busca: (r) => r.status === 200 });
  ops.busca.add(busca.timings.duration);
  const auto = get('/products?search=cabo&limit=10', 'autocomplete');
  check(auto, { autocomplete: (r) => r.status === 200 });
  ops.autocomplete.add(auto.timings.duration);

  sleep(Number(__ENV.THINK ?? 0.5));
}

export const handleSummary = (data) => summary('nova', data);
