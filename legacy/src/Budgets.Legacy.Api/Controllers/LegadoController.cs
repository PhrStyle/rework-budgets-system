using Microsoft.AspNetCore.Mvc;

namespace Budgets.Legacy.Api.Controllers;

/// <summary>Base com o usuário do login simulado, enviado no cabeçalho X-Usuario-Id.</summary>
[ApiController]
public abstract class LegadoController : ControllerBase
{
    protected int? UsuarioId =>
        Request.Headers.TryGetValue("X-Usuario-Id", out var valor) && int.TryParse(valor, out var id) ? id : null;
}
