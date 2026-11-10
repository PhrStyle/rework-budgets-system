using Budgets.Legacy.Data;
using Budgets.Legacy.Seed;
using Microsoft.EntityFrameworkCore;

// Uso: dotnet run --project legacy/src/Budgets.Legacy.Seed -- [small|full]
var perfil = args.FirstOrDefault(a => a is "small" or "full") ?? "full";
var raiz = SeedArquivos.RaizDoRepositorio(Directory.GetCurrentDirectory());
var pasta = Path.Combine(raiz, "data", "seed", perfil);
if (!File.Exists(Path.Combine(pasta, "manifest.json")))
{
    Console.Error.WriteLine($"Dados não encontrados em {pasta}. Rode antes: pnpm seed:generate -- --profile {perfil}");
    return 1;
}

var options = new DbContextOptionsBuilder<OrcamentosContext>().UseNpgsql(Conexao.DoAmbiente()).Options;
await using var db = new OrcamentosContext(options);
var carregador = new Carregador(db);
var resumo = await carregador.CarregarAsync(pasta);

Console.WriteLine($"Perfil {perfil} carregado em budgets_legacy em {resumo.Tempo.TotalSeconds:F1} s");
Console.WriteLine($"  {resumo.Orcamentos} orçamentos, {resumo.Grupos} grupos, {resumo.Itens} itens, {resumo.Produtos} produtos, {resumo.Clientes} clientes, {resumo.Vinculos} vínculos");

var c = Carregador.Comparar(carregador.TotaisLegado, SeedArquivos.TotaisEsperados(pasta));
Console.WriteLine("Totais da legada (decimal + arredondar para cima) × regra nova (inteiros + comercial):");
Console.WriteLine($"  iguais: {c.Iguais} · acima: {c.Acima} · abaixo: {c.Abaixo}");
Console.WriteLine($"  maior diferença: R$ {c.MaiorDiferenca:N2} · soma das diferenças: R$ {c.SomaDiferencas:N2}");
return 0;
