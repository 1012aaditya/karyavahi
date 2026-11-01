import { NextResponse } from 'next/server';
import { LANG_COOKIE } from '@/lib/session';
import { isCrossSite, sameSitePath, redirectToPath } from '@/lib/http';

export async function POST(req: Request) {
  if (isCrossSite(req)) return new NextResponse('Cross-site request refused.', { status: 403 });
  const form = await req.formData();
  const to = String(form.get('to') ?? 'en');
  // Back to the page the toggle was on, but never to another site named in the Referer.
  const back = sameSitePath(req.headers.get('referer'), req.headers);
  const res = redirectToPath(back);
  res.cookies.set(LANG_COOKIE, to === 'hi' ? 'hi' : 'en', {
    httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
