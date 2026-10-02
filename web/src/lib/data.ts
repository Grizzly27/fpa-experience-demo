import seed from '../data/seed.json';

export type Scenario = 'actual' | 'plan';
export type AccountGroup = 'Revenue' | 'COGS' | 'Opex';

export interface GlRow {
  month: string;
  fiscal_year: string;
  quarter: string;
  scenario: Scenario;
  department: string;
  account: string;
  account_group: AccountGroup;
  amount: number;
}

export interface DriverRow {
  month: string;
  scenario: Scenario;
  department: string;
  driver: string;
  value: number;
}

export const GL = seed.gl as GlRow[];
export const DRIVERS = seed.drivers as DriverRow[];
export const LAST_ACTUAL: string = seed.lastActual;
export const COST_CENTERS = ['Sales', 'Marketing', 'R&D', 'Customer Success', 'Operations', 'G&A'];

// ---------- periods ----------

export interface Period {
  id: string;
  label: string;
  months: string[];
}

const months26 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
  .filter((m) => m <= LAST_ACTUAL);

export const PERIODS: Period[] = [
  { id: 'YTD', label: 'FY26 YTD', months: months26 },
  ...[1, 2, 3].map((q) => ({
    id: `Q${q}-26`,
    label: `Q${q} FY26`,
    months: months26.slice((q - 1) * 3, q * 3),
  })),
  ...months26.slice(-3).reverse().map((m) => ({ id: m, label: monthLabel(m), months: [m] })),
];

export function monthLabel(m: string) {
  const d = new Date(`${m}-01T00:00:00`);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

// ---------- variance ----------

export interface VarLine {
  key: string;
  actual: number;
  plan: number;
}

/** Positive = favorable, for any account group. */
export function favorable(group: AccountGroup, actual: number, plan: number) {
  return group === 'Revenue' ? actual - plan : plan - actual;
}

export function sumBy(rows: GlRow[], scenario: Scenario, pred: (r: GlRow) => boolean = () => true) {
  return rows.reduce((s, r) => (r.scenario === scenario && pred(r) ? s + r.amount : s), 0);
}

export function inPeriod(p: Period) {
  const set = new Set(p.months);
  return GL.filter((r) => set.has(r.month));
}

export interface PnlSummary {
  revenue: number;
  cogs: number;
  grossMargin: number;
  opex: number;
  operatingIncome: number;
}

export function pnl(rows: GlRow[], scenario: Scenario): PnlSummary {
  const revenue = sumBy(rows, scenario, (r) => r.account_group === 'Revenue');
  const cogs = sumBy(rows, scenario, (r) => r.account_group === 'COGS');
  const opex = sumBy(rows, scenario, (r) => r.account_group === 'Opex');
  return { revenue, cogs, grossMargin: revenue - cogs, opex, operatingIncome: revenue - cogs - opex };
}

/** Driver value for a month/scenario/department (e.g. headcount). */
export function driver(month: string, scenario: Scenario, department: string, name: string) {
  return DRIVERS.find((d) => d.month === month && d.scenario === scenario && d.department === department && d.driver === name)?.value ?? 0;
}

// ---------- formatting ----------

export function money(n: number, opts: { compact?: boolean; sign?: boolean } = {}) {
  const { compact = true, sign = false } = opts;
  const abs = Math.abs(n);
  let s: string;
  if (compact && abs >= 1e6) s = `$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  else if (compact && abs >= 1e3) s = `$${(abs / 1e3).toFixed(0)}K`;
  else s = `$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n < 0) return `−${s}`;
  return sign ? `+${s}` : s;
}

export function pct(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(digits)}%`;
}
