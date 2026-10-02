import { useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MessageSquare, Pencil, Pin, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { AccessNote } from '../../components/ui/primitives';
import { CountUp } from '../../components/motion';
import { ForecastGrid } from '../../components/forecast/ForecastGrid';
import { COST_CENTERS, money, pct } from '../../lib/data';
import { DEFAULT_ASSUMPTIONS, FY26_OUTLOOK, MONTH_LABELS, type Assumptions } from '../../lib/forecast';
import { useForecast, type LogEntry } from '../../lib/useForecast';
import { can, ROLE_LABEL, usePersona } from '../../lib/app';
import { useTokens } from '../../lib/useTokens';

export function ForecastView() {
  const { state, dispatch, base, series, out, baseCase } = useForecast();
  const me = usePersona();
  const editable = can(me, 'forecast');
  const tk = useTokens();
  const [versionName, setVersionName] = useState('');
  const nEdits = Object.values(state.overrides).reduce((n, r) => n + Object.keys(r).length, 0);
  const atBase = !nEdits && JSON.stringify(state.assumptions) === JSON.stringify(DEFAULT_ASSUMPTIONS);

  const chart = out.months.map((m, i) => ({
    month: MONTH_LABELS[i],
    current: m.operatingIncome,
    base: baseCase.months[i].operatingIncome,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable ? (
          <p className="text-sm text-fg-muted">
            <b className="text-fg">Click any cell and type</b>, paste a block from Excel, or edit the FY27 column to spread a total.
            <kbd className="ml-1.5 rounded border border-line bg-surface px-1 font-mono text-2xs">Ctrl Z</kbd> undoes.
          </p>
        ) : <AccessNote>Read-only for {ROLE_LABEL[me.role]}s. Forecast drivers are maintained by FP&amp;A contributors.</AccessNote>}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {state.lastImpact && (
              <motion.div
                key={state.lastImpact.id}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={clsx('text-xs font-medium px-3 py-1.5 rounded-full border',
                  state.lastImpact.value >= 0 ? 'bg-pos-soft border-pos/30 text-pos' : 'bg-neg-soft border-neg/30 text-neg')}
                title={state.lastImpact.text}
              >
                Op income {money(state.lastImpact.value, { sign: true })} from last change
              </motion.div>
            )}
          </AnimatePresence>
          <button className="btn-secondary" onClick={() => dispatch({ type: 'undo' })} disabled={!editable || !state.past.length}><Undo2 size={15} />Undo</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: 'redo' })} disabled={!editable || !state.future.length}><Redo2 size={15} />Redo</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: 'reset' })} disabled={!editable || atBase}><RotateCcw size={15} />Reset</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="FY27 revenue" value={out.revenue} base={baseCase.revenue} prior={FY26_OUTLOOK.revenue} />
        <Kpi title="Gross margin" value={out.grossMargin} base={baseCase.grossMargin} prior={FY26_OUTLOOK.revenue - FY26_OUTLOOK.cogs}
          note={`${(out.grossMargin / out.revenue * 100).toFixed(1)}% of revenue`} />
        <Kpi title="Operating expenses" value={out.opex} base={baseCase.opex} prior={FY26_OUTLOOK.opex} cost />
        <Kpi title="Operating income" value={out.operatingIncome} base={baseCase.operatingIncome} prior={FY26_OUTLOOK.operatingIncome}
          note={`${(out.operatingIncome / out.revenue * 100).toFixed(1)}% margin · ${Math.round(out.endHeadcount)} ending HC`} />
      </div>

      <Card
        title="Forecast model"
        actions={<span className="text-xs text-fg-muted">{nEdits ? `${nEdits} cell${nEdits === 1 ? '' : 's'} edited` : 'All values calculated from assumptions'}<span className="inline-block ml-3 w-3 h-3 align-middle bg-edit-bg border border-edit-line rounded-sm" /> edited</span>}
      >
        <ForecastGrid series={series} base={base} overrides={state.overrides} out={out} dispatch={dispatch} readOnly={!editable} />
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card title="Assumptions">
          <fieldset disabled={!editable} className="disabled:opacity-60"><AssumptionsPanel a={state.assumptions} onChange={(patch, text) => dispatch({ type: 'assumption', patch, text })} /></fieldset>
        </Card>

        <div className="space-y-6">
          <Card title="Operating income · current vs base case">
            <div className="h-48">
              <ResponsiveContainer>
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tk.line} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} />
                  <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: tk['fg-muted'] }} stroke={tk['line-strong']} width={55} />
                  <Tooltip formatter={(v) => money(Number(v), { compact: false })} contentStyle={{ background: tk.surface, border: `1px solid ${tk.line}`, borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="base" name="Base case" stroke={tk['fg-subtle']} strokeDasharray="5 4" dot={false} />
                  <Line dataKey="current" name="Current" stroke={tk.accent} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Versions">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (versionName.trim()) { dispatch({ type: 'saveVersion', name: versionName.trim() }); setVersionName(''); } }}>
              <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="Name this version, e.g. Board v1"
                className="input flex-1" />
              <button className="px-3 py-1.5 text-sm bg-accent text-accent-fg rounded-md hover:bg-accent-hover disabled:opacity-50" disabled={!editable || !versionName.trim()}>Save</button>
            </form>
            <ul className="mt-3 divide-y divide-line text-sm">
              {!state.versions.length && <li className="py-2 text-fg-muted">No saved versions yet. Save one, change some drivers, then compare.</li>}
              {state.versions.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-fg-muted">
                      Op income {money(v.operatingIncome)} · <span className={v.operatingIncome - out.operatingIncome >= 0 ? 'text-pos' : 'text-neg'}>{money(v.operatingIncome - out.operatingIncome, { sign: true })} vs current</span>
                    </div>
                  </div>
                  <button onClick={() => dispatch({ type: 'loadVersion', id: v.id })} disabled={!editable} className="text-xs font-medium text-accent hover:underline disabled:opacity-40">Load</button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Updates & change log">
          <UpdatesFeed log={state.log} onPost={(text) => dispatch({ type: 'update', text })} />
        </Card>
      </div>
    </div>
  );
}

function Kpi({ title, value, base, prior, cost, note }: { title: string; value: number; base: number; prior: number; cost?: boolean; note?: string }) {
  const vsBase = value - base;
  const good = cost ? vsBase <= 0 : vsBase >= 0;
  return (
    <Card>
      <p className="text-xs font-medium text-fg-muted">{title}</p>
      <CountUp value={value} format={(n) => money(n)} className="num mt-1 block text-2xl font-semibold tracking-tight" />
      <p className={clsx('text-sm font-medium mt-2', Math.abs(vsBase) < 500 ? 'text-fg-subtle' : good ? 'text-pos' : 'text-neg')}>
        {Math.abs(vsBase) < 500 ? 'At base case' : `${money(vsBase, { sign: true })} vs base case`}
      </p>
      <p className="text-xs text-fg-muted mt-1">{pct((value - prior) / Math.abs(prior))} vs FY26 outlook</p>
      {note && <p className="text-xs text-fg-muted mt-1">{note}</p>}
    </Card>
  );
}

function Slider({ label, value, min, max, step, fmt, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const done = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  return (
    <label className="block">
      <div className="flex justify-between text-sm"><span className="text-fg">{label}</span><span className="font-medium tabular-nums">{fmt(shown)}</span></div>
      <input type="range" min={min} max={max} step={step} value={shown}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={done} onKeyUp={done} onBlur={done}
        className="w-full accent-[rgb(var(--accent))]" />
    </label>
  );
}

function AssumptionsPanel({ a, onChange }: { a: Assumptions; onChange: (p: Partial<Assumptions>, text: string) => void }) {
  const p1 = (v: number) => `${(v * 100).toFixed(1)}%`;
  const p0 = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">These drive every calculated cell. Cells you've edited in the grid keep your value.</p>
      <Slider label="Unit growth YoY" value={a.unitGrowth} min={-0.1} max={0.4} step={0.01} fmt={p0} onCommit={(v) => onChange({ unitGrowth: v }, `Unit growth ${p0(a.unitGrowth)} → ${p0(v)}`)} />
      <Slider label="Avg selling price" value={a.hwPrice} min={249} max={449} step={5} fmt={(v) => `$${v}`} onCommit={(v) => onChange({ hwPrice: v }, `ASP $${a.hwPrice} → $${v}`)} />
      <Slider label="Attach rate" value={a.attachRate} min={0.4} max={0.85} step={0.01} fmt={p0} onCommit={(v) => onChange({ attachRate: v }, `Attach rate ${p0(a.attachRate)} → ${p0(v)}`)} />
      <Slider label="Monthly churn" value={a.monthlyChurn} min={0.01} max={0.04} step={0.001} fmt={p1} onCommit={(v) => onChange({ monthlyChurn: v }, `Monthly churn ${p1(a.monthlyChurn)} → ${p1(v)}`)} />
      <Slider label="Subscription ARPU" value={a.arpu} min={9} max={24} step={0.5} fmt={(v) => `$${v.toFixed(2)}`} onCommit={(v) => onChange({ arpu: v }, `ARPU $${a.arpu} → $${v}`)} />
      <Slider label="Merit increase" value={a.merit} min={0} max={0.08} step={0.005} fmt={p1} onCommit={(v) => onChange({ merit: v }, `Merit ${p1(a.merit)} → ${p1(v)}`)} />
      <Slider label="Non-people opex growth" value={a.nonPeopleGrowth} min={-0.1} max={0.2} step={0.01} fmt={p0} onCommit={(v) => onChange({ nonPeopleGrowth: v }, `Non-people growth ${p0(a.nonPeopleGrowth)} → ${p0(v)}`)} />
      <div>
        <div className="text-sm text-fg mb-1">Net new hires in FY27</div>
        <div className="grid grid-cols-2 gap-2">
          {COST_CENTERS.map((cc) => (
            <label key={cc} className="flex items-center justify-between gap-2 text-xs bg-surface-2 rounded px-2 py-1">
              <span className="truncate">{cc}</span>
              <input type="number" value={a.hires[cc]} min={-20} max={60}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange({ hires: { ...a.hires, [cc]: v } }, `${cc} FY27 hires ${a.hires[cc]} → ${v}`); }}
                className="w-14 text-right bg-surface border border-line-strong rounded px-1 py-0.5 tabular-nums" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function UpdatesFeed({ log, onPost }: { log: LogEntry[]; onPost: (t: string) => void }) {
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'update'>('all');
  const shown = log.filter((l) => filter === 'all' || l.kind === 'update').slice(0, 30);
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onPost(text.trim()); setText(''); } }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="Post an update: what changed and why (e.g. 'Pulled 4 R&D hires into H1 per CTO')"
          className="input resize-none" />
        <div className="flex items-center justify-between mt-1">
          <div className="flex gap-1 text-xs">
            {(['all', 'update'] as const).map((f) => (
              <button type="button" key={f} onClick={() => setFilter(f)}
                className={clsx('px-2 py-0.5 rounded', filter === f ? 'bg-accent-soft text-accent' : 'text-fg-muted')}>
                {f === 'all' ? 'Everything' : 'Updates only'}
              </button>
            ))}
          </div>
          <button className="px-3 py-1 text-sm bg-accent text-accent-fg rounded-md hover:bg-accent-hover disabled:opacity-50" disabled={!text.trim()}>Post</button>
        </div>
      </form>
      <ul className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {shown.map((l) => (
            <motion.li key={l.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className={clsx('text-sm rounded-md px-3 py-2', l.kind === 'update' ? 'bg-accent-soft/60 border border-accent/20' : 'bg-surface-2')}>
              <div className="flex justify-between gap-2 text-[11px] text-fg-muted">
                <span className="inline-flex items-center gap-1">{l.kind === 'update' ? <MessageSquare size={12} aria-hidden /> : l.kind === 'version' ? <Pin size={12} aria-hidden /> : <Pencil size={12} aria-hidden />}{l.author}</span>
                <span>{ago(l.at)}</span>
              </div>
              <div className="mt-0.5 text-fg">{l.text}</div>
              {l.impact !== undefined && Math.abs(l.impact) >= 500 && (
                <div className={clsx('text-xs font-medium mt-0.5', l.impact >= 0 ? 'text-pos' : 'text-neg')}>
                  Op income {money(l.impact, { sign: true })}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
