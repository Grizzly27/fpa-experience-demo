import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, CheckCircle2, CircleAlert, Clock, Database, FileClock, FlaskConical, Inbox, KeyRound,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge, STATUS_TONE } from '../components/ui/primitives';
import { CountUp, EASE, Page, Reveal, rise, stagger } from '../components/motion';
import { PipelineFlow } from '../components/home/PipelineFlow';
import { SsoPanel } from '../components/home/SsoPanel';
import { AccessMatrix } from '../components/home/AccessMatrix';
import { ROLE_LABEL, can, canEditCostCenter, useApp, usePersona } from '../lib/app';
import { allowed, TRANSITIONS, useBudgets } from '../lib/budget';
import { COST_CENTERS, GL, LAST_ACTUAL, PERIODS, favorable, inPeriod, money, monthLabel, pct, pnl, sumBy } from '../lib/data';
import { DQ_CHECKS, RUNS, ago, lastRun } from '../lib/pipelines';
import { useForecastStore } from '../lib/useForecast';

export default function HomePage() {
  return (
    <Page>
      <DemoBanner />
      <Hero />
      <KpiStrip />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Reveal>
          <Card
            title="How data flows into planning"
            description="Governed pipelines land actuals in your AWS account, then feed every screen. Hover a node to trace its lineage."
            actions={<Badge tone="pos" dot>All pipelines healthy</Badge>}
          >
            <PipelineFlow />
            <PipelineStats />
          </Card>
        </Reveal>
        <Reveal delay={0.08}><TaskInbox /></Reveal>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Reveal><Card title={<span className="inline-flex items-center gap-2"><KeyRound size={15} className="text-accent" />Enterprise single sign-on</span>} description="Every user signs in through your identity provider. No separate passwords.">
          <SsoPanel />
        </Card></Reveal>
        <Reveal delay={0.06}><Card title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-accent" />Role-based access</span>} description="Capabilities by role, plus row-level scope by cost center.">
          <AccessMatrix />
        </Card></Reveal>
        <Reveal delay={0.12}><AuditTrail /></Reveal>
      </div>
    </Page>
  );
}

