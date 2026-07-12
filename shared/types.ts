export interface Observation {
  id: number;
  sourceRow: number;
  date: string;
  customer: string;
  product: string;
  quantity: number;
  unitPrice: number;
  importedAt: string;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predictionYear: number;
  predictedPrice: number;
  sampleCount: number;
}

export interface OutlierResult {
  included: Observation[];
  excluded: Observation[];
  lowerBound: number;
  upperBound: number;
}

export interface AnalysisResponse {
  observations: Observation[];
  includedObservations: Observation[];
  excludedObservations: Observation[];
  regression: RegressionResult | null;
  outlierBounds: { lower: number; upper: number } | null;
}
