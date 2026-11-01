import { continueRender, delayRender, staticFile } from 'remotion';

const FACES: [string, string, string][] = [
  ['IBM Plex Sans', 'fonts/plex-sans-latin.woff2', '100 700'],
  ['IBM Plex Sans Devanagari', 'fonts/plex-deva-400.woff2', '400'],
  ['IBM Plex Sans Devanagari', 'fonts/plex-deva-500.woff2', '500'],
  ['IBM Plex Sans Devanagari', 'fonts/plex-deva-600.woff2', '600'],
  ['Source Serif 4', 'fonts/source-serif-600.woff2', '600'],
];

let started = false;
/** Loads the fonts (copied from the app's build) before the first frame is captured. */
export function loadFonts() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('fonts');
  Promise.all(
    FACES.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format("woff2")`, { weight, style: 'normal' });
      (document.fonts as unknown as Set<FontFace>).add(face);
      return face.load();
    }),
  ).then(() => continueRender(handle), (e) => { console.error(e); continueRender(handle); });
}
