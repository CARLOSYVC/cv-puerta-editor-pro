import { useState } from 'react'

export type ExportValue = string | number | boolean | null

export interface ExportSheet {
  name: string
  columns: string[]
  rows: ExportValue[][]
}

interface DataExportActionsProps {
  fileName: string
  sheets: ExportSheet[]
  loadSheets?: () => Promise<ExportSheet[]>
}

function escapeHtml(value: ExportValue): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function safeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'reporte'
}

async function exportExcel(fileName: string, sheets: ExportSheet[]): Promise<void> {
  const ExcelModule = await import('exceljs')
  const workbook = new ExcelModule.default.Workbook()
  workbook.creator = 'Puerta Operations'
  workbook.created = new Date()

  for (const data of sheets) {
    const sheet = workbook.addWorksheet(data.name.slice(0, 31))
    sheet.addRow(data.columns)
    for (const row of data.rows) sheet.addRow(row)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: data.columns.length },
    }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF294D38' },
    }
    sheet.columns = data.columns.map((column, index) => {
      const maxCellLength = Math.max(
        column.length,
        ...data.rows.map((row) => String(row[index] ?? '').length),
      )
      return { width: Math.min(Math.max(maxCellLength + 2, 12), 42) }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  download(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${safeFileName(fileName)}.xlsx`,
  )
}

function openPdfPrint(
  fileName: string,
  sheets: ExportSheet[],
  popup = window.open('', '_blank'),
): void {
  if (!popup) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.')
  }

  const tables = sheets.map((sheet) => `
    <section>
      <h2>${escapeHtml(sheet.name)}</h2>
      <table>
        <thead><tr>${sheet.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>${sheet.rows.map((row) => `<tr>${sheet.columns.map((_, index) => `<td>${escapeHtml(row[index] ?? null)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>
  `).join('')

  popup.document.open()
  popup.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(fileName)}</title>
        <style>
          @page { size: landscape; margin: 14mm; }
          body { color: #29372f; font: 10px Arial, sans-serif; }
          h1 { font-size: 19px; margin: 0 0 5px; }
          h2 { font-size: 14px; margin: 22px 0 8px; }
          p { color: #758279; margin: 0 0 14px; }
          table { border-collapse: collapse; table-layout: auto; width: 100%; }
          th, td { border: 1px solid #dfe5dd; padding: 5px 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { background: #294d38; color: white; }
          tr { break-inside: avoid; }
          section { break-inside: auto; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(fileName)}</h1>
        <p>Generado ${escapeHtml(new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()))}</p>
        ${tables}
        <script>window.addEventListener('load', () => window.print(), { once: true })</script>
      </body>
    </html>`)
  popup.document.close()
}

export function DataExportActions({
  fileName,
  sheets,
  loadSheets,
}: DataExportActionsProps) {
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const hasData = Boolean(loadSheets) || sheets.some((sheet) => sheet.rows.length > 0)

  async function handleExcelExport() {
    setError('')
    setExporting(true)
    try {
      await exportExcel(fileName, loadSheets ? await loadSheets() : sheets)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el archivo Excel.')
    } finally {
      setExporting(false)
    }
  }

  function handlePdfExport() {
    setError('')
    if (loadSheets) {
      const popup = window.open('', '_blank')
      if (!popup) {
        setError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.')
        return
      }
      setExporting(true)
      void loadSheets()
        .then((allSheets) => openPdfPrint(fileName, allSheets, popup))
        .catch((cause: unknown) => {
          popup.close()
          setError(cause instanceof Error ? cause.message : 'No se pudo preparar el PDF.')
        })
        .finally(() => setExporting(false))
      return
    }
    try {
      openPdfPrint(fileName, sheets)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la vista para PDF.')
    }
  }

  return (
    <div className="data-export">
      <div className="data-export-buttons">
        <button
          className="project-secondary-button"
          disabled={!hasData || exporting}
          onClick={() => void handleExcelExport()}
          type="button"
        >
          {exporting ? 'Generando…' : 'Exportar Excel'}
        </button>
        <button
          className="project-secondary-button"
          disabled={!hasData || exporting}
          onClick={handlePdfExport}
          title="Se abrirá la impresión del navegador; selecciona Guardar como PDF."
          type="button"
        >
          Exportar PDF
        </button>
      </div>
      {error && <span className="data-export-error" role="alert">{error}</span>}
    </div>
  )
}
