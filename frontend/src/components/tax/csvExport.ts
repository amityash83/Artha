// CSV downloads for the Tax Planner. Every export is built from the same computed results
// the screens show, so a downloaded file always matches what you saw.

export type CsvCell = string | number | null | undefined;

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map((cell) => {
    if (cell === null || cell === undefined) return '';
    const text = typeof cell === 'number' ? String(Math.round(cell * 100) / 100) : cell;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\n');
}

export function downloadCsv(fileName: string, rows: CsvCell[][]): void {
  // BOM so Excel opens ₹ and other non-ASCII text correctly.
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
