using System.Diagnostics;
using Budgets.Legacy.Data;
using Budgets.Legacy.Data.Entidades;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Budgets.Legacy.Api.Controllers;

[Route("api/orcamentos")]
public class OrcamentosController(OrcamentosContext db, IOptions<OpcoesBloqueio> bloqueio) : LegadoController
{
    private DateTime LimiteDoBloqueio => DateTime.UtcNow.AddMinutes(-bloqueio.Value.ExpiraEmMinutos);

    /// <summary>
    /// Listagem com busca por LIKE '%termo%' na descrição e no cliente (problema 3): o curinga no
    /// início impede o uso de índice, então cada busca percorre a tabela inteira.
    /// </summary>
    [HttpGet]
    public async Task<Pagina<OrcamentoResumo>> Listar(
        string? busca, string? status, int? vendedorId, int pagina = 1, int tamanho = 20, CancellationToken ct = default)
    {
        var limite = LimiteDoBloqueio;
        var consulta = db.Orcamentos.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(busca))
        {
            var termo = $"%{busca.Trim()}%";
            var temId = int.TryParse(busca.Trim(), out var id);
            consulta = consulta.Where(o =>
                EF.Functions.ILike(o.Descricao, termo) || EF.Functions.ILike(o.Cliente.Nome, termo) || (temId && o.Id == id));
        }
        if (!string.IsNullOrWhiteSpace(status)) consulta = consulta.Where(o => o.Status == status);
        if (vendedorId is int vendedor) consulta = consulta.Where(o => o.VendedorId == vendedor);

