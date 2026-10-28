import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14181f', soft: '#49536b', faint: '#7a849c' },
        line: { DEFAULT: '#e2e6ef', strong: '#ccd3e0' },
        paper: { DEFAULT: '#ffffff', sunk: '#f5f7fb', deep: '#eef1f7' },
        brand: { DEFAULT: '#1b4ea8', dark: '#133a7f', light: '#e8effb' },
        good: { DEFAULT: '#116b43', light: '#e3f5ec' },
        warn: { DEFAULT: '#8a5a06', light: '#fdf2dc' },
        crit: { DEFAULT: '#9d1f2b', light: '#fdeaec' },
        pend: { DEFAULT: '#5b4696', light: '#efebfa' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '"Segoe UI"', 'Roboto', '"Noto Sans Devanagari"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
