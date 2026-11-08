import ExcelJS from 'exceljs';
import { ReportFileService } from './report-file.service.js';

describe('ReportFileService', () => {
  const service = new ReportFileService();

  it('creates an XLSX workbook with a header and rows', async () => {
    const buffer = await service.toExcel([
      {
        name: 'Existencias',
        columns: ['Material', 'Stock'],
        rows: [['Acero', 12]],
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.getWorksheet('Existencias')?.getRow(2).values).toEqual([
      undefined,
      'Acero',
      12,
    ]);
  });

  it('creates a valid PDF document', async () => {
    const buffer = await service.toPdf('Inventario', [
      { name: 'Existencias', columns: ['Material'], rows: [['Acero']] },
    ]);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
