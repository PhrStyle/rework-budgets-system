// Tela de edição da VERSÃO LEGADA, em jQuery.
//
// Reproduz de propósito como o sistema antigo funcionava. Não é descuido: cada trecho marca
// o problema do README que ele reproduz.
//  - Cálculo no navegador, em float, com o paliativo de arredondar sempre para cima (problemas 1 e 4).
//    É só uma prévia: o total definitivo é recalculado pelo servidor, em decimal, ao salvar.
//  - Itens carregados por grupo e guardados no localStorage, sem validação (problema 2).
//  - Edições só na página até salvar; salvamento automático a cada 5 minutos (problema 12).
//  - Salvar envia o orçamento INTEIRO, carregando antes os grupos fechados (problema 11).
//  - Mudar margem ou ajuste de prazo salva e recarrega a página para o servidor recalcular (problema 14).
//  - Toda chamada vai ao front (/front/...), que repassa à API (problema 13).
$(function () {
  var $tela = $('#orcamento');
  if (!$tela.length) return;

  var orcamentoId = $tela.data('id');
  var abertoEm = $tela.attr('data-aberto-em'); // identifica esta abertura do orçamento
  var AUTOSAVE_MS = 5 * 60 * 1000;
  var proximoAutosave = Date.now() + AUTOSAVE_MS;
  var pendentes = 0;
  var salvando = false;
  var recarregando = false;

  // Paliativo da época: arredondar SEMPRE para cima, no centavo. Em float, até isso falha:
  // 1.1 * 100 = 110.00000000000001 → 111 centavos (problema 4).
  function teto(valor) { return Math.ceil(valor * 100) / 100; }
  function moeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  // Lê de volta o texto "R$ 1.234,56" da tela: o DOM é a fonte do estado (problema 1).
  function lerMoeda(texto) { return parseFloat(String(texto).replace(/[^\d,]/g, '').replace(',', '.')) || 0; }
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- carregar um grupo: lazy loading com cache no localStorage (problema 2) ----------
  function chave(grupoId) { return 'legacy:grupo:' + grupoId; }

  function carregarItens(grupoId) {
    var cache = null;
    try { cache = JSON.parse(localStorage.getItem(chave(grupoId))); } catch (e) { /* cota ou bloqueado */ }
    if (cache) return $.Deferred().resolve(cache, true).promise(); // sem validar se ainda é atual
    return $.getJSON('/front/grupos/' + grupoId + '/itens').then(function (itens) {
      try { localStorage.setItem(chave(grupoId), JSON.stringify(itens)); } catch (e) { /* cota estourada */ }
      return itens;
    });
  }

  function linha(item) {
    var $l = $('<tr class="item" draggable="true">')
      .attr('data-produto', item.produtoId)
      .attr('data-unidade', item.unidade)
      .attr('data-nome', item.nome);
    $l.append('<td class="arrastar" title="Arrastar para reordenar">⠿</td>');
    $l.append($('<td class="nome">').text(item.nome).append(
      '<button type="button" class="inserir acima" title="Inserir produto acima">+</button>' +
      '<button type="button" class="inserir abaixo" title="Inserir produto abaixo">+</button>'));
    $l.append($('<td>').append($('<input type="number" step="0.01" min="0.01" class="form-control form-control-sm qtd">').val(item.quantidade)));
    $l.append($('<td>').append($('<input type="number" step="0.5" min="0" max="100" class="form-control form-control-sm desconto">').val(item.desconto)));
    $l.append($('<td class="text-end unitario">').text(moeda(item.preco)));
    $l.append('<td class="text-end total"></td>');
    $l.append('<td><button type="button" class="btn btn-sm btn-link text-danger remover" title="Remover">✕</button></td>');
    return $l;
  }

  function buscaProduto() {
    return $('<div class="busca-produto position-relative">' +
      '<input class="form-control form-control-sm" placeholder="Buscar produto pelo nome ou SKU…">' +
      '<ul class="sugestoes list-group"></ul></div>');
  }

  $tela.on('click', '.grupo-cabecalho', function () {
    var $g = $(this).closest('.grupo');
    var $corpo = $g.find('.grupo-corpo');
    if ($g.data('carregado')) { $corpo.toggle(); return; }

    $corpo.show().html('<p class="text-muted small p-3 mb-0">Carregando todos os itens do grupo…</p>');
    var inicio = performance.now();
    carregarItens($g.data('id')).then(function (itens, doCache) {
      var $tbody = $('<tbody>');
      $.each(itens, function (_, item) { $tbody.append(linha(item)); });
      $corpo.html('<table class="table table-sm align-middle mb-0"><thead><tr>' +
        '<th></th><th>Produto</th><th style="width:110px">Qtd</th><th style="width:100px">Desc. %</th>' +
        '<th class="text-end">Unitário</th><th class="text-end">Total</th><th></th></tr></thead></table>');
      $corpo.find('table').append($tbody);
      $corpo.append($('<div class="p-2">').append(buscaProduto()));
      $g.data('carregado', true);
      recalcular();
      $g.find('.grupo-info').text(itens.length + ' itens · ' +
        (doCache === true ? 'do localStorage, sem validar' : 'do servidor') + ' · ' +
        Math.round(performance.now() - inicio) + ' ms');
    }, function () {
      $corpo.html('<p class="text-danger small p-3 mb-0">Não foi possível carregar o grupo.</p>');
    });
  });

  // ---------- recalcular TUDO a cada alteração, lendo o DOM (problema 1) ----------
  function recalcular() {
    var inicio = performance.now();
    var linhas = 0;
    var subtotal = 0;
    $tela.find('.grupo').each(function () {
      var $g = $(this);
      if (!$g.data('carregado')) { subtotal += parseFloat($g.data('subtotal')); return; } // fechado: vale o do servidor
      var soma = 0;
      $g.find('tr.item').each(function () {
        var $l = $(this);
        var qtd = parseFloat($l.find('.qtd').val()) || 0;
        var desconto = parseFloat($l.find('.desconto').val()) || 0;
        var unitario = lerMoeda($l.find('.unitario').text());
        var total = teto(unitario * qtd * (1 - desconto / 100));
        $l.find('.total').text(moeda(total));
        soma += total;
        linhas++;
      });
      $g.find('.grupo-subtotal').text(moeda(soma));
      subtotal += soma;
    });
    $('.filho').each(function () { subtotal += parseFloat($(this).data('total')); });

    var prazo = parseFloat($('#prazo').val()) || 0;
    var margem = parseFloat($('#margem').val()) || 0;
    var comPrazo = teto(subtotal * (1 + prazo / 100));
    var total = teto(comPrazo * (1 + margem / 100));
    $('#subtotal-previa').text(moeda(subtotal));
    $('#total-previa').text(moeda(total));
    $('#diagnostico').text('· ' + linhas + ' linhas recalculadas no navegador em ' + (performance.now() - inicio).toFixed(1) + ' ms');
  }

  function marcarAlterado() {
    pendentes++;
    $('#pendentes').text(pendentes + (pendentes === 1 ? ' alteração' : ' alterações') + ' só nesta página (navegador)');
  }

  $tela.on('change', '.qtd, .desconto', function () { recalcular(); marcarAlterado(); });

  $tela.on('click', '.remover', function () {
    $(this).closest('tr').remove();
    recalcular();
    marcarAlterado();
  });

  // ---------- inserir produto acima ou abaixo de uma linha ----------
  $tela.on('click', '.inserir', function () {
    $tela.find('tr.linha-busca').remove();
    var $alvo = $(this).closest('tr');
    var $linhaBusca = $('<tr class="linha-busca"><td colspan="7"></td></tr>');
    $linhaBusca.find('td').append(buscaProduto());
    if ($(this).hasClass('acima')) $alvo.before($linhaBusca); else $alvo.after($linhaBusca);
    $linhaBusca.find('input').trigger('focus');
  });

  // ---------- busca de produtos: front → API → LIKE no banco (problemas 3 e 13) ----------
  var esperaBusca = null;
  $tela.on('keyup', '.busca-produto input', function (e) {
    var $busca = $(this).closest('.busca-produto');
    if (e.key === 'Escape') { $busca.closest('tr.linha-busca').remove(); return; }
    var termo = $(this).val().trim();
    clearTimeout(esperaBusca);
    if (termo.length < 2) { $busca.find('.sugestoes').empty(); return; }
    esperaBusca = setTimeout(function () {
      $.getJSON('/front/produtos', { busca: termo }).then(function (produtos) {
        var $lista = $busca.find('.sugestoes').empty();
        $.each(produtos, function (_, p) {
          $('<li class="list-group-item list-group-item-action small">')
            .text(p.nome + ' · ' + p.sku + ' · ' + moeda(p.preco) + '/' + p.unidade)
            .data('produto', p)
            .appendTo($lista);
        });
      });
    }, 250);
  });

  $tela.on('click', '.sugestoes li', function () {
    var p = $(this).data('produto');
    var $nova = linha({ produtoId: p.id, nome: p.nome, unidade: p.unidade, preco: p.preco, quantidade: 1, desconto: 0 });
    var $linhaBusca = $(this).closest('tr.linha-busca');
    if ($linhaBusca.length) {
      $linhaBusca.replaceWith($nova);
    } else {
      $(this).closest('.grupo-corpo').find('tbody').append($nova);
      $(this).closest('.busca-produto').find('input').val('');
      $(this).closest('.sugestoes').empty();
    }
    recalcular();
    marcarAlterado();
  });

  // ---------- reordenar arrastando (HTML5) ----------
  var $arrastando = null;
  $tela.on('dragstart', 'tr.item', function () { $arrastando = $(this).addClass('arrastando'); });
  $tela.on('dragend', 'tr.item', function () { $(this).removeClass('arrastando'); $tela.find('.sobre').removeClass('sobre'); });
  $tela.on('dragover', 'tr.item', function (e) { e.preventDefault(); $(this).addClass('sobre'); });
  $tela.on('dragleave', 'tr.item', function () { $(this).removeClass('sobre'); });
  $tela.on('drop', 'tr.item', function (e) {
    e.preventDefault();
    if ($arrastando && $arrastando[0] !== this && $(this).parent()[0] === $arrastando.parent()[0]) {
      $(this).before($arrastando);
      recalcular();
      marcarAlterado();
    }
  });

  // ---------- salvar: o orçamento INTEIRO, e depois recarregar a página ----------
  function itensDaTela($g) {
    return $g.find('tr.item').map(function (j) {
      var $l = $(this);
      return {
        id: null, produtoId: +$l.attr('data-produto'), nome: $l.attr('data-nome'), unidade: $l.attr('data-unidade'),
        preco: lerMoeda($l.find('.unitario').text()),
        quantidade: parseFloat($l.find('.qtd').val()) || 0,
        desconto: parseFloat($l.find('.desconto').val()) || 0,
        ordem: (j + 1) * 1024, total: 0
      };
    }).get();
  }

  function salvar(motivo) {
    if (salvando) return;
    salvando = true;
    $('#salvar').prop('disabled', true).text('Salvando…');
    var inicio = performance.now();
    var $grupos = $tela.find('.grupo');

    // Para enviar o orçamento inteiro, os grupos que o usuário nem abriu são carregados agora.
    var fechados = $grupos.map(function () {
      var $g = $(this);
      if ($g.data('carregado')) return null;
      return carregarItens($g.data('id')).then(function (itens) { $g.data('itensFechados', itens); });
    }).get();

    $.when.apply($, fechados).then(function () {
      var grupos = $grupos.map(function (i) {
        var $g = $(this);
        return {
          id: +$g.attr('data-id'), nome: $g.attr('data-nome'), categoria: $g.attr('data-categoria'), ordem: (i + 1) * 1024,
          itens: $g.data('carregado') ? itensDaTela($g) : $g.data('itensFechados')
        };
      }).get();
      var corpo = JSON.stringify({
        descricao: $('#descricao').val(), status: $('#status').val(),
        ajustePrazo: parseFloat($('#prazo').val()) || 0, margem: parseFloat($('#margem').val()) || 0,
        grupos: grupos
      });
      return $.ajax({ url: '/front/orcamentos/' + orcamentoId + '/salvar', method: 'POST', contentType: 'application/json', data: corpo })
        .then(function (r) {
          sessionStorage.setItem('legado:ultimoSalvar', JSON.stringify({
            motivo: motivo, kb: Math.round(corpo.length / 1024), ms: Math.round(performance.now() - inicio),
            servidor: r.milissegundos, itens: r.itens, total: r.total
          }));
          recarregando = true;
          location.reload(); // o servidor é a fonte da verdade: a página recarrega com os valores dele
        });
    }).fail(function (x) {
      salvando = false;
      $('#salvar').prop('disabled', false).text('Salvar');
      alert('Não foi possível salvar: ' + (x && x.responseText ? x.responseText : 'erro de rede'));
    });
  }

  $('#salvar').on('click', function () { salvar('botão Salvar'); });

  // Mudança global: o front não tem os grupos fechados, então salva e recarrega (problema 14).
  $('#prazo, #margem').on('change', function () {
    recalcular();
    marcarAlterado();
    $('#pendentes').text('Mudança global: salvando o orçamento inteiro para o servidor recalcular…');
    salvar(this.id === 'prazo' ? 'mudança no ajuste de prazo' : 'mudança na margem');
  });

  // Salvamento automático a cada 5 minutos, com o que estiver na página, simulação ou não (problema 12).
  setInterval(function () {
    var resta = proximoAutosave - Date.now();
    if (resta <= 0) {
      if (pendentes > 0) salvar('salvamento automático (5 min)');
      proximoAutosave = Date.now() + AUTOSAVE_MS;
    }
    $('#autosave').text(mmss(proximoAutosave - Date.now()));
  }, 1000);
  $('#avancar').on('click', function () { proximoAutosave = Date.now(); });

  // Sair da tela libera o bloqueio "aberto". Se o navegador fechar de repente, ele só expira.
  $(window).on('beforeunload', function () {
    // Manda junto o instante desta abertura: um "liberar" atrasado não solta o bloqueio da página seguinte.
    if (!recarregando) navigator.sendBeacon('/front/orcamentos/' + orcamentoId + '/liberar?abertoEm=' + encodeURIComponent(abertoEm));
  });

  // Mostra o que o último salvamento custou (o salvar recarrega a página).
  var ultimo = sessionStorage.getItem('legado:ultimoSalvar');
  if (ultimo) {
    sessionStorage.removeItem('legado:ultimoSalvar');
    var u = JSON.parse(ultimo);
    $('#ultimo-salvar').removeClass('d-none').text(
      'Último salvamento (' + u.motivo + '): enviou o orçamento inteiro, ' + u.itens + ' itens e ' + u.kb +
      ' KB, em ' + u.ms + ' ms (' + u.servidor + ' ms no servidor regravando tudo). A página recarregou com o total do servidor.');
  }

  recalcular();
});
