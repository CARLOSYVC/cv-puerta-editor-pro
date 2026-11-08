import { Module } from '@nestjs/common';
import {
  CostsController,
  DashboardController,
  MaterialConsumptionController,
  ProductionOrdersController,
} from './operations.controller.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OperationsService } from './operations.service.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';

@Module({
  imports: [InventoryModule, AuditLogModule],
  controllers: [
    ProductionOrdersController,
    MaterialConsumptionController,
    CostsController,
    DashboardController,
  ],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
