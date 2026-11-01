import React from 'react';
import { Composition, Still } from 'remotion';
import { Main } from './Main';
import { TOTAL } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Main" component={Main} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Still id="Poster" component={Main} width={1920} height={1080} />
  </>
);
