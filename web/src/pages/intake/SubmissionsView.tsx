import { useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, CheckCircle2, Lock, MessageSquare, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { AccessNote, Avatar, Badge, STATUS_TONE, Stat } from '../../components/ui/primitives';
import { CountUp, DrawCheck, EASE } from '../../components/motion';
import { COST_CENTERS, money, pct } from '../../lib/data';
import { canEditCostCenter, usePersona, ROLE_LABEL } from '../../lib/app';
import { FY26, TRANSITIONS, allowed, budgetTotal, forecastLines, useBudgets, type Transition } from '../../lib/budget';
import { ago } from '../../lib/pipelines';

const ACTION_STYLE: Record<string, string> = {
  submit: 'btn-primary', approve: 'btn-success', reject: 'btn-danger', lock: 'btn btn-secondary', reopen: 'btn-ghost',
};
const ACTION_ICON = { submit: Send, approve: CheckCircle2, reject: Undo2, lock: Lock, reopen: RotateCcw };

export function SubmissionsView() {
  const me = usePersona();
  const { budgets, setLine, pullForecast, act, reset } = useBudgets();
  const [sel, setSel] = useState(me.role === 'analyst' ? me.costCenters[0] : 'Sales');
  const [comment, setComment] = useState('');
  const [justApproved, setJustApproved] = useState<string | null>(null);
  const forecast = forecastLines();

  const b = budgets[sel];
  const mine = canEditCostCenter(me, sel);
  const editable = mine && (b.status === 'draft' || b.status === 'rejected');
  const grand = COST_CENTERS.reduce((s, cc) => s + budgetTotal(budgets[cc].lines), 0);
  const grandFc = COST_CENTERS.reduce((s, cc) => s + budgetTotal(forecast[cc]), 0);
  const grandFy26 = COST_CENTERS.reduce((s, cc) => s + budgetTotal(FY26[cc]), 0);
  const nApproved = COST_CENTERS.filter((cc) => ['approved', 'locked'].includes(budgets[cc].status)).length;
  const actions = TRANSITIONS.filter((t) => allowed(me, sel, t, b.status));
  const waiting = COST_CENTERS.filter((cc) => TRANSITIONS.some((t) => (t.action === 'submit' || t.action === 'approve') && allowed(me, cc, t, budgets[cc].status))).length;

  const run = (t: Transition) => {
    act(me, sel, t, comment);
    setComment('');
    if (t.action === 'approve') { setJustApproved(sel); setTimeout(() => setJustApproved(null), 1600); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="FY27 opex budget" value={<CountUp value={grand} format={(n) => money(n)} />} sub={`${pct((grand - grandFy26) / grandFy26)} vs FY26 outlook`} />
        <Stat label="Budget vs forecast" value={money(grand - grandFc, { sign: true })} deltaTone={grand > grandFc ? 'neg' : 'pos'}
          delta={grand > grandFc ? '▲ Above latest forecast' : '▼ Within latest forecast'} />
        <Stat label="Approved" value={`${nApproved} of ${COST_CENTERS.length}`} sub="cost centers">
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-pos" animate={{ width: `${(nApproved / COST_CENTERS.length) * 100}%` }} transition={{ ease: EASE, duration: 0.6 }} />
          </div>
        </Stat>
        <Stat label="Waiting on you" value={waiting} sub={me.role === 'approver' ? 'submissions to review' : me.role === 'analyst' ? 'budgets to submit' : 'Admins do not approve budgets'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card title="Cost centers" className="h-fit" flush actions={<button onClick={reset} className="btn-ghost h-7 px-2 text-xs"><RotateCcw size={13} />Reset demo</button>}>
          <ul className="p-1.5">
            {COST_CENTERS.map((cc) => {
              const t = budgetTotal(budgets[cc].lines);
              const own = canEditCostCenter(me, cc);
              return (
                <li key={cc}>
                  <button onClick={() => setSel(cc)}
                    className={clsx('relative flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors', sel === cc ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {cc}
                        {me.role === 'analyst' && !own && <Lock size={11} className="text-fg-subtle" aria-label="Not in your scope" />}
                      </span>
                      <span className="num block text-xs text-fg-muted">{money(t)} · {pct((t - budgetTotal(FY26[cc])) / budgetTotal(FY26[cc]))} YoY</span>
                    </span>
                    <AnimatePresence mode="wait">
                      <motion.span key={budgets[cc].status} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}>
                        <Badge tone={STATUS_TONE[budgets[cc].status]} className="capitalize">{budgets[cc].status}</Badge>
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title={<span className="flex items-center gap-2">{sel} · FY27 budget <Badge tone={STATUS_TONE[b.status]} className="capitalize">{b.status}</Badge></span>}
          description={<span className="inline-flex items-center gap-1.5">Owner <Avatar initials={b.owner.split(' ').map((x) => x[0]).join('')} size={16} /> {b.owner}</span>}
          actions={editable && <button onClick={() => pullForecast(me, sel)} className="btn-ghost h-7 px-2 text-xs"><ArrowDownToLine size={13} />Pull from forecast</button>}
          flush
        >
          <AnimatePresence>
            {justApproved === sel && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 overflow-hidden bg-pos-soft px-4 py-2 text-sm font-medium text-pos">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-pos text-surface"><DrawCheck size={13} /></span> {sel} approved
              </motion.div>
            )}
          </AnimatePresence>
          {b.status === 'rejected' && b.history.at(-1)?.comment && (
            <div className="mx-4 mt-4 flex gap-2 rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-sm text-neg">
              <MessageSquare size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span><b>Sent back by {b.history.at(-1)!.by}:</b> {b.history.at(-1)!.comment}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <th className="py-2.5 pl-4 text-left">Account</th>
                  <th className="px-3 py-2.5 text-right">FY26 outlook</th>
                  <th className="px-3 py-2.5 text-right">FY27 forecast</th>
                  <th className="px-3 py-2.5 text-right">FY27 budget</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">vs forecast</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(b.lines).map((acct) => {
                  const v = b.lines[acct], fc = forecast[sel][acct] ?? 0, d = v - fc;
                  return (
                    <tr key={acct} className="border-b border-line transition-colors hover:bg-surface-2/60">
                      <td className="py-2 pl-4">{acct}</td>
                      <td className="num px-3 py-2 text-right text-fg-muted">{money(FY26[sel][acct] ?? 0, { compact: false })}</td>
                      <td className="num px-3 py-2 text-right text-fg-muted">{money(fc, { compact: false })}</td>
                      <td className="px-3 py-1.5 text-right">
                        {editable ? <MoneyInput value={v} onChange={(x) => setLine(me, sel, acct, x)} label={`${sel} ${acct}`} />
                          : <span className="num font-medium">{money(v, { compact: false })}</span>}
                      </td>
                      <td className={clsx('num py-2 pl-3 pr-4 text-right', Math.abs(d) < 1 ? 'text-fg-subtle' : d > 0 ? 'text-neg' : 'text-pos')}>
                        {Math.abs(d) < 1 ? '—' : `${d > 0 ? '▲' : '▼'} ${money(Math.abs(d))}`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-2 font-semibold">
                  <td className="py-2.5 pl-4">Total</td>
                  <td className="num px-3 py-2.5 text-right">{money(budgetTotal(FY26[sel]), { compact: false })}</td>
                  <td className="num px-3 py-2.5 text-right">{money(budgetTotal(forecast[sel]), { compact: false })}</td>
                  <td className="num px-3 py-2.5 text-right">{money(budgetTotal(b.lines), { compact: false })}</td>
                  <td className="num py-2.5 pl-3 pr-4 text-right">{money(budgetTotal(b.lines) - budgetTotal(forecast[sel]), { sign: true })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4">
            {actions.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[240px] flex-1">
                  <span className="mb-1 block text-xs font-medium text-fg-muted">Comment {actions.some((a) => a.action === 'reject') ? '(required to send back)' : '(optional)'}</span>
                  <input value={comment} onChange={(e) => setComment(e.target.value)} className="input" placeholder="Add context for the record" />
                </label>
                {actions.map((t) => {
                  const Icon = ACTION_ICON[t.action];
                  const needsComment = t.action === 'reject' && !comment.trim();
                  return <button key={t.action} onClick={() => run(t)} disabled={needsComment} className={ACTION_STYLE[t.action]}><Icon size={15} />{t.label}</button>;
                })}
              </div>
            ) : (
              <AccessNote>
                {me.role === 'analyst' && !mine ? `${sel} is outside your scope. You can edit ${me.costCenters.join(' and ')}.`
                  : me.role === 'analyst' ? `Waiting on an approver. ${sel} is ${b.status}.`
                  : me.role === 'admin' ? `${ROLE_LABEL[me.role]}s manage the cycle but don't approve budgets (segregation of duties).`
                  : `Nothing to approve. ${sel} is ${b.status}.`}
              </AccessNote>
            )}

            <div>
              <h3 className="eyebrow mb-2">History</h3>
              {!b.history.length && <p className="text-sm text-fg-muted">Not submitted yet.</p>}
              <ol className="space-y-2.5 border-l border-line pl-4">
                {[...b.history].reverse().map((h, i) => (
                  <motion.li key={`${h.at}-${i}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line-strong ring-4 ring-surface" aria-hidden />
                    <span className="font-medium capitalize">{h.action === 'reject' ? 'Sent back' : h.action}</span>
                    <span className="text-fg-muted"> · {h.by} · {ago(h.at)}</span>
                    {h.comment && <div className="text-fg-muted">“{h.comment}”</div>}
                  </motion.li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MoneyInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  // Commit on every parseable keystroke so totals update live and nothing depends on blur.
  const edit = (raw: string) => {
    setText(raw);
    const t = raw.replace(/[$,\s]/g, '');
    if (!t) return;
    const n = /k$/i.test(t) ? Number(t.slice(0, -1)) * 1e3 : /m$/i.test(t) ? Number(t.slice(0, -1)) * 1e6 : Number(t);
    if (Number.isFinite(n)) onChange(Math.round(n));
  };
  return (
    <input
      aria-label={label}
      value={text ?? value.toLocaleString('en-US')}
      onFocus={(e) => { setText(String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => edit(e.target.value)}
      onBlur={() => setText(null)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="num w-36 rounded-md border border-line-strong bg-edit-bg/40 px-2 py-1 text-right transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
      title="Type a number. 1.2m and 250k work too"
    />
  );
}
