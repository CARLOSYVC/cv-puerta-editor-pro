-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "InventoryMovement_updatedById_idx" ON "InventoryMovement"("updatedById");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
