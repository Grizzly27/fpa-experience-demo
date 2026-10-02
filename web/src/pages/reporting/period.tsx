import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { PERIODS, monthLabel, type Period } from '../../lib/data';

/** Reporting period lives in the URL (?p=Q3-26) so every view is shareable. */
export function usePeriod(): [Period, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const id = params.get('p') ?? 'YTD';
  const period = PERIODS.find((x) => x.id === id)
    ?? (/^\d{4}-\d{2}$/.test(id) ? { id, label: monthLabel(id), months: [id] } : PERIODS[0]);
  return [period, (next) => setParams((p) => { p.set('p', next); return p; }, { replace: true })];
}

export function PeriodPicker() {
  const [period, setPeriod] = usePeriod();
  const options = PERIODS.some((x) => x.id === period.id) ? PERIODS : [...PERIODS, period];
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Reporting period">
      {options.map((x) => (
        <button key={x.id} role="radio" aria-checked={period.id === x.id} onClick={() => setPeriod(x.id)}
          className={clsx('relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors', period.id === x.id ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
          {period.id === x.id && <motion.span layoutId="period-pill" className="absolute inset-0 rounded-md bg-surface shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{x.label}</span>
        </button>
      ))}
    </div>
  );
}
