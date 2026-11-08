import { BadRequestException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsController } from './reports.controller.js';

describe('ReportsController', () => {
  const reports = {
    exportInventory: vi.fn(),
    exportPurchases: vi.fn(),
    exportCosts: vi.fn(),
    exportProductionOrders: vi.fn(),
    exportPurchaseOrders: vi.fn(),
    exportProjectCosts: vi.fn(),
    exportExecutiveReport: vi.fn(),
  };
  const setHeader = vi.fn();
  const response = { setHeader } as unknown as Response;
  const controller = new ReportsController(reports as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported export formats', async () => {
    await expect(controller.exportInventory('csv', response)).rejects.toThrow(
      BadRequestException,
    );
    expect(reports.exportInventory).not.toHaveBeenCalled();
  });

  it('returns an XLSX attachment with download headers', async () => {
    reports.exportInventory.mockResolvedValue(Buffer.from('xlsx-data'));

    const result = await controller.exportInventory('xlsx', response);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(reports.exportInventory).toHaveBeenCalledWith('xlsx');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="inventario.xlsx"',
    );
  });

  it('returns a PDF attachment', async () => {
    reports.exportCosts.mockResolvedValue(Buffer.from('%PDF-'));

    const result = await controller.exportCosts('pdf', response);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="costos.pdf"',
    );
  });

  it('exports production orders, purchase orders, project costs, and executive reports', async () => {
    reports.exportProductionOrders.mockResolvedValue(Buffer.from('production'));
    reports.exportPurchaseOrders.mockResolvedValue(Buffer.from('purchases'));
    reports.exportProjectCosts.mockResolvedValue(Buffer.from('project-costs'));
    reports.exportExecutiveReport.mockResolvedValue(Buffer.from('executive'));

    await controller.exportProductionOrders('xlsx', response);
    await controller.exportPurchaseOrders('pdf', response);
    await controller.exportProjectCosts('xlsx', response);
    await controller.exportExecutiveReport('pdf', response);

    expect(reports.exportProductionOrders).toHaveBeenCalledWith('xlsx');
    expect(reports.exportPurchaseOrders).toHaveBeenCalledWith('pdf');
    expect(reports.exportProjectCosts).toHaveBeenCalledWith('xlsx');
    expect(reports.exportExecutiveReport).toHaveBeenCalledWith('pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="ordenes-produccion.xlsx"',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="ordenes-compra.pdf"',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="costos-proyecto.xlsx"',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="reporte-ejecutivo.pdf"',
    );
  });
});
