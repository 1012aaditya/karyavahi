import type { Config } from 'tailwindcss';

/**
 * Design tokens. The token *names* (ink, line, paper, brand, good, warn, crit, pend) predate the
 * redesign and are used across every route, so they are kept and only their values changed:
 * warm ivory surfaces, deep navy text, teal for primary action and positive progress, muted
 * amber for attention, restrained red for serious declines.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f1f3d', soft: '#45526a', faint: '#77819a' },
        line: { DEFAULT: '#e8e4da', strong: '#d5cfc1' },
        paper: { DEFAULT: '#ffffff', sunk: '#f8f6f1', deep: '#efebe2' },
        ivory: { DEFAULT: '#faf8f3', deep: '#f3efe6' },
        navy: {
          DEFAULT: '#0f1f3d', 950: '#0a1630', 900: '#0f1f3d', 800: '#172b50', 700: '#213a66',
          600: '#34507f', 300: '#9fb0cc', 200: '#c9d3e4', 100: '#e7ecf4',
        },
        brand: { DEFAULT: '#0f766e', dark: '#115e59', light: '#e7f4f1', soft: '#5eb5a9' },
        good: { DEFAULT: '#18794e', light: '#e5f4ec' },
        warn: { DEFAULT: '#9a5b07', light: '#fcf2dc' },
        crit: { DEFAULT: '#b42318', light: '#fdecea' },
        pend: { DEFAULT: '#5b4696', light: '#efebfa' },
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI Variable Text"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'Roboto', '"Noto Sans Devanagari"', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', 'Inter', '"Segoe UI"', 'ui-sans-serif', 'system-ui', '"Noto Sans Devanagari"', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Code"', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,31,61,0.04), 0 1px 3px rgba(15,31,61,0.05)',
        lift: '0 4px 12px -2px rgba(15,31,61,0.08), 0 2px 4px -2px rgba(15,31,61,0.06)',
        pop: '0 16px 40px -8px rgba(15,31,61,0.22), 0 4px 12px -4px rgba(15,31,61,0.10)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out both', shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
} satisfies Config;
