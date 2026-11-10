using System.Diagnostics;
using Budgets.Legacy.Data;
using Budgets.Legacy.Data.Entidades;
using Microsoft.EntityFrameworkCore;

namespace Budgets.Legacy.Seed;

public record Resumo(int Orcamentos, int Grupos, int Itens, int Produtos, int Clientes, int Vinculos, TimeSpan Tempo);

/// <summary>Comparação dos totais da legada (decimal + arredondar para cima) com os da regra nova.</summary>
public record Comparacao(int Iguais, int Acima, int Abaixo, decimal MaiorDiferenca, decimal SomaDiferencas);

/// <summary>Carrega os arquivos do gerador no banco da legada, convertendo para o modelo dela (decimal).</summary>
public sealed class Carregador(OrcamentosContext db)
{
    private const int Lote = 100;

    public Dictionary<int, decimal> TotaisLegado { get; } = [];

    public async Task<Resumo> CarregarAsync(string pasta, CancellationToken ct = default)
    {
        var relogio = Stopwatch.StartNew();
        await db.Database.MigrateAsync(ct);
        await db.Database.ExecuteSqlRawAsync(
            """TRUNCATE "Itens", "Grupos", "Orcamentos", "Produtos", "Clientes", "Usuarios" RESTART IDENTITY CASCADE""", ct);
        db.ChangeTracker.AutoDetectChangesEnabled = false;

        db.Usuarios.AddRange(SeedArquivos.Ler<SeedPessoa>(pasta, "sellers.json").Select(s => new Usuario { Id = s.Id, Nome = s.Name }));
        db.Clientes.AddRange(SeedArquivos.Ler<SeedPessoa>(pasta, "clients.json").Select(c => new Cliente { Id = c.Id, Nome = c.Name }));
        var produtos = SeedArquivos.Ler<SeedProduto>(pasta, "catalog.json");
        db.Produtos.AddRange(produtos.Select(p => new Produto
        {
            Id = p.Id,
            Sku = p.Sku,
            Nome = p.Name,
            Categoria = p.Category,
            Unidade = p.Unit,
            Preco = p.Price / 100m,
        }));
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();

        // Os filhos têm id menor que o pai: percorrendo em ordem, o total de cada filho já existe
        // quando o pai é calculado. O vínculo em si é gravado depois, quando o pai já existe no banco.
        var totaisDosFilhos = new Dictionary<int, List<decimal>>();
        var vinculos = new List<(int Filho, int Pai)>();
        int orcamentos = 0, grupos = 0, itens = 0;

        foreach (var o in SeedArquivos.Orcamentos(pasta))
        {
            var entidade = new Orcamento
            {
                Id = o.Id,
                Descricao = o.Description,
                ClienteId = o.ClientId,
                VendedorId = o.SellerId,
                Status = o.Status,
                AjustePrazo = o.Prazo / 100m,
                Margem = o.Margem / 100m,
                CriadoEm = o.CreatedAt.ToUniversalTime(),
            };
            foreach (var g in o.Groups)
            {
                var grupo = new Grupo { Id = g.Id, Nome = g.Name, Categoria = g.Category, Ordem = g.Position };
                foreach (var i in g.Items)
                {
                    var item = new Item
                    {
                        Id = i.Id,
                        ProdutoId = i.ProductId,
                        Nome = i.Name,
                        Unidade = i.Unit,
                        Preco = i.Price / 100m,
                        Quantidade = i.Quantity / 100m,
                        Desconto = i.Discount / 100m,
                        Ordem = i.Position,
                    };
                    item.Total = CalculoLegado.TotalItem(item.Preco, item.Quantidade, item.Desconto);
                    grupo.Itens.Add(item);
                    itens++;
                }
                grupo.Subtotal = grupo.Itens.Sum(x => x.Total);
                entidade.Grupos.Add(grupo);
                grupos++;
            }
            entidade.Total = CalculoLegado.TotalOrcamento(
                entidade.Grupos.Select(x => x.Subtotal),
                totaisDosFilhos.GetValueOrDefault(o.Id) ?? [],
                entidade.AjustePrazo,
                entidade.Margem);
            TotaisLegado[o.Id] = entidade.Total;
            if (o.ParentId is int pai)
            {
                vinculos.Add((o.Id, pai));
                (totaisDosFilhos.TryGetValue(pai, out var lista) ? lista : totaisDosFilhos[pai] = []).Add(entidade.Total);
            }

            db.Orcamentos.Add(entidade);
            if (++orcamentos % Lote == 0)
            {
                await db.SaveChangesAsync(ct);
                db.ChangeTracker.Clear();
            }
        }
        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();

        // Vínculos em lote, como parâmetros (dois arrays), sem montar SQL com valores.
        var filhos = vinculos.Select(v => v.Filho).ToArray();
        var pais = vinculos.Select(v => v.Pai).ToArray();
        await db.Database.ExecuteSqlAsync(
            $"""UPDATE "Orcamentos" o SET "OrcamentoPaiId" = v.pai FROM unnest({filhos}, {pais}) AS v(filho, pai) WHERE o."Id" = v.filho""", ct);

        // Ids vieram do arquivo: ajusta as sequências para os próximos inserts.
        await db.Database.ExecuteSqlRawAsync(
            """
            SELECT setval(pg_get_serial_sequence('"Usuarios"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Usuarios"), 1));
            SELECT setval(pg_get_serial_sequence('"Clientes"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Clientes"), 1));
            SELECT setval(pg_get_serial_sequence('"Produtos"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Produtos"), 1));
            SELECT setval(pg_get_serial_sequence('"Orcamentos"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Orcamentos"), 1));
            SELECT setval(pg_get_serial_sequence('"Grupos"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Grupos"), 1));
            SELECT setval(pg_get_serial_sequence('"Itens"', 'Id'), COALESCE((SELECT MAX("Id") FROM "Itens"), 1));
            """, ct);

        return new Resumo(orcamentos, grupos, itens, produtos.Count, await db.Clientes.CountAsync(ct), vinculos.Count, relogio.Elapsed);
    }

    /// <summary>Compara os totais gravados pela legada com os esperados pela regra nova (em centavos).</summary>
    public static Comparacao Comparar(IReadOnlyDictionary<int, decimal> legado, IReadOnlyDictionary<int, long> esperadoCentavos)
    {
        int iguais = 0, acima = 0, abaixo = 0;
        decimal maior = 0, soma = 0;
        foreach (var (id, total) in legado)
        {
            var diferenca = total - esperadoCentavos[id] / 100m;
            if (diferenca == 0) iguais++;
            else if (diferenca > 0) acima++;
            else abaixo++;
            maior = Math.Max(maior, Math.Abs(diferenca));
            soma += diferenca;
        }
        return new Comparacao(iguais, acima, abaixo, maior, soma);
    }
}
