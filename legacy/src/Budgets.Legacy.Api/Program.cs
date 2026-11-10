using Budgets.Legacy.Api;
using Budgets.Legacy.Data;
using Microsoft.EntityFrameworkCore;

// API do back da versão legada. Na arquitetura antiga, o navegador não a chama direto:
// o jQuery chama o front (Razor Pages), que repassa para cá (problema 13).
var builder = WebApplication.CreateBuilder(args);

// ConnectionStrings:Legado (usada pelos testes) ou as variáveis do .env.
builder.Services.AddDbContext<OrcamentosContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Legado") ?? Conexao.DoAmbiente()));
builder.Services.Configure<OpcoesBloqueio>(builder.Configuration.GetSection("Bloqueio"));
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.MapControllers();
app.Run();

/// <summary>Exposto para os testes de integração (WebApplicationFactory).</summary>
public partial class Program;
