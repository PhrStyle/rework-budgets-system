using Budgets.Legacy.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Budgets.Legacy.Api.Controllers;

public class CatalogoController(OrcamentosContext db) : LegadoController
{
    /// <summary>Todos os itens de um grupo, de uma vez: sem paginação, como a legada carregava.</summary>
    [HttpGet("api/grupos/{id:int}/itens")]
    public async Task<IReadOnlyList<ItemDto>> ItensDoGrupo(int id, CancellationToken ct) =>
        await db.Itens.AsNoTracking()
            .Where(i => i.GrupoId == id)
            .OrderBy(i => i.Ordem)
            .Select(i => new ItemDto(i.Id, i.ProdutoId, i.Nome, i.Unidade, i.Preco, i.Quantidade, i.Desconto, i.Ordem, i.Total))
            .ToListAsync(ct);

    /// <summary>Busca de produtos por LIKE '%termo%' no nome ou no SKU (problema 3).</summary>
    [HttpGet("api/produtos")]
    public async Task<IReadOnlyList<ProdutoDto>> Produtos(string busca, CancellationToken ct)
    {
        var termo = $"%{busca.Trim()}%";
        return await db.Produtos.AsNoTracking()
            .Where(p => EF.Functions.ILike(p.Nome, termo) || EF.Functions.ILike(p.Sku, termo))
            .OrderBy(p => p.Nome)
            .Take(10)
            .Select(p => new ProdutoDto(p.Id, p.Sku, p.Nome, p.Categoria, p.Unidade, p.Preco))
            .ToListAsync(ct);
    }

    /// <summary>Usuários para o login simulado.</summary>
    [HttpGet("api/usuarios")]
    public async Task<IReadOnlyList<UsuarioDto>> Usuarios(CancellationToken ct) =>
        await db.Usuarios.AsNoTracking().OrderBy(u => u.Nome).Select(u => new UsuarioDto(u.Id, u.Nome)).ToListAsync(ct);
}
