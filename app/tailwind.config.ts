import type { Config } from 'tailwindcss';

/**
 * Design tokens — "civic intelligence workspace".
 *
 *   navy #101E38 · canvas #F6F4EE · teal #167D78 · amber #D9A441 · terracotta #B94B3E
 *   mist #DDE5E8 · white
 *
 * The token *names* (ink, line, paper, brand, good, warn, crit, pend) are used across every
 * route, so they are kept and mapped onto the palette. Amber is too light to carry text on the
 * ivory canvas, so `warn` (text) is a darkened amber and `amber` is the fill/indicator colour.
 * Surfaces are flat: hairline borders, elevation only for things that float (menus, drawers).
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#101E38', soft: '#4A5568', faint: '#7A8396' },
        line: { DEFAULT: '#E6E2D8', strong: '#D3CEC2' },
        paper: { DEFAULT: '#FFFFFF', sunk: '#FAF9F5', deep: '#EFECE4' },
        ivory: { DEFAULT: '#F6F4EE', deep: '#EEEBE2' },
        mist: { DEFAULT: '#DDE5E8', light: '#EEF2F4' },
        navy: {
          DEFAULT: '#101E38', 950: '#0B1529', 900: '#101E38', 800: '#18294A', 700: '#22365C',
          600: '#3A5078', 300: '#93A2BD', 200: '#C3CCDC', 100: '#E8ECF3',
        },
        brand: { DEFAULT: '#167D78', dark: '#106561', light: '#E5F1F0', soft: '#6BB3AE' },
        good: { DEFAULT: '#167D78', light: '#E5F1F0' },
        amber: { DEFAULT: '#D9A441', light: '#FAF0DA' },
        warn: { DEFAULT: '#8A6416', light: '#FAF0DA' },
        crit: { DEFAULT: '#B94B3E', light: '#F8E7E4' },
        pend: { DEFAULT: '#5B4E8C', light: '#EEEBF6' },
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI Variable Text"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'Roboto', '"Noto Sans Devanagari"', 'sans-serif'],
        display: ['Inter', '"Segoe UI Variable Display"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', '"Noto Sans Devanagari"', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Code"', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'none',
        lift: '0 1px 2px rgba(16,30,56,0.06)',
        pop: '0 12px 32px -8px rgba(16,30,56,0.22), 0 2px 6px -2px rgba(16,30,56,0.08)',
      },
      borderRadius: { lg: '8px', xl: '12px', '2xl': '14px' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in .16s ease-out both', 'slide-in': 'slide-in .18s ease-out both', shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
} satisfies Config;
