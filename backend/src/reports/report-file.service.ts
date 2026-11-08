import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ReportCell = string | number | boolean | null;

export interface ReportSheet {
  name: string;
  columns: string[];
  rows: ReportCell[][];
}

@Injectable()
export class ReportFileService {
  async toExcel(sheets: ReportSheet[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Puerta Operations';
    workbook.created = new Date();

    for (const data of sheets) {
      const worksheet = workbook.addWorksheet(data.name.slice(0, 31));
      worksheet.addRow(data.columns);
      for (const row of data.rows) worksheet.addRow(row);
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: data.rows.length + 1, column: data.columns.length },
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF294D38' },
      };
      worksheet.columns = data.columns.map((column, index) => {
        const contentLength = Math.max(
          column.length,
          ...data.rows.map((row) => String(row[index] ?? '').length),
        );
        return { width: Math.min(Math.max(contentLength + 2, 12), 42) };
      });
    }

    const result = await workbook.xlsx.writeBuffer();
    return Buffer.from(result);
  }

  toPdf(title: string, sheets: ReportSheet[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 28, bottom: 28, left: 28, right: 28 },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      document.font('Helvetica-Bold').fontSize(18).fillColor('#294d38').text(title);
      document.moveDown(0.35);
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#758279')
        .text(`Generado ${new Intl.DateTimeFormat('es', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date())}`);

      for (const sheet of sheets) {
        document.moveDown(1);
        document.font('Helvetica-Bold').fontSize(12).fillColor('#29372f').text(sheet.name);
        document.moveDown(0.35);
        this.writePdfTable(document, sheet);
      }

      document.end();
    });
  }

  private writePdfTable(
    document: PDFKit.PDFDocument,
    sheet: ReportSheet,
  ): void {
    const left = document.page.margins.left;
    const tableWidth =
      document.page.width - document.page.margins.left - document.page.margins.right;
    const columnWidth = tableWidth / sheet.columns.length;
    const rowHeight = 24;
    let y = document.y;

    const drawHeader = () => {
      document.rect(left, y, tableWidth, rowHeight).fill('#294d38');
      sheet.columns.forEach((column, index) => {
        document
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor('#ffffff')
          .text(column.slice(0, 42), left + index * columnWidth + 4, y + 7, {
            width: columnWidth - 8,
            height: rowHeight - 8,
            ellipsis: true,
          });
      });
      y += rowHeight;
    };

    drawHeader();
    for (const [rowIndex, row] of sheet.rows.entries()) {
      const cells = sheet.columns.map((_, index) =>
        String(row[index] ?? '').replace(/\s+/g, ' ').slice(0, 160),
      );
      document.font('Helvetica').fontSize(7);
      const height = Math.max(
        rowHeight,
        ...cells.map((cell) =>
          document.heightOfString(cell, {
            width: columnWidth - 8,
          }) + 8,
        ),
      );
      if (y + height > document.page.height - document.page.margins.bottom) {
        document.addPage();
        y = document.page.margins.top;
        drawHeader();
      }

      if (rowIndex % 2 === 1) {
        document.rect(left, y, tableWidth, height).fill('#f2f5f0');
      }
      document
        .rect(left, y, tableWidth, height)
        .lineWidth(0.35)
        .stroke('#dfe5dd');
      cells.forEach((cell, index) => {
        document
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#29372f')
          .text(cell, left + index * columnWidth + 4, y + 4, {
            width: columnWidth - 8,
            height: height - 8,
            ellipsis: true,
          });
      });
      y += height;
    }
    document.y = y;
  }
}
