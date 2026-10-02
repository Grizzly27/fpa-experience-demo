import { COST_CENTERS, GL, LAST_ACTUAL, driver } from './data';

/**
 * FY27 forecast engine.
 *
 * 1. Global assumptions (growth, merit, hires...) generate a base monthly series per driver row.
 * 2. User cell overrides replace individual months of any driver row.
 * 3. The P&L is computed from the resulting series.
 */

export interface Assumptions {
  unitGrowth: number;      // YoY growth on FY26 monthly units
  hwPrice: number;
  attachRate: number;
  monthlyChurn: number;
  arpu: number;
  merit: number;
  nonPeopleGrowth: number;
  hires: Record<string, number>; // net adds over FY27 by cost center, linear ramp
}

export type Overrides = Record<string, Record<number, number>>; // rowKey -> monthIdx -> value
export type Series = Record<string, number[]>;

export type RowFormat = 'int' | 'money' | 'pct' | 'hc';
export interface RowDef {
  key: string;
  label: string;
  section: string;
  format: RowFormat;
  /** how "spread annual total" distributes: by base seasonality or evenly */
  spread: 'seasonal' | 'even';
  /** stock rows (rates, prices, headcount) can't be meaningfully totalled */
  stock?: boolean;
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}`);
export const MONTH_LABELS = MONTHS.map((m) => new Date(`${m}-01T00:00:00`).toLocaleString('en-US', { month: 'short' }));

export const ROWS: RowDef[] = [
  { key: 'units', label: 'Hardware units', section: 'Revenue drivers', format: 'int', spread: 'seasonal' },
  { key: 'price', label: 'Avg selling price', section: 'Revenue drivers', format: 'money', spread: 'even', stock: true },
  { key: 'attach', label: 'Subscription attach rate', section: 'Revenue drivers', format: 'pct', spread: 'even', stock: true },
  { key: 'churn', label: 'Monthly churn', section: 'Revenue drivers', format: 'pct', spread: 'even', stock: true },
  { key: 'arpu', label: 'Subscription ARPU', section: 'Revenue drivers', format: 'money', spread: 'even', stock: true },
  ...COST_CENTERS.map((cc): RowDef => ({ key: `hc:${cc}`, label: cc, section: 'Headcount (ending)', format: 'hc', spread: 'even', stock: true })),
  ...COST_CENTERS.map((cc): RowDef => ({ key: `np:${cc}`, label: cc, section: 'Non-people opex', format: 'money', spread: 'even' })),
];

const HW_UNIT_COST = 196;
const HOSTING_PCT = 0.18;

const fy26Month = (mm: number) => {
  const m = `2026-${String(mm).padStart(2, '0')}`;
  return { m, scenario: (m <= LAST_ACTUAL ? 'actual' : 'plan') as 'actual' | 'plan' };
};

const BASE = (() => {
  const units = Array.from({ length: 12 }, (_, i) => {
    const { m, scenario } = fy26Month(i + 1);
    return driver(m, scenario, 'Revenue', 'hardware_units');
  });
  const ytd = GL.filter((r) => r.fiscal_year === 'FY26' && r.month <= LAST_ACTUAL && r.scenario === 'actual');
  const nMonths = new Set(ytd.map((r) => r.month)).size;
  const nonPeople: Record<string, number> = {};
  const cost: Record<string, number> = {};
  const hc: Record<string, number> = {};
  for (const cc of COST_CENTERS) {
    nonPeople[cc] = ytd
      .filter((r) => r.department === cc && r.account_group === 'Opex' && r.account !== 'Salaries & Benefits')
      .reduce((s, r) => s + r.amount, 0) / nMonths;
    cost[cc] = driver(LAST_ACTUAL, 'actual', cc, 'loaded_cost');
    hc[cc] = driver(LAST_ACTUAL, 'actual', cc, 'headcount');
  }
  return {
    units, nonPeople, cost, hc,
    subscribers: driver(LAST_ACTUAL, 'actual', 'Revenue', 'subscribers'),
    churn: driver(LAST_ACTUAL, 'actual', 'Revenue', 'churn_rate'),
    price: driver(LAST_ACTUAL, 'actual', 'Revenue', 'hardware_price'),
  };
})();

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  unitGrowth: 0.12,
  hwPrice: Math.round(BASE.price),
  attachRate: 0.62,
  monthlyChurn: Math.round(BASE.churn * 1000) / 1000,
  arpu: 14,
  merit: 0.04,
  nonPeopleGrowth: 0.05,
  hires: { Sales: 8, Marketing: 3, 'R&D': 12, 'Customer Success': 5, Operations: 2, 'G&A': 2 },
};

const fill = (v: number) => Array.from({ length: 12 }, () => v);

export function baseSeries(a: Assumptions): Series {
  const s: Series = {
    units: BASE.units.map((u) => Math.round(u * (1 + a.unitGrowth))),
    price: fill(a.hwPrice),
    attach: fill(a.attachRate),
    churn: fill(a.monthlyChurn),
    arpu: fill(a.arpu),
  };
  for (const cc of COST_CENTERS) {
    s[`hc:${cc}`] = Array.from({ length: 12 }, (_, i) =>
      Math.round((BASE.hc[cc] + (a.hires[cc] ?? 0) * (i + 1) / 12) * 10) / 10);
    s[`np:${cc}`] = fill(Math.round(BASE.nonPeople[cc] * (1 + a.nonPeopleGrowth)));
  }
  return s;
}

export function applyOverrides(base: Series, o: Overrides): Series {
  const out: Series = {};
  for (const [k, vals] of Object.entries(base)) {
    out[k] = vals.map((v, i) => o[k]?.[i] ?? v);
  }
  return out;
}

export interface MonthOut {
  hwRevenue: number;
  subRevenue: number;
  revenue: number;
  cogs: number;
  people: number;
  nonPeople: number;
  opex: number;
  operatingIncome: number;
  subscribers: number;
  headcount: number;
  opexByCc: Record<string, number>;
}

export interface ForecastOut {
  months: MonthOut[];
  revenue: number;
  cogs: number;
  grossMargin: number;
  opex: number;
  operatingIncome: number;
  endSubscribers: number;
  endHeadcount: number;
  opexByCc: Record<string, number>;
}

export function computePnl(s: Series, a: Assumptions): ForecastOut {
  let subs = BASE.subscribers;
  const months: MonthOut[] = [];
  for (let i = 0; i < 12; i++) {
    subs = subs * (1 - s.churn[i]) + s.units[i] * s.attach[i];
    const hwRevenue = s.units[i] * s.price[i];
    const subRevenue = subs * s.arpu[i];
    const revenue = hwRevenue + subRevenue;
    const cogs = s.units[i] * HW_UNIT_COST + subRevenue * HOSTING_PCT;
    const opexByCc: Record<string, number> = {};
    let people = 0, nonPeople = 0, headcount = 0;
    for (const cc of COST_CENTERS) {
      const p = s[`hc:${cc}`][i] * BASE.cost[cc] * (1 + a.merit) / 12;
      const np = s[`np:${cc}`][i];
      opexByCc[cc] = p + np;
      people += p;
      nonPeople += np;
      headcount += s[`hc:${cc}`][i];
    }
    const opex = people + nonPeople;
    months.push({ hwRevenue, subRevenue, revenue, cogs, people, nonPeople, opex, operatingIncome: revenue - cogs - opex, subscribers: subs, headcount, opexByCc });
  }
  const sum = (k: keyof MonthOut) => months.reduce((t, m) => t + (m[k] as number), 0);
  const revenue = sum('revenue'), cogs = sum('cogs'), opex = sum('opex');
  const opexByCc = Object.fromEntries(COST_CENTERS.map((cc) => [cc, months.reduce((t, m) => t + m.opexByCc[cc], 0)]));
  return {
    months, revenue, cogs, opex, opexByCc,
    grossMargin: revenue - cogs,
    operatingIncome: revenue - cogs - opex,
    endSubscribers: months[11].subscribers,
    endHeadcount: months[11].headcount,
  };
}

export function runForecast(a: Assumptions, o: Overrides = {}) {
  const base = baseSeries(a);
  const series = applyOverrides(base, o);
  return { base, series, out: computePnl(series, a) };
}

/** Distribute an annual total across months, following base seasonality or evenly. */
export function spreadTotal(total: number, baseRow: number[], mode: 'seasonal' | 'even'): number[] {
  if (mode === 'even') return fill(total / 12);
  const t = baseRow.reduce((x, y) => x + y, 0) || 1;
  return baseRow.map((v) => (total * v) / t);
}

/** FY26 outlook totals (actuals + remaining plan), for YoY comparison. */
export const FY26_OUTLOOK = (() => {
  let revenue = 0, cogs = 0, opex = 0;
  for (let i = 1; i <= 12; i++) {
    const { m, scenario } = fy26Month(i);
    for (const r of GL) {
      if (r.month !== m || r.scenario !== scenario) continue;
      if (r.account_group === 'Revenue') revenue += r.amount;
      else if (r.account_group === 'COGS') cogs += r.amount;
      else opex += r.amount;
    }
  }
  return { revenue, cogs, opex, operatingIncome: revenue - cogs - opex };
})();

// ---------- cell formatting / parsing ----------

export function fmtCell(v: number, f: RowFormat): string {
  switch (f) {
    case 'int': return Math.round(v).toLocaleString('en-US');
    case 'money': return v >= 1000 ? `$${Math.round(v / 1000).toLocaleString('en-US')}K` : `$${v.toFixed(2).replace(/\.00$/, '')}`;
    case 'pct': return `${(v * 100).toFixed(1)}%`;
    case 'hc': return v.toFixed(1);
  }
}

/** Editable text shown when a cell enters edit mode. */
export function editText(v: number, f: RowFormat): string {
  if (f === 'pct') return String(Math.round(v * 1000) / 10);
  if (f === 'hc') return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

/** Parse what the user typed or pasted: tolerates $, commas, %, K/M suffixes. */
export function parseCell(text: string, f: RowFormat): number | null {
  let t = text.trim().replace(/[$,\s]/g, '');
  if (!t) return null;
  let mult = 1;
  if (/k$/i.test(t)) { mult = 1e3; t = t.slice(0, -1); }
  else if (/m$/i.test(t)) { mult = 1e6; t = t.slice(0, -1); }
  const hadPct = t.endsWith('%');
  if (hadPct) t = t.slice(0, -1);
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (f === 'pct') return n / 100; // grid shows percentages; "2.5" and "2.5%" both mean 2.5%
  return n * mult;
}
