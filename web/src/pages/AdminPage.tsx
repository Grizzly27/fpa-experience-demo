import { useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Blocks, CalendarRange, Cpu, Database, Download, FileClock, KeyRound, Loader2, Network, PlugZap, Search, ShieldAlert, Sparkles, Users, Workflow,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AccessNote, Avatar, Badge, PageHeader, Tabs, type Tone } from '../components/ui/primitives';
import { DrawCheck, EASE, Page, rise, stagger } from '../components/motion';
import { CAPABILITIES, PERSONAS, ROLE_LABEL, can, usePersona, type Role } from '../lib/app';
import { useBudgets } from '../lib/budget';
import { useForecastStore } from '../lib/useForecast';
import { RUNS, ago } from '../lib/pipelines';
import { ArchitectureView } from './admin/ArchitectureView';

export default function AdminPage() {
  const me = usePersona();
  return (
    <Page>
      <PageHeader eyebrow="Platform administration" title="Admin Portal"
        description="Identity, access, planning cycles, integrations and the audit record. Changes here are themselves audited." />
      {!can(me, 'admin') && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <ShieldAlert size={16} aria-hidden /> You're viewing as {ROLE_LABEL[me.role]}: the Admin Portal is read-only. Switch to Sam Okafor (Administrator) to make changes.
        </div>
      )}
      <Tabs tabs={[
        { to: '/admin/users', label: 'Users & roles', icon: Users },
        { to: '/admin/sso', label: 'Single sign-on', icon: KeyRound },
        { to: '/admin/cycles', label: 'Planning cycles', icon: CalendarRange },
        { to: '/admin/integrations', label: 'Integrations', icon: PlugZap },
        { to: '/admin/audit', label: 'Audit log', icon: FileClock },
        { to: '/admin/architecture', label: 'Architecture', icon: Blocks },
      ]} />
      <Routes>
        <Route index element={<Navigate to="users" replace />} />
        <Route path="users" element={<UsersView />} />
        <Route path="sso" element={<SsoView />} />
        <Route path="cycles" element={<CyclesView />} />
        <Route path="integrations" element={<IntegrationsView />} />
        <Route path="audit" element={<AuditView />} />
        <Route path="architecture" element={<ArchitectureView />} />
      </Routes>
    </Page>
  );
}

// ---------------- Users & roles ----------------

interface User { name: string; email: string; role: Role; scope: string; status: 'Active' | 'Invited' | 'Deprovisioned'; lastSeen: string }

const USERS: User[] = [
  { name: 'Jordan Lee', email: 'jordan.lee@northwind.example', role: 'analyst', scope: 'R&D, Marketing', status: 'Active', lastSeen: 'now' },
  { name: 'Alex Rivera', email: 'alex.rivera@northwind.example', role: 'approver', scope: 'All cost centers', status: 'Active', lastSeen: '2h ago' },
  { name: 'Sam Okafor', email: 'sam.okafor@northwind.example', role: 'admin', scope: 'All cost centers', status: 'Active', lastSeen: '1d ago' },
  { name: 'Dana Kim', email: 'dana.kim@northwind.example', role: 'analyst', scope: 'Sales, Customer Success', status: 'Active', lastSeen: '6h ago' },
  { name: 'Luis Ortega', email: 'luis.ortega@northwind.example', role: 'analyst', scope: 'Operations, G&A', status: 'Active', lastSeen: '20h ago' },
  { name: 'Priya Natarajan', email: 'priya.natarajan@northwind.example', role: 'analyst', scope: 'R&D', status: 'Active', lastSeen: '1d ago' },
  { name: 'Marcus Webb', email: 'marcus.webb@northwind.example', role: 'analyst', scope: 'Sales', status: 'Invited', lastSeen: '—' },
  { name: 'Chris Doyle', email: 'chris.doyle@northwind.example', role: 'analyst', scope: 'Marketing', status: 'Deprovisioned', lastSeen: '34d ago' },
];
const STATUS: Record<User['status'], Tone> = { Active: 'pos', Invited: 'info', Deprovisioned: 'neutral' };

