import { useEffect, useState } from 'react';

const NAMES = ['accent', 'pos', 'neg', 'warn', 'fg', 'fg-muted', 'fg-subtle', 'line', 'line-strong', 'surface', 'chart-1', 'chart-2', 'chart-3', 'chart-4'] as const;
export type Tokens = Record<(typeof NAMES)[number], string>;

function read(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, `rgb(${cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(',')})`])) as Tokens;
}

/** Resolved token colors for chart libraries (SVG attributes can't use CSS variables). Updates on theme change. */
export function useTokens(): Tokens {
  const [t, setT] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setT(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return t;
}
