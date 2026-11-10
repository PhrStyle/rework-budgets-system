using System.Text.Json;

namespace Budgets.Legacy.Seed;

// Formato dos arquivos do packages/seed (o contrato entre o gerador e os carregadores).
// Valores inteiros: price em centavos, quantity em centésimos da unidade, discount/prazo/margem em pontos-base.

public record SeedPessoa(int Id, string Name);
public record SeedProduto(int Id, string Sku, string Name, string Category, string Unit, long Price);
public record SeedItem(int Id, int ProductId, string Name, string Unit, long Price, long Quantity, int Discount, int Position);
public record SeedGrupo(int Id, string Name, string Category, int Position, List<SeedItem> Items);
public record SeedOrcamento(
    int Id, string Description, int ClientId, int SellerId, string Status, int Prazo, int Margem,
    DateTime CreatedAt, int? ParentId, string Size, bool Synthetic, List<SeedGrupo> Groups);

public static class SeedArquivos
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static List<T> Ler<T>(string pasta, string arquivo) =>
        JsonSerializer.Deserialize<List<T>>(File.ReadAllText(Path.Combine(pasta, arquivo)), Json)
        ?? throw new InvalidDataException($"{arquivo} vazio");

    /// <summary>Lê um orçamento por linha, sem carregar o arquivo inteiro na memória.</summary>
    public static IEnumerable<SeedOrcamento> Orcamentos(string pasta)
    {
        foreach (var linha in File.ReadLines(Path.Combine(pasta, "budgets.ndjson")))
        {
            if (linha.Length == 0) continue;
            yield return JsonSerializer.Deserialize<SeedOrcamento>(linha, Json)
                ?? throw new InvalidDataException("linha inválida em budgets.ndjson");
        }
    }

    /// <summary>Total esperado pela regra nova, em centavos, por id do orçamento.</summary>
    public static Dictionary<int, long> TotaisEsperados(string pasta) =>
        JsonSerializer.Deserialize<Dictionary<int, long>>(File.ReadAllText(Path.Combine(pasta, "expected-totals.json")), Json)
        ?? throw new InvalidDataException("expected-totals.json vazio");

    /// <summary>Sobe a partir de um diretório até achar a raiz do repositório (onde está o pnpm-workspace.yaml).</summary>
    public static string RaizDoRepositorio(string inicio)
    {
        for (var dir = new DirectoryInfo(inicio); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml"))) return dir.FullName;
        throw new DirectoryNotFoundException("raiz do repositório não encontrada");
    }
}
