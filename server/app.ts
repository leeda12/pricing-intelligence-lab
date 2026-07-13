import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { identifyOutliers, linearRegression } from '../shared/calculations.js';
import { isRecommendationEligible } from '../shared/eligibility.js';
import type { AppConfig } from './config.js';
import { CsvInputError, MAX_CSV_BYTES, parsePricingCsv } from './csv.js';
import type { createObservationStore } from './database.js';

export type ObservationStore = ReturnType<typeof createObservationStore>;

export function initializeDataset(config: AppConfig, store: ObservationStore): boolean {
  if (config.nodeEnv !== 'production' || config.allowImports) return false;
  const sampleRows = parsePricingCsv(readFileSync(config.sampleCsvPath));
  return store.seedIfEmpty(sampleRows);
}

export function createApp(config: AppConfig, store: ObservationStore) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES, files: 1 } });
  const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
  const importLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  let importQueue: Promise<void> = Promise.resolve();
  const serializeImport = <T>(task: () => T): Promise<T> => {
    const next = importQueue.then(task, task);
    importQueue = next.then(() => undefined, () => undefined);
    return next;
  };

  app.disable('x-powered-by');
  if (config.nodeEnv === 'production') app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api', apiLimiter);

  app.get('/api/config', (_request, response) => response.json({
    allowImports: config.allowImports,
    publicDemo: config.nodeEnv === 'production' && !config.allowImports,
  }));
  app.get('/api/dimensions', (_request, response) => response.json(store.listDimensions()));

  app.use('/api/import', (_request, response, next) => {
    if (!config.allowImports) return response.status(403).json({ error: 'Data uploads are disabled in the public portfolio demo.' });
    next();
  });
  app.post('/api/import', importLimiter, upload.single('file'), async (request, response, next) => {
    if (!request.file) return response.status(400).json({ error: 'Choose a CSV file to import.' });
    try {
      const rows = parsePricingCsv(request.file.buffer);
      const count = await serializeImport(() => store.replaceObservations(rows));
      return response.status(201).json({ message: `${count} original observations imported.`, count });
    } catch (error) {
      if (error instanceof CsvInputError) return response.status(error.status).json({ error: error.message, details: error.details });
      return next(error);
    }
  });

  app.get('/api/analysis', (request, response) => {
    const customer = typeof request.query.customer === 'string' ? request.query.customer : undefined;
    const product = typeof request.query.product === 'string' ? request.query.product : undefined;
    const excludeOutliers = request.query.excludeOutliers === 'true';
    const observations = store.listObservations(customer, product);
    const recommendationEligible = isRecommendationEligible(customer, product);
    if (!recommendationEligible) {
      return response.json({ recommendationEligible, observations, includedObservations: observations, excludedObservations: [], regression: null, outlierBounds: null });
    }
    const outliers = identifyOutliers(observations);
    const included = excludeOutliers ? outliers.included : observations;
    return response.json({
      recommendationEligible,
      observations,
      includedObservations: included,
      excludedObservations: excludeOutliers ? outliers.excluded : [],
      regression: linearRegression(included),
      outlierBounds: observations.length >= 4 ? { lower: outliers.lowerBound, upper: outliers.upperBound } : null,
    });
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }));

  app.use(express.static(config.distPath, { index: false, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
    const indexPath = join(config.distPath, 'index.html');
    if (!existsSync(indexPath)) return response.status(503).type('text').send('Frontend build is unavailable. Run npm run build before npm start.');
    return response.sendFile(indexPath);
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({ error: 'The CSV file exceeds the 2 MB upload limit.' });
    }
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return response.status(500).json({ error: 'The server encountered an unexpected error.' });
  });

  return app;
}