function UsersView() {
  const me = usePersona();
  const admin = can(me, 'admin');
  const [users, setUsers] = useState(USERS);
  const [q, setQ] = useState('');
  const shown = users.filter((u) => `${u.name} ${u.email} ${u.scope}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="Users" description="Provisioned from your IdP via SCIM. Deprovisioning in the IdP revokes access here." flush
        actions={<div className="relative w-56"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden /><input className="input h-8 pl-8" placeholder="Search users" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              {['User', 'Role', 'Row-level scope', 'Status', 'Last sign-in'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}
            </tr></thead>
            <motion.tbody variants={stagger} initial="hidden" animate="show">
              {shown.map((u) => (
                <motion.tr key={u.email} variants={rise} className={clsx('border-b border-line', u.status === 'Deprovisioned' && 'opacity-60')}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2.5">
                      <Avatar initials={u.name.split(' ').map((x) => x[0]).join('')} />
                      <span><span className="block font-medium">{u.name}</span><span className="text-xs text-fg-muted">{u.email}</span></span>
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {admin && u.status !== 'Deprovisioned' ? (
                      <select className="input h-8 w-36" value={u.role} aria-label={`Role for ${u.name}`}
                        onChange={(e) => setUsers((all) => all.map((x) => x.email === u.email ? { ...x, role: e.target.value as Role } : x))}>
                        {(['analyst', 'approver', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : <Badge tone={u.role === 'admin' ? 'warn' : u.role === 'approver' ? 'info' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>}
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{u.scope}</td>
                  <td className="px-4 py-2"><Badge tone={STATUS[u.status]} dot>{u.status}</Badge></td>
                  <td className="px-4 py-2 text-fg-muted">{u.lastSeen}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="IdP group → role mapping">
          <ul className="space-y-2 text-sm">
            {PERSONAS.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
                <code className="font-mono text-xs">{p.groups[0]}</code>
                <span className="text-fg-subtle" aria-hidden>→</span>
                <Badge tone={p.role === 'admin' ? 'warn' : p.role === 'approver' ? 'info' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Role definitions">
          <ul className="space-y-3 text-xs">
            {(['analyst', 'approver', 'admin'] as Role[]).map((r) => (
              <li key={r}>
                <p className="font-semibold text-fg">{ROLE_LABEL[r]}</p>
                <p className="text-fg-muted">{CAPABILITIES.filter((c) => (c.roles as readonly Role[]).includes(r)).map((c) => c.label).join(' · ')}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-xs text-fg-muted">Segregation of duties: administrators can't approve budgets, and contributors can't approve their own.</p>
        </Card>
      </div>
    </div>
  );
}

// ---------------- SSO ----------------

const SSO_CHECKS = ['Resolve IdP metadata', 'Validate signing certificate', 'Round-trip test assertion', 'Verify group claims', 'SCIM endpoint reachable'];

function SsoView() {
  const me = usePersona();
  const admin = can(me, 'admin');
  const [step, setStep] = useState(-1);
  const run = () => {
    setStep(0);
    SSO_CHECKS.forEach((_, i) => setTimeout(() => setStep(i + 1), 450 * (i + 1)));
  };
  const rows: [string, React.ReactNode][] = [
    ['Protocol', <Badge tone="accent">SAML 2.0</Badge>],
    ['Identity provider', 'Okta (example tenant)'],
    ['Federation broker', 'Amazon Cognito user pool'],
    ['SP entity ID', <code className="font-mono text-xs">urn:amazon:cognito:sp:us-east-1_demo</code>],
    ['ACS URL', <code className="font-mono text-xs">https://auth.fpa-demo.example/saml2/idpresponse</code>],
    ['Signing certificate', <span className="inline-flex items-center gap-2">Valid until Aug 2028 <Badge tone="pos" dot>OK</Badge></span>],
    ['Enforce SSO for all users', <Badge tone="pos">On · local passwords disabled</Badge>],
    ['MFA', 'Enforced by IdP conditional access'],
    ['Session', '8h idle timeout · 24h absolute'],
    ['SCIM provisioning', <span className="inline-flex items-center gap-2">Enabled <span className="text-xs text-fg-muted">· token rotated 21d ago</span></span>],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card title="SAML configuration" flush>
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[200px_1fr] gap-4 px-4 py-2.5 text-sm">
              <dt className="text-fg-muted">{k}</dt><dd className="min-w-0 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Connection test" description="Simulated: verifies the trust chain end to end.">
        <ol className="space-y-2" aria-live="polite">
          {SSO_CHECKS.map((c, i) => {
            const st = step < 0 ? 'idle' : i < step ? 'done' : i === step ? 'run' : 'wait';
            return (
              <li key={c} className="flex items-center gap-2.5 text-sm">
                <span className="grid h-5 w-5 place-items-center">
                  {st === 'done' ? <span className="grid h-5 w-5 place-items-center rounded-full bg-pos-soft text-pos"><DrawCheck size={12} /></span>
                    : st === 'run' ? <Loader2 size={15} className="animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
                </span>
                <span className={st === 'idle' || st === 'wait' ? 'text-fg-muted' : 'text-fg'}>{c}</span>
              </li>
            );
          })}
        </ol>
        <AnimatePresence>
          {step >= SSO_CHECKS.length && (
            <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-md bg-pos-soft px-3 py-2 text-sm font-medium text-pos">All checks passed</motion.p>
          )}
        </AnimatePresence>
        <div className="mt-4">
          {admin ? <button className="btn-primary w-full" onClick={run} disabled={step >= 0 && step < SSO_CHECKS.length}><Network size={15} />Test connection</button>
            : <AccessNote>Administrators can test and change SSO.</AccessNote>}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Planning cycles ----------------

const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
interface Cycle { name: string; start: number; end: number; status: 'Open' | 'Closed' | 'Scheduled' }

function CyclesView() {
  const me = usePersona();
  const admin = can(me, 'admin');
  const [cycles, setCycles] = useState<Cycle[]>([
    { name: 'Q3 FY26 reforecast', start: 0, end: 1.2, status: 'Closed' },
    { name: 'Sep-26 close', start: 3, end: 3.15, status: 'Closed' },
    { name: 'FY27 budget', start: 3, end: 4, status: 'Open' },
    { name: 'Q4 FY26 reforecast', start: 3.6, end: 4.5, status: 'Scheduled' },
    { name: 'FY27 board review', start: 5, end: 5.4, status: 'Scheduled' },
  ]);
  const tone: Record<Cycle['status'], string> = { Open: 'bg-accent', Closed: 'bg-line-strong', Scheduled: 'bg-accent/35' };
  const today = 3 + 1.5 / 31;
  return (
    <Card title="Planning calendar" description="Cycles control when contributors can submit and which versions are writable.">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="ml-[180px] grid grid-cols-6 border-b border-line pb-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            {MONTHS.map((m) => <span key={m}>{m} 2026</span>)}
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-neg" style={{ left: `calc(180px + (100% - 180px) * ${today / 6})` }}>
              <span className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-neg px-1 text-2xs font-semibold text-surface">Today</span>
            </div>
            {cycles.map((c, i) => (
              <div key={c.name} className="flex items-center border-b border-line py-2.5">
                <div className="w-[180px] shrink-0 pr-3">
                  <p className="text-sm font-medium">{c.name}</p>
                  <Badge tone={c.status === 'Open' ? 'accent' : c.status === 'Closed' ? 'neutral' : 'info'}>{c.status}</Badge>
                </div>
                <div className="relative h-7 flex-1">
                  <motion.div className={clsx('absolute h-full rounded-md', tone[c.status])}
                    style={{ left: `${(c.start / 6) * 100}%`, originX: 0 }}
                    initial={{ width: 0 }} animate={{ width: `${((c.end - c.start) / 6) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }} />
                </div>
                <div className="w-28 shrink-0 pl-3 text-right">
                  {admin && c.status !== 'Closed' && (
                    <button className="btn-ghost h-7 px-2 text-xs" onClick={() => setCycles((all) => all.map((x) => x.name === c.name ? { ...x, status: x.status === 'Open' ? 'Scheduled' : 'Open' } : x))}>
                      {c.status === 'Open' ? 'Close cycle' : 'Open now'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!admin && <div className="mt-3"><AccessNote>Administrators open and close cycles.</AccessNote></div>}
    </Card>
  );
}

// ---------------- Integrations ----------------

function IntegrationsView() {
  const items: { name: string; kind: string; icon: typeof Database; status: string; tone: Tone; detail: string }[] = [
    { name: 'ERP general ledger', kind: 'Source · AWS Glue', icon: Database, status: 'Connected', tone: 'pos', detail: `Last sync ${ago(RUNS[0].startedAt)} · nightly` },
    { name: 'HRIS workforce', kind: 'Source · AWS Glue', icon: Users, status: 'Connected', tone: 'pos', detail: 'Headcount & comp snapshot · daily' },
    { name: 'CRM bookings', kind: 'Source · Amazon AppFlow', icon: Workflow, status: 'Warning', tone: 'warn', detail: '3 records quarantined · hourly' },
    { name: 'Athena / Redshift', kind: 'Warehouse', icon: Cpu, status: 'Healthy', tone: 'pos', detail: 'Semantic layer refreshed after each load' },
    { name: 'Amazon Bedrock', kind: 'AI · Claude', icon: Sparkles, status: 'Configured', tone: 'pos', detail: 'Invocation logging on · data stays in-account' },
    { name: 'Power BI / Tableau', kind: 'Downstream BI', icon: Blocks, status: 'Available', tone: 'neutral', detail: 'Connect to the governed semantic layer' },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <motion.div key={it.name} variants={rise} whileHover={{ y: -2 }} className="rounded-lg bg-surface p-4 shadow-card transition-shadow hover:shadow-pop">
          <div className="flex items-start justify-between gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-fg-muted"><it.icon size={18} aria-hidden /></span>
            <Badge tone={it.tone} dot>{it.status}</Badge>
          </div>
          <p className="mt-3 text-sm font-semibold">{it.name}</p>
          <p className="text-xs text-fg-subtle">{it.kind}</p>
          <p className="mt-2 text-xs text-fg-muted">{it.detail}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ---------------- Audit log ----------------

function AuditView() {
  const budgets = useBudgets((s) => s.budgets);
  const log = useForecastStore((s) => s.state.log);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const events = useMemo(() => [
    ...Object.entries(budgets).flatMap(([cc, b]) => b.history.map((h) => ({ at: h.at, who: h.by, kind: 'workflow', what: `${h.action} ${cc} budget${h.comment ? ` · "${h.comment}"` : ''}` }))),
    ...log.map((l) => ({ at: l.at, who: l.author, kind: l.kind === 'update' ? 'comment' : 'forecast', what: l.text })),
    ...RUNS.map((r) => ({ at: r.startedAt, who: 'system', kind: 'data', what: `${r.job} · ${r.rows.toLocaleString()} rows · ${r.status}` })),
    { at: Date.now() - 74 * 3600_000, who: 'SCIM', kind: 'identity', what: 'Provisioned dana.kim@northwind.example as Contributor' },
    { at: Date.now() - 34 * 86400_000, who: 'SCIM', kind: 'identity', what: 'Deprovisioned chris.doyle@northwind.example (left company)' },
    { at: Date.now() - 21 * 86400_000, who: 'Sam Okafor', kind: 'identity', what: 'Rotated SCIM bearer token' },
  ].sort((a, b) => b.at - a.at), [budgets, log]);
  const shown = events.filter((e) => (kind === 'all' || e.kind === kind) && `${e.who} ${e.what}`.toLowerCase().includes(q.toLowerCase()));
  const exportCsv = () => {
    const csv = ['timestamp,actor,type,event', ...shown.map((e) => [new Date(e.at).toISOString(), e.who, e.kind, e.what].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'audit_log.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const KIND_TONE: Record<string, Tone> = { workflow: 'pos', forecast: 'accent', comment: 'info', data: 'neutral', identity: 'warn' };
  return (
    <Card title="Audit log" description="Append-only. In production this streams to CloudTrail Lake / S3 Object Lock for retention." flush
      actions={<button className="btn-secondary" onClick={exportCsv}><Download size={15} />Export</button>}>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <div className="relative w-64"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden /><input className="input h-8 pl-8" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" /></div>
        <div className="flex flex-wrap gap-1">
          {['all', 'workflow', 'forecast', 'comment', 'data', 'identity'].map((k) => (
            <button key={k} onClick={() => setKind(k)} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors', kind === k ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2')}>{k}</button>
          ))}
        </div>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            {['When', 'Actor', 'Type', 'Event'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={`${e.at}-${i}`} className="border-b border-line">
                <td className="whitespace-nowrap px-4 py-2 text-fg-muted" title={new Date(e.at).toLocaleString()}>{ago(e.at)}</td>
                <td className="whitespace-nowrap px-4 py-2 font-medium">{e.who}</td>
                <td className="px-4 py-2"><Badge tone={KIND_TONE[e.kind]} className="capitalize">{e.kind}</Badge></td>
                <td className="px-4 py-2 text-fg-muted">{e.what}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-fg-muted">No events match.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
