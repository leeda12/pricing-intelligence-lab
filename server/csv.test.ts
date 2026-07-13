import { describe, expect, it } from 'vitest';
import { CsvInputError, MAX_CSV_BYTES, MAX_CSV_ROWS, parsePricingCsv } from './csv.js';

const header = 'date,customer,product,quantity,unit_price';

function expectStatus(csv: Buffer | string, status: number) {
  try {
    parsePricingCsv(Buffer.isBuffer(csv) ? csv : Buffer.from(csv));
    throw new Error('Expected CSV validation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(CsvInputError);
    expect((error as CsvInputError).status).toBe(status);
  }
}

describe('CSV import validation', () => {
  it('requires exact headers', () => expectStatus(`date,customer,product,unit_price,quantity\n2025-01-01,A,B,10,1`, 422));
  it('rejects impossible calendar dates', () => expectStatus(`${header}\n2025-02-30,A,B,1,10`, 422));
  it('limits customer and product lengths', () => expectStatus(`${header}\n2025-01-01,${'A'.repeat(101)},B,1,10`, 422));
  it('requires positive bounded quantities and prices', () => expectStatus(`${header}\n2025-01-01,A,B,0,1000000001`, 422));
  it('limits CSV row counts', () => {
    const rows = Array.from({ length: MAX_CSV_ROWS + 1 }, () => '2025-01-01,A,B,1,10');
    expectStatus(`${header}\n${rows.join('\n')}`, 413);
  });
  it('retains the 2 MB upload limit', () => expectStatus(Buffer.alloc(MAX_CSV_BYTES + 1, 65), 413));
});
