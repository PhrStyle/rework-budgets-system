using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Budgets.Legacy.Data;

/// <summary>Usado só pelo `dotnet ef` para gerar migrations; não conecta em banco nenhum.</summary>
public class DesignTimeFactory : IDesignTimeDbContextFactory<OrcamentosContext>
{
    public OrcamentosContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<OrcamentosContext>().UseNpgsql("Host=localhost;Database=design").Options);
}
