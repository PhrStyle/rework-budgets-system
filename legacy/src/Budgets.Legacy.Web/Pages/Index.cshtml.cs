using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Budgets.Legacy.Web.Pages;

/// <summary>Listagem renderizada no servidor; a busca vira LIKE '%termo%' na API.</summary>
public class IndexModel(ApiCliente api) : PageModel
{
    [BindProperty(SupportsGet = true)] public string? Busca { get; set; }
    [BindProperty(SupportsGet = true)] public string? Status { get; set; }
    [BindProperty(SupportsGet = true)] public int Pagina { get; set; } = 1;
    public PaginaModelo<OrcamentoResumoModelo> Resultado { get; private set; } = new(0, []);
    public long Milissegundos { get; private set; }

    public async Task OnGetAsync()
    {
        var relogio = System.Diagnostics.Stopwatch.StartNew();
        Resultado = await api.Listar(Busca, Status, Math.Max(Pagina, 1));
        Milissegundos = relogio.ElapsedMilliseconds;
    }
}
