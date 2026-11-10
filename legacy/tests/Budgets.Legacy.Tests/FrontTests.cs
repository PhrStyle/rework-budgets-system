using System.Net;
using System.Net.Http.Json;
using Budgets.Legacy.Api;
using Budgets.Legacy.Web;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budgets.Legacy.Tests;

/// <summary>
/// O front (Razor Pages) em memória chamando a API de verdade, também em memória: o mesmo caminho
/// jQuery → front → API do sistema antigo (problema 13).
/// </summary>
public class FrontTests(LegadoApiFixture api) : IClassFixture<LegadoApiFixture>
{
    private HttpClient Front(int? usuario, bool seguirRedirecionamentos = true)
    {
        var front = new WebApplicationFactory<MarcadorWeb>().WithWebHostBuilder(b => b.ConfigureServices(s =>
            s.AddHttpClient<ApiCliente>(c => c.BaseAddress = new Uri("http://localhost/"))
             .ConfigurePrimaryHttpMessageHandler(() => api.Fabrica.Server.CreateHandler())));
        var cliente = front.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = seguirRedirecionamentos });
        if (usuario is int id) cliente.DefaultRequestHeaders.Add("Cookie", $"{Sessao.CookieId}={id}; {Sessao.CookieNome}=Teste");
        return cliente;
    }

    private async Task<int> OrcamentoLivre()
    {
        await using var db = api.NovoContexto();
        return await db.Orcamentos.Where(o => !o.Aberto && o.Grupos.Count >= 2).OrderByDescending(o => o.Id).Select(o => o.Id).FirstAsync();
    }

    [Fact]
    public async Task Sem_usuario_escolhido_vai_para_o_login()
    {
        var resposta = await Front(null, seguirRedirecionamentos: false).GetAsync("/");

        Assert.Equal(HttpStatusCode.Redirect, resposta.StatusCode);
        Assert.Equal("/Login", resposta.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task O_front_repassa_para_a_API_e_mede_o_salto()
    {
        await using var db = api.NovoContexto();
        var grupo = await db.Grupos.OrderBy(g => g.Id).Select(g => new { g.Id, Itens = g.Itens.Count }).FirstAsync();

        var resposta = await Front(1).GetAsync($"/front/grupos/{grupo.Id}/itens");
        var itens = await resposta.Content.ReadFromJsonAsync<List<ItemDto>>();

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal(grupo.Itens, itens!.Count);
        Assert.Contains("front para API", resposta.Headers.GetValues("Server-Timing").Single());
    }

    [Fact]
    public async Task Outro_usuario_ve_o_orcamento_bloqueado()
    {
        var id = await OrcamentoLivre();
        await Front(1).GetAsync($"/Orcamento/{id}");

        var pagina = await Front(2).GetStringAsync($"/Orcamento/{id}");

        Assert.Contains("Orçamento bloqueado", pagina);
    }

    [Fact]
    public async Task O_script_da_tela_sai_com_cache_longo_e_sem_versao_no_nome()
    {
        var pagina = await Front(1).GetStringAsync($"/Orcamento/{await OrcamentoLivre()}");
        var script = await Front(1).GetAsync("/js/orcamento.js");

        Assert.Contains("<script src=\"/js/orcamento.js\"></script>", pagina); // sem ?v=hash
        Assert.Equal(TimeSpan.FromDays(7), script.Headers.CacheControl?.MaxAge); // problema 9
    }
}
