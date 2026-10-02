import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, LogOut, Monitor, Moon, Search, Sun, UserCog, type LucideIcon } from 'lucide-react';
import { PERSONAS, ROLE_LABEL, useApp } from '../../lib/app';
import { NAV } from './Sidebar';

interface Cmd { id: string; label: string; group: string; icon: LucideIcon; hint?: string; run: () => void }

const SUBPAGES: [string, string, string][] = [
  ['/intake/forecast', 'Driver forecast', 'Forecast Intake'],
  ['/intake/submissions', 'Cost center submissions', 'Forecast Intake'],
  ['/actuals/close', 'Close status', 'Actuals Management'],
  ['/actuals/loads', 'Data loads', 'Actuals Management'],
  ['/actuals/quality', 'Data quality checks', 'Actuals Management'],
  ['/actuals/mapping', 'Account mapping', 'Actuals Management'],
  ['/actuals/ledger', 'Ledger explorer', 'Actuals Management'],
  ['/reporting/variance', 'Plan vs actuals', 'Reporting'],
  ['/reporting/bridge', 'Operating income bridge', 'Reporting'],
  ['/reporting/library', 'Report library', 'Reporting'],
  ['/admin/users', 'Users & roles', 'Admin Portal'],
  ['/admin/sso', 'Single sign-on', 'Admin Portal'],
  ['/admin/cycles', 'Planning cycles', 'Admin Portal'],
  ['/admin/integrations', 'Integrations', 'Admin Portal'],
  ['/admin/audit', 'Audit log', 'Admin Portal'],
  ['/admin/architecture', 'Architecture', 'Admin Portal'],
];

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPalette);
  const setPersona = useApp((s) => s.setPersona);
  const setTheme = useApp((s) => s.setTheme);
  const signOut = useApp((s) => s.signOut);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useApp.getState().paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) { restore.current = document.activeElement as HTMLElement; setQ(''); setI(0); requestAnimationFrame(() => input.current?.focus()); }
    else restore.current?.focus?.();
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => { navigate(to); setOpen(false); };
    return [
      ...NAV.map((n) => ({ id: n.to, label: n.label, group: 'Go to', icon: n.icon, hint: n.description, run: go(n.to) })),
      ...SUBPAGES.map(([to, label, parent]) => ({ id: to, label, group: 'Go to', icon: ArrowRight, hint: parent, run: go(to) })),
      ...PERSONAS.map((p) => ({ id: `as-${p.id}`, label: `View as ${p.name}`, group: 'Demo', icon: UserCog, hint: `${ROLE_LABEL[p.role]} · ${p.title}`, run: () => { setPersona(p.id); setOpen(false); } })),
      { id: 'light', label: 'Light theme', group: 'Preferences', icon: Sun, run: () => { setTheme('light'); setOpen(false); } },
      { id: 'dark', label: 'Dark theme', group: 'Preferences', icon: Moon, run: () => { setTheme('dark'); setOpen(false); } },
      { id: 'system', label: 'Match system theme', group: 'Preferences', icon: Monitor, run: () => { setTheme('system'); setOpen(false); } },
      { id: 'signout', label: 'Sign out', group: 'Account', icon: LogOut, run: () => { signOut(); setOpen(false); } },
    ];
  }, [navigate, setOpen, setPersona, setTheme, signOut]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cmds;
    return cmds.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(t));
  }, [q, cmds]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); results[i]?.run(); }
    else if (e.key === 'Tab') e.preventDefault(); // keep focus in the dialog
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}
          onMouseDown={() => setOpen(false)}>
          <motion.div role="dialog" aria-modal="true" aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}
            className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-pop">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search size={16} className="text-fg-subtle" aria-hidden />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
                placeholder="Search pages, actions, people…" aria-label="Search commands"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
              <kbd className="rounded border border-line px-1.5 font-mono text-2xs text-fg-muted">Esc</kbd>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
              {!results.length && <li className="px-3 py-6 text-center text-sm text-fg-muted">No matches for “{q}”</li>}
              {results.map((c, k) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <li key={c.id}>
                    {header && <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{header}</p>}
                    <button role="option" aria-selected={k === i} onMouseMove={() => setI(k)} onClick={c.run}
                      className={clsx('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left', k === i ? 'bg-accent-soft' : '')}>
                      <c.icon size={16} className={k === i ? 'text-accent' : 'text-fg-subtle'} aria-hidden />
                      <span className="flex-1 truncate text-sm text-fg">{c.label}</span>
                      {c.hint && <span className="hidden truncate text-xs text-fg-subtle sm:block">{c.hint}</span>}
                      {k === i && <CornerDownLeft size={14} className="text-fg-subtle" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
