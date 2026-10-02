import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowRight, Info, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { submitLead } from '../../lib/analytics';
import { Unauthorized, useOwner } from '../../lib/owner';
import { PERSONAS, ROLE_LABEL, useApp, type Persona } from '../../lib/app';
import { Avatar, Badge } from '../ui/primitives';
import { DrawCheck, EASE } from '../motion';

type Step = 'start' | 'handshake' | 'owner';
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,120}\.[a-z]{2,24}$/i;

export function SignIn() {
  const signIn = useApp((s) => s.signIn);
  const [step, setStep] = useState<Step>('start');
  const [who, setWho] = useState<Persona | null>(null);
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = EMAIL_RE.test(email.trim());

  const enterWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    submitLead(email);
    signIn('jordan');
  };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Logo /> <span className="font-semibold">Custom FP&amp;A Experience</span>
          </div>
          <AnimatePresence mode="wait">
            {step === 'start' && (
              <Panel key="start">
                <h1 className="text-xl font-semibold tracking-tight">Explore the demo</h1>
                <p className="mt-1 text-sm text-fg-muted">Pick a demo user to see how access changes by role, or enter your email to jump right in.</p>

                <p className="eyebrow mt-6 mb-2">Select a user</p>
                <div className="space-y-2">
                  {PERSONAS.map((p, i) => (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, ease: EASE }}
                      onClick={() => { setWho(p); setStep('handshake'); }}
                      className="group flex w-full items-center gap-3 rounded-lg bg-surface p-3 text-left shadow-card transition-shadow hover:shadow-pop"
                    >
                      <Avatar initials={p.initials} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{p.title}</span>
                      </span>
                      <Badge tone={p.role === 'admin' ? 'warn' : p.role === 'approver' ? 'info' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
                      <ArrowRight size={16} className="text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </motion.button>
                  ))}
                </div>

                <div className="my-5 flex items-center gap-3 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>

                <form onSubmit={enterWithEmail} noValidate>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-fg-muted">Enter your email to learn more</span>
                    <div className="flex gap-2">
                      <input className={`input h-10 flex-1 ${touched && !valid ? 'border-neg focus:border-neg focus:ring-neg/25' : ''}`} type="email" inputMode="email" autoComplete="email"
                        placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => email && setTouched(true)}
                        aria-invalid={touched && !valid} aria-describedby="email-help" />
                      <button className="btn-primary h-10 shrink-0" disabled={!email.trim()}>Continue <ArrowRight size={16} /></button>
                    </div>
                  </label>
                  <p id="email-help" className={`mt-1.5 text-xs ${touched && !valid ? 'text-neg' : 'text-fg-subtle'}`}>
                    {touched && !valid ? 'Enter a valid email, or pick a demo user above.' : 'Optional. Shared only with the creator of this demo so they can follow up. Never used for anything else.'}
                  </p>
                </form>

                <div className="mt-5 flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-muted">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span><b className="text-fg">Demo environment.</b> Sign-in is simulated; in production users sign in through their company SSO (SAML 2.0 / OIDC via Amazon Cognito). This site collects basic usage analytics (pages viewed, approximate location, device); Do Not Track is honored.</span>
                </div>
                <button onClick={() => setStep('owner')} className="btn-ghost mt-2 w-full text-xs"><Activity size={14} />Site owner? View traffic</button>
              </Panel>
            )}

            {step === 'owner' && (
              <Panel key="owner">
                <OwnerSignIn onBack={() => setStep('start')} onDone={() => { signIn('sam'); window.location.hash = '#/traffic'; }} />
              </Panel>
            )}

            {step === 'handshake' && who && (
              <Panel key="handshake">
                <Handshake persona={who} domain="northwind.example" onDone={() => signIn(who.id)} />
              </Panel>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function OwnerSignIn({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const unlock = useOwner((s) => s.unlock);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad' | 'error'>('idle');
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setState('checking');
      try { await unlock(value); onDone(); } catch (err) { setState(err instanceof Unauthorized ? 'bad' : 'error'); }
    }}>
      <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"><Activity size={18} aria-hidden /></div>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">Site owner sign-in</h1>
      <p className="mt-1 text-sm text-fg-muted">Opens the private Traffic dashboard. The passphrase is verified by the server and kept only for this tab.</p>
      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-medium text-fg-muted">Passphrase</span>
        <input type="password" autoComplete="current-password" className="input h-10" value={value} autoFocus
          onChange={(e) => { setValue(e.target.value); if (state !== 'checking') setState('idle'); }} aria-invalid={state === 'bad'} aria-describedby="owner-msg" />
      </label>
      <p id="owner-msg" role="alert" className="mt-1.5 min-h-[18px] text-xs text-neg">
        {state === 'bad' && 'That passphrase was not accepted.'}{state === 'error' && 'Could not reach the analytics service.'}
      </p>
      <button className="btn-primary mt-2 h-10 w-full" disabled={!value || state === 'checking'}>
        {state === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Sign in
      </button>
      <button type="button" onClick={onBack} className="btn-ghost mt-3 px-0 text-xs">Back to demo sign-in</button>
    </form>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease: EASE }}>
      {children}
    </motion.div>
  );
}

