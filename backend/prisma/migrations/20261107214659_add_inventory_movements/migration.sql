-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'RETURN');

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "eventUuid" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_eventUuid_key" ON "InventoryMovement"("eventUuid");

-- CreateIndex
CREATE INDEX "InventoryMovement_materialId_idx" ON "InventoryMovement"("materialId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
