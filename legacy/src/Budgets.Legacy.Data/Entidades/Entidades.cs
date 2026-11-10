namespace Budgets.Legacy.Data.Entidades;

// Modelo da versão legada, como um sistema da época: valores em decimal, bloqueio como
// colunas no próprio orçamento e total gravado pelo servidor a cada salvamento.

public class Usuario
{
    public int Id { get; set; }
    public string Nome { get; set; } = "";
}

public class Cliente
{
    public int Id { get; set; }
    public string Nome { get; set; } = "";
}

public class Produto
{
    public int Id { get; set; }
    public string Sku { get; set; } = "";
    public string Nome { get; set; } = "";
    public string Categoria { get; set; } = "";
    /// <summary>un, m, l ou kg.</summary>
    public string Unidade { get; set; } = "";
    /// <summary>Preço por unidade, em reais.</summary>
    public decimal Preco { get; set; }
}

public class Orcamento
{
    public int Id { get; set; }
    public string Descricao { get; set; } = "";
    public int ClienteId { get; set; }
    public Cliente Cliente { get; set; } = null!;
    public int VendedorId { get; set; }
    public Usuario Vendedor { get; set; } = null!;
    public string Status { get; set; } = "Rascunho";
    /// <summary>Percentual, de −100 a 100.</summary>
    public decimal AjustePrazo { get; set; }
    /// <summary>Percentual, de 0 a 100.</summary>
    public decimal Margem { get; set; }
    public DateTime CriadoEm { get; set; }

    /// <summary>Orçamento que contém este (a versão mais nova).</summary>
    public int? OrcamentoPaiId { get; set; }
    public Orcamento? OrcamentoPai { get; set; }
    public List<Orcamento> Filhos { get; set; } = [];

    /// <summary>Bloqueio de edição: quem abriu e quando. Expira sozinho depois de um tempo.</summary>
    public bool Aberto { get; set; }
    public int? AbertoPorId { get; set; }
    public DateTime? AbertoEm { get; set; }

    /// <summary>Total calculado pelo servidor no último salvamento.</summary>
    public decimal Total { get; set; }

    public List<Grupo> Grupos { get; set; } = [];
}

public class Grupo
{
    public int Id { get; set; }
    public int OrcamentoId { get; set; }
    public Orcamento Orcamento { get; set; } = null!;
    public string Nome { get; set; } = "";
    public string Categoria { get; set; } = "";
    public int Ordem { get; set; }
    public decimal Subtotal { get; set; }
    public List<Item> Itens { get; set; } = [];
}

public class Item
{
    public int Id { get; set; }
    public int GrupoId { get; set; }
    public Grupo Grupo { get; set; } = null!;
    public int ProdutoId { get; set; }
    public Produto Produto { get; set; } = null!;
    public string Nome { get; set; } = "";
    public string Unidade { get; set; } = "";
    public decimal Preco { get; set; }
    public decimal Quantidade { get; set; }
    /// <summary>Percentual, de 0 a 100.</summary>
    public decimal Desconto { get; set; }
    public int Ordem { get; set; }
    public decimal Total { get; set; }
}
