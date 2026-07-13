import { resolve } from 'node:path';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  allowImports: boolean;
  port: number;
  databasePath: string;
  distPath: string;
  sampleCsvPath: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = environment.NODE_ENV === 'production' ? 'production' : environment.NODE_ENV === 'test' ? 'test' : 'development';
  const allowImports = environment.ALLOW_IMPORTS === undefined
    ? nodeEnv !== 'production'
    : environment.ALLOW_IMPORTS.toLowerCase() === 'true';
  const port = Number(environment.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');

  return {
    nodeEnv,
    allowImports,
    port,
    databasePath: resolve(environment.DATABASE_PATH ?? './data/pricing-lab.db'),
    distPath: resolve('./dist'),
    sampleCsvPath: resolve('./sample-data/SYNTHETIC_SAMPLE_pricing_history.csv'),
  };
}
