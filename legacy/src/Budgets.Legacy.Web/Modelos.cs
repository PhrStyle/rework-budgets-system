using System.Globalization;

namespace Budgets.Legacy.Web;

// Cópias dos contratos da API, como no sistema original (problema 13): cada campo novo
// na API precisa ser repetido aqui, no front.

public record UsuarioModelo(int Id, string Nome);
public record PaginaModelo<T>(int Total, List<T> Itens);
public record OrcamentoResumoModelo(int Id, string Descricao, string Cliente, string Vendedor, string Status, decimal Total, bool Bloqueado, string? AbertoPor);
public record GrupoResumoModelo(int Id, string Nome, string Categoria, int Ordem, decimal Subtotal, int QuantidadeItens);
public record FilhoResumoModelo(int Id, string Descricao, decimal Total);
public record OrcamentoDetalheModelo(
    int Id, string Descricao, int ClienteId, string Cliente, int VendedorId, string Vendedor, string Status,
    decimal AjustePrazo, decimal Margem, decimal Total, int? OrcamentoPaiId,
    List<GrupoResumoModelo> Grupos, List<FilhoResumoModelo> Filhos, DateTime? AbertoEm);
public record ItemModelo(int? Id, int ProdutoId, string Nome, string Unidade, decimal Preco, decimal Quantidade, decimal Desconto, int Ordem, decimal Total);
public record GrupoSalvarModelo(int? Id, string Nome, string Categoria, int Ordem, List<ItemModelo> Itens);
public record SalvarModelo(string Descricao, string Status, decimal AjustePrazo, decimal Margem, List<GrupoSalvarModelo> Grupos);
public record ResultadoSalvarModelo(decimal Total, int Grupos, int Itens, long Milissegundos);
public record BloqueadoModelo(string Mensagem, string? AbertoPor, DateTime? AbertoEm);
public record ProdutoModelo(int Id, string Sku, string Nome, string Categoria, string Unidade, decimal Preco);

public static class Formato
{
    public static readonly CultureInfo Br = new("pt-BR");
    public static string Moeda(decimal valor) => valor.ToString("C", Br);
    public static string Numero(decimal valor) => valor.ToString("0.##", CultureInfo.InvariantCulture);
}

/// <summary>Login simulado: o usuário escolhido fica num cookie, sem senha.</summary>
public static class Sessao
{
    public const string CookieId = "legado_usuario";
    public const string CookieNome = "legado_nome";
}
