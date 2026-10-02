import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { COST_CENTERS, inPeriod, money, sumBy } from '../../lib/data';
import { useTokens } from '../../lib/useTokens';
import { PeriodPicker, usePeriod } from './period';

interface Step { label: string; delta: number; kind: 'total' | 'step' }

export function BridgeView() {
  const [period] = usePeriod();
  const tk = useTokens();
  const [showTable, setShowTable] = useState(false);

  const steps = useMemo<Step[]>(() => {
    const rows = inPeriod(period);
    const oi = (s: 'actual' | 'plan') => sumBy(rows, s, (r) => r.account_group === 'Revenue') - sumBy(rows, s, (r) => r.account_group !== 'Revenue');
    const v = (pred: (r: (typeof rows)[number]) => boolean, sign: 1 | -1) => sign * (sumBy(rows, 'actual', pred) - sumBy(rows, 'plan', pred));
    return [
      { label: 'Plan OI', delta: oi('plan'), kind: 'total' },
      { label: 'HW revenue', delta: v((r) => r.account === 'Hardware Revenue', 1), kind: 'step' },
      { label: 'Sub revenue', delta: v((r) => r.account === 'Subscription Revenue', 1), kind: 'step' },
      { label: 'COGS', delta: v((r) => r.account_group === 'COGS', -1), kind: 'step' },
      ...COST_CENTERS.map((cc): Step => ({ label: cc === 'Customer Success' ? 'Cust. Success' : cc, delta: v((r) => r.account_group === 'Opex' && r.department === cc, -1), kind: 'step' })),
      { label: 'Actual OI', delta: oi('actual'), kind: 'total' },
    ];
  }, [period]);

  const data = useMemo(() => {
    let run = 0;
    return steps.map((s) => {
      if (s.kind === 'total') { run = s.delta; return { ...s, base: 0, value: s.delta, end: s.delta }; }
      const start = run;
      run += s.delta;
      return { ...s, base: Math.min(start, run), value: Math.abs(s.delta), end: run };
    });
  }, [steps]);

  const min = Math.min(...data.map((d) => d.base));
  const color = (d: (typeof data)[number], i: number) => d.kind === 'total' ? (i === 0 ? tk['chart-2'] : tk.accent) : d.delta >= 0 ? tk.pos : tk.neg;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">How plan operating income became actual: each bar is a favorable (▲) or unfavorable (▼) driver.</p>
        <PeriodPicker />
      </div>
      <Card title={`Operating income bridge · ${period.label}`} description="Plan → actual, by revenue line, COGS and cost center">
        <div className="h-[360px]">
          <ResponsiveContainer>
            <BarChart key={period.id} data={data} margin={{ top: 28, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={tk.line} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} interval={0} />
              <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} width={60} domain={[Math.floor(min * 0.96 / 1e6) * 1e6, 'auto']} allowDataOverflow />
              <Tooltip cursor={{ fill: tk.line, opacity: 0.35 }}
                contentStyle={{ background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 6, fontSize: 12 }}
                formatter={(_v, _n, item) => {
                  const d = item.payload as (typeof data)[number];
                  return [d.kind === 'total' ? money(d.delta, { compact: false }) : `${d.delta >= 0 ? '▲' : '▼'} ${money(Math.abs(d.delta), { compact: false })}`, d.kind === 'total' ? 'Operating income' : 'Impact'];
                }} />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]} animationDuration={900} animationEasing="ease-out">
                {data.map((d, i) => <Cell key={d.label} fill={color(d, i)} />)}
                <LabelList dataKey="delta" position="top" style={{ fontSize: 10, fill: tk['fg-muted'], fontVariantNumeric: 'tabular-nums' }}
                  formatter={(v) => {
                    const n = Number(v);
                    return Math.abs(n) > 5e6 ? money(n) : `${n >= 0 ? '▲' : '▼'}${money(Math.abs(n))}`;
                  }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <button onClick={() => setShowTable(!showTable)} className="btn-ghost mt-2 px-1 text-xs" aria-expanded={showTable}>
          <ChevronDown size={14} className={clsx('transition-transform', showTable && 'rotate-180')} /> {showTable ? 'Hide' : 'Show'} as table
        </button>
        <AnimatePresence initial={false}>
          {showTable && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <table className="mt-2 w-full max-w-lg text-sm">
                <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle"><th className="py-2 text-left">Step</th><th className="py-2 text-right">Impact</th><th className="py-2 text-right">Running OI</th></tr></thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.label} className={clsx('border-b border-line', d.kind === 'total' && 'font-semibold')}>
                      <td className="py-1.5">{d.label}</td>
                      <td className={clsx('num py-1.5 text-right', d.kind === 'step' && (d.delta >= 0 ? 'text-pos' : 'text-neg'))}>
                        {d.kind === 'total' ? '—' : `${d.delta >= 0 ? '▲' : '▼'} ${money(Math.abs(d.delta), { compact: false })}`}
                      </td>
                      <td className="num py-1.5 text-right">{money(d.end, { compact: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
