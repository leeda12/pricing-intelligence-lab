import type { Observation, OutlierResult, RegressionResult } from './types.js';

export function linearRegression(observations: Observation[]): RegressionResult | null {
  if (observations.length < 2) return null;
  const points = observations.map((row) => ({ x: decimalYear(row.date), y: row.unitPrice }));
  const meanX = average(points.map((point) => point.x));
  const meanY = average(points.map((point) => point.y));
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const residual = points.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
  const total = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const predictionYear = Math.max(...observations.map((row) => new Date(`${row.date}T00:00:00Z`).getUTCFullYear())) + 1;
  return {
    slope,
    intercept,
    rSquared: total === 0 ? 1 : 1 - residual / total,
    predictionYear,
    predictedPrice: slope * predictionYear + intercept,
    sampleCount: observations.length,
  };
}

export function identifyOutliers(observations: Observation[]): OutlierResult {
  if (observations.length < 4) {
    return { included: [...observations], excluded: [], lowerBound: -Infinity, upperBound: Infinity };
  }
  const prices = observations.map((row) => row.unitPrice).sort((a, b) => a - b);
  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  return {
    included: observations.filter((row) => row.unitPrice >= lowerBound && row.unitPrice <= upperBound),
    excluded: observations.filter((row) => row.unitPrice < lowerBound || row.unitPrice > upperBound),
    lowerBound,
    upperBound,
  };
}

function decimalYear(date: string): number {
  const parsed = new Date(`${date}T00:00:00Z`);
  const year = parsed.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (parsed.getTime() - start) / (end - start);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: number[], value: number): number {
  const index = (sorted.length - 1) * value;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}
