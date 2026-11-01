import { Easing } from 'remotion';

/** The app's own palette (app/src/lib/tokens.ts): navy ink on ivory, teal for action. */
export const C = {
  ink: '#101E38',
  inkSoft: '#4A5568',
  inkFaint: '#6B7385',
  line: '#E6E2D8',
  lineStrong: '#D3CEC2',
  paper: '#FFFFFF',
  paperSunk: '#FAF9F5',
  paperDeep: '#EFECE4',
  ivory: '#F6F4EE',
  ivoryDeep: '#EEEBE2',
  mist: '#DDE5E8',
  navy950: '#0B1529',
  navy800: '#18294A',
  navy300: '#93A2BD',
  brand: '#167D78',
  brandDark: '#106561',
  brandLight: '#E5F1F0',
  brandSoft: '#6BB3AE',
  brandMint: '#A7E3D8',
  amber: '#D9A441',
  amberLight: '#FAF0DA',
  warn: '#8A6416',
  crit: '#B94B3E',
  critLight: '#F8E7E4',
  pend: '#5B4E8C',
};

/** Two typefaces, as in the app: Source Serif 4 for titles, IBM Plex Sans (+ its Devanagari) for everything else. */
export const F = {
  serif: '"Source Serif 4", Georgia, serif',
  sans: '"IBM Plex Sans", "IBM Plex Sans Devanagari", system-ui, sans-serif',
};

export const FPS = 30;
export const TOTAL = 180 * FPS;
/** Seconds → frames. */
export const s = (sec: number) => Math.round(sec * FPS);

/** One calm curve for every move. */
export const EASE = Easing.bezier(0.45, 0, 0.2, 1);
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** The seven blocks of the narration (script.md). */
export const BLOCKS = [
  { id: '01', start: 0, end: 20 },
  { id: '02', start: 20, end: 32 },
  { id: '03', start: 32, end: 75 },
  { id: '04', start: 75, end: 110 },
  { id: '05', start: 110, end: 130 },
  { id: '06', start: 130, end: 155 },
  { id: '07', start: 155, end: 180 },
] as const;
