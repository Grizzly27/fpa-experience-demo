import { Fragment } from 'react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import { CAPABILITIES, PERSONAS, ROLE_LABEL, useApp, usePersona, type Role } from '../../lib/app';
import { Avatar } from '../ui/primitives';
import { EASE } from '../motion';

const ROLES: Role[] = ['analyst', 'approver', 'admin'];

/** Role x capability matrix. Clicking a role switches the demo persona so the whole app re-scopes. */
export function AccessMatrix() {
  const me = usePersona();
  const setPersona = useApp((s) => s.setPersona);

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[330px] grid-cols-[1fr_repeat(3,68px)] text-xs" role="table" aria-label="Role-based access">
          <div role="row" className="contents">
            <div role="columnheader" className="pb-2" />
            {ROLES.map((r) => {
              const p = PERSONAS.find((x) => x.role === r)!;
              const active = me.role === r;
              return (
                <button key={r} role="columnheader" onClick={() => setPersona(p.id)}
                  className="relative flex flex-col items-center gap-1 rounded-t-md px-1 pb-2 pt-1.5 transition-colors hover:bg-surface-2"
                  aria-pressed={active} title={`View the app as ${p.name}`}>
                  {active && <motion.span layoutId="role-col" className="absolute inset-0 rounded-t-md bg-accent-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} aria-hidden />}
                  <Avatar initials={p.initials} size={24} className="relative" />
                  <span className={clsx('relative text-2xs font-semibold', active ? 'text-accent' : 'text-fg')}>{r === 'admin' ? 'Admin' : ROLE_LABEL[r]}</span>
                </button>
              );
            })}
          </div>
          {CAPABILITIES.map((c, i) => (
            <Fragment key={c.id}>
              <div role="rowheader" className="border-t border-line py-2 pr-2 text-fg">{c.label}</div>
              {ROLES.map((r) => {
                const ok = (c.roles as readonly Role[]).includes(r);
                const active = me.role === r;
                return (
                  <div key={r} role="cell" className={clsx('grid place-items-center border-t border-line py-2 transition-colors duration-300', active && 'bg-accent-soft/60')}>
                    <AnimatePresence mode="wait">
                      <motion.span key={`${r}-${active}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.25, ease: EASE, delay: active ? i * 0.04 : 0 }}>
                        {ok
                          ? <span className={clsx('grid h-5 w-5 place-items-center rounded-full', active ? 'bg-pos text-surface' : 'bg-pos-soft text-pos')}><Check size={12} strokeWidth={3} aria-label="Allowed" /></span>
                          : <Minus size={14} className="text-fg-subtle" aria-label="Not allowed" />}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <motion.p key={me.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        <span className="font-medium text-fg">Row-level scope:</span>{' '}
        {me.role === 'analyst'
          ? <>{me.name} can only edit <b className="text-fg">{me.costCenters.join(' and ')}</b>. Other cost centers are read-only.</>
          : <>{me.name} sees all {me.costCenters.length} cost centers.</>}
        {' '}Click a role above to view the app as that person.
      </motion.p>
    </div>
  );
}
