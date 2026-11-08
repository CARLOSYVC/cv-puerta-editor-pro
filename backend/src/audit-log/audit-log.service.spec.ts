import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportFileService } from '../reports/report-file.service.js';
import { AuditLogService } from './audit-log.service.js';

describe('AuditLogService', () => {
  const prisma = {
    $transaction: vi.fn(),
    auditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };
  const reportFiles = {
    toExcel: vi.fn(),
    toPdf: vi.fn(),
  };
  let service: AuditLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditLogService(
      prisma as unknown as PrismaService,
      reportFiles as unknown as ReportFileService,
    );
  });

  it('paginates matching entries and returns the total count', async () => {
    const entries = [{ id: 'log-1' }];
    prisma.auditLog.findMany.mockResolvedValue(entries);
    prisma.auditLog.count.mockResolvedValue(26);
    prisma.$transaction.mockResolvedValue([entries, 26]);

    await expect(service.findAll({
      page: '2',
      pageSize: '10',
      search: 'maria',
      userId: 'user-1',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    })).resolves.toEqual({
      entries,
      total: 26,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({
        userId: 'user-1',
        createdAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lt: new Date('2026-11-08T00:00:00.000Z'),
        },
        OR: expect.arrayContaining([
          { entityId: { contains: 'maria', mode: 'insensitive' } },
          { user: { is: { name: { contains: 'maria', mode: 'insensitive' } } } },
        ]),
      }),
    }));
  });

  it('rejects invalid pagination and date ranges', async () => {
    await expect(service.findAll({ page: '0' })).rejects.toThrow(BadRequestException);
    await expect(service.findAll({ dateFrom: '2026-02-30' })).rejects.toThrow(BadRequestException);
    await expect(service.findAll({
      dateFrom: '2026-11-08',
      dateTo: '2026-11-07',
    })).rejects.toThrow(BadRequestException);
  });

  it('exports filtered audit entries as formula-safe CSV', async () => {
    prisma.auditLog.findMany.mockResolvedValue([{
      createdAt: new Date('2026-11-07T12:00:00.000Z'),
      user: { name: '=2+2', email: 'user@example.com' },
      action: 'CREATE',
      entity: 'Client',
      entityId: 'id,"quoted"',
    }]);

    const csv = await service.exportCsv({ search: 'quoted' });

    expect(csv).toContain("\"'=2+2\"");
    expect(csv).toContain('"id,""quoted"""');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { entityId: { contains: 'quoted', mode: 'insensitive' } },
        ]),
      }),
    }));
  });

  it('exports filtered entries as Excel or PDF using the shared report renderer', async () => {
    const entries = [{
      createdAt: new Date('2026-11-07T12:00:00.000Z'),
      user: { name: 'Maria', email: 'maria@example.com' },
      action: 'UPDATE',
      entity: 'Client',
      entityId: 'client-id',
    }];
    prisma.auditLog.findMany.mockResolvedValue(entries);
    reportFiles.toExcel.mockResolvedValue(Buffer.from('xlsx'));
    reportFiles.toPdf.mockResolvedValue(Buffer.from('%PDF'));

    await expect(service.exportFile({ entity: 'Client' }, 'xlsx'))
      .resolves.toEqual(Buffer.from('xlsx'));
    expect(reportFiles.toExcel).toHaveBeenCalledWith([expect.objectContaining({
      name: 'Auditoría',
      rows: [[
        '2026-11-07T12:00:00.000Z',
        'Maria',
        'maria@example.com',
        'UPDATE',
        'Client',
        'client-id',
      ]],
    })]);

    await expect(service.exportFile({ userId: 'user-id' }, 'pdf'))
      .resolves.toEqual(Buffer.from('%PDF'));
    expect(reportFiles.toPdf).toHaveBeenCalledWith(
      'Registro de auditoría',
      [expect.objectContaining({ name: 'Auditoría' })],
    );
  });

  it('lists only users represented in the audit history', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Maria' }]);

    await expect(service.findUsers()).resolves.toEqual([{ id: 'user-1', name: 'Maria' }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
});
