import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Observation } from '../shared/types.js';

export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_ROWS = 10_000;
export const CSV_HEADERS = ['date', 'customer', 'product', 'quantity', 'unit_price'] as const;

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must use YYYY-MM-DD').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'must be a real calendar date');

const csvRow = z.object({
  date: calendarDate,
  customer: z.string().trim().min(1).max(100),
  product: z.string().trim().min(1).max(100),
  quantity: z.coerce.number().finite().positive().max(1_000_000_000),
  unit_price: z.coerce.number().finite().positive().max(1_000_000_000),
});

export class CsvInputError extends Error {
  constructor(public readonly status: 400 | 413 | 422, message: string, public readonly details?: string[]) {
    super(message);
  }
}

export function parsePricingCsv(buffer: Buffer): Omit<Observation, 'id' | 'importedAt'>[] {
  if (buffer.length > MAX_CSV_BYTES) throw new CsvInputError(413, 'The CSV file exceeds the 2 MB upload limit.');
  let records: string[][];
  try {
    records = parse(buffer, { bom: true, skip_empty_lines: true, trim: true, relax_column_count: false }) as string[][];
  } catch {
    throw new CsvInputError(400, 'The CSV file could not be parsed.');
  }
  if (!records.length) throw new CsvInputError(400, 'The CSV contains no header or data rows.');
  const headers = records[0];
  if (headers.length !== CSV_HEADERS.length || headers.some((header, index) => header !== CSV_HEADERS[index])) {
    throw new CsvInputError(422, `CSV headers must be exactly: ${CSV_HEADERS.join(',')}.`);
  }
  const dataRows = records.slice(1);
  if (!dataRows.length) throw new CsvInputError(400, 'The CSV contains no data rows.');
  if (dataRows.length > MAX_CSV_ROWS) throw new CsvInputError(413, `The CSV exceeds the ${MAX_CSV_ROWS.toLocaleString('en-US')} row limit.`);

  const errors: string[] = [];
  const rows = dataRows.flatMap((record, index) => {
    const raw = Object.fromEntries(CSV_HEADERS.map((header, column) => [header, record[column]]));
    const result = csvRow.safeParse(raw);
    if (!result.success) {
      errors.push(`Row ${index + 2}: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(', ')}`);
      return [];
    }
    return [{
      sourceRow: index + 2,
      date: result.data.date,
      customer: result.data.customer,
      product: result.data.product,
      quantity: result.data.quantity,
      unitPrice: result.data.unit_price,
    }];
  });
  if (errors.length) throw new CsvInputError(422, 'CSV validation failed.', errors.slice(0, 20));
  return rows;
}
