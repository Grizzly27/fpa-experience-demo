import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** remove body padding (tables that run edge to edge) */
  flush?: boolean;
}

export function Card({ children, className, title, description, actions, flush }: CardProps) {
  return (
    <section className={clsx('rounded-lg bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(!flush && 'p-4')}>{children}</div>
    </section>
  );
}