function DemoBanner() {
  const dismissed = useApp((s) => s.bannerDismissed);
  const dismiss = useApp((s) => s.dismissBanner);
  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ ease: EASE, duration: 0.3 }} className="overflow-hidden">
          <div className="relative overflow-hidden rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
            <motion.div aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              initial={{ x: '-120%' }} animate={{ x: '360%' }} transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }} />
            <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-warn"><FlaskConical size={16} aria-hidden /> You're exploring a demo</span>
              <span className="text-xs text-fg-muted">This shows what a custom FP&amp;A platform on AWS can look like. Nothing here is a real company or real data.</span>
              <div className="flex flex-wrap gap-1.5">
                {['Fictional company', 'Synthetic data', 'Simulated SSO', 'Basic usage analytics'].map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
              <button onClick={dismiss} className="btn-ghost ml-auto h-7 w-7 p-0" aria-label="Dismiss demo notice"><X size={15} /></button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function useTasks() {
  const me = usePersona();
  const budgets = useBudgets((s) => s.budgets);
  const tasks: { title: string; detail: string; to: string; tone: 'neg' | 'info' | 'warn' | 'neutral' }[] = [];
  for (const cc of COST_CENTERS) {
    const b = budgets[cc];
    const last = b.history.at(-1);
    if (b.status === 'rejected' && canEditCostCenter(me, cc)) tasks.push({ title: `Rework ${cc} budget`, detail: `Sent back by ${last?.by ?? 'approver'}${last?.comment ? `: "${last.comment.slice(0, 70)}…"` : ''}`, to: '/intake/submissions', tone: 'neg' });
    else if (b.status === 'draft' && canEditCostCenter(me, cc)) tasks.push({ title: `Submit ${cc} budget`, detail: 'Draft seeded from the latest forecast', to: '/intake/submissions', tone: 'info' });
    else if (b.status === 'submitted' && allowed(me, cc, TRANSITIONS[1], b.status)) tasks.push({ title: `Review ${cc} submission`, detail: `Submitted by ${b.owner} ${last ? ago(last.at) : ''}`, to: '/intake/submissions', tone: 'info' });
  }
  if (can(me, 'actuals')) {
    const crm = lastRun('crm_bookings_hourly');
    tasks.push({ title: 'Resolve CRM data warning', detail: crm.note ?? '', to: '/actuals/quality', tone: 'warn' });
    tasks.push({ title: `Lock ${monthLabel(LAST_ACTUAL)} actuals`, detail: 'Trial balance reconciled to $0.00', to: '/actuals/close', tone: 'neutral' });
  }
  if (can(me, 'forecast')) tasks.push({ title: 'Refresh FY27 forecast', detail: 'Sep-26 actuals landed; re-run drivers', to: '/intake/forecast', tone: 'neutral' });
  const urgency = { neg: 0, warn: 1, info: 2, neutral: 3 };
  return tasks.sort((a, b) => urgency[a.tone] - urgency[b.tone]);
}

function Hero() {
  const me = usePersona();
  const budgets = useBudgets((s) => s.budgets);
  const tasks = useTasks();
  const approved = COST_CENTERS.filter((cc) => ['approved', 'locked'].includes(budgets[cc].status)).length;
  const daysLeft = Math.max(0, Math.ceil((new Date('2026-10-31T23:59:00').getTime() - Date.now()) / 86400000));

  return (
    <motion.section variants={stagger} initial="hidden" animate="show" className="grid items-center gap-6 rounded-xl bg-surface p-6 shadow-card lg:grid-cols-[1fr_auto]">
      <div>
        <motion.p variants={rise} className="eyebrow">FY27 planning cycle · {ROLE_LABEL[me.role]}</motion.p>
        <motion.h1 variants={rise} className="mt-1 text-2xl font-semibold tracking-tight">{greeting()}, {me.name.split(' ')[0]}.</motion.h1>
        <motion.p variants={rise} className="mt-1.5 max-w-2xl text-sm text-fg-muted">
          {tasks.length ? <>You have <b className="text-fg">{tasks.length} item{tasks.length === 1 ? '' : 's'}</b> waiting. </> : 'You are all caught up. '}
          Actuals are closed through <b className="text-fg">{monthLabel(LAST_ACTUAL)}</b> and the FY27 budget closes in <b className="text-fg">{daysLeft} days</b>.
        </motion.p>
        <motion.div variants={rise} className="mt-4 flex flex-wrap gap-2">
          {tasks[0] && <Link to={tasks[0].to} className="btn-primary">{tasks[0].title} <ArrowRight size={15} /></Link>}
          <Link to="/reporting/variance" className="btn-secondary">Plan vs actuals</Link>
          <Link to="/assistant" className="btn-secondary"><Sparkles size={15} className="text-accent" /> Ask the AI</Link>
        </motion.div>
      </div>
      <motion.div variants={rise} className="flex items-center gap-5">
        <Ring value={approved / COST_CENTERS.length} label={`${approved}/${COST_CENTERS.length}`} sub="approved" />
        <ul className="space-y-1.5 text-xs">
          {(['locked', 'approved', 'submitted', 'rejected', 'draft'] as const).map((s) => {
            const n = COST_CENTERS.filter((cc) => budgets[cc].status === s).length;
            return (
              <li key={s} className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[s]} className="w-[72px] justify-center capitalize">{s}</Badge>
                <span className="num font-medium">{n}</span>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </motion.section>
  );
}

function Ring({ value, label, sub }: { value: number; label: string; sub: string }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="relative h-[96px] w-[96px]">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="48" cy="48" r={r} className="fill-none stroke-surface-3" strokeWidth="8" />
        <motion.circle cx="48" cy="48" r={r} className="fill-none stroke-pos" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 1.2, ease: EASE, delay: 0.2 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        <div><div className="num text-lg font-semibold">{label}</div><div className="text-2xs text-fg-muted">{sub}</div></div>
      </div>
    </div>
  );
}

function Sparkline({ actual, plan, tone }: { actual: number[]; plan: number[]; tone: 'pos' | 'neg' }) {
  const clip = useId();
  const all = [...actual, ...plan];
  const min = Math.min(...all), max = Math.max(...all);
  const y = (v: number) => 30 - ((v - min) / (max - min || 1)) * 26;
  const d = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${(i / (plan.length - 1)) * 100},${y(v)}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" className="mt-3 h-8 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <path d={d(plan)} fill="none" className="stroke-fg-subtle" strokeWidth={1.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {/* reveal left-to-right with a clip (pathLength + non-scaling strokes render as dashes) */}
      <clipPath id={clip}>
        <motion.rect x={0} y={-4} height={40} initial={{ width: 0 }} whileInView={{ width: 100 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
      </clipPath>
      <path d={d(actual)} fill="none" clipPath={`url(#${clip})`} className={tone === 'pos' ? 'stroke-pos' : 'stroke-neg'} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function KpiStrip() {
  const ytd = PERIODS[0];
  const rows = useMemo(() => inPeriod(ytd), [ytd]);
  const a = pnl(rows, 'actual'), p = pnl(rows, 'plan');
  const series = (group: 'Revenue' | 'Opex' | 'OI') => {
    const sc = (s: 'actual' | 'plan') => ytd.months.map((m) => {
      const mr = GL.filter((r) => r.month === m);
      if (group === 'OI') return sumBy(mr, s, (r) => r.account_group === 'Revenue') - sumBy(mr, s, (r) => r.account_group !== 'Revenue');
      return sumBy(mr, s, (r) => r.account_group === group);
    });
    return { actual: sc('actual'), plan: sc('plan') };
  };
  const items = [
    { label: 'Revenue · FY26 YTD', a: a.revenue, p: p.revenue, group: 'Revenue' as const, s: series('Revenue') },
    { label: 'Operating expenses · YTD', a: a.opex, p: p.opex, group: 'Opex' as const, s: series('Opex') },
    { label: 'Operating income · YTD', a: a.operatingIncome, p: p.operatingIncome, group: 'Revenue' as const, s: series('OI') },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((k) => {
        const fav = favorable(k.group, k.a, k.p);
        return (
          <motion.div key={k.label} variants={rise} className="rounded-lg bg-surface p-4 shadow-card">
            <p className="text-xs font-medium text-fg-muted">{k.label}</p>
            <CountUp value={k.a} format={(n) => money(n)} className="num mt-1.5 block text-2xl font-semibold tracking-tight" />
            <p className={clsx('num mt-1 text-xs font-medium', fav >= 0 ? 'text-pos' : 'text-neg')}>
              {fav >= 0 ? '▲' : '▼'} {money(Math.abs(fav))} {fav >= 0 ? 'favorable' : 'unfavorable'} · {pct((k.a - k.p) / Math.abs(k.p))} vs plan
            </p>
            <Sparkline actual={k.s.actual} plan={k.s.plan} tone={fav >= 0 ? 'pos' : 'neg'} />
          </motion.div>
        );
      })}
      <motion.div variants={rise} className="rounded-lg bg-surface p-4 shadow-card">
        <p className="text-xs font-medium text-fg-muted">Data freshness</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight">{monthLabel(LAST_ACTUAL)}</p>
        <p className="mt-1 text-xs font-medium text-pos">▲ Closed & reconciled</p>
        <ul className="mt-3 space-y-1 text-xs text-fg-muted">
          <li className="flex justify-between"><span>Last GL load</span><span className="num text-fg">{ago(lastRun('gl_daily_load').startedAt)}</span></li>
          <li className="flex justify-between"><span>Quality rules passing</span><span className="num text-fg">47 / 48</span></li>
        </ul>
      </motion.div>
    </motion.div>
  );
}

function PipelineStats() {
  const gl = lastRun('gl_daily_load');
  const stats = [
    { icon: Database, label: 'Last GL load', value: ago(gl.startedAt), sub: `${gl.rows.toLocaleString()} journal lines` },
    { icon: CheckCircle2, label: 'Data quality', value: `${DQ_CHECKS.filter((c) => c.status === 'pass').length}/${DQ_CHECKS.length} checks`, sub: '1 warning in CRM bookings' },
    { icon: Clock, label: 'Next scheduled run', value: 'in 18h', sub: 'Nightly 02:00 UTC' },
    { icon: Activity, label: 'Runs (7 days)', value: `${RUNS.length * 14}`, sub: '99.6% success' },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface-2 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-2xs font-medium text-fg-muted"><s.icon size={13} aria-hidden />{s.label}</p>
          <p className="num mt-0.5 text-sm font-semibold">{s.value}</p>
          <p className="text-2xs text-fg-subtle">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

function TaskInbox() {
  const tasks = useTasks();
  const me = usePersona();
  const ICON = { neg: CircleAlert, info: Inbox, warn: CircleAlert, neutral: FileClock };
  return (
    <Card title="Your work" description={`Scoped to ${me.name} · ${ROLE_LABEL[me.role]}`} className="h-full" flush>
      <motion.ul key={me.id} variants={stagger} initial="hidden" animate="show" className="divide-y divide-line">
        {!tasks.length && <li className="px-4 py-8 text-center text-sm text-fg-muted">Nothing needs you right now.</li>}
        {tasks.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.li key={t.title} variants={rise}>
              <Link to={t.to} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <span className={clsx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md',
                  t.tone === 'neg' ? 'bg-neg-soft text-neg' : t.tone === 'warn' ? 'bg-warn-soft text-warn' : t.tone === 'info' ? 'bg-info-soft text-info' : 'bg-surface-2 text-fg-muted')}>
                  <Icon size={15} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{t.title}</span>
                  <span className="line-clamp-2 block text-xs text-fg-muted">{t.detail}</span>
                </span>
                <ArrowRight size={15} className="mt-1 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </Card>
  );
}

function AuditTrail() {
  const budgets = useBudgets((s) => s.budgets);
  const log = useForecastStore((s) => s.state.log);
  const events = [
    ...Object.entries(budgets).flatMap(([cc, b]) => b.history.map((h) => ({ at: h.at, who: h.by, what: `${h.action} · ${cc} budget`, kind: 'workflow' }))),
    ...log.map((l) => ({ at: l.at, who: l.author, what: l.text, kind: l.kind })),
    { at: Date.now() - 52 * 3600_000, who: 'system', what: 'Sep-26 close loaded · TB reconciled', kind: 'data' },
    { at: Date.now() - 74 * 3600_000, who: 'SCIM', what: 'Provisioned dana.kim@northwind.example → Contributor', kind: 'identity' },
  ].sort((a, b) => b.at - a.at).slice(0, 7);
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Users size={15} className="text-accent" />Audit trail</span>}
      description="Every change is attributed, timestamped and immutable."
      actions={<Link to="/admin/audit" className="text-xs font-medium text-accent hover:underline">View all</Link>} flush>
      <ol className="relative px-4 py-3">
        <span className="absolute bottom-4 left-[23px] top-4 w-px bg-line" aria-hidden />
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li key={`${e.at}-${e.what}`} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ease: EASE }} className="relative flex gap-3 py-1.5">
              <span className={clsx('relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface',
                e.kind === 'identity' ? 'bg-warn' : e.kind === 'data' ? 'bg-info' : e.kind === 'workflow' ? 'bg-pos' : 'bg-accent')} aria-hidden />
              <span className="min-w-0 text-xs">
                <span className="block truncate text-fg"><b className="font-medium">{e.who}</b> · {e.what}</span>
                <span className="text-fg-subtle">{ago(e.at)}</span>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </Card>
  );
}
