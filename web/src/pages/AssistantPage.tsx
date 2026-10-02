import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Database, Lock, ShieldCheck, Sparkles, Table2, Wand2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Avatar, Badge, PageHeader } from '../components/ui/primitives';
import { EASE, Page } from '../components/motion';
import { TypingBuddy, type BuddyState } from '../components/assistant/TypingBuddy';
import { Markdown } from '../components/assistant/Markdown';
import { usePersona } from '../lib/app';
import { LAST_ACTUAL, monthLabel } from '../lib/data';
import { trackAction } from '../lib/analytics';

interface Answers { model: string; generated: string; answers: { question: string; answer: string }[] }
// answers.json is produced by data/gen_answers.py (Claude on Amazon Bedrock). Optional at build time.
const files = import.meta.glob<{ default: Answers }>('../data/answers.json', { eager: true });
const DATA: Answers | undefined = Object.values(files)[0]?.default;

const SUGGESTED = DATA?.answers.map((a) => a.question) ?? [
  'Why is Q3 opex over plan?',
  'How is revenue tracking against plan this year?',
  'What drove the August variance?',
];

interface Msg { id: number; role: 'user' | 'assistant'; text: string; sources?: boolean }

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function match(q: string) {
  if (!DATA) return null;
  const qt = tokens(q);
  let best: { score: number; answer: string } | null = null;
  for (const a of DATA.answers) {
    const at = tokens(a.question);
    const overlap = [...qt].filter((w) => at.has(w)).length / Math.max(1, Math.min(qt.size, at.size));
    if (!best || overlap > best.score) best = { score: overlap, answer: a.answer };
  }
  return best && best.score >= 0.34 ? best.answer : null;
}

