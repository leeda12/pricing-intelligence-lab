# Pricing Intelligence Lab

Pricing Intelligence Lab turns synthetic transaction history into an auditable next-year price recommendation. It gives pricing teams a transparent workflow for importing observations, exploring customer-product trends, comparing optional outlier treatment, and explaining the model behind a recommendation.

> **Portfolio status:** This application currently runs locally and is not deployed.

## Application preview

![Pricing Intelligence Lab dashboard showing the synthetic Northstar Outfitters and Atlas Widget example](docs/pricing-intelligence-dashboard.png)

*The dashboard shows the synthetic Northstar Outfitters and Atlas Widget example.*

## Features

- Imports and validates historical pricing observations from CSV.
- Transactionally replaces the current dataset so repeated imports never create duplicates.
- Preserves every original observation from the current successful import.
- Filters analysis by fictional customer and product.
- Charts observed unit prices alongside a fitted regression trend.
- Optionally identifies outliers using the 1.5×IQR rule and explicitly lists every excluded source row.
- Calculates an ordinary least-squares trend and recommends a price for the following calendar year only after one specific customer and product are selected.
- Keeps aggregate selections in exploration mode without combining unrelated cohorts into one regression.
- Explains the slope, intercept, fitted sample size, prediction, and R² in plain language.
- Exports a standalone HTML recommendation report.
- Provides clear empty, loading, success, validation-error, and server-error states.

## Fictional data notice

All customer names, product names, prices, quantities, and transaction records included in this repository are entirely fictional and were created solely for demonstration. The project contains no proprietary, confidential, or real customer data.

The ready-to-use example is clearly labeled at `sample-data/SYNTHETIC_SAMPLE_pricing_history.csv`.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite, Recharts
- **Backend:** Node.js 24, Express, TypeScript
- **Persistence:** SQLite through Node's built-in `node:sqlite` module
- **Validation and import:** Zod, csv-parse, Multer
- **Testing:** Vitest
- **Automation:** GitHub Actions

## Quick start

Requirements: Node.js 24 LTS and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`, choose `sample-data/SYNTHETIC_SAMPLE_pricing_history.csv`, and select **Import observations**. The local API runs at `http://localhost:3001`.

Copy `.env.example` to `.env` only if you want to change the API port or database path. Never commit `.env`.

## Architecture

- `src/`: React interface, Recharts visualization, report export, and user-facing states.
- `server/`: Express API, CSV validation, and local SQLite persistence.
- `shared/`: framework-independent types, IQR detection, and ordinary least-squares regression.
- `sample-data/`: clearly labeled fictional data.

The browser calls the local Express API through Vite's development proxy. This single-dataset MVP validates the complete CSV first, then transactionally replaces the prior dataset. A failed validation leaves the previous valid dataset untouched. Analysis may explicitly omit flagged rows from a regression, but it never changes the original observations from the current import.

## CSV format

Headers must be exactly `date,customer,product,quantity,unit_price`. Dates use `YYYY-MM-DD`; quantity and price must be positive numbers. Validation rejects the entire import and reports source row numbers if any row is invalid.

## Calculation methodology

Linear regression uses ordinary least squares with decimal year as `x` and unit price as `y`. The recommendation evaluates the fitted line at the calendar year after the latest observation. The interface shows slope, intercept, sample size, prediction, and R².

Optional outliers use Tukey's rule: prices below `Q1 − 1.5 × IQR` or above `Q3 + 1.5 × IQR` are flagged. Exclusion is off by default. When enabled, every excluded observation is highlighted on the chart and listed with its original CSV row number. Stored observations remain unchanged.

## Testing and production build

```powershell
npm test
npm run build
npm start
```

Tests cover regression behavior, insufficient data, IQR detection, transactional replacement, repeated imports, and rollback preservation. `npm run build` compiles the server and creates the frontend in `dist/`.

GitHub Actions runs `npm ci`, `npm test`, and `npm run build` on pushes and pull requests to `main`.

## Limitations and future improvements

- The MVP supports one active local dataset rather than multiple named datasets or organizations.
- Recommendations use a simple time-based linear model and do not yet incorporate volume, cost, seasonality, elasticity, or competitive signals.
- Outlier detection operates on unit price only and requires a user-controlled exclusion decision.
- SQLite is intended for local evaluation; a deployed version would need managed persistence, backups, and access controls.
- Report export is standalone HTML rather than a branded PDF or shareable hosted report.
- Future work could add model comparisons, confidence intervals, scenario analysis, richer regression diagnostics, accessible data-table views, and deployment automation.

## Repository safety

Generated databases, reports, secrets, dependency folders, build output, logs, and coverage are excluded through `.gitignore`.
