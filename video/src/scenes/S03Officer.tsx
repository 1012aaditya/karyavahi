import React from 'react';
import { chain } from '../components/Footage';
import { Hud } from '../components/Overlay';
import { ProductShot, sec, type Note } from '../components/ProductShot';
import { SceneFade } from '../components/ui';
import { s } from '../theme';

/**
 * 03 · The officer's view (0:32–1:15), all live footage from karyavahi.onrender.com.
 * Times are seconds from the start of this block (0:32). Camera keys: [t, x, y, zoom] in clip pixels.
 */
const segs = chain(0, [
  sec({ clip: 'home', dur: 8.6, trim: 0.5, keys: [[0, 960, 540, 1], [4.2, 960, 540, 1], [5.4, 720, 600, 1.28], [6.8, 720, 600, 1.28], [7.8, 1480, 330, 1.55]] }),
  sec({ clip: 'cmdk', dur: 4.0, trim: 1.4, rate: 2.0, keys: [[0, 1150, 300, 1.2], [1.0, 1248, 250, 1.6]] }),
  sec({ clip: 'case', dur: 2.2, trim: 0.6, keys: [[0, 620, 300, 1.3], [2.2, 600, 320, 1.38]] }),
  sec({ clip: 'case', dur: 2.0, trim: 6.0, keys: [[0, 760, 300, 1.4], [2.0, 740, 300, 1.48]] }),
  sec({ clip: 'case', dur: 2.4, trim: 12.4, keys: [[0, 760, 400, 1.25], [2.4, 720, 380, 1.32]] }),
  sec({ clip: 'explain', dur: 4.0, trim: 1.2, rate: 1.25, keys: [[0, 760, 640, 1.22], [2.4, 760, 640, 1.22], [4.0, 800, 560, 1.2]] }),
  sec({ clip: 'explain', dur: 2.3, trim: 12.2, keys: [[0, 880, 690, 1.45], [2.3, 900, 700, 1.6]] }),
  sec({ clip: 'plan', dur: 1.5, trim: 1.8, rate: 2.6, keys: [[0, 760, 560, 1.2], [1.5, 760, 540, 1.22]] }),
  sec({ clip: 'plan', dur: 1.4, trim: 6.3, keys: [[0, 760, 470, 1.22], [1.4, 760, 450, 1.26]] }),
  sec({ clip: 'plan', dur: 2.0, trim: 14.6, keys: [[0, 900, 330, 1.42], [2.0, 880, 350, 1.5]] }),
  sec({ clip: 'approve', dur: 5.4, trim: 0.6, keys: [[0, 720, 800, 1.3], [2.5, 700, 820, 1.38], [3.4, 1380, 320, 1.3], [5.4, 1450, 330, 1.45]] }),
  sec({ clip: 'work', dur: 7.2, trim: 0.6, keys: [[0, 760, 420, 1.2], [2.0, 720, 420, 1.32], [7.2, 740, 400, 1.36]] }),
]);

const BL = { x: 300, y: 846 }; // labels sit low in the window, left of the app's own dock

const notes: Note[] = [
  { at: 5.0, until: 8.5, text: 'Their own block, on a real map', ...BL, target: [700, 600] },
  { at: 7.2, until: 8.6, text: 'What needs them today', x: 1180, y: 322, align: 'center', target: [1480, 255] },
  { at: 9.4, until: 12.6, text: 'One search for everything — or ask Claude', ...BL, target: [1240, 225], icon: 'spark' },
  { at: 12.8, until: 14.8, text: 'The drop: 65.7% → 47.7% in one round', ...BL, target: [380, 366], tone: 'crit' },
  { at: 14.9, until: 16.8, text: 'The schools driving it', ...BL, target: [620, 270], tone: 'crit' },
  { at: 17.0, until: 19.2, text: 'The conditions behind it · association, not cause', ...BL, target: [470, 285] },
  { at: 19.4, until: 23.2, text: 'Claude explains it in plain words', ...BL, icon: 'spark' },
  { at: 23.3, until: 25.5, text: 'Every figure checked against the records', ...BL, target: [990, 768], icon: 'check' },
  { at: 25.7, until: 28.3, text: 'A plan suggested from the evidence library', ...BL, icon: 'spark' },
  { at: 28.4, until: 30.4, text: 'Costs per school, from UP PAB 2025-26', ...BL, target: [640, 240] },
  { at: 30.5, until: 31.9, text: 'The officer decides — AI drafts carry no authority', ...BL, tone: 'ink' },
  { at: 32.0, until: 33.6, text: 'A second officer approves', ...BL, target: [525, 912] },
  { at: 33.9, until: 35.8, text: 'One tap → approved, comparison schools locked', ...BL, target: [1560, 362], icon: 'check' },
  { at: 36.0, text: 'Every task has an owner…', ...BL, target: [565, 330] },
  { at: 37.6, text: '…and a deadline', x: 1180, y: 846, align: 'left', target: [955, 330] },
];

const urls = [
  { at: 0, url: '/overview' },
  { at: 12.6, url: '/cases/CASE-0184' },
  { at: 25.5, url: '/cases/CASE-0127' },
  { at: 28.3, url: '/cases/CASE-0127/plan' },
  { at: 30.4, url: '/approvals' },
  { at: 33.3, url: '/cases/CASE-0208' },
  { at: 35.8, url: '/cases/CASE-0070' },
];

export const S03Officer: React.FC = () => (
  <SceneFade dur={s(43)}>
    <ProductShot segs={segs} notes={notes} urls={urls} />
    <Hud showFrom={0} showUntil={s(43) + 30} doneAt={[s(37.6), 1e9, 1e9, 1e9]} />
  </SceneFade>
);
