/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens: values live in src/index.css (light + dark)
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        'fg-muted': v('fg-muted'),
        'fg-subtle': v('fg-subtle'),
        accent: v('accent'),
        'accent-hover': v('accent-hover'),
        'accent-soft': v('accent-soft'),
        'accent-fg': v('accent-fg'),
        pos: v('pos'),
        'pos-soft': v('pos-soft'),
        neg: v('neg'),
        'neg-soft': v('neg-soft'),
        warn: v('warn'),
        'warn-soft': v('warn-soft'),
        info: v('info'),
        'info-soft': v('info-soft'),
        'edit-bg': v('edit-bg'),
        'edit-fg': v('edit-fg'),
        'edit-line': v('edit-line'),
        nav: v('nav'),
        'nav-2': v('nav-2'),
        'nav-fg': v('nav-fg'),
        'nav-muted': v('nav-muted'),
        chart: {
          1: v('chart-1'),
          2: v('chart-2'),
          3: v('chart-3'),
          4: v('chart-4'),
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 0 0 1px rgb(var(--line) / 1)',
        pop: '0 12px 32px -8px rgb(15 23 42 / 0.28), 0 0 0 1px rgb(var(--line) / 1)',
      },
      borderRadius: { DEFAULT: '6px', md: '6px', lg: '8px', xl: '12px' },
      transitionDuration: { DEFAULT: '200ms' },
    },
  },
  plugins: [],
};
