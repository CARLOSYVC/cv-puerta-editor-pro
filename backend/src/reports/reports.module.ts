import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OperationsModule } from '../production-orders/operations.module.js';
import { PurchasingModule } from '../purchasing/purchasing.module.js';
import { ReportFileService } from './report-file.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [InventoryModule, OperationsModule, PurchasingModule],
  controllers: [ReportsController],
  providers: [ReportFileService, ReportsService],
})
export class ReportsModule {}
