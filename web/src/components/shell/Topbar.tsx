import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bell, Check, ChevronRight, LogOut, Monitor, Moon, Search, Sun, UserCog } from 'lucide-react';
import { PERSONAS, ROLE_LABEL, useApp, usePersona } from '../../lib/app';
import { useForecastStore } from '../../lib/useForecast';
import { useBudgets } from '../../lib/budget';
import { ago } from '../../lib/pipelines';
import { Avatar, Badge } from '../ui/primitives';
import { NAV, OWNER_NAV } from './Sidebar';

const SUB: Record<string, string> = {
  forecast: 'Driver forecast', submissions: 'Cost center submissions',
  close: 'Close status', loads: 'Data loads', quality: 'Data quality', mapping: 'Account mapping', ledger: 'Ledger explorer',
  variance: 'Plan vs actuals', bridge: 'Operating income bridge', library: 'Report library',
  users: 'Users & roles', sso: 'Single sign-on', cycles: 'Planning cycles', integrations: 'Integrations', audit: 'Audit log', architecture: 'Architecture',
};

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function Popover({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  if (!open) return null;
  return <div className={clsx('absolute right-0 top-11 z-50 rounded-lg bg-surface shadow-pop', className)}>{children}</div>;
}

export function Topbar() {
  const { pathname } = useLocation();
  const [, section, sub] = pathname.split('/');
  const nav = [...NAV, OWNER_NAV].find((n) => n.to === `/${section ?? ''}`) ?? NAV[0];
  const setPalette = useApp((s) => s.setPalette);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden text-fg-subtle sm:inline">FP&amp;A Experience</span>
          <ChevronRight size={14} className="hidden text-fg-subtle sm:inline" aria-hidden />
          <Link to={nav.to} className={clsx('truncate font-medium', sub ? 'text-fg-muted hover:text-fg' : 'text-fg')}>{nav.label}</Link>
          {sub && SUB[sub] && (<><ChevronRight size={14} className="text-fg-subtle" aria-hidden /><span className="truncate font-medium text-fg">{SUB[sub]}</span></>)}
        </nav>

        <div className="flex-1" />

        <button
          onClick={() => setPalette(true)}
          className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg-subtle transition-colors hover:border-line-strong lg:flex"
        >
          <Search size={15} aria-hidden /> Search or jump to…
          <kbd className="ml-auto rounded border border-line bg-surface px-1.5 font-mono text-2xs text-fg-muted">Ctrl K</kbd>
        </button>
        <button onClick={() => setPalette(true)} className="btn-ghost h-8 w-8 p-0 lg:hidden" aria-label="Search"><Search size={16} /></button>

        <Badge tone="warn" dot className="hidden sm:inline-flex">Demo environment</Badge>
        <ThemeToggle />
        <Notifications />
        <UserMenu />
      </div>
      {/* compact nav for small screens, where the sidebar is hidden */}
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) => clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium', isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted')}>
            <n.icon size={14} aria-hidden />{n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

function ThemeToggle() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const order = ['system', 'light', 'dark'] as const;
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const next = order[(order.indexOf(theme) + 1) % 3];
  return (
    <button onClick={() => setTheme(next)} className="btn-ghost h-8 w-8 p-0" aria-label={`Theme: ${theme}. Switch to ${next}`} title={`Theme: ${theme}`}>
      <Icon size={16} />
    </button>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const log = useForecastStore((s) => s.state.log);
  const budgets = useBudgets((s) => s.budgets);
  const items = [
    ...Object.entries(budgets).flatMap(([cc, b]) => b.history.map((h) => ({ at: h.at, text: `${h.by} ${h.action === 'reject' ? 'sent back' : h.action === 'submit' ? 'submitted' : h.action + 'd'} ${cc}`, to: '/intake/submissions' }))),
    ...log.filter((l) => l.kind === 'update').map((l) => ({ at: l.at, text: `${l.author}: ${l.text}`, to: '/intake/forecast' })),
  ].sort((a, b) => b.at - a.at).slice(0, 7);
  const navigate = useNavigate();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn-ghost relative h-8 w-8 p-0" aria-label="Notifications" aria-expanded={open}>
        <Bell size={16} />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-neg ring-2 ring-surface" aria-hidden />
      </button>
      <Popover open={open} className="w-80">
        <div className="border-b border-line px-3 py-2 text-xs font-semibold">Activity</div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.map((i, k) => (
            <li key={k}>
              <button onClick={() => { navigate(i.to); setOpen(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-surface-2">
                <span className="line-clamp-2 text-fg">{i.text}</span>
                <span className="text-fg-subtle">{ago(i.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const persona = usePersona();
  const setPersona = useApp((s) => s.setPersona);
  const signOut = useApp((s) => s.signOut);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-surface-2" aria-expanded={open} aria-label="Account menu">
        <Avatar initials={persona.initials} />
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-xs font-medium text-fg">{persona.name}</span>
          <span className="block text-2xs text-fg-subtle">{ROLE_LABEL[persona.role]}</span>
        </span>
      </button>
      <Popover open={open} className="w-72">
        <div className="flex items-center gap-3 border-b border-line p-3">
          <Avatar initials={persona.initials} size={36} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{persona.name}</div>
            <div className="truncate text-xs text-fg-muted">{persona.title}</div>
            <div className="mt-1 flex flex-wrap gap-1"><Badge tone="accent">{ROLE_LABEL[persona.role]}</Badge><Badge>SSO · SAML</Badge></div>
          </div>
        </div>
        <div className="p-1.5">
          <p className="flex items-center gap-1.5 px-2 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle"><UserCog size={12} /> Demo: view as</p>
          {PERSONAS.map((p) => (
            <button key={p.id} onClick={() => { setPersona(p.id); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
              <Avatar initials={p.initials} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{p.name}</span>
                <span className="block truncate text-2xs text-fg-subtle">{ROLE_LABEL[p.role]} · {p.title}</span>
              </span>
              {p.id === persona.id && <Check size={14} className="text-accent" aria-label="Current" />}
            </button>
          ))}
        </div>
        <button onClick={signOut} className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg">
          <LogOut size={14} /> Sign out
        </button>
      </Popover>
    </div>
  );
}
