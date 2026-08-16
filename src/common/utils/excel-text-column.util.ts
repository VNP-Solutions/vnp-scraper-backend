import * as XLSX from 'xlsx';

/**
 * SheetJS infers `t: 'n'` from numeric JS values, which causes Excel to drop
 * leading zeroes and treat large card numbers / CVVs as scientific notation.
 * This helper forces a column to be plain text by writing each cell as
 * `{ t: 's', v: <string>, z: '@' }`.
 *
 * Pass the worksheet, the rows (in their original row order — index 0 is
 * the first DATA row, header row is implicit at sheet row 0), and the
 * EXACT header label of the column to convert.
 */
export function applyExcelTextColumnFormat(
  worksheet: XLSX.WorkSheet,
  dataRows: ReadonlyArray<Record<string, unknown>>,
  columnHeader: string,
): void {
  if (dataRows.length === 0) return;
  const columnIndex = Object.keys(dataRows[0]).indexOf(columnHeader);
  if (columnIndex < 0) return;

  for (let rowIndex = 0; rowIndex <= dataRows.length; rowIndex++) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    const cellValue =
      rowIndex === 0
        ? columnHeader
        : (() => {
            const raw = dataRows[rowIndex - 1][columnHeader];
            if (raw == null || raw === '') return '';
            return String(raw);
          })();
    worksheet[address] = { t: 's', v: cellValue, z: '@' };
  }
}