        var total = await consulta.CountAsync(ct);
        var itens = await consulta
            .OrderByDescending(o => o.Id)
            .Skip((Math.Max(pagina, 1) - 1) * tamanho)
            .Take(Math.Clamp(tamanho, 1, 100))
            .Select(o => new OrcamentoResumo(
                o.Id, o.Descricao, o.Cliente.Nome, o.Vendedor.Nome, o.Status, o.Total,
                o.Aberto && o.AbertoEm > limite,
                o.Aberto && o.AbertoEm > limite ? db.Usuarios.Where(u => u.Id == o.AbertoPorId).Select(u => u.Nome).FirstOrDefault() : null))
            .ToListAsync(ct);
        return new Pagina<OrcamentoResumo>(total, itens);
    }

    /// <summary>
    /// Abre o orçamento para edição e marca "aberto" (bloqueio). Devolve o cabeçalho e o resumo dos
    /// grupos, sem os itens: os itens vêm por grupo, quando o usuário abre cada um (lazy loading).
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrcamentoDetalhe>> Abrir(int id, CancellationToken ct)
    {
        if (UsuarioId is not int usuario) return BadRequest("Informe o usuário no cabeçalho X-Usuario-Id.");

        // Um UPDATE condicional só: marca como aberto por mim se estiver livre, se já for meu ou se expirou.
        var agora = DateTime.UtcNow;
        var limite = LimiteDoBloqueio;
        var conseguiu = await db.Orcamentos
            .Where(o => o.Id == id && (!o.Aberto || o.AbertoPorId == usuario || o.AbertoEm < limite))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Aberto, true)
                .SetProperty(o => o.AbertoPorId, usuario)
                .SetProperty(o => o.AbertoEm, agora), ct);
        if (conseguiu == 0) return await RespostaDeBloqueio(id, ct);

        var detalhe = await db.Orcamentos.AsNoTracking()
            .Where(o => o.Id == id)
            .Select(o => new OrcamentoDetalhe(
                o.Id, o.Descricao, o.ClienteId, o.Cliente.Nome, o.VendedorId, o.Vendedor.Nome, o.Status,
                o.AjustePrazo, o.Margem, o.Total, o.OrcamentoPaiId,
                o.Grupos.OrderBy(g => g.Ordem)
                    .Select(g => new GrupoResumo(g.Id, g.Nome, g.Categoria, g.Ordem, g.Subtotal, g.Itens.Count)).ToList(),
                o.Filhos.OrderBy(f => f.Id).Select(f => new FilhoResumo(f.Id, f.Descricao, f.Total)).ToList(),
                o.AbertoEm))
            .FirstAsync(ct);
        return detalhe;
    }

    /// <summary>
    /// Libera o bloqueio (o front chama ao sair da tela). Com <paramref name="abertoEm"/>, só libera se o
    /// bloqueio ainda for o daquela abertura: um "liberar" atrasado da página anterior (F5, outra aba)
    /// não pode soltar o bloqueio que a página nova acabou de pegar.
    /// </summary>
    [HttpPost("{id:int}/liberar")]
    public async Task<IActionResult> Liberar(int id, DateTime? abertoEm, CancellationToken ct)
    {
        if (UsuarioId is not int usuario) return BadRequest("Informe o usuário no cabeçalho X-Usuario-Id.");
        await db.Orcamentos
            .Where(o => o.Id == id && o.AbertoPorId == usuario && (abertoEm == null || o.AbertoEm == abertoEm))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Aberto, false)
                .SetProperty(o => o.AbertoPorId, (int?)null)
                .SetProperty(o => o.AbertoEm, (DateTime?)null), ct);
        return NoContent();
    }

    /// <summary>
    /// Salva o orçamento INTEIRO (problema 11): apaga todos os grupos e itens e grava de novo, numa
    /// transação, recalculando tudo em decimal com o arredondamento para cima (CalculoLegado). É também
    /// o "recálculo no back" que a tela usava ao mudar margem ou ajuste de prazo (problema 14).
    /// </summary>
    [HttpPost("{id:int}/salvar")]
    public async Task<ActionResult<ResultadoSalvar>> Salvar(int id, SalvarOrcamento dados, CancellationToken ct)
    {
        if (UsuarioId is not int usuario) return BadRequest("Informe o usuário no cabeçalho X-Usuario-Id.");
        var relogio = Stopwatch.StartNew();

        var limite = LimiteDoBloqueio;
        var orcamento = await db.Orcamentos.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orcamento is null) return NotFound();
        if (!orcamento.Aberto || orcamento.AbertoPorId != usuario || orcamento.AbertoEm < limite)
            return StatusCode(StatusCodes.Status423Locked,
                new Bloqueado("O orçamento não está aberto por você (o bloqueio expirou ou é de outro usuário).", null, orcamento.AbertoEm));

        // Como o salvar apaga e regrava tudo, um grupo que faltasse no envio seria apagado.
        var existentes = await db.Grupos.Where(g => g.OrcamentoId == id).Select(g => g.Id).ToListAsync(ct);
        var enviados = dados.Grupos.Where(g => g.Id is not null).Select(g => g.Id!.Value).ToHashSet();
        var faltando = existentes.Where(g => !enviados.Contains(g)).ToList();
        if (faltando.Count > 0)
            return BadRequest($"O orçamento precisa ser enviado inteiro; faltam os grupos {string.Join(", ", faltando)}.");

        await using var transacao = await db.Database.BeginTransactionAsync(ct);
        await db.Itens.Where(i => i.Grupo.OrcamentoId == id).ExecuteDeleteAsync(ct);
        await db.Grupos.Where(g => g.OrcamentoId == id).ExecuteDeleteAsync(ct);

        var grupos = dados.Grupos.Select(g =>
        {
            var grupo = new Grupo { OrcamentoId = id, Nome = g.Nome, Categoria = g.Categoria, Ordem = g.Ordem };
            grupo.Itens = g.Itens.Select(i => new Item
            {
                ProdutoId = i.ProdutoId,
                Nome = i.Nome,
                Unidade = i.Unidade,
                Preco = i.Preco,
                Quantidade = i.Quantidade,
                Desconto = i.Desconto,
                Ordem = i.Ordem,
                Total = CalculoLegado.TotalItem(i.Preco, i.Quantidade, i.Desconto),
            }).ToList();
            grupo.Subtotal = grupo.Itens.Sum(x => x.Total);
            return grupo;
        }).ToList();
        db.Grupos.AddRange(grupos);

        var totaisDosFilhos = await db.Orcamentos.Where(f => f.OrcamentoPaiId == id).Select(f => f.Total).ToListAsync(ct);
        orcamento.Descricao = dados.Descricao;
        orcamento.Status = dados.Status;
        orcamento.AjustePrazo = dados.AjustePrazo;
        orcamento.Margem = dados.Margem;
        orcamento.Total = CalculoLegado.TotalOrcamento(grupos.Select(g => g.Subtotal), totaisDosFilhos, dados.AjustePrazo, dados.Margem);
        orcamento.AbertoEm = DateTime.UtcNow; // salvar renova o bloqueio

        await db.SaveChangesAsync(ct);
        await transacao.CommitAsync(ct);
        return new ResultadoSalvar(orcamento.Total, grupos.Count, grupos.Sum(g => g.Itens.Count), relogio.ElapsedMilliseconds);
    }

    private async Task<ActionResult> RespostaDeBloqueio(int id, CancellationToken ct)
    {
        var atual = await db.Orcamentos.AsNoTracking()
            .Where(o => o.Id == id)
            .Select(o => new { o.AbertoEm, Nome = db.Usuarios.Where(u => u.Id == o.AbertoPorId).Select(u => u.Nome).FirstOrDefault() })
            .FirstOrDefaultAsync(ct);
        if (atual is null) return NotFound();
        return StatusCode(StatusCodes.Status423Locked,
            new Bloqueado($"Orçamento aberto por {atual.Nome}.", atual.Nome, atual.AbertoEm));
    }
}
