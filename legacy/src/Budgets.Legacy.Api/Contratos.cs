namespace Budgets.Legacy.Api;

public class OpcoesBloqueio
{
    /// <summary>Depois desse tempo sem salvar, o bloqueio "aberto" é considerado expirado.</summary>
    public int ExpiraEmMinutos { get; set; } = 30;
}

public record Pagina<T>(int Total, IReadOnlyList<T> Itens);

public record OrcamentoResumo(
    int Id, string Descricao, string Cliente, string Vendedor, string Status, decimal Total, bool Bloqueado, string? AbertoPor);

public record GrupoResumo(int Id, string Nome, string Categoria, int Ordem, decimal Subtotal, int QuantidadeItens);

public record FilhoResumo(int Id, string Descricao, decimal Total);

public record OrcamentoDetalhe(
    int Id, string Descricao, int ClienteId, string Cliente, int VendedorId, string Vendedor, string Status,
    decimal AjustePrazo, decimal Margem, decimal Total, int? OrcamentoPaiId,
    IReadOnlyList<GrupoResumo> Grupos, IReadOnlyList<FilhoResumo> Filhos);

public record ItemDto(
    int? Id, int ProdutoId, string Nome, string Unidade, decimal Preco, decimal Quantidade, decimal Desconto, int Ordem, decimal Total);

public record GrupoSalvar(int? Id, string Nome, string Categoria, int Ordem, List<ItemDto> Itens);

/// <summary>O orçamento inteiro: cabeçalho, todos os grupos e todos os itens (como a legada enviava).</summary>
public record SalvarOrcamento(string Descricao, string Status, decimal AjustePrazo, decimal Margem, List<GrupoSalvar> Grupos);

public record ResultadoSalvar(decimal Total, int Grupos, int Itens, long Milissegundos);

public record Bloqueado(string Mensagem, string? AbertoPor, DateTime? AbertoEm);

public record ProdutoDto(int Id, string Sku, string Nome, string Categoria, string Unidade, decimal Preco);

public record UsuarioDto(int Id, string Nome);
