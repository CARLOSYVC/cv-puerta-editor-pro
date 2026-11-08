import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { AuditLogController } from './audit-log.controller.js';

describe('AuditLogController', () => {
  const service = {
    exportFile: vi.fn(),
  };
  const responseMock = {
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
  const response = responseMock as unknown as Response;
  const controller = new AuditLogController(service as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pdf', 'application/pdf'],
    ['csv', 'text/csv; charset=utf-8'],
  ])('sets attachment headers for %s exports', async (format, contentType) => {
    const content = Buffer.from('report');
    service.exportFile.mockResolvedValue(content);

    await controller.export({ entity: 'Client', format }, response);

    expect(service.exportFile).toHaveBeenCalledWith(
      { entity: 'Client' },
      format,
    );
    expect(responseMock.setHeader).toHaveBeenCalledWith('Content-Type', contentType);
    expect(responseMock.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="audit-log.${format}"`,
    );
    expect(responseMock.setHeader).toHaveBeenCalledWith('Content-Length', content.byteLength);
    expect(responseMock.send).toHaveBeenCalledWith(content);
  });

  it('keeps CSV as the default for older export callers', async () => {
    service.exportFile.mockResolvedValue(Buffer.from('csv'));

    await controller.export({ entityId: 'target-id' }, response);

    expect(service.exportFile).toHaveBeenCalledWith(
      { entityId: 'target-id' },
      'csv',
    );
  });

  it('rejects unsupported export formats', async () => {
    await expect(controller.export({ format: 'html' }, response))
      .rejects.toThrow(BadRequestException);
    expect(service.exportFile).not.toHaveBeenCalled();
  });
});
