import {
  cleanId,
  decideAction,
  evaluateReopenDecision,
  parseAmount,
  parseDate,
  resolveColumns,
} from './reopen-rules';
import type { ParsedAttachment } from './support-email.types';

function attachmentFromRows(
  rows: Record<string, string>[],
  columns?: string[],
): ParsedAttachment {
  return {
    filename: 'report.csv',
    mimeType: 'text/csv',
    sizeBytes: 100,
    format: 'csv',
    columns: columns ?? Object.keys(rows[0] ?? {}),
    rows,
    rowCount: rows.length,
  };
}

describe('parseAmount', () => {
  it('reads plain numbers', () => {
    expect(parseAmount(12.5)).toBe(12.5);
    expect(parseAmount('12.5')).toBe(12.5);
  });

  it('reads currency-formatted strings', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('USD 12.5')).toBe(12.5);
  });

  it('reads accounting-notation negatives', () => {
    expect(parseAmount('(12.50)')).toBe(-12.5);
  });

  it('returns null for blank / unreadable values', () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
  });
});

describe('cleanId', () => {
  it('strips Excel number-format separators and decimal tails', () => {
    expect(cleanId('6,377,849.00')).toBe('6377849');
    expect(cleanId(' 123 ')).toBe('123');
  });

  it('leaves non-numeric values untouched', () => {
    expect(cleanId('ABC-123')).toBe('ABC-123');
  });

  it('returns an empty string for nullish input', () => {
    expect(cleanId(null)).toBe('');
    expect(cleanId(undefined)).toBe('');
  });
});

