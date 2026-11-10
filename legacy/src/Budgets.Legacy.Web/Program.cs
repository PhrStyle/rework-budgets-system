using Budgets.Legacy.Web;

// Front da versão legada (Razor Pages). Renderiza as páginas e serve de intermediário
// entre o jQuery e a API do back (problema 13).
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
// Sem isso, o Razor escreve "ç", "ã" etc. como entidades HTML (&#xE7;): a tela fica certa, o fonte ilegível.
builder.Services.Configure<Microsoft.Extensions.WebEncoders.WebEncoderOptions>(o =>
    o.TextEncoderSettings = new System.Text.Encodings.Web.TextEncoderSettings(System.Text.Unicode.UnicodeRanges.All));
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient<ApiCliente>(c =>
    c.BaseAddress = new Uri(builder.Configuration["Api:BaseUrl"] ?? "http://127.0.0.1:5080/"));

var app = builder.Build();
if (!app.Environment.IsDevelopment()) app.UseExceptionHandler("/Error");
// Como no sistema original: os scripts saem com cache de 7 dias e SEM versão no nome do arquivo.
// Depois de um deploy, o navegador continua usando o orcamento.js antigo com o back novo, até um
// Ctrl+F5 (problema 9). O próprio ASP.NET tem a solução (asp-append-version), que o sistema não usava.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = arquivo =>
    {
        if (arquivo.Context.Request.Path.StartsWithSegments("/js"))
            arquivo.Context.Response.Headers.CacheControl = "public, max-age=604800";
    },
});
app.UseRouting();

// Login simulado: sem usuário escolhido, só a tela de login e os arquivos estáticos.
app.Use(async (ctx, next) =>
{
    var caminho = ctx.Request.Path;
    var livre = caminho.StartsWithSegments("/Login") || caminho.StartsWithSegments("/lib")
        || caminho.StartsWithSegments("/css") || caminho.StartsWithSegments("/js") || caminho.StartsWithSegments("/favicon.ico");
    if (!livre && !ctx.Request.Cookies.ContainsKey(Sessao.CookieId))
    {
        if (caminho.StartsWithSegments("/front")) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
        ctx.Response.Redirect("/Login");
        return;
    }
    await next();
});

app.MapRazorPages();
app.MapIntermediario();
app.Run();

namespace Budgets.Legacy.Web
{
    /// <summary>Marca o assembly do front para os testes (WebApplicationFactory).</summary>
    public class MarcadorWeb;
}
