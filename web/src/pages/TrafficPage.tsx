import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, Check, ChevronDown, Copy, Eye, FlaskConical, Globe2, KeyRound, Laptop, Loader2, Lock, Mail, MousePointerClick, RefreshCw, ShieldCheck, Smartphone, Tablet, Timer, UserRound, Users,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge, PageHeader } from '../components/ui/primitives';
import { CountUp, EASE, Page, rise, stagger } from '../components/motion';
import { useTokens } from '../lib/useTokens';
import { ACTION_LABEL, PERSONA_LABEL, Unauthorized, fetchStats, pageLabel, useOwner, type Lead, type Named, type SessionRow, type Stats } from '../lib/owner';
import { sampleStats } from '../lib/trafficSample';
import { excludeThisBrowser, isExcluded } from '../lib/analytics';
import { ago } from '../lib/pipelines';

const RANGES = [{ days: 1, label: '24 hours' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];
const fmtDur = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
const fmtNum = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : Math.round(n).toLocaleString());
const where = (s: { city?: string; country?: string }) => [s.city, s.country].filter(Boolean).join(', ') || 'Unknown location';
const DeviceIcon = ({ d, size = 14 }: { d: string; size?: number }) => d === 'Mobile' ? <Smartphone size={size} aria-hidden /> : d === 'Tablet' ? <Tablet size={size} aria-hidden /> : <Laptop size={size} aria-hidden />;

export default function TrafficPage() {
  const key = useOwner((s) => s.key);
  const [sample, setSample] = useState(false);
  if (!key && !sample) return <Gate onSample={() => setSample(true)} />;
  return <Dashboard ownerKey={key} sample={sample || !key} onExitSample={() => setSample(false)} />;
}

// ---------------- passphrase gate ----------------

function Gate({ onSample }: { onSample: () => void }) {
  const unlock = useOwner((s) => s.unlock);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad' | 'error'>('idle');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('checking');
    try { await unlock(value); } catch (err) { setState(err instanceof Unauthorized ? 'bad' : 'error'); }
  };
  return (
    <Page>
      <div className="mx-auto mt-6 grid max-w-4xl overflow-hidden rounded-xl bg-surface shadow-card md:grid-cols-2">
        <div className="relative overflow-hidden bg-nav p-8 text-nav-fg">
          <motion.div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#3B82F6]/20 blur-2xl" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }} />
          <Activity size={28} className="relative text-[#60A5FA]" aria-hidden />
          <h1 className="relative mt-4 text-xl font-semibold">Traffic & engagement</h1>
          <p className="relative mt-2 text-sm text-nav-muted">See how people use the public demo: live visitors, journeys through the app, where they come from, and what they try.</p>
          <ul className="relative mt-6 space-y-2 text-xs text-nav-muted">
            <li className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#4ADE80]" />Anonymous by default: random visitor ids, no IP addresses. Emails only when a visitor chooses to share one</li>
            <li className="flex gap-2"><Globe2 size={14} className="mt-0.5 shrink-0 text-[#4ADE80]" />Location is approximate (city level, from AWS CloudFront)</li>
            <li className="flex gap-2"><Lock size={14} className="mt-0.5 shrink-0 text-[#4ADE80]" />Data lives in your AWS account and expires after 90 days</li>
          </ul>
        </div>
        <form onSubmit={submit} className="p-8">
          <p className="eyebrow">Site owner</p>
          <h2 className="mt-1 text-lg font-semibold">Unlock with your passphrase</h2>
          <p className="mt-1 text-sm text-fg-muted">Checked by the server on every request. Kept only for this browser tab.</p>
          <label className="mt-5 block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Passphrase</span>
            <input type="password" autoComplete="current-password" className={clsx('input h-10', state === 'bad' && 'border-neg focus:border-neg focus:ring-neg/25')}
              value={value} onChange={(e) => { setValue(e.target.value); if (state !== 'checking') setState('idle'); }} aria-invalid={state === 'bad'} aria-describedby="gate-msg" />
          </label>
          <p id="gate-msg" role="alert" className="mt-1.5 min-h-[18px] text-xs text-neg">
            {state === 'bad' && 'That passphrase was not accepted.'}{state === 'error' && 'Could not reach the analytics service. Try again.'}
          </p>
          <button className="btn-primary mt-2 h-10 w-full" disabled={!value || state === 'checking'}>
            {state === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Unlock dashboard
          </button>
          <button type="button" onClick={onSample} className="btn-ghost mt-3 w-full text-xs"><FlaskConical size={14} />Preview with sample data</button>
        </form>
      </div>
    </Page>
  );
}

