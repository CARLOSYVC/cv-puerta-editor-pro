import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportFileService, type ReportSheet } from '../reports/report-file.service.js';

export interface AuditLogFilters {
  entity?: string;
  entityId?: string;
  search?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogPageOptions extends AuditLogFilters {
  page?: string;
  pageSize?: string;
}

export type AuditLogExportFormat = 'xlsx' | 'pdf' | 'csv';

export interface AuditLogEntryInput {
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity:
    | 'InventoryMovement'
    | 'ProductionOrder'
    | 'Supplier'
    | 'PurchaseOrder'
    | 'User'
    | 'RolePermission';
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportFiles: ReportFileService,
  ) {}

  record(
    transaction: Prisma.TransactionClient,
    input: AuditLogEntryInput,
  ) {
    return transaction.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
      },
    });
  }

  async findAll(options: AuditLogPageOptions) {
    const page = this.parsePositiveInteger(options.page, 1, 'page', 1_000_000);
    const pageSize = this.parsePositiveInteger(options.pageSize, 25, 'pageSize', 100);
    const where = this.buildWhere(options);
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findUsers() {
    return this.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async exportCsv(options: AuditLogFilters) {
    const entries = await this.findExportEntries(options);
    const rows = [
      ['Fecha', 'Usuario', 'Correo', 'Acción', 'Entidad', 'ID'],
      ...entries.map((entry) => [
        entry.createdAt.toISOString(),
        entry.user?.name ?? 'Usuario eliminado',
        entry.user?.email ?? '',
        entry.action,
        entry.entity,
        entry.entityId,
      ]),
    ];
    return `\uFEFF${rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n')}`;
  }

  async exportFile(options: AuditLogFilters, format: AuditLogExportFormat) {
    if (format === 'csv') return Buffer.from(await this.exportCsv(options), 'utf8');

    const entries = await this.findExportEntries(options);
    const sheet: ReportSheet = {
      name: 'Auditoría',
      columns: ['Fecha', 'Usuario', 'Correo', 'Acción', 'Entidad', 'ID'],
      rows: entries.map((entry) => [
        entry.createdAt.toISOString(),
        entry.user?.name ?? 'Usuario eliminado',
        entry.user?.email ?? '',
        entry.action,
        entry.entity,
        entry.entityId,
      ]),
    };
    return format === 'xlsx'
      ? this.reportFiles.toExcel([sheet])
      : this.reportFiles.toPdf('Registro de auditoría', [sheet]);
  }

  private buildWhere(options: AuditLogFilters): Prisma.AuditLogWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (options.dateFrom) {
      createdAt.gte = this.parseDate(options.dateFrom, 'dateFrom');
    }
    if (options.dateTo) {
      const endDate = this.parseDate(options.dateTo, 'dateTo');
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      createdAt.lt = endDate;
    }
    if (createdAt.gte && createdAt.lt && createdAt.gte >= createdAt.lt) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }

    const search = options.search?.trim();
    return {
      ...(options.entity && { entity: options.entity }),
      ...(options.entityId && { entityId: { contains: options.entityId.trim(), mode: 'insensitive' } }),
      ...(options.userId && { userId: options.userId }),
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
      ...(search && {
        OR: [
          { entityId: { contains: search, mode: 'insensitive' } },
          { entity: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
          { user: { is: { name: { contains: search, mode: 'insensitive' } } } },
          { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };
  }

  private parsePositiveInteger(
    value: string | undefined,
    defaultValue: number,
    name: string,
    maximum: number,
  ) {
    const parsed = value === undefined ? defaultValue : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException(`${name} must be an integer from 1 to ${maximum}`);
    }
    return parsed;
  }

  private parseDate(value: string, name: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${name} must use YYYY-MM-DD format`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${name} must be a valid calendar date`);
    }
    return date;
  }

  private csvCell(value: string) {
    const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  private findExportEntries(options: AuditLogFilters) {
    return this.prisma.auditLog.findMany({
      where: this.buildWhere(options),
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
