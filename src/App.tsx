import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisResponse, Observation } from '../shared/types';

type Status = { kind: 'idle' | 'loading' | 'success' | 'validation' | 'server'; message?: string; details?: string[] };
type Dimensions = { customers: string[]; products: string[]; total: number };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function App() {
  const [dimensions, setDimensions] = useState<Dimensions>({ customers: [], products: [], total: 0 });
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [customer, setCustomer] = useState('');
  const [product, setProduct] = useState('');
  const [excludeOutliers, setExcludeOutliers] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const load = useCallback(async () => {
    setStatus((current) => current.kind === 'success' ? current : { kind: 'loading', message: 'Loading observations…' });
    try {
      const query = new URLSearchParams({ ...(customer && { customer }), ...(product && { product }), excludeOutliers: String(excludeOutliers) });
      const [dimensionResponse, analysisResponse] = await Promise.all([fetch('/api/dimensions'), fetch(`/api/analysis?${query}`)]);
      if (!dimensionResponse.ok || !analysisResponse.ok) throw new Error('Server response was not successful.');
      setDimensions(await dimensionResponse.json());
      setAnalysis(await analysisResponse.json());
      setStatus((current) => current.kind === 'success' ? current : { kind: 'idle' });
    } catch {
      setStatus({ kind: 'server', message: 'The local API is unavailable. Confirm the development server is running and try again.' });
    }
  }, [customer, product, excludeOutliers]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!customer || !product) setExcludeOutliers(false);
  }, [customer, product]);

  async function importCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setStatus({ kind: 'validation', message: 'Select a CSV file before importing.' });
    setStatus({ kind: 'loading', message: 'Validating and importing the CSV…' });
    const form = new FormData(); form.append('file', file);
    try {
      const response = await fetch('/api/import', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) return setStatus({ kind: response.status === 422 || response.status === 400 ? 'validation' : 'server', message: result.error, details: result.details });
      setStatus({ kind: 'success', message: result.message });
      setFile(null); setCustomer(''); setProduct('');
      const input = document.getElementById('csv-file') as HTMLInputElement | null; if (input) input.value = '';
      await load();
    } catch { setStatus({ kind: 'server', message: 'Import failed because the local API could not be reached.' }); }
  }

  const chartData = useMemo(() => analysis?.observations.map((row) => ({
    ...row,
    label: row.date,
    price: row.unitPrice,
    trendPrice: analysis.regression ? analysis.regression.slope * decimalYear(row.date) + analysis.regression.intercept : null,
  })) ?? [], [analysis]);
  const excludedIds = new Set(analysis?.excludedObservations.map((row) => row.id));
  const recommendationEligible = analysis?.recommendationEligible === true;

  return <main>
    <header className="hero">
      <div className="hero-copy"><span className="eyebrow">LOCAL ANALYTICS WORKBENCH</span><h1>Pricing Intelligence Lab</h1><p>Turn synthetic price history into an auditable next-year recommendation.</p></div>
      <div className="hero-stat"><strong>{dimensions.total}</strong><span>observations preserved</span></div>
    </header>

    <section className="workspace">
      <aside className="panel controls">
        <div className="section-heading"><span>01</span><div><h2>Import data</h2><p>Required: date, customer, product, quantity, unit_price</p></div></div>
        <form onSubmit={importCsv}>
          <label className="file-input" htmlFor="csv-file"><span>{file?.name ?? 'Choose synthetic CSV'}</span><input id="csv-file" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <button className="primary" disabled={status.kind === 'loading'}>{status.kind === 'loading' ? 'Working…' : 'Import observations'}</button>
        </form>
        {status.kind !== 'idle' && <div className={`notice ${status.kind}`} role="status"><strong>{status.kind === 'success' ? 'Import complete' : status.kind === 'validation' ? 'Check your file' : status.kind === 'server' ? 'Server error' : 'Please wait'}</strong><p>{status.message}</p>{status.details?.map((detail) => <small key={detail}>{detail}</small>)}</div>}

        <div className="section-heading"><span>02</span><div><h2>Define cohort</h2><p>Choose a customer and product.</p></div></div>
        <label>Customer<select value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="">All customers</option>{dimensions.customers.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Product<select value={product} onChange={(event) => setProduct(event.target.value)}><option value="">All products</option>{dimensions.products.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className={`toggle ${!customer || !product ? 'disabled' : ''}`}><input type="checkbox" checked={excludeOutliers} disabled={!customer || !product} onChange={(event) => setExcludeOutliers(event.target.checked)} /><span><strong>Exclude IQR outliers</strong><small>{customer && product ? 'Always disclosed below; originals remain stored.' : 'Select a specific customer and product first.'}</small></span></label>
      </aside>

      <div className="results">
        {!analysis?.observations.length ? <EmptyState loading={status.kind === 'loading'} /> : <>
          {recommendationEligible && <section className="metrics">
            <Metric label="Recommended price" value={analysis.regression ? money.format(analysis.regression.predictedPrice) : 'Need more data'} accent />
            <Metric label="Prediction year" value={analysis.regression?.predictionYear.toString() ?? '—'} />
            <Metric label="Annual trend" value={analysis.regression ? `${analysis.regression.slope >= 0 ? '+' : ''}${money.format(analysis.regression.slope)}` : '—'} />
            <Metric label="Model fit (R²)" value={analysis.regression ? analysis.regression.rSquared.toFixed(3) : '—'} />
          </section>}
          {!recommendationEligible && <AggregateExploration />}
          <section className="panel chart-panel">
            <div className="panel-title"><div><span className="eyebrow">HISTORICAL UNIT PRICE</span><h2>{customer || 'All customers'} · {product || 'All products'}</h2><p className="chart-context">{recommendationEligible ? 'Solid green shows observed prices. Dashed blue shows the regression trend. Orange rings identify excluded IQR outliers when enabled.' : 'Observed prices are shown for aggregate exploration only. Select one customer and one product to fit a regression trend.'}</p></div>{recommendationEligible && <button className="secondary" onClick={() => exportReport(analysis, customer, product, excludeOutliers)}>Export report</button>}</div>
            <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 16, right: 20, bottom: 8, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe5e2" /><XAxis dataKey="label" tickFormatter={formatChartDate} interval="preserveStartEnd" minTickGap={52} tick={{ fontSize: 12 }} /><YAxis tickFormatter={(value) => `$${value}`} tick={{ fontSize: 12 }} domain={['auto', 'auto']} /><Tooltip labelFormatter={(label) => formatFullDate(String(label))} formatter={(value, name) => [money.format(Number(value)), name]} /><Legend /><Line name="Observed price" type="monotone" dataKey="price" stroke="#176b5b" strokeWidth={2.5} dot={(props) => <circle key={`dot-${props.payload.id}`} cx={props.cx} cy={props.cy} r={excludedIds.has(props.payload.id) ? 6 : 4} fill={excludedIds.has(props.payload.id) ? '#d95d39' : '#176b5b'} stroke="#fff" strokeWidth={2} />} />{recommendationEligible && <Line name="Regression trend" type="linear" dataKey="trendPrice" stroke="#314a78" strokeWidth={2.5} strokeDasharray="8 5" dot={false} activeDot={false} />}{recommendationEligible && analysis.excludedObservations.map((row) => <ReferenceDot key={row.id} x={row.date} y={row.unitPrice} r={8} fill="none" stroke="#d95d39" strokeWidth={2} />)}</LineChart></ResponsiveContainer></div>
          </section>
          {recommendationEligible && <section className="two-column">
            <Explanation analysis={analysis} excludeOutliers={excludeOutliers} />
            <ExcludedTable rows={analysis.excludedObservations} enabled={excludeOutliers} />
          </section>}
        </>}
      </div>
    </section>
    <footer>Built with entirely synthetic data · Original imports are preserved · Analysis is directional, not financial advice</footer>
  </main>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={`metric ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }
function AggregateExploration() { return <section className="aggregate-guidance" role="status"><div className="aggregate-icon">◎</div><div><span className="eyebrow">EXPLORATION MODE</span><h2>Select a specific customer and product for a recommendation</h2><p>Aggregate selections can be explored in the observed-price chart, but regression KPIs and reports are intentionally unavailable because unrelated cohorts should not share one fitted model.</p></div></section>; }
function decimalYear(date: string): number { const parsed = new Date(`${date}T00:00:00Z`); const year = parsed.getUTCFullYear(); return year + (parsed.getTime() - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)); }
function formatChartDate(date: string): string { return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)); }
function formatFullDate(date: string): string { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)); }
function EmptyState({ loading }: { loading: boolean }) { return <section className="panel empty"><div className="empty-mark">↗</div><h2>{loading ? 'Loading your workspace…' : 'Import synthetic pricing history'}</h2><p>{loading ? 'Connecting to the local analysis service.' : 'Start with the clearly labeled sample CSV in the sample-data folder, or use your own fictional dataset.'}</p></section>; }
function Explanation({ analysis, excludeOutliers }: { analysis: AnalysisResponse; excludeOutliers: boolean }) {
  const regression = analysis.regression;
  return <section className="panel explanation"><span className="eyebrow">RECOMMENDATION RATIONALE</span><h2>How the recommendation works</h2>{regression ? <><div className="recommendation-callout"><div><span>Next-year recommendation</span><strong>{money.format(regression.predictedPrice)}</strong></div><small>for {regression.predictionYear} · based on {regression.sampleCount} fitted observations</small></div><p>We fit a straight line through the selected price history, using the date as time and unit price as the outcome.</p><div className="formula">price = {regression.slope.toFixed(4)} × year {regression.intercept >= 0 ? '+' : '−'} {Math.abs(regression.intercept).toFixed(2)}</div><p>The fitted line is extended to <strong>{regression.predictionYear}</strong>. An R² of <strong>{regression.rSquared.toFixed(3)}</strong> indicates how much historical price variation the trend explains.</p><p className="disclosure-note">{excludeOutliers ? `${analysis.excludedObservations.length} IQR outlier(s) were visibly excluded from the fit; every original observation remains preserved.` : 'No observations were excluded. Enable IQR exclusion to compare a filtered recommendation.'}</p></> : <p>At least two observations with different dates are required to calculate a trend.</p>}</section>;
}
function ExcludedTable({ rows, enabled }: { rows: Observation[]; enabled: boolean }) { return <section className="panel exclusions"><span className="eyebrow">OUTLIER DISCLOSURE</span><h2>{enabled ? `${rows.length} excluded observation${rows.length === 1 ? '' : 's'}` : 'No exclusions applied'}</h2>{enabled && rows.length ? <div className="table-wrap"><table><thead><tr><th>Source row</th><th>Date</th><th>Price</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.sourceRow}</td><td>{row.date}</td><td>{money.format(row.unitPrice)}</td></tr>)}</tbody></table></div> : <p>{enabled ? 'No prices fall outside the 1.5× IQR bounds.' : 'Every imported observation is included in the regression.'}</p>}</section>; }

function exportReport(analysis: AnalysisResponse, customer: string, product: string, excludeOutliers: boolean) {
  if (!analysis.recommendationEligible) return;
  const regression = analysis.regression;
  const escaped = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
  const rows = analysis.excludedObservations.map((row) => `<tr><td>${row.sourceRow}</td><td>${escaped(row.date)}</td><td>${money.format(row.unitPrice)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pricing Intelligence Report</title><style>body{font:15px Arial;max-width:800px;margin:48px auto;color:#18312d}h1{color:#0d5549}.card{padding:20px;border:1px solid #ccd8d5;margin:16px 0}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><p>SYNTHETIC DATA REPORT</p><h1>Pricing Intelligence Lab</h1><div class="card"><b>Cohort:</b> ${escaped(customer || 'All customers')} · ${escaped(product || 'All products')}<br><b>Observations:</b> ${analysis.observations.length}<br><b>Outlier exclusion:</b> ${excludeOutliers ? 'Enabled' : 'Disabled'}</div><div class="card"><h2>Recommendation</h2><p>${regression ? `${money.format(regression.predictedPrice)} for ${regression.predictionYear}` : 'Insufficient data'}</p>${regression ? `<p>Slope: ${regression.slope.toFixed(4)} · Intercept: ${regression.intercept.toFixed(2)} · R²: ${regression.rSquared.toFixed(3)}</p>` : ''}</div><div class="card"><h2>Excluded observations</h2>${rows ? `<table><tr><th>Source row</th><th>Date</th><th>Price</th></tr>${rows}</table>` : '<p>None.</p>'}</div><p>Generated locally from fictional data. Directional analysis only.</p></body></html>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); link.download = `pricing-report-${new Date().toISOString().slice(0, 10)}.html`; link.click(); URL.revokeObjectURL(link.href);
}
