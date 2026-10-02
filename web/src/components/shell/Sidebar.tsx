import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  BarChart3, ChevronsLeft, ChevronsRight, Database, FilePenLine, Home, Lock, ShieldCheck, Sparkles, type LucideIcon,
} from 'lucide-react';
import { can, useApp, usePersona } from '../../lib/app';
import { Logo } from './SignIn';
import { useBudgets, TRANSITIONS, allowed } from '../../lib/budget';
import { COST_CENTERS } from '../../lib/data';

export interface NavItem { to: string; label: string; icon: LucideIcon; description: string }

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, description: 'Cycle status, your tasks, platform overview' },
  { to: '/intake', label: 'Forecast Intake', icon: FilePenLine, description: 'Driver forecast and cost center submissions' },
  { to: '/actuals', label: 'Actuals Management', icon: Database, description: 'Close status, loads, data quality, mappings' },
  { to: '/reporting', label: 'Reporting', icon: BarChart3, description: 'Variance, bridges and report library' },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles, description: 'Ask questions about plan vs actuals' },
  { to: '/admin', label: 'Admin Portal', icon: ShieldCheck, description: 'Users, roles, SSO, cycles, integrations, audit' },
];

/** Number of submissions waiting on the current persona. */
export function useMyQueue() {
  const p = usePersona();
  const budgets = useBudgets((s) => s.budgets);
  return COST_CENTERS.filter((cc) => TRANSITIONS.some((t) => t.action !== 'reopen' && t.action !== 'lock' && allowed(p, cc, t, budgets[cc].status))).length;
}

export function Sidebar() {
  const collapsed = useApp((s) => s.navCollapsed);
  const toggle = useApp((s) => s.toggleNav);
  const persona = usePersona();
  const queue = useMyQueue();
  const budgets = useBudgets((s) => s.budgets);
  const approved = COST_CENTERS.filter((cc) => ['approved', 'locked'].includes(budgets[cc].status)).length;

  return (
    <aside
      className={clsx(
        'sticky top-0 hidden h-screen shrink-0 flex-col bg-nav text-nav-fg transition-[width] duration-200 md:flex',
        collapsed ? 'w-[60px]' : 'w-[248px]',
      )}
      aria-label="Primary"
    >
      <div className={clsx('flex h-14 items-center gap-2.5 border-b border-white/10', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Logo />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 truncate text-sm font-semibold">Custom FP&amp;A Experience</div>
            <div className="truncate text-2xs text-nav-muted">Demo tenant · Northwind Devices</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {!collapsed && <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-nav-muted">Workspace</p>}
        {NAV.map((item) => {
          const locked = item.to === '/admin' && !can(persona, 'admin');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => clsx(
                'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                isActive ? 'bg-nav-2 text-white' : 'text-nav-muted hover:bg-white/5 hover:text-white',
                collapsed && 'justify-center',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#3B82F6]" aria-hidden />}
                  <item.icon size={18} aria-hidden className="shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.to === '/intake' && queue > 0 && (
                    <span className="rounded-full bg-[#3B82F6] px-1.5 text-2xs font-semibold text-white" aria-label={`${queue} items need your action`}>{queue}</span>
                  )}
                  {!collapsed && locked && <Lock size={13} className="text-nav-muted" aria-label="Read-only for your role" />}
                  {collapsed && item.to === '/intake' && queue > 0 && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[#3B82F6]" aria-hidden />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="m-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between text-2xs">
            <span className="font-semibold uppercase tracking-[0.08em] text-nav-muted">FY27 budget cycle</span>
            <span className="text-nav-muted">Closes Oct 31</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#22C55E] transition-[width] duration-500" style={{ width: `${(approved / COST_CENTERS.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-nav-fg">{approved} of {COST_CENTERS.length} cost centers approved</p>
        </div>
      )}

      <button
        onClick={toggle}
        className="flex h-10 items-center justify-center gap-2 border-t border-white/10 text-xs text-nav-muted transition-colors hover:text-white"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
      </button>
    </aside>
  );
}
