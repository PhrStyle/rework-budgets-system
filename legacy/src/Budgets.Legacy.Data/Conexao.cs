namespace Budgets.Legacy.Data;

/// <summary>Monta a connection string a partir das mesmas variáveis do .env usadas pelo Docker Compose.</summary>
public static class Conexao
{
    public static string DoAmbiente() =>
        Environment.GetEnvironmentVariable("LEGACY_DB")
        ?? $"Host=127.0.0.1;Port={Env("POSTGRES_PORT", "54320")};Database=budgets_legacy;" +
           $"Username={Env("POSTGRES_USER", "budgets")};Password={Env("POSTGRES_PASSWORD", "")}";

    private static string Env(string name, string fallback) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value ? value : fallback;
}
