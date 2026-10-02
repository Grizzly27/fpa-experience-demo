import { create } from 'zustand';
import { COST_CENTERS, GL, LAST_ACTUAL } from './data';
import { runForecast } from './forecast';
import { loadSavedForecast } from './useForecast';
import { can, canEditCostCenter, type Persona } from './app';

export type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'locked';
export interface HistoryItem { action: string; by: string; at: number; comment?: string }
export interface Budget { status: Status; lines: Record<string, number>; history: HistoryItem[]; owner: string }
export type Budgets = Record<string, Budget>;

export const OWNERS: Record<string, string> = {
  'R&D': 'Jordan Lee', Marketing: 'Jordan Lee', Sales: 'Dana Kim',
  'Customer Success': 'Dana Kim', Operations: 'Luis Ortega', 'G&A': 'Luis Ortega',
};

export const TRANSITIONS = [
  { action: 'submit', label: 'Submit for approval', from: ['draft', 'rejected'], to: 'submitted' },
  { action: 'approve', label: 'Approve', from: ['submitted'], to: 'approved' },
  { action: 'reject', label: 'Send back', from: ['submitted'], to: 'rejected' },
  { action: 'lock', label: 'Lock', from: ['approved'], to: 'locked' },
  { action: 'reopen', label: 'Reopen', from: ['approved', 'locked'], to: 'draft' },
] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** Who may perform a transition on a given cost center. */
export function allowed(p: Persona, cc: string, t: Transition, status: Status): boolean {
  if (!(t.from as readonly Status[]).includes(status)) return false;
  if (t.action === 'submit') return canEditCostCenter(p, cc);
  return can(p, 'approve');
}

/** FY26 full-year outlook (actuals + remaining plan) by cost center and account. */
export const FY26: Record<string, Record<string, number>> = (() => {
  const out: Record<string, Record<string, number>> = {};
  for (const r of GL) {
    if (r.fiscal_year !== 'FY26' || r.account_group !== 'Opex') continue;
    if (r.scenario !== (r.month <= LAST_ACTUAL ? 'actual' : 'plan')) continue;
    (out[r.department] ??= {})[r.account] = (out[r.department][r.account] ?? 0) + r.amount;
  }
  return out;
})();

/** Budget lines from the saved FY27 forecast, splitting non-people spend by FY26 account mix. */
export function forecastLines(): Record<string, Record<string, number>> {
  const { assumptions, overrides } = loadSavedForecast();
  const { series, out } = runForecast(assumptions, overrides);
  const res: Record<string, Record<string, number>> = {};
  for (const cc of COST_CENTERS) {
    const np = series[`np:${cc}`].reduce((a, b) => a + b, 0);
    const accts = Object.entries(FY26[cc]).filter(([a]) => a !== 'Salaries & Benefits');
    const npFy26 = accts.reduce((s, [, v]) => s + v, 0);
    res[cc] = { 'Salaries & Benefits': Math.round((out.opexByCc[cc] - np) / 1000) * 1000 };
    for (const [a, v] of accts) res[cc][a] = Math.round((np * v / npFy26) / 1000) * 1000;
  }
  return res;
}

function seed(): Budgets {
  const fc = forecastLines();
  const h = (hoursAgo: number) => Date.now() - hoursAgo * 3600_000;
  const b: Budgets = {};
  for (const cc of COST_CENTERS) b[cc] = { status: 'draft', lines: { ...fc[cc] }, history: [], owner: OWNERS[cc] };
  b['G&A'] = { ...b['G&A'], status: 'approved', history: [
    { action: 'submit', by: 'Luis Ortega', at: h(50) },
    { action: 'approve', by: 'Alex Rivera', at: h(30), comment: 'Flat professional fees. Looks good.' }] };
  b.Operations = { ...b.Operations, status: 'submitted', history: [{ action: 'submit', by: 'Luis Ortega', at: h(20), comment: 'Facilities includes the Austin lease renewal.' }] };
  b.Sales = { ...b.Sales, status: 'submitted', history: [{ action: 'submit', by: 'Dana Kim', at: h(6) }] };
  b['R&D'] = {
    ...b['R&D'], status: 'rejected',
    lines: { ...b['R&D'].lines, Contractors: Math.round(b['R&D'].lines.Contractors * 1.45 / 1000) * 1000 },
    history: [
      { action: 'submit', by: 'Jordan Lee', at: h(28) },
      { action: 'reject', by: 'Alex Rivera', at: h(9), comment: 'Contractors still at Q3 run-rate. Rewrite backfill ends in Dec; please bring back to normalized level.' }],
  };
  return b;
}

const KEY = 'northwind.budget.v2';
const load = (): Budgets => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* ignore */ } return seed(); };

interface Store {
  budgets: Budgets;
  setLine: (p: Persona, cc: string, acct: string, v: number) => void;
  pullForecast: (p: Persona, cc: string) => void;
  act: (p: Persona, cc: string, t: Transition, comment?: string) => void;
  reset: () => void;
}

export const useBudgets = create<Store>((set, get) => {
  const save = (budgets: Budgets) => { set({ budgets }); try { localStorage.setItem(KEY, JSON.stringify(budgets)); } catch { /* ignore */ } };
  const editable = (p: Persona, cc: string) =>
    canEditCostCenter(p, cc) && ['draft', 'rejected'].includes(get().budgets[cc].status);
  return {
    budgets: load(),
    setLine: (p, cc, acct, v) => {
      if (!editable(p, cc)) return;
      const b = get().budgets;
      save({ ...b, [cc]: { ...b[cc], lines: { ...b[cc].lines, [acct]: v } } });
    },
    pullForecast: (p, cc) => {
      if (!editable(p, cc)) return;
      const b = get().budgets;
      save({ ...b, [cc]: { ...b[cc], lines: { ...forecastLines()[cc] } } });
    },
    act: (p, cc, t, comment) => {
      const b = get().budgets;
      if (!allowed(p, cc, t, b[cc].status)) return;
      save({ ...b, [cc]: { ...b[cc], status: t.to, history: [...b[cc].history, { action: t.action, by: p.name, at: Date.now(), comment: comment?.trim() || undefined }] } });
    },
    reset: () => save(seed()),
  };
});

export const budgetTotal = (lines: Record<string, number>) => Object.values(lines).reduce((a, b) => a + b, 0);
