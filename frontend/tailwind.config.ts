import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        'paper-2': 'var(--color-paper-2)',
        'paper-3': 'var(--color-paper-3)',
        cotton: 'var(--color-cotton)',
        desk: 'var(--color-desk)',
        print: 'var(--color-print)',
        board: 'var(--color-board)',
        'board-type': 'var(--color-board-type)',
        paid: 'var(--color-paid)',
        ink: 'var(--color-ink)',
        'ink-2': 'var(--color-ink-2)',
        muted: 'var(--color-muted)',
        rule: 'var(--color-rule)',
        'rule-2': 'var(--color-rule-2)',
        accent: 'var(--color-accent)',
        'accent-ink': 'var(--color-accent-ink)',
        'accent-2': 'var(--color-accent-2)',
        focus: 'var(--color-focus)',
        error: 'var(--color-error)',
        'error-soft': 'var(--color-error-soft)',
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warn: 'var(--color-warn)',
        'warn-soft': 'var(--color-warn-soft)',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-outlier)'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        input: 'var(--radius-input)',
        stock: 'var(--radius-stock)',
      },
    },
  },
  plugins: [],
} satisfies Config;
