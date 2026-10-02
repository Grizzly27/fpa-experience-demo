import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, CalendarCheck2, CheckCircle2, Download, GitMerge, Loader2, Lock, Play, ScrollText, Search, ShieldCheck, Table2, Unlock, UploadCloud,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AccessNote, Badge, PageHeader, STATUS_TONE, Stat, Tabs } from '../components/ui/primitives';
import { DrawCheck, EASE, Page, rise, stagger } from '../components/motion';
import { can, usePersona } from '../lib/app';
import { trackAction } from '../lib/analytics';
import { COST_CENTERS, GL, LAST_ACTUAL, money, monthLabel } from '../lib/data';
import { ACCOUNT_MAP, CLOSE_CALENDAR, DQ_CHECKS, RUNS, ago, type Run } from '../lib/pipelines';

export default function ActualsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="System of record → planning"
        title="Actuals Management"
        description="Close status, governed loads from the ERP, data quality, account mapping and a drill-down ledger. Everything downstream reads from here."
      />
      <Tabs tabs={[
        { to: '/actuals/close', label: 'Close status', icon: CalendarCheck2 },
        { to: '/actuals/loads', label: 'Data loads', icon: UploadCloud },
        { to: '/actuals/quality', label: 'Data quality', icon: ShieldCheck, count: DQ_CHECKS.filter((c) => c.status === 'warn').length },
        { to: '/actuals/mapping', label: 'Account mapping', icon: GitMerge },
        { to: '/actuals/ledger', label: 'Ledger explorer', icon: Table2 },
      ]} />
      <Routes>
        <Route index element={<Navigate to="close" replace />} />
        <Route path="close" element={<CloseView />} />
        <Route path="loads" element={<LoadsView />} />
        <Route path="quality" element={<QualityView />} />
        <Route path="mapping" element={<MappingView />} />
        <Route path="ledger" element={<LedgerView />} />
      </Routes>
    </Page>
  );
}

// ---------------- Close status ----------------

const CLOSE_STEPS = [
  'Sub-ledgers closed (AP, AR, payroll)',
  'Accruals & reclasses posted',
  'GL loaded to data lake',
  'Trial balance reconciled ($0.00 difference)',
  'Variance commentary collected',
];

