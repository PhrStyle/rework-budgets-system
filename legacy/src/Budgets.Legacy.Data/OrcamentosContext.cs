using Budgets.Legacy.Data.Entidades;
using Microsoft.EntityFrameworkCore;

namespace Budgets.Legacy.Data;

public class OrcamentosContext(DbContextOptions<OrcamentosContext> options) : DbContext(options)
{
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Produto> Produtos => Set<Produto>();
    public DbSet<Orcamento> Orcamentos => Set<Orcamento>();
    public DbSet<Grupo> Grupos => Set<Grupo>();
    public DbSet<Item> Itens => Set<Item>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        // Dinheiro e quantidade em numeric(18,2); percentuais em numeric(5,2), como o EF faria com decimal.
        model.Entity<Produto>().Property(p => p.Preco).HasPrecision(18, 2);

        model.Entity<Orcamento>(o =>
        {
            o.Property(x => x.AjustePrazo).HasPrecision(5, 2);
            o.Property(x => x.Margem).HasPrecision(5, 2);
            o.Property(x => x.Total).HasPrecision(18, 2);
            o.HasOne(x => x.Vendedor).WithMany().HasForeignKey(x => x.VendedorId).OnDelete(DeleteBehavior.Restrict);
            o.HasOne(x => x.OrcamentoPai).WithMany(x => x.Filhos).HasForeignKey(x => x.OrcamentoPaiId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<Grupo>().Property(g => g.Subtotal).HasPrecision(18, 2);

        model.Entity<Item>(i =>
        {
            i.Property(x => x.Preco).HasPrecision(18, 2);
            i.Property(x => x.Quantidade).HasPrecision(18, 2);
            i.Property(x => x.Desconto).HasPrecision(5, 2);
            i.Property(x => x.Total).HasPrecision(18, 2);
            i.HasIndex(x => new { x.GrupoId, x.Ordem });
        });
    }
}
