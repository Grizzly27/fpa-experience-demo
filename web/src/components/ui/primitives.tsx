import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { Lock, type LucideIcon } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface TabDef { to: string; label: string; icon?: LucideIcon; count?: number }

/** Route-backed tabs so every view is deep-linkable. */
export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const id = useId();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) => clsx(
            'relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors',
            isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {({ isActive }) => (<>
          {isActive && <motion.span layoutId={`tab-${id}`} transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" aria-hidden />}
          {t.icon && <t.icon size={15} aria-hidden />}
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 text-2xs font-semibold text-accent">{t.count}</span>
          )}
          </>)}
        </NavLink>
      ))}
    </nav>
  );
}

export type Tone = 'neutral' | 'pos' | 'neg' | 'warn' | 'info' | 'accent' | 'solid';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted ring-line',
  pos: 'bg-pos-soft text-pos ring-pos/25',
  neg: 'bg-neg-soft text-neg ring-neg/25',
  warn: 'bg-warn-soft text-warn ring-warn/25',
  info: 'bg-info-soft text-info ring-info/25',
  accent: 'bg-accent-soft text-accent ring-accent/25',
  solid: 'bg-fg text-surface ring-fg',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral', submitted: 'info', approved: 'pos', rejected: 'neg', locked: 'solid',
  success: 'pos', warning: 'warn', running: 'info', failed: 'neg',
  reconciled: 'pos', open: 'warn', future: 'neutral', pass: 'pos', warn: 'warn',
};

export function Stat({ label, value, delta, deltaTone, sub, icon: Icon, children }: {
  label: string; value: ReactNode; delta?: ReactNode; deltaTone?: 'pos' | 'neg' | 'neutral'; sub?: ReactNode; icon?: LucideIcon; children?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {Icon && <Icon size={15} className="text-fg-subtle" aria-hidden />}
      </div>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {delta && (
        <p className={clsx('num mt-1 text-xs font-medium', deltaTone === 'pos' ? 'text-pos' : deltaTone === 'neg' ? 'text-neg' : 'text-fg-muted')}>{delta}</p>
      )}
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
      {children}
    </div>
  );
}

export function Avatar({ initials, size = 28, className }: { initials: string; size?: number; className?: string }) {
  const hue = [...initials].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={clsx('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 42%)` }}
      aria-hidden
    >{initials}</span>
  );
}

/** Explains why a control is unavailable instead of silently hiding it. */
export function AccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-fg-muted">
      <Lock size={13} aria-hidden /> {children}
    </p>
  );
}
