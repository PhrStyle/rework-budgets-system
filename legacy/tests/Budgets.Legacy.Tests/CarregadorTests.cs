using System.Text.Json;
using Budgets.Legacy.Data;
using Budgets.Legacy.Data.Entidades;
using Budgets.Legacy.Seed;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace Budgets.Legacy.Tests;

/// <summary>
/// Teste de integração: sobe um Postgres descartável (Testcontainers), aplica a migration e
/// carrega o perfil "small" gerado pelo packages/seed. Precisa de Docker e de
/// `pnpm seed:generate -- --profile small` antes.
/// </summary>
public class CarregadorTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.6-alpine").Build();
    private static readonly string Pasta = Path.Combine(
        SeedArquivos.RaizDoRepositorio(AppContext.BaseDirectory), "data", "seed", "small");

    public Task InitializeAsync() => _postgres.StartAsync();
    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();

    private OrcamentosContext NovoContexto() =>
        new(new DbContextOptionsBuilder<OrcamentosContext>().UseNpgsql(_postgres.GetConnectionString()).Options);

    [Fact]
    public async Task Carrega_o_perfil_small_e_confere_com_o_manifest_e_com_a_regra_nova()
    {
        Assert.True(File.Exists(Path.Combine(Pasta, "manifest.json")),
            $"Dados não encontrados em {Pasta}. Rode: pnpm seed:generate -- --profile small");
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(Pasta, "manifest.json")));
        var esperado = manifest.RootElement.GetProperty("summary");

        await using var db = NovoContexto();
        var carregador = new Carregador(db);
        var resumo = await carregador.CarregarAsync(Pasta);

        // O que o carregador diz que fez bate com o manifest...
        Assert.Equal(esperado.GetProperty("budgets").GetInt32(), resumo.Orcamentos);
        Assert.Equal(esperado.GetProperty("items").GetInt32(), resumo.Itens);
        Assert.Equal(esperado.GetProperty("containingPreviousVersion").GetInt32(),
            await db.Orcamentos.Where(o => o.OrcamentoPaiId != null).Select(o => o.OrcamentoPaiId).Distinct().CountAsync());

        // ...e o que está no banco também.
        Assert.Equal(resumo.Orcamentos, await db.Orcamentos.CountAsync());
        Assert.Equal(resumo.Itens, await db.Itens.CountAsync());

        // Profundidade 1 e pai sempre mais novo, agora conferidos no banco.
        var filhos = await db.Orcamentos.Where(o => o.OrcamentoPaiId != null)
            .Select(o => new { o.Id, Pai = o.OrcamentoPai! }).ToListAsync();
        Assert.All(filhos, f => Assert.True(f.Pai.Id > f.Id && f.Pai.OrcamentoPaiId == null));

        // O total gravado pela legada nunca fica abaixo do da regra nova.
        var comparacao = Carregador.Comparar(carregador.TotaisLegado, SeedArquivos.TotaisEsperados(Pasta));
        Assert.Equal(0, comparacao.Abaixo);
        Assert.True(comparacao.Acima > 0, "o paliativo deveria cobrar a mais em algum orçamento");
    }

    [Fact]
    public async Task Ajusta_as_sequencias_para_os_proximos_inserts()
    {
        await using var db = NovoContexto();
        await new Carregador(db).CarregarAsync(Pasta);
        var maior = await db.Clientes.MaxAsync(c => c.Id);

        db.Clientes.Add(new Cliente { Nome = "Cliente novo" });
        await db.SaveChangesAsync();

        Assert.True(await db.Clientes.MaxAsync(c => c.Id) > maior);
    }
}
