/**
 * A blocker's description as a Hindi reader sees it. The reason inside is what an officer typed
 * and stays as written; the note the back-fill adds around it is translated.
 */
export function blockerText(description: string, lang: 'en' | 'hi' = 'en'): string {
  if (lang !== 'hi') return description;
  const m = /^([\s\S]*) \(recorded on (\S+) when its (owner was changed|deadline was moved)\)$/.exec(description);
  return m ? `${m[1]} (${m[2]} पर दर्ज, जब ${m[3] === 'owner was changed' ? 'उसका ज़िम्मेदार बदला गया' : 'उसकी समय-सीमा बदली गई'})` : description;
}

/** How a blocker was closed. The back-fill's own words are translated; an officer's note stays as typed. */
export function blockerResolutionText(resolution: string, lang: 'en' | 'hi' = 'en'): string {
  if (lang !== 'hi') return resolution;
  if (resolution === 'Task was later submitted') return 'काम बाद में जमा हुआ';
  return resolution.replace(/^Escalated: /, 'ऊपर भेजी गई: ');
}
