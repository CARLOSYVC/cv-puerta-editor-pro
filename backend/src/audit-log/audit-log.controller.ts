import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ModuleAccess } from '../auth/module-access.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  AuditLogService,
  type AuditLogExportFormat,
} from './audit-log.service.js';

@ApiTags('audit-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('audit-log')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('users')
  findUsers() {
    return this.auditLogService.findUsers();
  }

  @Get('export')
  async export(
    @Query() filters: {
      entity?: string;
      entityId?: string;
      search?: string;
      userId?: string;
      dateFrom?: string;
      dateTo?: string;
      format?: string;
    },
    @Res() response: Response,
  ) {
    const format = this.parseExportFormat(filters.format);
    const auditFilters = { ...filters };
    delete auditFilters.format;
    const content = await this.auditLogService.exportFile(auditFilters, format);
    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : format === 'pdf'
        ? 'application/pdf'
        : 'text/csv; charset=utf-8';
    response
      .setHeader('Content-Type', contentType)
      .setHeader('Content-Disposition', `attachment; filename="audit-log.${format}"`)
      .setHeader('Content-Length', content.byteLength)
      .send(content);
  }

  @Get()
  findAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('search') search?: string,
    @Query('userId') userId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditLogService.findAll({
      entity,
      entityId,
      search,
      userId,
      dateFrom,
      dateTo,
      page,
      pageSize,
    });
  }

  private parseExportFormat(value = 'csv'): AuditLogExportFormat {
    if (value === 'xlsx' || value === 'pdf' || value === 'csv') return value;
    throw new BadRequestException('format must be xlsx, pdf, or csv');
  }
}
