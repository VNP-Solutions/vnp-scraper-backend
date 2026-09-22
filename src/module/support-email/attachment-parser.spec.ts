import * as XLSX from 'xlsx';
import {
  findHeaderRowIndex,
  parseAttachmentBuffer,
} from './attachment-parser.service';
import { evaluateReopenDecision } from './reopen-rules';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsxBufferFromGrid(grid: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Mirrors `HID_2466996_Open_Payment_Report.xlsx`: a title row, an instruction
 * row listing the submitted booking IDs, blank spacers, and only then the
 * header — all indented two columns to the right.
 */
const AGED_BOOKING_REPORT_GRID: unknown[][] = [
  [],
  ['', 'Aged Booking Product Decision Report'],
  [],
  ['', '', 'Booking ID (Enter Booking ID separate ID by ,): 673627267,965314174'],
  [],
  [],
  [],
  [
    '',
    '',
    '',
    'Hotel ID',
    'Booking ID',
    'Booking Date',
    'Checkout Date',
    'Booking Matched Status Name',
    'Supplier Local Currency',
    'USD Total Include GST',
  ],
  ['', '', '', '2466996', '673627267', '2026-06-01', '2026-07-11', 'Matched-under', 'THB', '327.36'],
  ['', '', '', '2466996', '965314174', '2026-04-02', '2026-05-17', 'Matched', 'THB', '88.00'],
  ['', '', '', '2466996', '674573379', '2026-07-02', '2026-08-20', 'Matched-under', 'THB', '16.17'],
];

describe('findHeaderRowIndex', () => {
  it('skips title and instruction rows to reach the real header', () => {
    expect(findHeaderRowIndex(AGED_BOOKING_REPORT_GRID)).toBe(7);
  });

  it('is not fooled by the instruction line quoting a column name', () => {
    // Row 0 says "Booking ID (Enter Booking ID separate ID by ,)"; the header
    // on row 1 has more recognizable columns and must win.
    expect(
      findHeaderRowIndex([
        ['Booking ID (Enter Booking ID separate ID by ,): 673627267,965314174'],
        ['Hotel ID', 'Booking ID', 'Checkout Date'],
        ['2466996', '673627267', '2026-07-11'],
      ]),
    ).toBe(1);
  });

  it('finds a header whose names have drifted', () => {
    expect(
      findHeaderRowIndex([
        ['Some Report Title'],
        ['Hotel ID (HID)', 'Booking ID No.', 'Checkout Date (Local Time)'],
        ['2466996', '673627267', '2026-07-11'],
      ]),
    ).toBe(1);
  });

  it('falls back to the first non-empty row when no column is recognized', () => {
    expect(
      findHeaderRowIndex([[], ['', ''], ['Some Title'], ['a', 'b']]),
    ).toBe(2);
  });

  it('returns 0 for an empty sheet', () => {
    expect(findHeaderRowIndex([])).toBe(0);
  });

  it('still finds a header sitting on the first row', () => {
    expect(
      findHeaderRowIndex([['Hotel ID', 'Booking ID'], ['1', '2']]),
    ).toBe(0);
  });
});

describe('parseAttachmentBuffer — Agoda report with preamble rows', () => {
  const attachment = parseAttachmentBuffer(
    'HID_2466996_Open_Payment_Report.xlsx',
    XLSX_MIME,
    xlsxBufferFromGrid(AGED_BOOKING_REPORT_GRID),
  );

  it('parses without error', () => {
    expect(attachment.parseError).toBeUndefined();
    expect(attachment.format).toBe('xlsx');
  });

  it('reads the real header instead of the report title', () => {
    expect(attachment.columns).toContain('Hotel ID');
    expect(attachment.columns).toContain('Booking Matched Status Name');
    expect(attachment.columns).toContain('USD Total Include GST');
    expect(attachment.columns).not.toContain(
      'Aged Booking Product Decision Report',
    );
  });

  it('returns only the data rows beneath the header', () => {
    expect(attachment.rowCount).toBe(3);
  });

  it('resolves as a matched-status sheet and collects the unpaid rows', () => {
    const decision = evaluateReopenDecision(attachment, {
      agodaId: '2466996',
      // Pinned so the 150-day checkout cutoff cannot age the fixture out.
    }, { now: new Date('2026-09-01T00:00:00Z') });

    expect(decision.sheetType).toBe('booking_matched_status');
    expect(decision.detectedColumns.amount).toBe('USD Total Include GST');
    expect(decision.detectedColumns.currency).toBe('Supplier Local Currency');

    expect(decision.collect.map((r) => r.bookingId)).toEqual([
      '673627267',
      '674573379',
    ]);
    expect(decision.collect[0].amount).toBe(327.36);

    // `Matched` means Agoda already paid it, so it is not collectable.
    expect(decision.skipped.map((r) => r.bookingId)).toEqual(['965314174']);

    // Every unpaid row had a readable amount, so no case needs reopening.
    expect(decision.shouldReopen).toBe(false);
    expect(decision.reopen).toHaveLength(0);
  });
});
