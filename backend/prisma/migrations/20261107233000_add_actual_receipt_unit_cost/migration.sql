ALTER TABLE "PurchaseReceiptItem"
ADD COLUMN "unitCost" DECIMAL(12,2);

UPDATE "PurchaseReceiptItem" AS receipt_item
SET "unitCost" = purchase_order_item."unitCost"
FROM "PurchaseOrderItem" AS purchase_order_item
WHERE receipt_item."purchaseOrderItemId" = purchase_order_item."id";

ALTER TABLE "PurchaseReceiptItem"
ALTER COLUMN "unitCost" SET NOT NULL;
