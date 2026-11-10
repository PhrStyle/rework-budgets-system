using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Budgets.Legacy.Web.Pages;

/// <summary>
/// Editor: o servidor renderiza o cabeçalho e o resumo dos grupos (sem itens). Os itens vêm por grupo,
/// pelo jQuery, através do front (problema 13). Abrir a página marca o orçamento como "aberto".
/// </summary>
public class OrcamentoModel(ApiCliente api) : PageModel
{
    public OrcamentoDetalheModelo? Detalhe { get; private set; }
    public BloqueadoModelo? Bloqueado { get; private set; }

    public async Task OnGetAsync(int id) => (Detalhe, Bloqueado) = await api.Abrir(id);
}
