import { NextResponse } from 'next/server';
import { SESSION_COOKIE, loadSession } from '@/lib/session';
import { ROLE_LABELS } from '@domain/permissions';

/**
 * Demo sign-in. Takes a user id and checks it resolves to an active user with at least one
 * role. There is no password: every account is fictional and the data carries no personal
 * information. Authority still comes from the user's role rows, never from this cookie, so a
 * signed-in BEO cannot see another block's cases no matter what the cookie says.
 *
 * Against Supabase this handler is replaced by signInWithPassword; nothing downstream changes.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const userId = String(form.get('user_id') ?? '').trim();
  const session = userId ? loadSession(userId) : null;

  if (!session) {
    const back = new URL('/login', req.url);
    back.searchParams.set('error', 'unknown-account');
    return NextResponse.redirect(back, 303);
  }

  const home = ROLE_LABELS[session.role]?.home ?? '/cases';
  const res = NextResponse.redirect(new URL(home, req.url), 303);
  res.cookies.set(SESSION_COOKIE, session.user_id, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
  });
  return res;
}
