import React from 'react';
import { chain } from '../components/Footage';
import { Hud } from '../components/Overlay';
import { ProductShot, sec, type Note } from '../components/ProductShot';
import { SceneFade } from '../components/ui';
import { s } from '../theme';

/** 05 · Proof, then results (1:50–2:10). Times are seconds from 1:50. */
const segs = chain(0, [
  sec({ clip: 'evidence', dur: 4.3, trim: 1.5, keys: [[0, 760, 540, 1.2], [1.4, 640, 560, 1.42], [4.3, 620, 580, 1.5]] }),
  sec({ clip: 'outcome', dur: 7.9, trim: 0.5, keys: [[0, 960, 500, 1.05], [1.9, 960, 500, 1.05], [2.9, 780, 560, 1.32], [6.4, 800, 560, 1.38], [7.3, 840, 400, 1.7]] }),
  sec({ clip: 'reopen', dur: 2.7, trim: 2.6, keys: [[0, 560, 620, 1.55], [2.7, 540, 630, 1.7]] }),
  sec({ clip: 'report', dur: 2.0, trim: 0.6, rate: 1.8, keys: [[0, 760, 400, 1.3], [2.0, 760, 420, 1.3]] }),
  sec({ clip: 'report', dur: 3.1, trim: 5.2, keys: [[0, 760, 520, 1.22], [3.1, 760, 600, 1.2]] }),
]);

const BL = { x: 300, y: 846 };
const notes: Note[] = [
  { at: 0.4, until: 4.3, text: 'Checked by someone else — nobody checks their own work', ...BL, target: [564, 650], icon: 'check' },
  { at: 6.4, until: 10.9, text: 'Plan schools compared with similar schools', ...BL, target: [900, 610] },
  { at: 11.0, until: 12.2, text: 'Did it work? +20 pp, interval above zero → closes', ...BL, target: [826, 330], icon: 'check' },
  { at: 12.4, until: 14.9, text: 'No gain → the case reopens', ...BL, target: [480, 664], tone: 'crit' },
  { at: 15.1, until: 16.9, text: 'The Action Taken Report, built from the ledger', ...BL },
  { at: 17.1, text: 'Claude drafts the narrative — cited, logged', ...BL, icon: 'spark' },
];
const urls = [
  { at: 0, url: '/evidence' },
  { at: 4.3, url: '/cases/CASE-0074' },
  { at: 12.2, url: '/cases?tab=reopened' },
  { at: 14.9, url: '/reports/RPT-00014' },
];

export const S05Results: React.FC = () => (
  <SceneFade dur={s(20)}>
    <ProductShot segs={segs} notes={notes} urls={urls} />
    <Hud showFrom={-30} showUntil={s(20) + 30} doneAt={[-100, s(0.8), s(11.3), s(12.8)]} />
  </SceneFade>
);
