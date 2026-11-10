using System.Text.Json;
using Budgets.Legacy.Data;
using Budgets.Legacy.Seed;

namespace Budgets.Legacy.Tests;

public class CalculoLegadoTests
{
    [Fact]
    public void Arredonda_sempre_para_cima_no_centavo()
    {
        Assert.Equal(3425.91m, CalculoLegado.TotalItem(1234.56m, 3m, 7.5m)); // exato: 3425,904
        Assert.Equal(49.98m, CalculoLegado.TotalItem(19.99m, 2.5m, 0m)); // exato: 49,975
        Assert.Equal(100m, CalculoLegado.TotalItem(100m, 1m, 0m)); // exato não muda
    }

    [Fact]
    public void Diverge_do_arredondamento_comercial_da_versao_nova()
    {
        // Mesmo item do caso "item simples" da fixture: a regra nova dá R$ 3.425,90 (342590 centavos).
        Assert.Equal(3425.90m + 0.01m, CalculoLegado.TotalItem(1234.56m, 3m, 7.5m));
    }

    [Fact]
    public void Aplica_prazo_e_margem_arredondando_para_cima_a_cada_passo()
    {
        // 10000 × 0,975 = 9750; × 1,15 = 11212,50 (exato, sem arredondar)
        Assert.Equal(11212.50m, CalculoLegado.TotalOrcamento([10000m], [], -2.5m, 15m));
        // 0,01 × 1,5 = 0,015 → 0,02; × 1,5 = 0,03
        Assert.Equal(0.03m, CalculoLegado.TotalOrcamento([0.01m], [], 50m, 50m));
    }

    public static IEnumerable<object[]> Casos()
    {
        var raiz = SeedArquivos.RaizDoRepositorio(AppContext.BaseDirectory);
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(raiz, "fixtures", "budget-cases.json")));
        foreach (var caso in doc.RootElement.GetProperty("cases").EnumerateArray())
        {
            if (!caso.TryGetProperty("expected", out var esperado)) continue; // casos de erro
            yield return [caso.GetProperty("name").GetString()!, caso.GetProperty("input").GetRawText(), esperado.GetProperty("total").GetInt64()];
        }
    }

    /// <summary>
    /// Os mesmos casos da versão nova (fixtures/budget-cases.json). A legada nunca fica abaixo
    /// do total da regra nova: o paliativo erra sempre para cima.
    /// </summary>
    [Theory]
    [MemberData(nameof(Casos))]
    public void Casos_compartilhados_nunca_ficam_abaixo_da_regra_nova(string nome, string entrada, long esperadoCentavos)
    {
        using var doc = JsonDocument.Parse(entrada);
        var totalLegado = TotalDaFixture(doc.RootElement);
        Assert.True(totalLegado >= esperadoCentavos / 100m, $"{nome}: legada {totalLegado} < nova {esperadoCentavos / 100m}");
    }

    private static decimal TotalDaFixture(JsonElement orcamento)
    {
        var subtotais = orcamento.GetProperty("groups").EnumerateArray().Select(g =>
            g.GetProperty("items").EnumerateArray().Sum(i => CalculoLegado.TotalItem(
                i.GetProperty("price").GetInt64() / 100m,
                i.GetProperty("quantity").GetInt64() / 100m,
                i.GetProperty("discount").GetInt32() / 100m)));
        var filhos = orcamento.GetProperty("children").EnumerateArray().Select(TotalDaFixture);
        return CalculoLegado.TotalOrcamento(
            subtotais, filhos,
            orcamento.GetProperty("prazo").GetInt32() / 100m,
            orcamento.GetProperty("margem").GetInt32() / 100m);
    }
}
