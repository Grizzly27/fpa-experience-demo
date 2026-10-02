import { useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { CountUp, rise, stagger } from '../../components/motion';
import { useTokens } from '../../lib/useTokens';
import { motion } from 'framer-motion';
import { PeriodPicker, usePeriod } from './period';
import {
  GL, LAST_ACTUAL, favorable, inPeriod, money, monthLabel, pct, pnl, sumBy,
  type AccountGroup, type GlRow,
} from '../../lib/data';

const GROUPS: AccountGroup[] = ['Revenue', 'COGS', 'Opex'];

export function VarianceView() {
  const [period, setPeriod] = usePeriod();
  const tk = useTokens();
  const [metric, setMetric] = useState<AccountGroup>('Opex');
  const rows = useMemo(() => inPeriod(period), [period]);
  const a = pnl(rows, 'actual');
  const p = pnl(rows, 'plan');

  const monthly = useMemo(() => {
    const ms = [...new Set(GL.filter((r) => r.fiscal_year === 'FY26').map((r) => r.month))].sort();
    return ms.map((m) => {
      const mr = GL.filter((r) => r.month === m && r.account_group === metric);
      return {
        month: m,
        label: monthLabel(m),
        actual: m <= LAST_ACTUAL ? sumBy(mr, 'actual') : null,
        plan: sumBy(mr, 'plan'),
      };
    });
  }, [metric]);

  const pickMonth = (m?: string) => { if (m && m <= LAST_ACTUAL) setPeriod(m); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Actuals closed through {monthLabel(LAST_ACTUAL)}. Click a bar to drill into that month, or a row to expand.</p>
        <PeriodPicker />
      </div>

      <motion.div key={period.id} variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi title="Revenue" actual={a.revenue} plan={p.revenue} group="Revenue" />
        <Kpi title="Gross margin" actual={a.grossMargin} plan={p.grossMargin} group="Revenue"
          note={`${(a.grossMargin / a.revenue * 100).toFixed(1)}% GM vs ${(p.grossMargin / p.revenue * 100).toFixed(1)}% plan`} />
        <Kpi title="Operating expenses" actual={a.opex} plan={p.opex} group="Opex" />
        <Kpi title="Operating income" actual={a.operatingIncome} plan={p.operatingIncome} group="Revenue" />
      </motion.div>

      <Card
        title={`FY26 ${metric} by month`}
        actions={
          <div className="flex gap-1">
            {GROUPS.map((g) => (
              <button key={g} onClick={() => setMetric(g)}
                className={clsx('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', metric === g ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-fg-muted hover:text-fg')}>
                {g}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={monthly} onClick={(e) => pickMonth(monthly[Number(e?.activeTooltipIndex)]?.month)}>
              <CartesianGrid vertical={false} stroke={tk.line} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} />
              <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} width={60} />
              <Tooltip formatter={(v) => money(Number(v), { compact: false })} cursor={{ fill: tk.line, opacity: 0.4 }} contentStyle={{ background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 6, fontSize: 12 }} />
              <Legend />
              <Bar dataKey="actual" name="Actual" fill={tk.accent} radius={[3, 3, 0, 0]} cursor="pointer" />
              <Line dataKey="plan" name="Plan" stroke={tk['fg-muted']} strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`P&L variance · ${period.label}`} description="Favorable variances in green with ▲, unfavorable in red with ▼." flush>
        <VarianceTable rows={rows} />
      </Card>
    </div>
  );
}

function Kpi({ title, actual, plan, group, note }: { title: string; actual: number; plan: number; group: AccountGroup; note?: string }) {
  const fav = favorable(group, actual, plan);
  return (
    <motion.div variants={rise} className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-fg-muted">{title}</p>
      <CountUp value={actual} format={(n) => money(n)} className="num mt-1.5 block text-2xl font-semibold tracking-tight" />
      <p className="num mt-0.5 text-xs text-fg-subtle">Plan {money(plan)}</p>
      <p className={clsx('num mt-1.5 text-xs font-medium', fav >= 0 ? 'text-pos' : 'text-neg')}>
        {fav >= 0 ? '▲' : '▼'} {money(Math.abs(fav))} {fav >= 0 ? 'favorable' : 'unfavorable'} ({pct((actual - plan) / Math.abs(plan))})
      </p>
      {note && <p className="mt-0.5 text-xs text-fg-subtle">{note}</p>}
    </motion.div>
  );
}

interface Node { key: string; label: string; group: AccountGroup; actual: number; plan: number; children?: Node[] }

function buildTree(rows: GlRow[]): Node[] {
  return GROUPS.map((g) => {
    const gr = rows.filter((r) => r.account_group === g);
    const depts = [...new Set(gr.map((r) => r.department))];
    return {
      key: g, label: g, group: g, actual: sumBy(gr, 'actual'), plan: sumBy(gr, 'plan'),
      children: depts.map((d) => {
        const dr = gr.filter((r) => r.department === d);
        const accts = [...new Set(dr.map((r) => r.account))];
        return {
          key: `${g}/${d}`, label: d, group: g, actual: sumBy(dr, 'actual'), plan: sumBy(dr, 'plan'),
          children: accts.map((ac) => {
            const ar = dr.filter((r) => r.account === ac);
            return { key: `${g}/${d}/${ac}`, label: ac, group: g, actual: sumBy(ar, 'actual'), plan: sumBy(ar, 'plan') };
          }).sort((x, y) => favorable(g, x.actual, x.plan) - favorable(g, y.actual, y.plan)),
        };
      }).sort((x, y) => favorable(g, x.actual, x.plan) - favorable(g, y.actual, y.plan)),
    };
  });
}

function VarianceTable({ rows }: { rows: GlRow[] }) {
  const tree = useMemo(() => buildTree(rows), [rows]);
  const [open, setOpen] = useState<Set<string>>(new Set(['Opex']));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // scale variance bars within each group so Opex isn't dwarfed by COGS
  const maxAbs = Object.fromEntries(tree.map((g) => [g.group, Math.max(...g.children!.map((d) => Math.abs(d.actual - d.plan)), 1)]));

  const render = (n: Node, depth: number): ReactNode[] => {
    const fav = favorable(n.group, n.actual, n.plan);
    const isOpen = open.has(n.key);
    const out: ReactNode[] = [
      <tr key={n.key} onClick={() => n.children && toggle(n.key)}
        className={clsx('border-b border-line', n.children && 'cursor-pointer hover:bg-surface-2', depth === 0 && 'bg-surface-2 font-semibold')}>
        <td className="py-2 pr-4" style={{ paddingLeft: 8 + depth * 20 }}>
          {n.children && <span className="inline-block w-4 text-fg-subtle">{isOpen ? '▾' : '▸'}</span>}
          {n.label}
        </td>
        <td className="py-2 px-3 text-right tabular-nums">{money(n.actual, { compact: false })}</td>
        <td className="py-2 px-3 text-right tabular-nums text-fg-muted">{money(n.plan, { compact: false })}</td>
        <td className={clsx('py-2 px-3 text-right tabular-nums font-medium', fav >= 0 ? 'text-pos' : 'text-neg')}>
          {fav >= 0 ? '▲' : '▼'} {money(Math.abs(fav), { compact: false })}
        </td>
        <td className={clsx('py-2 px-3 text-right tabular-nums', fav >= 0 ? 'text-pos' : 'text-neg')}>
          {n.plan ? pct((n.actual - n.plan) / Math.abs(n.plan)) : '—'}
        </td>
        <td className="py-2 pl-3 w-40 hidden md:table-cell">
          {depth > 0 && (
            <div className="h-2 bg-surface-2 rounded">
              <div className={clsx('h-2 rounded', fav >= 0 ? 'bg-pos' : 'bg-neg')}
                style={{ width: `${Math.min(100, Math.abs(n.actual - n.plan) / maxAbs[n.group] * 100)}%` }} />
            </div>
          )}
        </td>
      </tr>,
    ];
    if (isOpen && n.children) n.children.forEach((c) => out.push(...render(c, depth + 1)));
    return out;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-fg-muted border-b border-line">
            <th className="text-left py-2 pl-2 pr-4 font-medium">Line</th>
            <th className="text-right py-2 px-3 font-medium">Actual</th>
            <th className="text-right py-2 px-3 font-medium">Plan</th>
            <th className="text-right py-2 px-3 font-medium">Fav / (Unfav)</th>
            <th className="text-right py-2 px-3 font-medium">Var %</th>
            <th className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody>{tree.flatMap((g) => render(g, 0))}</tbody>
      </table>
    </div>
  );
}
