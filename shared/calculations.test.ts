import { describe, expect, it } from 'vitest';
import { identifyOutliers, linearRegression } from './calculations.js';
import type { Observation } from './types.js';

const row = (id: number, date: string, unitPrice: number): Observation => ({ id, sourceRow: id + 1, date, customer: 'Northstar Outfitters', product: 'Atlas Widget', quantity: 10, unitPrice, importedAt: '2026-01-01T00:00:00Z' });

describe('linearRegression', () => {
  it('fits a rising price trend and predicts the following year', () => {
    const result = linearRegression([row(1, '2022-01-01', 10), row(2, '2023-01-01', 12), row(3, '2024-01-01', 14)]);
    expect(result).not.toBeNull();
    expect(result!.predictionYear).toBe(2025);
    expect(result!.predictedPrice).toBeCloseTo(16, 1);
    expect(result!.rSquared).toBeCloseTo(1, 4);
  });
  it('returns null with fewer than two observations', () => expect(linearRegression([row(1, '2024-01-01', 10)])).toBeNull());
});

describe('identifyOutliers', () => {
  it('discloses an extreme observation without mutating the source array', () => {
    const observations = [row(1, '2020-01-01', 10), row(2, '2021-01-01', 11), row(3, '2022-01-01', 12), row(4, '2023-01-01', 13), row(5, '2024-01-01', 100)];
    const result = identifyOutliers(observations);
    expect(result.excluded.map((item) => item.id)).toEqual([5]);
    expect(result.included).toHaveLength(4);
    expect(observations).toHaveLength(5);
  });
});
