import { GL, LAST_ACTUAL, monthLabel } from './data';

/** Demo pipeline metadata. Times are relative to "now" so the demo always looks fresh. */

export type RunStatus = 'success' | 'warning' | 'running' | 'failed';

export interface PipelineNode {
  id: string;
  stage: 'source' | 'ingest' | 'lake' | 'serve' | 'consume';
  name: string;
  detail: string;
  status?: RunStatus;
  route?: string; // where the node links inside the app
}

export const NODES: PipelineNode[] = [
  { id: 'erp', stage: 'source', name: 'ERP general ledger', detail: 'Journal lines · daily', status: 'success' },
  { id: 'hris', stage: 'source', name: 'HRIS workforce', detail: 'Headcount & comp · daily', status: 'success' },
  { id: 'crm', stage: 'source', name: 'CRM bookings', detail: 'Units & pipeline · hourly', status: 'warning' },
  { id: 'glue', stage: 'ingest', name: 'AWS Glue ETL', detail: 'Extract, map, validate', status: 'success' },
  { id: 'raw', stage: 'lake', name: 'S3 · raw zone', detail: 'Immutable landing', status: 'success' },
  { id: 'curated', stage: 'lake', name: 'S3 · curated', detail: 'Parquet · 48 DQ rules', status: 'success' },
  { id: 'wh', stage: 'serve', name: 'Athena / Redshift', detail: 'Governed semantic layer', status: 'success' },
  { id: 'actuals', stage: 'consume', name: 'Actuals Management', detail: 'Close & reconcile', route: '/actuals' },
  { id: 'reporting', stage: 'consume', name: 'Reporting', detail: 'Variance & bridges', route: '/reporting' },
  { id: 'intake', stage: 'consume', name: 'Forecast Intake', detail: 'Seeds drivers & budgets', route: '/intake' },
  { id: 'ai', stage: 'consume', name: 'AI Assistant', detail: 'Grounded Q&A', route: '/assistant' },
];

export const EDGES: [string, string][] = [
  ['erp', 'glue'], ['hris', 'glue'], ['crm', 'glue'],
  ['glue', 'raw'], ['raw', 'curated'], ['curated', 'wh'],
  ['wh', 'actuals'], ['wh', 'reporting'], ['wh', 'intake'], ['wh', 'ai'],
];

const H = 3600_000;
const now = Date.now();

export interface Run {
  id: string;
  job: string;
  source: string;
  startedAt: number;
  durationSec: number;
  rows: number;
  status: RunStatus;
  note?: string;
}

export const RUNS: Run[] = [
  { id: 'r-2611', job: 'gl_daily_load', source: 'ERP general ledger', startedAt: now - 5.6 * H, durationSec: 214, rows: 48_212, status: 'success' },
  { id: 'r-2610', job: 'hris_headcount_snapshot', source: 'HRIS workforce', startedAt: now - 5.4 * H, durationSec: 41, rows: 212, status: 'success' },
  { id: 'r-2609', job: 'crm_bookings_hourly', source: 'CRM bookings', startedAt: now - 0.7 * H, durationSec: 18, rows: 1_204, status: 'warning', note: '3 opportunities with unmapped owner region (routed to "Unassigned")' },
  { id: 'r-2608', job: 'curated_gl_build', source: 'S3 raw → curated', startedAt: now - 5.5 * H, durationSec: 96, rows: 1_170, status: 'success' },
  { id: 'r-2607', job: 'gl_daily_load', source: 'ERP general ledger', startedAt: now - 29.6 * H, durationSec: 207, rows: 47_985, status: 'success' },
  { id: 'r-2606', job: 'month_close_sep26', source: 'ERP general ledger', startedAt: now - 52 * H, durationSec: 388, rows: 51_440, status: 'success', note: 'Sep-26 close: TB reconciled to $0.00' },
];

export const lastRun = (job: string) => RUNS.filter((r) => r.job === job).sort((a, b) => b.startedAt - a.startedAt)[0];

export interface Check { name: string; detail: string; status: 'pass' | 'warn' }
export const DQ_CHECKS: Check[] = [
  { name: 'Trial balance reconciles', detail: 'Sum of loaded actuals = ERP TB for Sep-26 (difference $0.00)', status: 'pass' },
  { name: 'Account mapping complete', detail: '100% of GL accounts mapped to a planning account', status: 'pass' },
  { name: 'No duplicate journals', detail: '0 duplicate journal IDs across 51,440 lines', status: 'pass' },
  { name: 'Period locked in ERP', detail: `${monthLabel(LAST_ACTUAL)} is closed in source; late entries blocked`, status: 'pass' },
  { name: 'Sign conventions', detail: 'Revenue credit / expense debit normalized', status: 'pass' },
  { name: 'Cost center ownership', detail: 'CRM: 3 records with unmapped owner region', status: 'warn' },
];

/** Monthly close status for FY26. */
export const CLOSE_CALENDAR = Array.from({ length: 12 }, (_, i) => {
  const m = `2026-${String(i + 1).padStart(2, '0')}`;
  const loaded = m <= LAST_ACTUAL;
  const rows = GL.filter((r) => r.month === m && r.scenario === 'actual').length;
  return {
    month: m,
    label: monthLabel(m),
    status: (loaded ? (m === LAST_ACTUAL ? 'reconciled' : 'locked') : m === '2026-10' ? 'open' : 'future') as 'locked' | 'reconciled' | 'open' | 'future',
    rows,
  };
});

/** GL → planning account mapping (subset; the real one has hundreds of lines). */
export const ACCOUNT_MAP = [
  { gl: '4000-4099', name: 'Product sales', planning: 'Hardware Revenue', group: 'Revenue' },
  { gl: '4100-4199', name: 'Subscription fees', planning: 'Subscription Revenue', group: 'Revenue' },
  { gl: '5000-5049', name: 'Inventory relief', planning: 'Hardware COGS', group: 'COGS' },
  { gl: '5100-5149', name: 'Cloud hosting (COGS)', planning: 'Hosting COGS', group: 'COGS' },
  { gl: '6000-6199', name: 'Wages, bonus, benefits, payroll tax', planning: 'Salaries & Benefits', group: 'Opex' },
  { gl: '6200-6249', name: 'Contract labor', planning: 'Contractors', group: 'Opex' },
  { gl: '6300-6349', name: 'SaaS & cloud (non-COGS)', planning: 'Software & Cloud', group: 'Opex' },
  { gl: '6400-6449', name: 'Travel & entertainment', planning: 'Travel', group: 'Opex' },
  { gl: '6500-6599', name: 'Programs, events, media', planning: 'Marketing Programs', group: 'Opex' },
  { gl: '6600-6649', name: 'Rent, utilities, maintenance', planning: 'Facilities', group: 'Opex' },
  { gl: '6700-6749', name: 'Legal, audit, consulting', planning: 'Professional Fees', group: 'Opex' },
];

export function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