function CloseView() {
  const me = usePersona();
  const admin = can(me, 'actuals');
  const [locked, setLocked] = useState(false);
  return (
    <div className="space-y-6">
      <Card title="FY26 close calendar" description="Months lock after reconciliation so reports and forecasts never shift under you.">
        <motion.ol variants={stagger} initial="hidden" animate="show" className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {CLOSE_CALENDAR.map((m) => {
            const status = m.month === LAST_ACTUAL && locked ? 'locked' : m.status;
            return (
              <motion.li key={m.month} variants={rise}
                className={clsx('rounded-lg border p-2.5 transition-colors duration-300',
                  status === 'locked' ? 'border-line bg-surface-2' : status === 'reconciled' ? 'border-pos/40 bg-pos-soft' : status === 'open' ? 'border-warn/40 bg-warn-soft' : 'border-dashed border-line')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{m.label}</span>
                  {status === 'locked' ? <Lock size={12} className="text-fg-subtle" aria-label="Locked" /> : status === 'reconciled' ? <CheckCircle2 size={13} className="text-pos" aria-label="Reconciled" /> : null}
                </div>
                <p className="mt-1 text-2xs capitalize text-fg-muted">{status}</p>
                {m.rows > 0 && <p className="num text-2xs text-fg-subtle">{m.rows} lines</p>}
              </motion.li>
            );
          })}
        </motion.ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={`${monthLabel(LAST_ACTUAL)} close checklist`} description="Owned by Controllership. FP&A can plan on it once the period is locked.">
          <ol className="space-y-2">
            {[...CLOSE_STEPS, 'Period locked for planning'].map((s, i) => {
              const done = i < CLOSE_STEPS.length || locked;
              return (
                <li key={s} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <span className={clsx('grid h-6 w-6 place-items-center rounded-full text-xs', done ? 'bg-pos text-surface' : 'border border-dashed border-line-strong text-fg-subtle')}>
                    {done ? <DrawCheck size={14} /> : i + 1}
                  </span>
                  <span className={clsx('text-sm', done ? 'text-fg' : 'text-fg-muted')}>{s}</span>
                </li>
              );
            })}
          </ol>
        </Card>
        <Card title="Period lock">
          <AnimatePresence mode="wait">
            <motion.div key={String(locked)} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ease: EASE }}
              className="flex flex-col items-center gap-3 py-4 text-center">
              <motion.span initial={{ rotate: locked ? -20 : 0 }} animate={{ rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                className={clsx('grid h-14 w-14 place-items-center rounded-full', locked ? 'bg-fg text-surface' : 'bg-pos-soft text-pos')}>
                {locked ? <Lock size={24} /> : <Unlock size={24} />}
              </motion.span>
              <p className="text-sm font-medium">{locked ? `${monthLabel(LAST_ACTUAL)} is locked` : `${monthLabel(LAST_ACTUAL)} is reconciled, not yet locked`}</p>
              <p className="text-xs text-fg-muted">{locked ? 'Reports and forecasts now treat it as final.' : 'Lock to make it final for reporting and forecast seeding.'}</p>
            </motion.div>
          </AnimatePresence>
          {admin
            ? <button className="btn-primary w-full" onClick={() => setLocked(!locked)}>{locked ? <><Unlock size={15} />Unlock period</> : <><Lock size={15} />Lock {monthLabel(LAST_ACTUAL)}</>}</button>
            : <AccessNote>Only administrators can lock periods.</AccessNote>}
        </Card>
      </div>
    </div>
  );
}

// ---------------- Data loads ----------------

const STAGES = ['Extract from ERP', 'Land in S3 raw', 'Validate (48 rules)', 'Map to planning accounts', 'Publish to curated', 'Refresh semantic layer'];

function LoadsView() {
  const me = usePersona();
  const admin = can(me, 'actuals');
  const [runs, setRuns] = useState<Run[]>(RUNS);
  const [stage, setStage] = useState(-1);

  useEffect(() => {
    if (stage < 0) return;
    if (stage >= STAGES.length) {
      setRuns((r) => [{ id: `r-${2612 + r.length - RUNS.length}`, job: 'gl_daily_load', source: 'ERP general ledger', startedAt: Date.now(), durationSec: 12, rows: 48_390, status: 'success', note: `Manual run by ${me.name}` }, ...r]);
      const t = setTimeout(() => setStage(-1), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), 650);
    return () => clearTimeout(t);
  }, [stage, me.name]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Last successful GL load" value={ago(runs.find((r) => r.job === 'gl_daily_load')!.startedAt)} sub="Nightly 02:00 UTC" icon={UploadCloud} />
        <Stat label="Lines loaded (last run)" value={runs[0].rows.toLocaleString()} sub={runs[0].source} />
        <Stat label="7-day success rate" value="99.6%" delta="▲ 0.4 pts vs prior week" deltaTone="pos" />
        <Stat label="Median duration" value="1m 36s" sub="p95 6m 28s (month-end)" />
      </div>

      <Card title="Pipeline run" description="Trigger an on-demand load. The same job runs on schedule in AWS Glue."
        actions={admin
          ? <button className="btn-primary" onClick={() => { trackAction('run_load'); setStage(0); }} disabled={stage >= 0}>{stage >= 0 ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}{stage >= 0 ? 'Running…' : 'Run GL load now'}</button>
          : <AccessNote>Administrators can trigger loads</AccessNote>}>
        <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-live="polite">
          {STAGES.map((s, i) => {
            const state = stage < 0 ? 'idle' : i < stage ? 'done' : i === stage ? 'active' : 'pending';
            return (
              <li key={s} className={clsx('relative overflow-hidden rounded-md border p-3 text-xs transition-colors duration-300',
                state === 'done' ? 'border-pos/40 bg-pos-soft' : state === 'active' ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}>
                {state === 'active' && <motion.span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ duration: 0.65, ease: 'linear' }} />}
                <span className="flex items-center gap-1.5 font-medium">
                  {state === 'done' ? <span className="text-pos"><DrawCheck size={13} /></span> : state === 'active' ? <Loader2 size={13} className="animate-spin text-accent" /> : <span className="num text-fg-subtle">{i + 1}</span>}
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Run history" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              {['Run', 'Job', 'Source', 'Started', 'Duration', 'Rows', 'Status', 'Notes'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}
            </tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {runs.map((r) => (
                  <motion.tr key={r.id} layout initial={{ opacity: 0, backgroundColor: 'rgb(var(--accent) / 0.12)' }} animate={{ opacity: 1, backgroundColor: 'rgb(var(--accent) / 0)' }} transition={{ duration: 1.2 }}
                    className="border-b border-line">
                    <td className="num px-4 py-2 font-mono text-xs text-fg-muted">{r.id}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.job}</td>
                    <td className="px-4 py-2">{r.source}</td>
                    <td className="px-4 py-2 text-fg-muted">{ago(r.startedAt)}</td>
                    <td className="num px-4 py-2">{Math.floor(r.durationSec / 60)}m {r.durationSec % 60}s</td>
                    <td className="num px-4 py-2">{r.rows.toLocaleString()}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE[r.status]} dot className="capitalize">{r.status}</Badge></td>
                    <td className="max-w-[280px] truncate px-4 py-2 text-xs text-fg-muted" title={r.note}>{r.note ?? '—'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------- Data quality ----------------

const CRM_ISSUES = [
  { id: 'OPP-48211', account: 'Brightline Retail', region: '—', amount: 182_400 },
  { id: 'OPP-48230', account: 'Harbor Outfitters', region: '—', amount: 96_000 },
  { id: 'OPP-48244', account: 'Summit Home Co.', region: '—', amount: 41_750 },
];

function QualityView() {
  const me = usePersona();
  const admin = can(me, 'actuals');
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const allFixed = fixed.size === CRM_ISSUES.length;
  const checks = DQ_CHECKS.map((c) => (c.status === 'warn' && allFixed ? { ...c, status: 'pass' as const, detail: 'All CRM owner regions mapped' } : c));
  const passing = checks.filter((c) => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <Card title="Validation rules" description={`${passing} of ${checks.length} rule groups passing · 48 individual rules run on every load`}
        actions={<Badge tone={passing === checks.length ? 'pos' : 'warn'} dot>{passing === checks.length ? 'All passing' : '1 warning'}</Badge>}>
        <motion.ul variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((c) => (
            <motion.li key={c.name} variants={rise} layout className={clsx('flex gap-3 rounded-lg border p-3 transition-colors duration-300', c.status === 'pass' ? 'border-line' : 'border-warn/40 bg-warn-soft')}>
              {c.status === 'pass' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-pos" aria-label="Pass" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-label="Warning" />}
              <span><span className="block text-sm font-medium">{c.name}</span><span className="text-xs text-fg-muted">{c.detail}</span></span>
            </motion.li>
          ))}
        </motion.ul>
      </Card>

      <Card title="Exceptions · CRM bookings" description="Records quarantined from the curated zone until resolved. Downstream reports are unaffected." flush>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            {['Record', 'Account', 'Owner region', 'Amount', ''].map((h, i) => <th key={i} className="px-4 py-2.5 text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {CRM_ISSUES.map((r) => {
              const ok = fixed.has(r.id);
              return (
                <tr key={r.id} className="border-b border-line">
                  <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-4 py-2">{r.account}</td>
                  <td className="px-4 py-2">
                    <AnimatePresence mode="wait">
                      {ok ? <motion.span key="ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}><Badge tone="pos">North America</Badge></motion.span>
                        : <motion.span key="no" exit={{ opacity: 0 }}><Badge tone="warn">Unmapped</Badge></motion.span>}
                    </AnimatePresence>
                  </td>
                  <td className="num px-4 py-2">{money(r.amount, { compact: false })}</td>
                  <td className="px-4 py-2 text-right">
                    {admin && !ok && <button className="btn-secondary h-7 px-2 text-xs" onClick={() => setFixed((s) => new Set(s).add(r.id))}>Map to North America</button>}
                    {ok && <span className="inline-flex items-center gap-1 text-xs text-pos"><DrawCheck size={13} />Released</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!admin && <div className="p-4"><AccessNote>Administrators resolve data exceptions.</AccessNote></div>}
      </Card>
    </div>
  );
}

// ---------------- Account mapping ----------------

function MappingView() {
  const [q, setQ] = useState('');
  const rows = ACCOUNT_MAP.filter((r) => `${r.gl} ${r.name} ${r.planning} ${r.group}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="GL → planning account map" description="Hundreds of ERP accounts roll up to a small, stable planning chart of accounts. Coverage is checked on every load."
      actions={<div className="relative w-56"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden /><input className="input h-8 pl-8" placeholder="Filter accounts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter accounts" /></div>}
      flush>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="text-xs text-fg-muted">Mapping coverage</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><motion.div className="h-full rounded-full bg-pos" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1, ease: EASE }} /></div>
        <span className="num text-xs font-semibold text-pos">100%</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
          {['GL range', 'ERP description', '', 'Planning account', 'Group'].map((h, i) => <th key={i} className="px-4 py-2.5 text-left">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.gl} className="border-b border-line hover:bg-surface-2/60">
              <td className="px-4 py-2 font-mono text-xs">{r.gl}</td>
              <td className="px-4 py-2 text-fg-muted">{r.name}</td>
              <td className="px-1 py-2 text-fg-subtle" aria-hidden>→</td>
              <td className="px-4 py-2 font-medium">{r.planning}</td>
              <td className="px-4 py-2"><Badge tone={r.group === 'Revenue' ? 'pos' : r.group === 'COGS' ? 'warn' : 'info'}>{r.group}</Badge></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted">No accounts match “{q}”.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------- Ledger explorer ----------------

const PAGE = 20;

function LedgerView() {
  const months = [...new Set(GL.filter((r) => r.scenario === 'actual').map((r) => r.month))].sort().reverse();
  const [month, setMonth] = useState(LAST_ACTUAL);
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => GL.filter((r) => r.scenario === 'actual'
    && (month === 'all' || r.month === month)
    && (dept === 'all' || r.department === dept)
    && (!q || r.account.toLowerCase().includes(q.toLowerCase()))), [month, dept, q]);
  const total = rows.reduce((s, r) => s + (r.account_group === 'Revenue' ? r.amount : -r.amount), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const exportCsv = () => {
    trackAction('export_csv');
    const head = 'month,department,account,account_group,amount\n';
    const body = rows.map((r) => [r.month, r.department, r.account, r.account_group, r.amount.toFixed(2)].map((v) => `"${v}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([head + body], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `actuals_${month}_${dept}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => setPage(0), [month, dept, q]);

  return (
    <Card title="Ledger explorer" description="Curated actuals at the planning grain. Production drills further to journal lines." flush
      actions={<button className="btn-secondary" onClick={exportCsv}><Download size={15} />Export CSV</button>}>
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <label className="text-xs"><span className="mb-1 block font-medium text-fg-muted">Period</span>
          <select className="input h-8 w-36" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All periods</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select></label>
        <label className="text-xs"><span className="mb-1 block font-medium text-fg-muted">Department</span>
          <select className="input h-8 w-44" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All departments</option>
            {['Revenue', ...COST_CENTERS].map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="text-xs"><span className="mb-1 block font-medium text-fg-muted">Account</span>
          <div className="relative w-56"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden /><input className="input h-8 pl-8" placeholder="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} /></div></label>
        <div className="ml-auto text-right text-xs text-fg-muted">
          <span className="num block text-sm font-semibold text-fg">{rows.length.toLocaleString()} lines</span>
          Net {money(total, { compact: false })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            {['Period', 'Department', 'Account', 'Group', 'Amount'].map((h) => <th key={h} className={clsx('px-4 py-2.5', h === 'Amount' ? 'text-right' : 'text-left')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.slice(page * PAGE, (page + 1) * PAGE).map((r, i) => (
              <tr key={`${r.month}-${r.department}-${r.account}-${i}`} className="border-b border-line hover:bg-surface-2/60">
                <td className="px-4 py-2">{monthLabel(r.month)}</td>
                <td className="px-4 py-2">{r.department}</td>
                <td className="px-4 py-2">{r.account}</td>
                <td className="px-4 py-2 text-fg-muted">{r.account_group}</td>
                <td className="num px-4 py-2 text-right">{money(r.amount, { compact: false })}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted"><ScrollText className="mx-auto mb-2 text-fg-subtle" />No lines match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-fg-muted">
        <span>Page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <button className="btn-secondary h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <button className="btn-secondary h-7 px-2 text-xs" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </Card>
  );
}
