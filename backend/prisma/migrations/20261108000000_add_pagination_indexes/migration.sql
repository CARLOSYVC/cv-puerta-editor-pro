CREATE INDEX "Client_name_id_idx" ON "Client"("name", "id");
CREATE INDEX "Project_createdAt_id_idx" ON "Project"("createdAt", "id");
CREATE INDEX "Material_name_id_idx" ON "Material"("name", "id");
CREATE INDEX "PurchaseOrder_createdAt_id_idx" ON "PurchaseOrder"("createdAt", "id");
CREATE INDEX "ProductionOrder_createdAt_id_idx" ON "ProductionOrder"("createdAt", "id");
CREATE INDEX "InventoryMovement_createdAt_id_idx" ON "InventoryMovement"("createdAt", "id");
