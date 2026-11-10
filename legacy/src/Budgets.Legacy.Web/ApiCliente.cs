using System.Net;
using System.Net.Http.Json;

namespace Budgets.Legacy.Web;

/// <summary>Cliente da API do back. Toda chamada do jQuery passa por aqui antes de chegar à API.</summary>
public class ApiCliente(HttpClient http, IHttpContextAccessor contexto)
{
    private HttpRequestMessage Pedido(HttpMethod metodo, string caminho, object? corpo = null)
    {
        var pedido = new HttpRequestMessage(metodo, caminho);
        if (contexto.HttpContext?.Request.Cookies[Sessao.CookieId] is { } usuario)
            pedido.Headers.Add("X-Usuario-Id", usuario);
        if (corpo is not null) pedido.Content = JsonContent.Create(corpo);
        return pedido;
    }

    private async Task<T> Ler<T>(string caminho, CancellationToken ct)
    {
        using var resposta = await http.SendAsync(Pedido(HttpMethod.Get, caminho), ct);
        resposta.EnsureSuccessStatusCode();
        return (await resposta.Content.ReadFromJsonAsync<T>(ct))!;
    }

    public Task<List<UsuarioModelo>> Usuarios(CancellationToken ct = default) => Ler<List<UsuarioModelo>>("api/usuarios", ct);

    public Task<PaginaModelo<OrcamentoResumoModelo>> Listar(string? busca, string? status, int pagina, CancellationToken ct = default) =>
        Ler<PaginaModelo<OrcamentoResumoModelo>>(
            $"api/orcamentos?busca={Uri.EscapeDataString(busca ?? "")}&status={Uri.EscapeDataString(status ?? "")}&pagina={pagina}&tamanho=20", ct);

    public async Task<(OrcamentoDetalheModelo? Detalhe, BloqueadoModelo? Bloqueado)> Abrir(int id, CancellationToken ct = default)
    {
        using var resposta = await http.SendAsync(Pedido(HttpMethod.Get, $"api/orcamentos/{id}"), ct);
        if (resposta.StatusCode == HttpStatusCode.Locked)
            return (null, await resposta.Content.ReadFromJsonAsync<BloqueadoModelo>(ct));
        resposta.EnsureSuccessStatusCode();
        return (await resposta.Content.ReadFromJsonAsync<OrcamentoDetalheModelo>(ct), null);
    }

    public Task<List<ItemModelo>> ItensDoGrupo(int id, CancellationToken ct = default) => Ler<List<ItemModelo>>($"api/grupos/{id}/itens", ct);

    public Task<List<ProdutoModelo>> Produtos(string busca, CancellationToken ct = default) =>
        Ler<List<ProdutoModelo>>($"api/produtos?busca={Uri.EscapeDataString(busca)}", ct);

    public Task<HttpResponseMessage> Salvar(int id, SalvarModelo dados, CancellationToken ct = default) =>
        http.SendAsync(Pedido(HttpMethod.Post, $"api/orcamentos/{id}/salvar", dados), ct);

    public async Task Liberar(int id, string? abertoEm, CancellationToken ct = default)
    {
        var consulta = string.IsNullOrEmpty(abertoEm) ? "" : $"?abertoEm={Uri.EscapeDataString(abertoEm)}";
        using var resposta = await http.SendAsync(Pedido(HttpMethod.Post, $"api/orcamentos/{id}/liberar{consulta}"), ct);
    }
}
