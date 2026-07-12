import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Observation } from '../shared/types.js';

export function createObservationStore(path: string) {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_row INTEGER NOT NULL,
      date TEXT NOT NULL,
      customer TEXT NOT NULL,
      product TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      imported_at TEXT NOT NULL
    )
  `);

  function replaceObservations(rows: Omit<Observation, 'id' | 'importedAt'>[]): number {
  const insert = database.prepare(`
    INSERT INTO observations (source_row, date, customer, product, quantity, unit_price, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const importedAt = new Date().toISOString();
  database.exec('BEGIN');
  try {
    database.exec('DELETE FROM observations');
    database.exec("DELETE FROM sqlite_sequence WHERE name = 'observations'");
    for (const row of rows) {
      insert.run(row.sourceRow, row.date, row.customer, row.product, row.quantity, row.unitPrice, importedAt);
    }
    database.exec('COMMIT');
    return rows.length;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  }

  function listObservations(customer?: string, product?: string): Observation[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (customer) { clauses.push('customer = ?'); values.push(customer); }
  if (product) { clauses.push('product = ?'); values.push(product); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = database.prepare(`SELECT id, source_row, date, customer, product, quantity, unit_price, imported_at FROM observations ${where} ORDER BY date, id`).all(...values) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id), sourceRow: Number(row.source_row), date: String(row.date),
    customer: String(row.customer), product: String(row.product), quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price), importedAt: String(row.imported_at),
  }));
  }

  function listDimensions(): { customers: string[]; products: string[]; total: number } {
  const customers = database.prepare('SELECT DISTINCT customer FROM observations ORDER BY customer').all().map((row) => String((row as { customer: string }).customer));
  const products = database.prepare('SELECT DISTINCT product FROM observations ORDER BY product').all().map((row) => String((row as { product: string }).product));
  const total = Number((database.prepare('SELECT COUNT(*) AS count FROM observations').get() as { count: number }).count);
  return { customers, products, total };
  }

  return { replaceObservations, listObservations, listDimensions, close: () => database.close() };
}

const store = createObservationStore(process.env.DATABASE_PATH ?? './data/pricing-lab.db');
export const replaceObservations = store.replaceObservations;
export const listObservations = store.listObservations;
export const listDimensions = store.listDimensions;
