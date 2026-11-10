-- DropIndex
DROP INDEX "groups_budget_id_position_idx";

-- DropIndex
DROP INDEX "items_group_id_position_idx";

-- CreateIndex
CREATE UNIQUE INDEX "groups_budget_id_position_key" ON "groups"("budget_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "items_group_id_position_key" ON "items"("group_id", "position");

