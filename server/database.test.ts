import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { createObservationStore } from './database.js';

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('dataset replacement imports', () => {
  it('keeps exactly one current dataset when the same CSV is imported twice', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pricing-lab-'));
    temporaryDirectories.push(directory);
    const store = createObservationStore(join(directory, 'test.db'));
    const csv = readFileSync(resolve('sample-data/SYNTHETIC_SAMPLE_pricing_history.csv'));
    const parsed = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    const rows = parsed.map((row, index) => ({ sourceRow: index + 2, date: row.date, customer: row.customer, product: row.product, quantity: Number(row.quantity), unitPrice: Number(row.unit_price) }));

    expect(store.replaceObservations(rows)).toBe(20);
    expect(store.replaceObservations(rows)).toBe(20);
    expect(store.listDimensions().total).toBe(20);
    expect(store.listObservations('Northstar Outfitters', 'Atlas Widget')).toHaveLength(10);
    store.close();
  });

  it('rolls back and retains the previous dataset if replacement cannot complete', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pricing-lab-'));
    temporaryDirectories.push(directory);
    const store = createObservationStore(join(directory, 'test.db'));
    const validRows = [{ sourceRow: 2, date: '2025-01-01', customer: 'Northstar Outfitters', product: 'Atlas Widget', quantity: 10, unitPrice: 20 }];
    store.replaceObservations(validRows);

    expect(() => store.replaceObservations([{ ...validRows[0], quantity: Number.NaN }])).toThrow();
    expect(store.listObservations()).toHaveLength(1);
    expect(store.listObservations()[0].unitPrice).toBe(20);
    store.close();
  });
});