// ---------------- dashboard ----------------

function Dashboard({ ownerKey, sample, onExitSample }: { ownerKey: string | null; sample: boolean; onExitSample: () => void }) {
  const lock = useOwner((s) => s.lock);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(isExcluded());

  const load = useCallback(async () => {
    if (sample || !ownerKey) { setData(sampleStats(days)); return; }
    setLoading(true);
    try { setData(await fetchStats(ownerKey, days)); setError(null); }
    catch (e) { if (e instanceof Unauthorized) lock(); else setError((e as Error).message); }
    finally { setLoading(false); }
  }, [days, ownerKey, sample, lock]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (sample) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, sample]);

  const empty = data && !sample && data.kpis.sessions === 0;

  return (
    <Page>
      <PageHeader
        eyebrow={sample ? 'Preview' : 'Site owner · private'}
        title="Traffic & engagement"
        description="Real visits to the public demo. Anonymous unless a visitor chooses to share their email; approximate location, no IP addresses."
        actions={<>
          {data && <span className="text-xs text-fg-subtle">Updated {ago(Date.parse(data.generatedAt))}</span>}
          <button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={15} className={clsx(loading && 'animate-spin')} />Refresh</button>
          {sample ? <button className="btn-secondary" onClick={onExitSample}><Lock size={15} />Exit preview</button>
            : <button className="btn-secondary" onClick={lock}><Lock size={15} />Lock</button>}
        </>}
      />

      {/* one filter row, above everything it scopes */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.days} role="radio" aria-checked={days === r.days} onClick={() => setDays(r.days)}
              className={clsx('relative rounded-md px-3 py-1 text-xs font-medium transition-colors', days === r.days ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
              {days === r.days && <motion.span layoutId="range-pill" className="absolute inset-0 rounded-md bg-surface shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <span className="relative">Last {r.label}</span>
            </button>
          ))}
        </div>
        {sample && <Badge tone="warn" dot>Sample data, not real traffic</Badge>}
        {!sample && (
          <label className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={excluded} onChange={(e) => { excludeThisBrowser(e.target.checked); setExcluded(e.target.checked); }} />
            Exclude my own visits from this browser
          </label>
        )}
      </div>

      {error && <div className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-sm text-neg">{error}</div>}
      {!data ? <Skeleton /> : empty ? <Empty /> : (
        <div className={clsx('space-y-6 transition-opacity duration-300', loading && 'opacity-60')}>
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <LiveCard data={data} />
            <KpiRow data={data} />
          </div>
          <LeadsCard leads={data.leads ?? []} />
          <TrendCard data={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <SessionExplorer sessions={data.sessions} />
            <FeedCard data={data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <FunnelCard funnel={data.funnel} />
            <HeatmapCard heat={data.heatmapUtc} />
          </div>
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Breakdown title="Top pages" items={data.pages.map((x) => ({ ...x, name: pageLabel(x.name) }))} unit="views" />
            <Breakdown title="Where visitors come from" items={data.referrers} unit="sessions" />
            <Breakdown title="Locations" items={data.cities} unit="sessions" />
            <Breakdown title="Demo identity chosen" items={data.personas.map((x) => ({ ...x, name: PERSONA_LABEL[x.name] ?? x.name }))} unit="sessions" empty="No one has signed in yet" />
            <Breakdown title="What they tried" items={data.actions.map((x) => ({ ...x, name: ACTION_LABEL[x.name] ?? x.name }))} unit="times" empty="No interactions yet" />
            <Breakdown title="Devices & browsers" items={[...data.devices, ...data.browsers.map((b) => ({ ...b, name: `${b.name} (browser)` }))]} unit="sessions" />
          </motion.div>
        </div>
      )}
    </Page>
  );
}

function Skeleton() {
  return <div className="space-y-4" aria-busy="true"><div className="h-32 animate-pulse rounded-lg bg-surface-2" /><div className="h-72 animate-pulse rounded-lg bg-surface-2" /></div>;
}

function Empty() {
  return (
    <Card>
      <div className="flex flex-col items-center py-12 text-center">
        <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent"><Activity size={24} /></motion.span>
        <h2 className="mt-4 text-base font-semibold">No visits in this range yet</h2>
        <p className="mt-1 max-w-md text-sm text-fg-muted">Share the demo link and visits will appear here within seconds. Your own visits from this browser are excluded.</p>
        <code className="mt-4 rounded-md bg-surface-2 px-3 py-1.5 text-xs">https://grizzly27.github.io/fpa-experience-demo/</code>
      </div>
    </Card>
  );
}

function LiveCard({ data }: { data: Stats }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-nav p-5 text-nav-fg shadow-card">
      <motion.div aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#22C55E]/15 blur-2xl" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }} />
      <p className="relative flex items-center gap-2 text-xs font-medium text-nav-muted">
        <span className="relative flex h-2.5 w-2.5">
          {data.live.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-75" />}
          <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', data.live.length ? 'bg-[#4ADE80]' : 'bg-nav-muted')} />
        </span>
        On the demo right now
      </p>
      <CountUp value={data.live.length} format={(n) => String(Math.round(n))} className="relative mt-1 block text-5xl font-semibold tracking-tight" />
      <ul className="relative mt-3 space-y-1.5 text-xs">
        <AnimatePresence initial={false}>
          {data.live.slice(0, 4).map((l) => (
            <motion.li key={l.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <DeviceIcon d={l.device} size={13} />
              <span className="truncate">{where(l)}</span>
              <span className="ml-auto shrink-0 text-nav-muted">{pageLabel(l.page)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {!data.live.length && <li className="text-nav-muted">No one in the last 5 minutes</li>}
      </ul>
    </div>
  );
}

function KpiRow({ data }: { data: Stats }) {
  const { kpis: k, previous: p } = data;
  const items: { label: string; v: number; prev: number; fmt: (n: number) => string; icon: typeof Users; lowerIsBetter?: boolean; spark?: 'visitors' | 'sessions' | 'pageviews' }[] = [
    { label: 'Unique visitors', v: k.visitors, prev: p.visitors, fmt: fmtNum, icon: Users, spark: 'visitors' },
    { label: 'Sessions', v: k.sessions, prev: p.sessions, fmt: fmtNum, icon: Activity, spark: 'sessions' },
    { label: 'Page views', v: k.pageviews, prev: p.pageviews, fmt: fmtNum, icon: Eye, spark: 'pageviews' },
    { label: 'Avg engaged time', v: k.avgEngaged, prev: p.avgEngaged, fmt: fmtDur, icon: Timer },
    { label: 'Bounce rate', v: k.bounceRate, prev: p.bounceRate, fmt: fmtPct, icon: MousePointerClick, lowerIsBetter: true },
    { label: 'Returning visitors', v: k.returningRate, prev: p.returningRate, fmt: fmtPct, icon: UserRound },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {items.map((it) => {
        const delta = it.prev ? (it.v - it.prev) / it.prev : null;
        const good = delta === null ? null : it.lowerIsBetter ? delta <= 0 : delta >= 0;
        return (
          <motion.div key={it.label} variants={rise} className="rounded-lg bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-fg-muted">{it.label}</p><it.icon size={14} className="text-fg-subtle" aria-hidden /></div>
            <CountUp value={it.v} format={it.fmt} className="mt-1 block text-2xl font-semibold tracking-tight" />
            <p className={clsx('mt-0.5 text-xs font-medium', good === null ? 'text-fg-subtle' : good ? 'text-pos' : 'text-neg')}>
              {delta === null ? 'No prior period' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}% vs previous ${data.days === 1 ? 'day' : `${data.days} days`}`}
            </p>
            {it.spark && <Spark values={data.series.map((s) => s[it.spark!])} />}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/** De-emphasis sparkline with the current period's last point in the accent. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 22 - (v / max) * 20] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div className="relative mt-2 h-6">
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
        <path d={d} fill="none" className="stroke-fg-subtle" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* end dot as HTML so it stays round when the SVG stretches */}
      <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface" style={{ left: `${lx}%`, top: `${(ly / 24) * 100}%` }} aria-hidden />
    </div>
  );
}

function TrendCard({ data }: { data: Stats }) {
  const tk = useTokens();
  const [metric, setMetric] = useState<'visitors' | 'sessions' | 'pageviews'>('visitors');
  const [table, setTable] = useState(false);
  const label = { visitors: 'Visitors', sessions: 'Sessions', pageviews: 'Page views' }[metric];
  const fmtT = (t: string) => new Date(t).toLocaleString(undefined, data.hourly ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });
  return (
    <Card title={`${label} over time`} description={data.hourly ? 'Hourly, your local time' : 'Daily'}
      actions={
        <div className="flex gap-1">
          {(['visitors', 'sessions', 'pageviews'] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} aria-pressed={metric === m}
              className={clsx('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', metric === m ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-fg-muted hover:text-fg')}>
              {{ visitors: 'Visitors', sessions: 'Sessions', pageviews: 'Page views' }[m]}
            </button>
          ))}
        </div>
      }>
      <div className="h-64">
        <ResponsiveContainer>
          <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tk.accent} stopOpacity={0.18} />
                <stop offset="100%" stopColor={tk.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={tk.line} />
            <XAxis dataKey="t" tickFormatter={fmtT} tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} width={36} />
            <Tooltip cursor={{ stroke: tk['fg-subtle'], strokeWidth: 1 }} labelFormatter={(t) => new Date(String(t)).toLocaleString(undefined, data.hourly ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { weekday: 'short', month: 'short', day: 'numeric' })}
              formatter={(v) => [Number(v).toLocaleString(), label]} contentStyle={{ background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 6, fontSize: 12 }} />
            <Area key={metric} type="monotone" dataKey={metric} stroke={tk.accent} strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 4, stroke: tk.surface, strokeWidth: 2 }} animationDuration={800} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <button onClick={() => setTable(!table)} className="btn-ghost mt-1 px-1 text-xs" aria-expanded={table}>
        <ChevronDown size={14} className={clsx('transition-transform', table && 'rotate-180')} />{table ? 'Hide' : 'Show'} as table
      </button>
      {table && (
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface"><tr className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle"><th className="py-1.5 text-left">{data.hourly ? 'Hour' : 'Day'}</th><th className="text-right">Visitors</th><th className="text-right">Sessions</th><th className="text-right">Page views</th></tr></thead>
            <tbody>{[...data.series].reverse().map((s) => (
              <tr key={s.t} className="num border-t border-line"><td className="py-1">{fmtT(s.t)}</td><td className="text-right">{s.visitors}</td><td className="text-right">{s.sessions}</td><td className="text-right">{s.pageviews}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SessionExplorer({ sessions }: { sessions: SessionRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title="Session explorer" description="Each visit, newest first. Expand one to replay the path through the demo." flush>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-surface"><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            {['When', 'Visitor', 'Where', 'Device', 'Source', 'Signed in as', 'Pages', 'Engaged', ''].map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 text-left first:pl-4">{h}</th>)}
          </tr></thead>
          <tbody>
            {sessions.map((s) => {
              const isOpen = open === s.id;
              return (
                <SessionRowView key={s.id} s={s} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : s.id)} />
              );
            })}
            {!sessions.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-fg-muted">No sessions in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SessionRowView({ s, isOpen, onToggle }: { s: SessionRow; isOpen: boolean; onToggle: () => void }) {
  const t0 = Date.parse(s.start);
  return (
    <>
      <tr onClick={onToggle} className={clsx('cursor-pointer border-b border-line transition-colors hover:bg-surface-2/60', isOpen && 'bg-surface-2/60')} aria-expanded={isOpen}>
        <td className="whitespace-nowrap py-2 pl-4 pr-3">
          <span className="block font-medium">{ago(t0)}</span>
          <span className="text-xs text-fg-subtle">{new Date(t0).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        </td>
        <td className="px-3 py-2">{s.email ? <span className="inline-flex items-center gap-1.5 font-medium text-accent"><Mail size={13} aria-hidden />{s.email}</span> : <span className="text-fg-subtle">Anonymous</span>}</td>
        <td className="px-3 py-2">{where(s)}{s.new ? '' : <Badge className="ml-1.5">Returning</Badge>}</td>
        <td className="whitespace-nowrap px-3 py-2 text-fg-muted"><span className="inline-flex items-center gap-1.5"><DeviceIcon d={s.device} />{s.browser}</span></td>
        <td className="px-3 py-2 text-fg-muted">{s.ref || 'Direct'}</td>
        <td className="px-3 py-2">{s.persona ? <Badge tone="accent">{PERSONA_LABEL[s.persona] ?? s.persona}</Badge> : <span className="text-fg-subtle">—</span>}</td>
        <td className="num px-3 py-2">{s.pages.length}</td>
        <td className="num whitespace-nowrap px-3 py-2">{fmtDur(s.engaged)}</td>
        <td className="pr-3"><ChevronDown size={14} className={clsx('text-fg-subtle transition-transform', isOpen && 'rotate-180')} /></td>
      </tr>
      <AnimatePresence initial={false}>
        {isOpen && (
          <tr><td colSpan={9} className="p-0">
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden bg-surface-2/40">
              <ol className="flex flex-wrap items-center gap-1.5 px-4 py-3">
                {s.pages.map((p, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-fg-subtle" aria-hidden>→</span>}
                    <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs">
                      <span className="font-medium">{pageLabel(p.p)}</span>
                      <span className="ml-1.5 text-fg-subtle">+{fmtDur((Date.parse(p.ts) - t0) / 1000)}</span>
                    </span>
                  </motion.li>
                ))}
              </ol>
              <p className="px-4 pb-3 text-xs text-fg-muted">
                Visitor {s.visitor} · {s.os} · {s.actions} interaction{s.actions === 1 ? '' : 's'} · session {s.id}
              </p>
            </motion.div>
          </td></tr>
        )}
      </AnimatePresence>
    </>
  );
}

function LeadsCard({ leads }: { leads: Lead[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText([...new Set(leads.map((l) => l.email))].join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Mail size={15} className="text-accent" />People who shared their email</span>}
      description="Visitors who chose to enter an email on the sign-in screen, with what they did afterwards."
      actions={leads.length > 0 && <button className="btn-secondary" onClick={copy}>{copied ? <Check size={15} className="text-pos" /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy emails'}</button>}
      flush>
      {!leads.length ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">No one has shared an email in this range yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              {['Email', 'When', 'Time in demo', 'Pages', 'Where', 'Source'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left">{h}</th>)}
            </tr></thead>
            <motion.tbody variants={stagger} initial="hidden" animate="show">
              {leads.map((l) => (
                <motion.tr key={`${l.email}-${l.start}`} variants={rise} className="border-b border-line">
                  <td className="px-4 py-2"><a href={`mailto:${l.email}`} className="font-medium text-accent hover:underline">{l.email}</a></td>
                  <td className="whitespace-nowrap px-4 py-2 text-fg-muted" title={new Date(l.start).toLocaleString()}>{ago(Date.parse(l.start))}</td>
                  <td className="num px-4 py-2">{fmtDur(l.engaged)}</td>
                  <td className="num px-4 py-2">{l.pages}</td>
                  <td className="px-4 py-2 text-fg-muted"><span className="inline-flex items-center gap-1.5"><DeviceIcon d={l.device} />{where(l)}</span></td>
                  <td className="px-4 py-2 text-fg-muted">{l.ref || 'Direct'}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FeedCard({ data }: { data: Stats }) {
  return (
    <Card title="Activity stream" description="Latest events across all visitors" flush>
      <ol className="max-h-[520px] space-y-0.5 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {data.feed.map((e) => (
            <motion.li key={`${e.ts}-${e.s}-${e.t}-${e.p}${e.a}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
              className="flex gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2">
              <span className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full', e.t === 'action' ? 'bg-pos' : e.t === 'persona' ? 'bg-warn' : e.t === 'session_start' ? 'bg-info' : 'bg-accent')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg">
                  {e.t === 'page_view' && <>Viewed <b className="font-medium">{pageLabel(e.p)}</b></>}
                  {e.t === 'action' && <b className="font-medium">{ACTION_LABEL[e.a] ?? e.a}</b>}
                  {e.t === 'persona' && <>Signed in as <b className="font-medium">{PERSONA_LABEL[e.persona] ?? e.persona}</b></>}
                  {e.t === 'session_start' && <>New visit started</>}
                </span>
                <span className="text-fg-subtle">{where(e)} · {e.device}</span>
              </span>
              <span className="shrink-0 text-fg-subtle">{ago(Date.parse(e.ts))}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {!data.feed.length && <li className="px-2 py-8 text-center text-xs text-fg-muted">No activity yet</li>}
      </ol>
    </Card>
  );
}

function FunnelCard({ funnel }: { funnel: Named[] }) {
  const top = Math.max(1, funnel[0]?.value ?? 1);
  return (
    <Card title="Engagement funnel" description="How far visits get into the demo">
      <ol className="space-y-3">
        {funnel.map((f, i) => {
          const conv = i ? f.value / Math.max(1, funnel[i - 1].value) : null;
          return (
            <li key={f.name}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-fg">{f.name}</span>
                <span className="num text-fg-muted"><b className="text-fg">{f.value.toLocaleString()}</b>{conv !== null && <span className="ml-2">{fmtPct(conv)} of previous</span>}</span>
              </div>
              <div className="h-3 rounded-r bg-surface-2">
                <motion.div className="h-3 rounded-r bg-accent" initial={{ width: 0 }} animate={{ width: `${(f.value / top) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }} />
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function HeatmapCard({ heat }: { heat: number[] }) {
  // shift UTC hour-of-week buckets into the viewer's local time
  const local = useMemo(() => {
    const offsetH = -new Date().getTimezoneOffset() / 60;
    const out = Array(168).fill(0);
    heat.forEach((v, i) => { out[((i + Math.round(offsetH)) % 168 + 168) % 168] += v; });
    return out as number[];
  }, [heat]);
  const max = Math.max(1, ...local);
  const step = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const OPACITY = [0, 0.22, 0.45, 0.7, 1];
  return (
    <Card title="When people visit" description="Page views by weekday and hour, your local time">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[2px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9px] text-fg-subtle">{h % 6 === 0 ? `${h}h` : ''}</span>)}
            {DAYS.map((d, di) => (
              <div key={d} className="contents">
                <span className="pr-1 text-right text-2xs leading-[18px] text-fg-muted">{d}</span>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = local[di * 24 + h];
                  return (
                    <motion.span key={h} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (di * 24 + h) * 0.002 }}
                      title={`${d} ${h}:00 · ${v} page view${v === 1 ? '' : 's'}`} aria-label={`${d} ${h}:00, ${v} page views`} role="img"
                      className="h-[18px] rounded-[3px] bg-surface-2 transition-transform hover:scale-125 hover:ring-1 hover:ring-fg-subtle">
                      {v > 0 && <span className="block h-full w-full rounded-[3px] bg-accent" style={{ opacity: OPACITY[step(v)] }} />}
                    </motion.span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-2xs text-fg-subtle">
            Fewer {OPACITY.map((o, i) => <span key={i} className="h-3 w-3 rounded-[3px] bg-surface-2"><span className="block h-full w-full rounded-[3px] bg-accent" style={{ opacity: o }} /></span>)} More
          </div>
        </div>
      </div>
    </Card>
  );
}

function Breakdown({ title, items, unit, empty }: { title: string; items: Named[]; unit: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <motion.div variants={rise}>
      <Card title={title} className="h-full">
        {!items.length ? <p className="py-6 text-center text-sm text-fg-muted">{empty ?? 'No data yet'}</p> : (
          <ul className="space-y-2.5">
            {items.slice(0, 7).map((it, i) => (
              <li key={it.name} title={`${it.name}: ${it.value.toLocaleString()} ${unit}`}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="truncate text-fg">{it.name}</span>
                  <span className="num shrink-0 font-medium text-fg">{it.value.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-r bg-surface-2">
                  <motion.div className="h-2 rounded-r bg-accent" initial={{ width: 0 }} whileInView={{ width: `${(it.value / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE, delay: i * 0.05 }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}
