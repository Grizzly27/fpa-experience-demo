import { useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronDown, Download, FileSpreadsheet, Users, Wallet, Waypoints } from 'lucide-react';
import { Badge } from '../../components/ui/primitives';
import { rise, stagger } from '../../components/motion';
import { COST_CENTERS, DRIVERS, GL, LAST_ACTUAL, money, monthLabel } from '../../lib/data';

type Table = { head: string[]; rows: (string | number)[][] };

const fy26Months = [...new Set(GL.filter((r) => r.fiscal_year === 'FY26' && r.month <= LAST_ACTUAL).map((r) => r.month))].sort();
const act = (pred: (r: (typeof GL)[number]) => boolean) => GL.filter((r) => r.scenario === 'actual' && pred(r)).reduce((s, r) => s + r.amount, 0);

const REPORTS: { id: string; title: string; desc: string; icon: typeof Wallet; owner: string; build: () => Table }[] = [
  {
    id: 'pnl', title: 'Monthly P&L · FY26 actuals', icon: Wallet, owner: 'FP&A', desc: 'Revenue, COGS, opex and operating income by month.',
    build: () => ({
      head: ['Line', ...fy26Months.map(monthLabel)],
      rows: (['Revenue', 'COGS', 'Opex'] as const).map((g) => [g, ...fy26Months.map((m) => Math.round(act((r) => r.month === m && r.account_group === g)))]),
    }),
  },
  {
    id: 'opex', title: 'Opex by cost center · YTD', icon: Waypoints, owner: 'FP&A', desc: 'Actual vs plan by cost center, year to date.',
    build: () => ({
      head: ['Cost center', 'Actual', 'Plan', 'Variance'],
      rows: COST_CENTERS.map((cc) => {
        const f = (s: string) => GL.filter((r) => r.scenario === s && r.department === cc && r.account_group === 'Opex' && fy26Months.includes(r.month)).reduce((t, r) => t + r.amount, 0);
        return [cc, Math.round(f('actual')), Math.round(f('plan')), Math.round(f('plan') - f('actual'))];
      }),
    }),
  },
  {
    id: 'hc', title: 'Headcount by department', icon: Users, owner: 'People finance', desc: `Ending headcount, actual vs plan, ${monthLabel(LAST_ACTUAL)}.`,
    build: () => ({
      head: ['Department', 'Actual', 'Plan', 'Gap'],
      rows: COST_CENTERS.map((cc) => {
        const g = (s: string) => DRIVERS.find((d) => d.month === LAST_ACTUAL && d.scenario === s && d.department === cc && d.driver === 'headcount')?.value ?? 0;
        return [cc, g('actual').toFixed(1), g('plan').toFixed(1), (g('actual') - g('plan')).toFixed(1)];
      }),
    }),
  },
];

function toCsv(t: Table) {
  return [t.head, ...t.rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}

export function LibraryView() {
  const [open, setOpen] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Set<string>>(new Set(['pnl']));
  const download = (id: string, t: Table) => {
    const url = URL.createObjectURL(new Blob([toCsv(t)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `${id}_${LAST_ACTUAL}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-3">
      {REPORTS.map((r) => {
        const isOpen = open === r.id;
        const t = isOpen ? r.build() : null;
        return (
          <motion.li key={r.id} variants={rise} className="rounded-lg bg-surface shadow-card">
            <div className="flex flex-wrap items-center gap-4 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent"><r.icon size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{r.title} <Badge>{r.owner}</Badge>
                  {scheduled.has(r.id) && <Badge tone="info"><CalendarClock size={11} />Weekly · Mon 7am</Badge>}</p>
                <p className="text-xs text-fg-muted">{r.desc} Refreshed from curated actuals after every load.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={scheduled.has(r.id)}
                  onChange={() => setScheduled((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                Schedule
              </label>
              <button className="btn-secondary" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                Preview <ChevronDown size={14} className={clsx('transition-transform', isOpen && 'rotate-180')} />
              </button>
              <button className="btn-secondary" onClick={() => download(r.id, r.build())}><Download size={15} />CSV</button>
            </div>
            <AnimatePresence initial={false}>
              {isOpen && t && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                  <div className="overflow-x-auto border-t border-line">
                    <table className="w-full text-sm">
                      <thead><tr className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t.head.map((h, i) => <th key={h} className={clsx('px-4 py-2', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
                      <tbody>{t.rows.map((row) => (
                        <tr key={String(row[0])} className="border-t border-line">
                          {row.map((v, i) => <td key={i} className={clsx('px-4 py-1.5', i ? 'num text-right' : 'font-medium')}>{typeof v === 'number' ? money(v) : v}</td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
      <li className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-4 text-xs text-fg-muted">
        <FileSpreadsheet size={15} aria-hidden /> In production, reports also publish to Power BI / Tableau through the same governed semantic layer.
      </li>
    </motion.ul>
  );
}
