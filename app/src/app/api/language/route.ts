import { NextResponse } from 'next/server';
import { LANG_COOKIE } from '@/lib/session';

export async function POST(req: Request) {
  const form = await req.formData();
  const to = String(form.get('to') ?? 'en');
  const res = NextResponse.redirect(new URL(req.headers.get('referer') ?? '/', req.url), 303);
  res.cookies.set(LANG_COOKIE, to === 'hi' ? 'hi' : 'en', {
    httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
