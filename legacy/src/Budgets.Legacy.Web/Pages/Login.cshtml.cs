using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Budgets.Legacy.Web.Pages;

/// <summary>Login simulado: escolhe o usuário da lista, sem senha.</summary>
public class LoginModel(ApiCliente api) : PageModel
{
    public List<UsuarioModelo> Usuarios { get; private set; } = [];

    public async Task<IActionResult> OnGetAsync(bool sair = false)
    {
        if (sair)
        {
            Response.Cookies.Delete(Sessao.CookieId);
            Response.Cookies.Delete(Sessao.CookieNome);
            return RedirectToPage();
        }
        Usuarios = await api.Usuarios();
        return Page();
    }

    public IActionResult OnPost(int usuarioId, string nome)
    {
        Response.Cookies.Append(Sessao.CookieId, usuarioId.ToString(), new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax });
        Response.Cookies.Append(Sessao.CookieNome, nome, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax });
        return RedirectToPage("/Index");
    }
}
