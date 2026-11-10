// A versão legada como o navegador dela usa: páginas Razor e o jQuery chamando o front (/front/...),
// que repassa à API. Entra pelo Toxiproxy (rede Brasil ↔ US Central emulada).
import { check, sleep } from 'k6';
import http from 'k6/http';
import { parseHTML } from 'k6/html';

import { budgetOf, enviados, ops, options as opts, recebidos, summary, userOf } from './comum.js';

const BASE = __ENV.BASE ?? 'http://toxiproxy:15081';
export const options = opts();

function login() {
  const jar = http.cookieJar();
  jar.set(BASE, 'legado_usuario', String(userOf(__VU)));
  jar.set(BASE, 'legado_nome', `Usuario ${userOf(__VU)}`);
}

/** Abre a página do orçamento (marca como aberto) e lê o que o jQuery leria dela. */
function abrirPagina(id) {
  const res = http.get(`${BASE}/Orcamento/${id}`, { tags: { name: 'pagina' } });
  check(res, { 'página abriu': (r) => r.status === 200 && r.body.includes('id="orcamento"') });
  const doc = parseHTML(res.body);
  const grupos = doc
    .find('.grupo')
    .toArray()
    .map((g) => ({
      id: Number(g.attr('data-id')),
      nome: g.attr('data-nome'),
      categoria: g.attr('data-categoria'),
    }));
  return {
    res,
    grupos,
    abertoEm: doc.find('#orcamento').attr('data-aberto-em'),
    descricao: doc.find('#descricao').val(),
    status: doc.find('#status option[selected]').val() ?? 'Rascunho',
    prazo: parseFloat(doc.find('#prazo').val() || '0'),
    margem: parseFloat(doc.find('#margem').val() || '0'),
  };
}

/** O "Salvar" da legada: carrega os grupos fechados, envia o orçamento inteiro e recarrega a página. */
function salvarTudo(id, pagina, ajuste) {
  const inicio = Date.now();
  // Os grupos que o usuário não abriu vêm agora (o navegador faz até 6 em paralelo por servidor).
  const respostas = http.batch(
    pagina.grupos.map((g) => [
      'GET',
      `${BASE}/front/grupos/${g.id}/itens`,
      null,
      { tags: { name: 'grupo' } },
    ]),
  );
  const grupos = pagina.grupos.map((g, i) => ({
    id: g.id,
    nome: g.nome,
    categoria: g.categoria,
    ordem: (i + 1) * 1024,
    itens: respostas[i].json(),
  }));
  ajuste(grupos);
  const corpo = JSON.stringify({
    descricao: pagina.descricao,
    status: pagina.status,
    ajustePrazo: pagina.prazo,
    margem: pagina.margem,
    grupos,
  });
  const res = http.post(`${BASE}/front/orcamentos/${id}/salvar`, corpo, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'salvar' },
  });
  check(res, { salvou: (r) => r.status === 200 });
  const recarregada = abrirPagina(id); // location.reload(): o servidor é a fonte da verdade
  return {
    ms: Date.now() - inicio,
    corpo,
    recebido:
      respostas.reduce((s, r) => s + r.body.length, 0) +
      res.body.length +
      recarregada.res.body.length,
    pagina: recarregada,
  };
}

export default function () {
  const id = budgetOf(__VU);
  login();

  // Abrir o orçamento: a página Razor (o front pede o detalhe à API e marca como aberto).
  let pagina = abrirPagina(id);
  ops.abrir.add(pagina.res.timings.duration);
  recebidos.abrir.add(pagina.res.body.length);

  // Abrir o primeiro grupo: todos os itens de uma vez, pelo front.
  const grupo = http.get(`${BASE}/front/grupos/${pagina.grupos[0].id}/itens`, {
    tags: { name: 'grupo' },
  });
  check(grupo, { 'grupo veio': (r) => r.status === 200 });
  ops.grupo.add(grupo.timings.duration);

  // Editar 1 item: só na página (nada vai ao servidor), com o total em prévia, em float.
  ops.editar.add(0);

  // Salvar: o orçamento inteiro.
  const salvo = salvarTudo(id, pagina, (grupos) => {
    grupos[0].itens[0].quantidade += 1;
  });
  ops.salvar.add(salvo.ms);
  enviados.salvar.add(salvo.corpo.length);
  recebidos.salvar.add(salvo.recebido);
  pagina = salvo.pagina;

  // Mudar a margem: na legada, também salva tudo e recarrega a página para o servidor recalcular.
  const margem = salvarTudo(id, pagina, () => undefined);
  ops.margem.add(margem.ms);
  enviados.margem.add(margem.corpo.length);

  // Buscar orçamentos (a página de listagem) e o autocomplete de produtos.
  const busca = http.get(`${BASE}/?busca=hospital`, { tags: { name: 'busca' } });
  check(busca, { busca: (r) => r.status === 200 });
  ops.busca.add(busca.timings.duration);
  const auto = http.get(`${BASE}/front/produtos?busca=cabo`, { tags: { name: 'autocomplete' } });
  check(auto, { autocomplete: (r) => r.status === 200 });
  ops.autocomplete.add(auto.timings.duration);

  // Sair da página: o navegador libera o bloqueio (sendBeacon).
  http.post(
    `${BASE}/front/orcamentos/${id}/liberar?abertoEm=${encodeURIComponent(salvo.pagina.abertoEm ?? '')}`,
    null,
    { tags: { name: 'liberar' } },
  );
  sleep(Number(__ENV.THINK ?? 0.5));
}

export const handleSummary = (data) => summary('legada', data);
