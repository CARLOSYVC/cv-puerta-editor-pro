import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';
import { ReportFileService } from '../reports/report-file.service.js';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, ReportFileService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
