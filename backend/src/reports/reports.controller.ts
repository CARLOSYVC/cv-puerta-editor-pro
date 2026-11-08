import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ModuleAccess } from '../auth/module-access.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ReportsService, type ReportExportFormat } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('inventory/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('inventory')
  @Header('Cache-Control', 'no-store')
  async exportInventory(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('inventario', format, response, (type) =>
      this.reports.exportInventory(type),
    );
  }

  @Get('purchases/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('purchasing-reports')
  @Header('Cache-Control', 'no-store')
  async exportPurchases(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('compras', format, response, (type) =>
      this.reports.exportPurchases(type),
    );
  }

  @Get('costs/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('costs')
  @Header('Cache-Control', 'no-store')
  async exportCosts(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('costos', format, response, (type) =>
      this.reports.exportCosts(type),
    );
  }

  @Get('production-orders/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('production-orders')
  @Header('Cache-Control', 'no-store')
  async exportProductionOrders(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('ordenes-produccion', format, response, (type) =>
      this.reports.exportProductionOrders(type),
    );
  }

  @Get('purchase-orders/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('purchase-orders')
  @Header('Cache-Control', 'no-store')
  async exportPurchaseOrders(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('ordenes-compra', format, response, (type) =>
      this.reports.exportPurchaseOrders(type),
    );
  }

  @Get('project-costs/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('costs')
  @Header('Cache-Control', 'no-store')
  async exportProjectCosts(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('costos-proyecto', format, response, (type) =>
      this.reports.exportProjectCosts(type),
    );
  }

  @Get('executive/export')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'pdf'], required: true })
  @ModuleAccess('dashboard')
  @Header('Cache-Control', 'no-store')
  async exportExecutiveReport(
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.exportReport('reporte-ejecutivo', format, response, (type) =>
      this.reports.exportExecutiveReport(type),
    );
  }

  private async exportReport(
    fileName: string,
    value: string,
    response: Response,
    createFile: (format: ReportExportFormat) => Promise<Buffer>,
  ): Promise<StreamableFile> {
    const format = this.parseFormat(value);
    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    const buffer = await createFile(format);
    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.${format}"`,
    );
    response.setHeader('Content-Length', buffer.byteLength);
    return new StreamableFile(buffer);
  }

  private parseFormat(value: string): ReportExportFormat {
    if (value === 'xlsx' || value === 'pdf') return value;
    throw new BadRequestException('format must be either xlsx or pdf');
  }
}
