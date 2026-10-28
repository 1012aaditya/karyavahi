import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type Session } from './session';

/**
 * For pages: the signed-in session, or a redirect to sign in.
 *
 * Kept apart from session.ts because importing next/navigation drags in React's client
 * context, which the command-line scripts (the smoke test and the write test) cannot load.
 */
export async function pageSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}
