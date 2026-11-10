-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('Rascunho', 'Enviado', 'Aprovado', 'Perdido');

-- CreateTable
CREATE TABLE "sellers" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'Rascunho',
    "prazo_bp" INTEGER NOT NULL,
    "margem_bp" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "parent_id" INTEGER,
    "groups_total_cents" BIGINT NOT NULL,
    "children_total_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subtotal_cents" BIGINT NOT NULL,
    "item_count" INTEGER NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discount_bp" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "total_cents" BIGINT NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "budgets_parent_id_idx" ON "budgets"("parent_id");

-- CreateIndex
CREATE INDEX "budgets_created_at_idx" ON "budgets"("created_at" DESC);

-- CreateIndex
CREATE INDEX "groups_budget_id_position_idx" ON "groups"("budget_id", "position");

-- CreateIndex
CREATE INDEX "items_group_id_position_idx" ON "items"("group_id", "position");

-- CreateIndex
CREATE INDEX "items_product_id_idx" ON "items"("product_id");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Limites das regras (packages/budget-calc, LIMITS) também no banco: um bug na API
-- não consegue gravar um percentual impossível. O Prisma não modela CHECK; ficam aqui.
ALTER TABLE "products" ADD CONSTRAINT "products_unit_check" CHECK ("unit" IN ('un', 'm', 'l', 'kg'));
ALTER TABLE "products" ADD CONSTRAINT "products_price_check" CHECK ("price_cents" >= 0);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_prazo_check" CHECK ("prazo_bp" BETWEEN -10000 AND 10000);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_margem_check" CHECK ("margem_bp" BETWEEN 0 AND 10000);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_parent_check" CHECK ("parent_id" <> "id");
ALTER TABLE "groups" ADD CONSTRAINT "groups_version_check" CHECK ("version" >= 1);
ALTER TABLE "items" ADD CONSTRAINT "items_unit_check" CHECK ("unit" IN ('un', 'm', 'l', 'kg'));
ALTER TABLE "items" ADD CONSTRAINT "items_price_check" CHECK ("price_cents" >= 0);
ALTER TABLE "items" ADD CONSTRAINT "items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "items" ADD CONSTRAINT "items_discount_check" CHECK ("discount_bp" BETWEEN 0 AND 10000);
-- "un" não tem fração: a quantidade em centésimos precisa ser múltipla de 100.
ALTER TABLE "items" ADD CONSTRAINT "items_un_whole_check" CHECK ("unit" <> 'un' OR "quantity" % 100 = 0);
