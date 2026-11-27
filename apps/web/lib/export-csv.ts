/**
 * Escapes a CSV cell. Values starting with = + - @ TAB or CR are prefixed with a quote so
 * spreadsheet apps treat them as text (prevents CSV/formula injection, e.g. =HYPERLINK(...)).
 * Pure numbers (including negatives like -12.5) are left untouched.
 */
export function escapeCsvCell(val: string | number | null | undefined): string {
  let str = String(val ?? '');
  const isNumber = typeof val === 'number' || /^-?\d+(\.\d+)?$/.test(str);
  if (!isNumber && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join(
    '\n',
  );
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
