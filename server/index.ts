import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { identifyOutliers, linearRegression } from '../shared/calculations.js';
import { isRecommendationEligible } from '../shared/eligibility.js';
import { replaceObservations, listDimensions, listObservations } from './database.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2_000_000 } });
const port = Number(process.env.PORT ?? 3001);

const csvRow = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must use YYYY-MM-DD'),
  customer: z.string().trim().min(1), product: z.string().trim().min(1),
  quantity: z.coerce.number().positive(), unit_price: z.coerce.number().positive(),
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
app.get('/api/dimensions', (_request, response) => response.json(listDimensions()));

app.post('/api/import', upload.single('file'), (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose a CSV file to import.' });
  try {
    const parsed = parse(request.file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    if (!parsed.length) return response.status(400).json({ error: 'The CSV contains no data rows.' });
    const errors: string[] = [];
    const rows = parsed.flatMap((raw, index) => {
      const result = csvRow.safeParse(raw);
      if (!result.success) {
        errors.push(`Row ${index + 2}: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(', ')}`);
        return [];
      }
      return [{ sourceRow: index + 2, date: result.data.date, customer: result.data.customer, product: result.data.product, quantity: result.data.quantity, unitPrice: result.data.unit_price }];
    });
    if (errors.length) return response.status(422).json({ error: 'CSV validation failed.', details: errors.slice(0, 20) });
    const count = replaceObservations(rows);
    return response.status(201).json({ message: `${count} original observations imported.`, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse CSV.';
    return response.status(400).json({ error: 'Invalid CSV file.', details: [message] });
  }
});

app.get('/api/analysis', (request, response) => {
  const customer = typeof request.query.customer === 'string' ? request.query.customer : undefined;
  const product = typeof request.query.product === 'string' ? request.query.product : undefined;
  const excludeOutliers = request.query.excludeOutliers === 'true';
  const observations = listObservations(customer, product);
  const recommendationEligible = isRecommendationEligible(customer, product);
  if (!recommendationEligible) {
    return response.json({
      recommendationEligible,
      observations,
      includedObservations: observations,
      excludedObservations: [],
      regression: null,
      outlierBounds: null,
    });
  }
  const outliers = identifyOutliers(observations);
  const included = excludeOutliers ? outliers.included : observations;
  response.json({
    recommendationEligible,
    observations, includedObservations: included,
    excludedObservations: excludeOutliers ? outliers.excluded : [],
    regression: linearRegression(included),
    outlierBounds: observations.length >= 4 ? { lower: outliers.lowerBound, upper: outliers.upperBound } : null,
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'The server encountered an unexpected error.' });
});

app.listen(port, () => console.log(`Pricing API listening on http://localhost:${port}`));
