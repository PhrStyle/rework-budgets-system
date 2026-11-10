using System.Diagnostics;
using System.Net.Http.Json;

namespace Budgets.Legacy.Web;

/// <summary>
/// Endpoints que o jQuery chama no FRONT, que repassam para a API do back e devolvem a resposta
/// (problema 13): jQuery → front → API → front → jQuery. Cada resposta é desserializada aqui e
/// serializada de novo. O cabeçalho Server-Timing mostra no DevTools quanto custa cada salto
/// (cabeçalhos HTTP só aceitam ASCII: a descrição fica sem acento).
/// </summary>
public static class Intermediario
{
    public static void MapIntermediario(this WebApplication app)
    {
        var front = app.MapGroup("/front");

        front.MapGet("/grupos/{id:int}/itens", async (int id, ApiCliente api, HttpContext ctx, CancellationToken ct) =>
            await Repassar(ctx, () => api.ItensDoGrupo(id, ct)));

        front.MapGet("/produtos", async (string busca, ApiCliente api, HttpContext ctx, CancellationToken ct) =>
            await Repassar(ctx, () => api.Produtos(busca, ct)));

        front.MapPost("/orcamentos/{id:int}/salvar", async (int id, SalvarModelo dados, ApiCliente api, HttpContext ctx, CancellationToken ct) =>
        {
            var relogio = Stopwatch.StartNew();
            using var resposta = await api.Salvar(id, dados, ct);
            ctx.Response.Headers["Server-Timing"] = $"api;desc=\"front para API\";dur={relogio.ElapsedMilliseconds}";
            if (!resposta.IsSuccessStatusCode)
                return Results.Content(await resposta.Content.ReadAsStringAsync(ct), "application/json", statusCode: (int)resposta.StatusCode);
            return Results.Json(await resposta.Content.ReadFromJsonAsync<ResultadoSalvarModelo>(ct));
        });

        front.MapPost("/orcamentos/{id:int}/liberar", async (int id, string? abertoEm, ApiCliente api, CancellationToken ct) =>
        {
            await api.Liberar(id, abertoEm, ct);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> Repassar<T>(HttpContext ctx, Func<Task<T>> chamada)
    {
        var relogio = Stopwatch.StartNew();
        var dados = await chamada();
        ctx.Response.Headers["Server-Timing"] = $"api;desc=\"front para API\";dur={relogio.ElapsedMilliseconds}";
        return Results.Json(dados);
    }
}
