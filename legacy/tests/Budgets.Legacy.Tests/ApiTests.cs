using System.Net;
using System.Net.Http.Json;
using Budgets.Legacy.Api;
using Budgets.Legacy.Data;
using Budgets.Legacy.Seed;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace Budgets.Legacy.Tests;

/// <summary>Sobe a API de verdade contra um Postgres descartável com o perfil "small" carregado.</summary>
public sealed class LegadoApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.6-alpine").Build();
    public WebApplicationFactory<Program> Fabrica { get; private set; } = null!;

    public OrcamentosContext NovoContexto() =>
        new(new DbContextOptionsBuilder<OrcamentosContext>().UseNpgsql(_postgres.GetConnectionString()).Options);

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        var pasta = Path.Combine(SeedArquivos.RaizDoRepositorio(AppContext.BaseDirectory), "data", "seed", "small");
        await using (var db = NovoContexto()) await new Carregador(db).CarregarAsync(pasta);

        // A API lê a connection string de LEGACY_DB (ver Conexao.DoAmbiente).
        Environment.SetEnvironmentVariable("LEGACY_DB", _postgres.GetConnectionString());
        Fabrica = new WebApplicationFactory<Program>();
    }

    public async Task DisposeAsync()
    {
        await Fabrica.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

public class ApiTests(LegadoApiFixture api) : IClassFixture<LegadoApiFixture>
{
    private HttpClient Cliente(int usuario)
    {
        var cliente = api.Fabrica.CreateClient();
        cliente.DefaultRequestHeaders.Add("X-Usuario-Id", usuario.ToString());
        return cliente;
    }

    private async Task<int> OrcamentoLivre()
    {
        await using var db = api.NovoContexto();
        // Cada teste deixa o seu orçamento aberto: o próximo pega outro ainda livre,
        // e os testes não dividem bloqueios.
        return await db.Orcamentos.Where(o => !o.Aberto && o.Grupos.Count >= 2).OrderBy(o => o.Id).Select(o => o.Id).FirstAsync();
    }

    [Fact]
    public async Task Busca_por_LIKE_na_descricao_no_cliente_e_pelo_id()
    {
        var todos = await Cliente(1).GetFromJsonAsync<Pagina<OrcamentoResumo>>("/api/orcamentos?tamanho=100");
        var alvo = todos!.Itens[0];
        var palavra = alvo.Cliente.Split(' ')[1].ToUpperInvariant(); // ILIKE: ignora maiúsculas

        var porCliente = await Cliente(1).GetFromJsonAsync<Pagina<OrcamentoResumo>>($"/api/orcamentos?busca={palavra}");
        var porId = await Cliente(1).GetFromJsonAsync<Pagina<OrcamentoResumo>>($"/api/orcamentos?busca={alvo.Id}");

        Assert.Contains(porCliente!.Itens, o => o.Id == alvo.Id);
        Assert.Contains(porId!.Itens, o => o.Id == alvo.Id);
        Assert.Equal(60, todos.Total);
    }

    [Fact]
    public async Task Abrir_bloqueia_para_outros_usuarios_ate_liberar()
    {
        var id = await OrcamentoLivre();

        var aberto = await Cliente(1).GetAsync($"/api/orcamentos/{id}");
        var outro = await Cliente(2).GetAsync($"/api/orcamentos/{id}");
        var mesmoUsuario = await Cliente(1).GetAsync($"/api/orcamentos/{id}"); // outra aba do mesmo usuário passa
        await Cliente(1).PostAsync($"/api/orcamentos/{id}/liberar", null);
        var depois = await Cliente(2).GetAsync($"/api/orcamentos/{id}");

        Assert.Equal(HttpStatusCode.OK, aberto.StatusCode);
        Assert.Equal(HttpStatusCode.Locked, outro.StatusCode);
        Assert.NotNull((await outro.Content.ReadFromJsonAsync<Bloqueado>())?.AbertoPor);
        Assert.Equal(HttpStatusCode.OK, mesmoUsuario.StatusCode);
        Assert.Equal(HttpStatusCode.OK, depois.StatusCode);
    }

    [Fact]
    public async Task O_bloqueio_expira_sozinho()
    {
        var id = await OrcamentoLivre();
        await Cliente(1).GetAsync($"/api/orcamentos/{id}");
        await using (var db = api.NovoContexto())
            await db.Orcamentos.Where(o => o.Id == id)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.AbertoEm, DateTime.UtcNow.AddMinutes(-31)));

        var outro = await Cliente(2).GetAsync($"/api/orcamentos/{id}");

        Assert.Equal(HttpStatusCode.OK, outro.StatusCode);
    }

    [Fact]
    public async Task Salvar_regrava_o_orcamento_inteiro_e_recalcula_com_o_paliativo()
    {
        var id = await OrcamentoLivre();
        var cliente = Cliente(1);
        var detalhe = (await cliente.GetFromJsonAsync<OrcamentoDetalhe>($"/api/orcamentos/{id}"))!;
        var grupos = new List<GrupoSalvar>();
        foreach (var g in detalhe.Grupos)
        {
            var itens = (await cliente.GetFromJsonAsync<List<ItemDto>>($"/api/grupos/{g.Id}/itens"))!;
            grupos.Add(new GrupoSalvar(g.Id, g.Nome, g.Categoria, g.Ordem, itens));
        }
        var primeiro = grupos[0].Itens[0];
        grupos[0].Itens[0] = primeiro with { Quantidade = primeiro.Quantidade + 1 };

        var resposta = await cliente.PostAsJsonAsync($"/api/orcamentos/{id}/salvar",
            new SalvarOrcamento(detalhe.Descricao, detalhe.Status, detalhe.AjustePrazo, detalhe.Margem, grupos));
        var resultado = (await resposta.Content.ReadFromJsonAsync<ResultadoSalvar>())!;

        await using var db = api.NovoContexto();
        var gravado = await db.Orcamentos.Include(o => o.Grupos).ThenInclude(g => g.Itens).Include(o => o.Filhos).FirstAsync(o => o.Id == id);
        var esperado = CalculoLegado.TotalOrcamento(
            grupos.Select(g => g.Itens.Sum(i => CalculoLegado.TotalItem(i.Preco, i.Quantidade, i.Desconto))),
            gravado.Filhos.Select(f => f.Total), detalhe.AjustePrazo, detalhe.Margem);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal(esperado, resultado.Total);
        Assert.Equal(esperado, gravado.Total);
        Assert.Equal(grupos.Sum(g => g.Itens.Count), gravado.Grupos.Sum(g => g.Itens.Count));
        // Apagou e regravou: os grupos têm ids novos (o cache por id no navegador fica órfão).
        Assert.DoesNotContain(gravado.Grupos, g => detalhe.Grupos.Any(d => d.Id == g.Id));
    }

    [Fact]
    public async Task Salvar_recusa_sem_bloqueio_e_recusa_orcamento_incompleto()
    {
        var id = await OrcamentoLivre();
        var detalhe = (await Cliente(1).GetFromJsonAsync<OrcamentoDetalhe>($"/api/orcamentos/{id}"))!;
        var incompleto = new SalvarOrcamento(detalhe.Descricao, detalhe.Status, detalhe.AjustePrazo, detalhe.Margem, []);

        var semBloqueio = await Cliente(2).PostAsJsonAsync($"/api/orcamentos/{id}/salvar", incompleto);
        var semGrupos = await Cliente(1).PostAsJsonAsync($"/api/orcamentos/{id}/salvar", incompleto);

        Assert.Equal(HttpStatusCode.Locked, semBloqueio.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, semGrupos.StatusCode);
    }

    [Fact]
    public async Task Busca_de_produtos_por_LIKE()
    {
        var produtos = await Cliente(1).GetFromJsonAsync<List<ProdutoDto>>("/api/produtos?busca=cabo");

        Assert.NotEmpty(produtos!);
        Assert.All(produtos!, p => Assert.True(
            p.Nome.Contains("cabo", StringComparison.OrdinalIgnoreCase) || p.Sku.Contains("cabo", StringComparison.OrdinalIgnoreCase)));
    }
}
