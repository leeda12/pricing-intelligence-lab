import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, initializeDataset, type ObservationStore } from './app.js';
import type { AppConfig } from './config.js';
import { createObservationStore } from './database.js';

const directories: string[] = [];
const openStores = new Set<ObservationStore>();

function fixtureConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const directory = mkdtempSync(join(tmpdir(), 'pricing-app-'));
  directories.push(directory);
  const distPath = join(directory, 'dist');
  mkdirSync(join(distPath, 'assets'), { recursive: true });
  writeFileSync(join(distPath, 'index.html'), '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>');
  writeFileSync(join(distPath, 'assets', 'app.js'), 'globalThis.__APP_LOADED__ = true;');
  return {
    nodeEnv: 'test', allowImports: true, port: 3001,
    databasePath: join(directory, 'pricing.db'), distPath,
    sampleCsvPath: resolve('sample-data/SYNTHETIC_SAMPLE_pricing_history.csv'),
    ...overrides,
  };
}

function openStore(path: string): ObservationStore {
  const store = createObservationStore(path);
  openStores.add(store);
  return store;
}

function closeStore(store: ObservationStore) {
  store.close();
  openStores.delete(store);
}

afterEach(() => {
  for (const store of openStores) store.close();
  openStores.clear();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('production single-service application', () => {
  it('serves the SPA, production assets, health endpoint, and JSON API 404s', async () => {
    const config = fixtureConfig({ nodeEnv: 'production', allowImports: false });
    const store = openStore(config.databasePath);
    initializeDataset(config, store);
    const app = createApp(config, store);

    await request(app).get('/').expect(200).expect('Content-Type', /html/);
    await request(app).get('/assets/app.js').expect(200).expect('Content-Type', /javascript/);
    await request(app).get('/api/health').expect(200, { status: 'ok' });
    await request(app).get('/api/does-not-exist').expect('Content-Type', /json/).expect(404, { error: 'API route not found.' });
  });

  it('disables production import controls and rejects every import request', async () => {
    const config = fixtureConfig({ nodeEnv: 'production', allowImports: false });
    const store = openStore(config.databasePath);
    initializeDataset(config, store);
    const app = createApp(config, store);

    await request(app).get('/api/config').expect(200, { allowImports: false, publicDemo: true });
    await request(app).post('/api/import').attach('file', Buffer.from('not,csv'), 'input.csv').expect(403, { error: 'Data uploads are disabled in the public portfolio demo.' });
    await request(app).get('/api/import').expect(403, { error: 'Data uploads are disabled in the public portfolio demo.' });
  });

  it('seeds the fictional dataset only when the database is empty', () => {
    const config = fixtureConfig({ nodeEnv: 'production', allowImports: false });
    const store = openStore(config.databasePath);
    expect(initializeDataset(config, store)).toBe(true);
    expect(store.listDimensions().total).toBe(20);
    expect(initializeDataset(config, store)).toBe(false);
    expect(store.listDimensions().total).toBe(20);
  });

  it('does not overwrite an existing persistent dataset during restart', () => {
    const config = fixtureConfig({ nodeEnv: 'production', allowImports: false });
    const original = openStore(config.databasePath);
    original.replaceObservations([{ sourceRow: 2, date: '2025-01-01', customer: 'Existing Fictional Customer', product: 'Existing Product', quantity: 4, unitPrice: 19 }]);
    closeStore(original);

    const restarted = openStore(config.databasePath);
    expect(initializeDataset(config, restarted)).toBe(false);
    expect(restarted.listObservations()).toHaveLength(1);
    expect(restarted.listObservations()[0].customer).toBe('Existing Fictional Customer');
  });

  it('preserves the previous valid dataset after a failed local import', async () => {
    const config = fixtureConfig({ nodeEnv: 'development', allowImports: true });
    const store = openStore(config.databasePath);
    store.replaceObservations([{ sourceRow: 2, date: '2025-01-01', customer: 'Previous Fictional Customer', product: 'Previous Product', quantity: 4, unitPrice: 19 }]);
    const app = createApp(config, store);
    const invalid = 'date,customer,product,quantity,unit_price\n2025-02-30,A,B,1,10';

    await request(app).post('/api/import').attach('file', Buffer.from(invalid), 'invalid.csv').expect(422);
    expect(store.listObservations()).toHaveLength(1);
    expect(store.listObservations()[0].customer).toBe('Previous Fictional Customer');
  });

  it('keeps aggregate exploration recommendation-free and preserves cohort analysis', async () => {
    const config = fixtureConfig({ nodeEnv: 'production', allowImports: false });
    const store = openStore(config.databasePath);
    initializeDataset(config, store);
    const app = createApp(config, store);

    const aggregate = await request(app).get('/api/analysis').expect(200);
    expect(aggregate.body.recommendationEligible).toBe(false);
    expect(aggregate.body.regression).toBeNull();
    expect(aggregate.body.observations).toHaveLength(20);

    const cohort = await request(app).get('/api/analysis').query({ customer: 'Northstar Outfitters', product: 'Atlas Widget', excludeOutliers: 'true' }).expect(200);
    expect(cohort.body.recommendationEligible).toBe(true);
    expect(cohort.body.observations).toHaveLength(10);
    expect(cohort.body.includedObservations).toHaveLength(9);
    expect(cohort.body.excludedObservations).toHaveLength(1);
    expect(cohort.body.regression.predictedPrice).toBeCloseTo(22.85, 2);
  });
});
