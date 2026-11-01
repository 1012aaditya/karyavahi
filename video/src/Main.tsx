import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Captions, Narration } from './components/Overlay';
import { loadFonts } from './fonts';
import { S01Challenge } from './scenes/S01Challenge';
import { S02Answer } from './scenes/S02Answer';
import { S03Officer } from './scenes/S03Officer';
import { S04Field } from './scenes/S04Field';
import { S05Results } from './scenes/S05Results';
import { S06Trust } from './scenes/S06Trust';
import { S07Close } from './scenes/S07Close';
import { BLOCKS, C, s } from './theme';

loadFonts();

const SCENES = [S01Challenge, S02Answer, S03Officer, S04Field, S05Results, S06Trust, S07Close];

/** The whole film: seven scenes on the script's time marks, narration, and captions. */
export const Main: React.FC = () => (
  <AbsoluteFill style={{ background: C.ivory }}>
    {/* A barely-there paper grain so large ivory areas do not band. */}
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 30% 20%, #FBFAF6 0%, ${C.ivory} 60%, ${C.ivoryDeep} 100%)` }} />
    {BLOCKS.map((b, i) => {
      const Scene = SCENES[i];
      return (
        <Sequence key={b.id} name={`${b.id}`} from={s(b.start)} durationInFrames={s(b.end - b.start)}>
          <Scene />
        </Sequence>
      );
    })}
    <Narration />
    <Captions hideFrom={s(161.3)} />
  </AbsoluteFill>
);