export default function AssistantPage() {
  const me = usePersona();
  const [msgs, setMsgs] = useState<Msg[]>([{
    id: 0, role: 'assistant',
    text: `Hi ${me.name.split(' ')[0]}. I answer questions about plan vs actuals using only governed numbers from the curated warehouse (actuals through ${monthLabel(LAST_ACTUAL)}). Ask me anything, or start with one of these:`,
  }]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<BuddyState>('idle');
  const [keys, setKeys] = useState(0);
  const [streaming, setStreaming] = useState<{ id: number; shown: number } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = state === 'thinking' || state === 'answering';

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, streaming?.shown]);

  const onType = (v: string) => {
    setInput(v);
    if (busy) return;
    setKeys((k) => k + 1);
    setState('listening');
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setState((s) => (s === 'listening' ? 'idle' : s)), 1100);
  };

  const ask = (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    clearTimeout(idleTimer.current);
    trackAction('assistant_question');
    const id = Date.now();
    setMsgs((m) => [...m, { id: id - 1, role: 'user', text: question }]);
    setInput('');
    setState('thinking');
    const answer = match(question);
    const text = !DATA
      ? 'Answers for this demo are being generated with Claude on Amazon Bedrock and will appear here shortly. In the AWS deployment, this question would run live against the warehouse.'
      : answer ?? `This static demo replays answers Claude generated from this dataset, so I can't answer that one live. In the AWS deployment it would query the warehouse directly. Try one of these: ${SUGGESTED.slice(0, 3).map((s) => `"${s}"`).join(', ')}.`;
    setTimeout(() => {
      setMsgs((m) => [...m, { id, role: 'assistant', text, sources: !!answer }]);
      setState('answering');
      setStreaming({ id, shown: 0 });
    }, 1400);
  };

  // stream the latest answer
  useEffect(() => {
    if (!streaming) return;
    const msg = msgs.find((m) => m.id === streaming.id);
    if (!msg) return;
    if (streaming.shown >= msg.text.length) { setStreaming(null); setState('idle'); return; }
    const t = setTimeout(() => setStreaming((s) => s && { ...s, shown: s.shown + 4 }), 14);
    return () => clearTimeout(t);
  }, [streaming, msgs]);

  return (
    <Page>
      <PageHeader eyebrow="Grounded generative AI" title="AI Assistant"
        description="Plain-English answers about plan vs actuals. The model only sees governed numbers, cites what it used, and never invents a figure." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex h-[min(72vh,720px)] flex-col overflow-hidden rounded-lg bg-surface shadow-card" aria-label="Conversation">
          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            <AnimatePresence initial={false}>
              {msgs.map((m, i) => {
                const text = streaming?.id === m.id ? m.text.slice(0, streaming.shown) : m.text;
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                    className={clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                    {m.role === 'assistant'
                      ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg"><Sparkles size={15} aria-hidden /></span>
                      : <Avatar initials={me.initials} size={32} />}
                    <div className={clsx('max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      m.role === 'user' ? 'rounded-tr-sm bg-accent text-accent-fg' : 'rounded-tl-sm bg-surface-2 text-fg')}>
                      {m.role === 'assistant' ? <Markdown text={text} /> : text}
                      {streaming?.id === m.id && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle" aria-hidden />}
                      {i === 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {SUGGESTED.map((s) => (
                            <button key={s} onClick={() => ask(s)} disabled={busy}
                              className="rounded-full border border-accent/30 bg-surface px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-50">{s}</button>
                          ))}
                        </div>
                      )}
                      {m.sources && streaming?.id !== m.id && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-2xs text-fg-muted">
                          <Database size={12} aria-hidden /> Grounded on
                          {['curated.gl', 'FY26 YTD', 'Q1–Q3 FY26', 'Jul–Sep 26'].map((s) => <Badge key={s}>{s}</Badge>)}
                          {DATA && <span className="ml-auto">{DATA.model}</span>}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {state === 'thinking' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pl-11 text-xs text-fg-muted">
                <Table2 size={13} className="animate-pulse text-accent" aria-hidden /> Querying plan vs actual tables…
              </motion.div>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-line p-3">
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <textarea value={input} onChange={(e) => onType(e.target.value)} rows={1} aria-label="Ask a question"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                placeholder="Ask about variances, drivers, trends…" className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm text-fg outline-none placeholder:text-fg-subtle" />
              <button className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg transition-opacity disabled:opacity-40" disabled={!input.trim() || busy} aria-label="Send">
                <ArrowUp size={16} />
              </button>
            </div>
            <p className="mt-1.5 text-2xs text-fg-subtle">Enter to send · Shift+Enter for a new line · Read-only: the assistant can't change plans or data</p>
          </form>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div className="mx-auto max-w-[280px]"><TypingBuddy state={state} keystrokes={keys} /></div>
            <AnimatePresence mode="wait">
              <motion.p key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="mt-1 text-center text-xs font-medium text-fg-muted">
                {{ idle: 'Ready when you are', listening: 'Listening…', thinking: 'Pulling the numbers…', answering: 'Writing your answer…' }[state]}
              </motion.p>
            </AnimatePresence>
          </Card>
          <Card title="How it works">
            <ol className="space-y-2.5 text-xs">
              {[
                { icon: Wand2, t: 'Your question', d: 'Scoped to your role and cost centers' },
                { icon: Database, t: 'Retrieve governed numbers', d: 'Athena / Redshift aggregates, not raw files' },
                { icon: Sparkles, t: 'Claude on Amazon Bedrock', d: 'Runs in your AWS account; prompts are logged' },
                { icon: ShieldCheck, t: 'Answer with sources', d: 'Every figure traces back to a table' },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><s.icon size={12} aria-hidden /></span>
                  <span><span className="font-medium text-fg">{i + 1}. {s.t}</span><span className="block text-fg-muted">{s.d}</span></span>
                </li>
              ))}
            </ol>
          </Card>
          <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs text-fg-muted">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>Guardrails: no write access, no numbers outside the provided tables, and data never leaves the client's AWS account.</span>
          </div>
        </aside>
      </div>
    </Page>
  );
}