describe('parseDate', () => {
  it('reads ISO dates, tolerating a trailing time', () => {
    expect(parseDate('2026-04-26')?.toISOString().slice(0, 10)).toBe(
      '2026-04-26',
    );
    expect(parseDate('2026-04-23T08:53:16')?.toISOString().slice(0, 10)).toBe(
      '2026-04-23',
    );
  });

  it('reads US month-first dates with 2- or 4-digit years', () => {
    expect(parseDate('4/26/2026')?.toISOString().slice(0, 10)).toBe(
      '2026-04-26',
    );
    expect(parseDate('4/26/26')?.toISOString().slice(0, 10)).toBe(
      '2026-04-26',
    );
  });

  it('pivots two-digit years at 70', () => {
    expect(parseDate('1/1/69')?.getUTCFullYear()).toBe(2069);
    expect(parseDate('1/1/70')?.getUTCFullYear()).toBe(1970);
  });

  it('swaps day/month when the first component cannot be a month', () => {
    expect(parseDate('26.04.2026')?.toISOString().slice(0, 10)).toBe(
      '2026-04-26',
    );
  });

  it('reads named-month formats in either order', () => {
    expect(parseDate('April 21, 2026')?.toISOString().slice(0, 10)).toBe(
      '2026-04-21',
    );
    expect(parseDate('21 Apr 2026')?.toISOString().slice(0, 10)).toBe(
      '2026-04-21',
    );
  });

  it('reads Excel serial numbers', () => {
    // Serial 46000 -> days since 1899-12-30
    expect(parseDate(46000)?.toISOString().slice(0, 10)).toBe('2025-12-09');
  });

  it('rejects rolled-over and unreadable dates', () => {
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('resolveColumns', () => {
  it('matches header spellings ignoring case and separators', () => {
    const columns = resolveColumns([
      'Hotel ID',
      'Booking-No',
      'Check Out Date',
      'Booking Matched Status Name',
      'USD Total Include GST',
    ]);

    expect(columns.hotelId).toBe('Hotel ID');
    expect(columns.bookingId).toBe('Booking-No');
    expect(columns.checkoutDate).toBe('Check Out Date');
    expect(columns.matchedStatus).toBe('Booking Matched Status Name');
    expect(columns.amount).toBe('USD Total Include GST');
  });

  it('reads Type 1 (LP(USD)) amount only when there is no matched-status column', () => {
    const columns = resolveColumns([
      'Booking ID',
      'Payment Status',
      'LP(USD)',
    ]);
    expect(columns.amount).toBe('LP(USD)');
  });
});

describe('decideAction — checkout window', () => {
  it('skips rows past the 150-day checkout limit regardless of layout', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const headers = ['Booking ID', 'Checkout Date', 'Payment Status', 'LP(USD)'];
    const row = {
      'Booking ID': '1',
      'Checkout Date': '2026-01-01',
      'Payment Status': 'Pending Collection',
      'LP(USD)': '50',
    };

    const verdict = decideAction(headers, row, now);
    expect(verdict.action).toBe('SKIP');
    expect(verdict.reason).toMatch(/Checkout \d+ days ago/);
  });
});

describe('decideAction — Type 2 (Booking Matched Status)', () => {
  const headers = [
    'Booking ID',
    'Booking Matched Status Name',
    'USD Total Include GST',
  ];

  it('collects an unpaid, above-minimum amount', () => {
    const row = {
      'Booking ID': '1',
      'Booking Matched Status Name': 'Open',
      'USD Total Include GST': '25.00',
    };
    expect(decideAction(headers, row).action).toBe('COLLECT');
  });

  it('reopens when unpaid but the amount is blank', () => {
    const row = {
      'Booking ID': '1',
      'Booking Matched Status Name': 'Matched Under',
      'USD Total Include GST': '',
    };
    expect(decideAction(headers, row).action).toBe('REOPEN');
  });

  it('skips rows already matched (paid)', () => {
    const row = {
      'Booking ID': '1',
      'Booking Matched Status Name': 'Matched',
      'USD Total Include GST': '25.00',
    };
    expect(decideAction(headers, row).action).toBe('SKIP');
  });

  it('skips amounts below the minimum', () => {
    const row = {
      'Booking ID': '1',
      'Booking Matched Status Name': 'Open',
      'USD Total Include GST': '1.00',
    };
    expect(decideAction(headers, row).action).toBe('SKIP');
  });
});

describe('decideAction — Type 1 (Payment Status)', () => {
  it('skips already-paid rows', () => {
    const headers = ['Booking ID', 'Payment Status', 'LP(USD)'];
    const row = { 'Booking ID': '1', 'Payment Status': 'Paid', 'LP(USD)': '30' };
    expect(decideAction(headers, row).action).toBe('SKIP');
  });

  it('requires Pending Collection + Departed when a booking-status column exists', () => {
    const headers = ['Booking ID', 'Payment Status', 'Booking Status', 'LP(USD)'];

    const cancelled = decideAction(headers, {
      'Booking ID': '1',
      'Payment Status': 'Pending Collection',
      'Booking Status': 'Cxl by Customer',
      'LP(USD)': '30',
    });
    expect(cancelled.action).toBe('SKIP');

    const departed = decideAction(headers, {
      'Booking ID': '1',
      'Payment Status': 'Pending Collection',
      'Booking Status': 'Departed',
      'LP(USD)': '30',
    });
    expect(departed.action).toBe('COLLECT');
  });

  it('collects on Pending Collection alone when there is no booking-status column', () => {
    const headers = ['Booking ID', 'Payment Status', 'LP(USD)'];
    const row = {
      'Booking ID': '1',
      'Payment Status': 'Pending Collection',
      'LP(USD)': '30',
    };
    expect(decideAction(headers, row).action).toBe('COLLECT');
  });

  it('reopens Pending Collection rows with no LP(USD) column', () => {
    const headers = ['Booking ID', 'Payment Status'];
    const row = { 'Booking ID': '1', 'Payment Status': 'Pending Collection' };
    expect(decideAction(headers, row).action).toBe('REOPEN');
  });
});

describe('evaluateReopenDecision', () => {
  it('detects the sheet type and rolls up collect/reopen/skip buckets', () => {
    const attachment = attachmentFromRows([
      {
        'Hotel ID': '2462187',
        'Booking ID': '608820319',
        'Booking Matched Status Name': 'Open',
        'USD Total Include GST': '25.00',
      },
      {
        'Hotel ID': '2462187',
        'Booking ID': '590948995',
        'Booking Matched Status Name': 'Matched Under',
        'USD Total Include GST': '',
      },
      {
        'Hotel ID': '2462187',
        'Booking ID': '919720506',
        'Booking Matched Status Name': 'Matched',
        'USD Total Include GST': '10.00',
      },
    ]);

    const decision = evaluateReopenDecision(attachment, {
      agodaId: '2462187',
    });

    expect(decision.sheetType).toBe('booking_matched_status');
    expect(decision.collect.map((row) => row.bookingId)).toEqual([
      '608820319',
    ]);
    expect(decision.reopen.map((row) => row.bookingId)).toEqual([
      '590948995',
    ]);
    expect(decision.skipped.map((row) => row.bookingId)).toEqual([
      '919720506',
    ]);
    expect(decision.shouldReopen).toBe(true);
  });

  it('skips rows belonging to a different hotel, comparing IDs numerically', () => {
    const attachment = attachmentFromRows([
      {
        'Hotel ID': '6,377,849.00',
        'Booking ID': '1',
        'Booking Matched Status Name': 'Open',
        'USD Total Include GST': '25.00',
      },
    ]);

    const decision = evaluateReopenDecision(attachment, {
      agodaId: '9999999',
    });

    expect(decision.skipped).toHaveLength(1);
    expect(decision.skipped[0].reason).toMatch(/does not match property Agoda ID/);
    expect(decision.shouldReopen).toBe(false);
  });

  it('returns an empty, non-reopening decision for unparseable attachments', () => {
    const attachment: ParsedAttachment = {
      filename: 'broken.csv',
      mimeType: 'text/csv',
      sizeBytes: 10,
      format: 'csv',
      columns: [],
      rows: [],
      rowCount: 0,
      parseError: 'boom',
    };

    const decision = evaluateReopenDecision(attachment);
    expect(decision.shouldReopen).toBe(false);
    expect(decision.collect).toHaveLength(0);
    expect(decision.reopen).toHaveLength(0);
  });
});
