namespace Budgets.Legacy.Data;

/// <summary>
/// Cálculo do servidor na versão legada: decimal (C#) com o paliativo da época, arredondar
/// SEMPRE para cima em cada cálculo, para que a divergência com o float do navegador
/// errasse a favor da empresa. Reproduzido de propósito; a versão nova usa inteiros e
/// arredondamento comercial (packages/money e packages/budget-calc).
/// </summary>
public static class CalculoLegado
{
    /// <summary>Arredonda para cima, no centavo.</summary>
    public static decimal TetoCentavos(decimal valor) => Math.Ceiling(valor * 100m) / 100m;

    /// <summary>preço × quantidade × (1 − desconto%), arredondado para cima.</summary>
    public static decimal TotalItem(decimal preco, decimal quantidade, decimal descontoPercentual) =>
        TetoCentavos(preco * quantidade * (1m - descontoPercentual / 100m));

    /// <summary>(Σ grupos + Σ filhos) → ajuste de prazo → margem, arredondando para cima a cada passo.</summary>
    public static decimal TotalOrcamento(
        IEnumerable<decimal> subtotaisGrupos,
        IEnumerable<decimal> totaisFilhos,
        decimal ajustePrazoPercentual,
        decimal margemPercentual)
    {
        var subtotal = subtotaisGrupos.Sum() + totaisFilhos.Sum();
        var comPrazo = TetoCentavos(subtotal * (1m + ajustePrazoPercentual / 100m));
        return TetoCentavos(comPrazo * (1m + margemPercentual / 100m));
    }
}
