# Pricing Intelligence Lab

A local full-stack TypeScript portfolio project for exploring **entirely synthetic** historical pricing data. It imports CSV observations, preserves every original row in SQLite, charts price history, optionally discloses and excludes IQR outliers, fits a linear trend, recommends a next-year price, and exports a standalone HTML report.

## Quick start

Requirements: Node.js 24 LTS and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`, choose `sample-data/SYNTHETIC_SAMPLE_pricing_history.csv`, and select **Import observations**. The API runs at `http://localhost:3001`.

Copy `.env.example` to `.env` only if you want to change the API port or database path. Never commit `.env`.

## Architecture

- `src/`: React + Vite interface, Recharts visualization, report export, and user-facing states.
- `server/`: Express API, CSV validation, and local SQLite persistence using Node's built-in SQLite module.
- `shared/`: framework-independent types, IQR detection, and ordinary least-squares regression.
- `sample-data/`: clearly labeled fictional data; no proprietary or real customer information.

The browser calls the local Express API through Vite's development proxy. This single-dataset MVP validates the complete CSV first, then transactionally replaces the prior dataset. A failed validation leaves the previous valid dataset untouched. Analysis may omit flagged rows when explicitly requested, but it never changes the original rows from the current import.

## CSV format

Headers must be exactly `date,customer,product,quantity,unit_price`. Dates use `YYYY-MM-DD`; quantity and price must be positive numbers. Validation rejects the entire import and reports source row numbers if any row is invalid.

## Calculations

Linear regression uses ordinary least squares with decimal year as `x` and unit price as `y`. The recommendation evaluates the fitted line at the calendar year after the latest observation. The UI shows slope, intercept, sample size, prediction, and R².

Optional outliers use Tukey's rule: prices below `Q1 − 1.5 × IQR` or above `Q3 + 1.5 × IQR` are flagged. Exclusion is off by default. When enabled, every excluded observation is highlighted on the chart and listed with its original CSV row number. The database remains unchanged.

## States and safety

The interface includes empty, loading, import-success, validation-error, and server-error states. Generated databases, exported reports, secrets, dependencies, build output, logs, and coverage are ignored by Git.

## Testing and production build

```powershell
npm test
npm run build
npm start
```

Unit tests cover regression behavior, insufficient data, IQR detection, and preservation of the input collection. `npm run build` compiles the server and creates the frontend in `dist/`. For this local portfolio project, use `npm run dev` for the simplest complete experience.
