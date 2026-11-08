import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import {
  PurchaseOrdersController,
  PurchasingReportsController,
  ReceivingController,
  SuppliersController,
} from './purchasing.controller.js';
import { PurchasingService } from './purchasing.service.js';

@Module({
  imports: [AuditLogModule],
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    ReceivingController,
    PurchasingReportsController,
  ],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
