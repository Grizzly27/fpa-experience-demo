import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Fingerprint, KeyRound, ShieldCheck, UserMinus, Users } from 'lucide-react';
import { EASE } from '../motion';

/**
 * Looping SSO explainer: the request travels user -> IdP, the signed assertion travels IdP -> app,
 * then a session is issued. Runs only while visible.
 */
const PHASES = [
  { label: 'Sign-in request', from: 0, to: 1, chip: 'AuthnRequest' },
  { label: 'MFA at your IdP', from: 1, to: 1, chip: 'MFA ✓' },
  { label: 'Signed assertion', from: 1, to: 2, chip: 'SAML assertion' },
  { label: 'Role mapped, session issued', from: 2, to: 2, chip: 'Approver' },
];
const X = [15, 50, 85]; // % positions of the three actors

export function SsoPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-60px' });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1500);
    return () => clearInterval(t);
  }, [inView, reduce]);

  const ph = PHASES[reduce ? 3 : phase];
  const actors = [
    { name: 'Employee', icon: Users },
    { name: 'Your IdP', icon: Fingerprint, sub: 'Okta · Entra ID' },
    { name: 'FP&A app', icon: ShieldCheck, sub: 'via Cognito' },
  ];

  return (
    <div ref={ref}>
      <div className="relative h-[116px] rounded-lg bg-surface-2">
        <div className="absolute left-[15%] right-[15%] top-[38px] h-px bg-line-strong" />
        {actors.map((a, i) => {
          const active = ph.from === i || ph.to === i;
          return (
            <div key={a.name} className="absolute top-3 flex -translate-x-1/2 flex-col items-center" style={{ left: `${X[i]}%` }}>
              <motion.span
                animate={{ scale: active ? 1.06 : 1 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={`grid h-[52px] w-[52px] place-items-center rounded-full border-2 bg-surface transition-colors duration-300 ${active ? 'border-accent text-accent' : 'border-line text-fg-muted'}`}
              >
                <a.icon size={20} aria-hidden />
              </motion.span>
              <span className="mt-1.5 whitespace-nowrap text-xs font-medium text-fg">{a.name}</span>
              {a.sub && <span className="whitespace-nowrap text-2xs text-fg-subtle">{a.sub}</span>}
            </div>
          );
        })}
        <AnimatePresence mode="popLayout">
          <motion.span
            key={phase}
            initial={{ left: `${X[ph.from]}%`, opacity: 0, y: -4 }}
            animate={{ left: `${X[ph.to]}%`, opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="absolute top-[-10px] -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg shadow-pop"
          >
            {ph.chip}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5" aria-live="polite">
        {PHASES.map((p, i) => (
          <span key={p.label} className={`h-1 rounded-full transition-all duration-300 ${i === phase ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'}`} />
        ))}
        <span className="ml-2 text-xs text-fg-muted">{ph.label}</span>
      </div>

      <ul className="mt-4 grid gap-2.5 text-xs sm:grid-cols-2">
        {[
          { icon: KeyRound, t: 'No passwords stored', d: 'SAML 2.0 / OIDC federation; the IdP owns credentials.' },
          { icon: Fingerprint, t: 'MFA enforced upstream', d: 'Conditional access and device posture stay in your IdP.' },
          { icon: UserMinus, t: 'Instant offboarding', d: 'SCIM deprovisioning revokes access within minutes.' },
          { icon: Users, t: 'Groups → roles', d: 'IdP groups map to planning roles and cost center scope.' },
        ].map((f) => (
          <li key={f.t} className="flex gap-2.5">
            <f.icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span><span className="font-medium text-fg">{f.t}.</span> <span className="text-fg-muted">{f.d}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