function Handshake({ persona, domain, onDone }: { persona: Persona; domain: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const steps = [
    `Discovered identity provider for ${domain}`,
    'Signed SAML AuthnRequest sent to IdP',
    'User authenticated · MFA verified by IdP',
    'Assertion validated: signature, audience, expiry',
    `Group "${persona.groups[0]}" mapped to ${ROLE_LABEL[persona.role]}`,
    'Session issued · 8h idle timeout',
  ];
  const [done, setDone] = useState(reduce ? steps.length : 0);

  useEffect(() => {
    if (done >= steps.length) { const t = setTimeout(onDone, reduce ? 150 : 650); return () => clearTimeout(t); }
    const t = setTimeout(() => setDone((d) => d + 1), 420);
    return () => clearTimeout(t);
  }, [done, steps.length, onDone, reduce]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"><KeyRound size={18} aria-hidden /></div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Signing you in</h1>
          <p className="text-xs text-fg-muted">as {persona.name} · simulated SAML 2.0</p>
        </div>
      </div>
      <TokenTrack progress={done / steps.length} />
      <ol className="mt-4 space-y-2.5" aria-live="polite">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5 text-sm">
            <span className="grid h-5 w-5 shrink-0 place-items-center">
              {i < done ? <span className="grid h-5 w-5 place-items-center rounded-full bg-pos-soft text-pos"><DrawCheck size={13} /></span>
                : i === done ? <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
                : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" aria-hidden />}
            </span>
            <span className={i <= done ? 'text-fg' : 'text-fg-subtle'}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** User → IdP → App with a token travelling along the track. */
function TokenTrack({ progress }: { progress: number }) {
  const stops = ['You', 'Identity provider', 'FP&A app'];
  return (
    <div className="relative mt-5 px-2">
      <div className="absolute left-6 right-6 top-[15px] h-0.5 rounded bg-line" />
      <motion.div className="absolute left-6 top-[15px] h-0.5 rounded bg-accent" animate={{ width: `calc((100% - 48px) * ${progress})` }} transition={{ ease: EASE, duration: 0.4 }} />
      <motion.div className="absolute top-[9px] grid h-3.5 w-3.5 place-items-center rounded-full bg-accent shadow-[0_0_0_4px_rgb(var(--accent)/0.2)]"
        animate={{ left: `calc(24px + (100% - 48px) * ${progress} - 7px)` }} transition={{ ease: EASE, duration: 0.4 }} aria-hidden />
      <div className="relative flex justify-between">
        {stops.map((s, i) => (
          <div key={s} className="flex w-12 flex-col items-center gap-1.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full border-2 bg-surface transition-colors ${progress >= i / 2 ? 'border-accent' : 'border-line'}`}>
              {i === 0 ? <span className="text-2xs font-semibold">You</span> : i === 1 ? <ShieldCheck size={15} className="text-fg-muted" /> : <Logo size={16} />}
            </span>
            <span className="whitespace-nowrap text-2xs text-fg-muted">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="#2563EB" />
      <rect x="8" y="17" width="4" height="7" rx="1" fill="white" opacity="0.7" />
      <rect x="14" y="12" width="4" height="12" rx="1" fill="white" opacity="0.85" />
      <rect x="20" y="7" width="4" height="17" rx="1" fill="white" />
    </svg>
  );
}

/** Left panel: animated planning grid with forecast lines drawing in. */
function BrandPanel() {
  const reduce = useReducedMotion();
  const line = (pts: number[]) => pts.map((y, k) => `${k ? 'L' : 'M'}${k * 60},${y}`).join(' ');
  const series = [
    [300, 280, 290, 250, 240, 210, 200, 170, 160, 130, 120, 95],
    [310, 300, 295, 285, 270, 262, 250, 238, 230, 218, 205, 196],
  ];
  return (
    <aside className="relative hidden overflow-hidden bg-nav text-nav-fg lg:flex lg:flex-col lg:justify-between lg:p-10">
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
        <defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="white" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      <svg viewBox="0 0 660 360" className="absolute bottom-24 left-0 w-[115%] opacity-90" aria-hidden>
        {series.map((pts, i) => (
          <motion.path key={i} d={line(pts)} fill="none" stroke={i ? '#64748B' : '#3B82F6'} strokeWidth={i ? 2 : 3}
            strokeDasharray={i ? '6 6' : undefined} strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, delay: 0.3 + i * 0.25, ease: EASE }} />
        ))}
        <motion.circle cx={660} cy={95} r={6} fill="#3B82F6" initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 2.4, duration: 0.5 }} />
      </svg>
      <div className="relative flex items-center gap-2.5"><Logo /><span className="text-sm font-semibold">Custom FP&amp;A Experience</span><span className="rounded border border-white/20 px-1.5 text-2xs text-nav-muted">Demo</span></div>
      <div className="relative max-w-md">
        <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          className="text-3xl font-semibold leading-tight tracking-tight">Plan, forecast and close the loop on actuals, in one governed workspace.</motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.6 }} className="mt-3 text-sm text-nav-muted">
          Enterprise SSO, role-based access and governed data pipelines from day one. Built on AWS in your own account.
        </motion.p>
        <div className="mt-6 flex flex-wrap gap-2 text-2xs">
          {['SAML 2.0 / OIDC', 'SCIM provisioning', 'Row-level access', 'Audit trail', 'Data stays in your AWS'].map((t, i) => (
            <motion.span key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.07 }}
              className="rounded-full border border-white/15 px-2.5 py-1 text-nav-fg">{t}</motion.span>
          ))}
        </div>
      </div>
      <p className="relative text-2xs text-nav-muted">Demo build · Northwind Devices is fictional · synthetic data</p>
    </aside>
  );
}
