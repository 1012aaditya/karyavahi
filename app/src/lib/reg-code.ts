import 'server-only';
import { cookies, headers } from 'next/headers';
import { isHttps } from './http';

/**
 * The demo's stand-in for "we emailed you a code".
 *
 * No email is sent in the demo, so the code is shown on screen, but only to the browser that
 * submitted the request. It travels in a short-lived, http-only cookie scoped to /register, not
 * in the address: a URL is kept in browser history, server and proxy logs and Referer headers,
 * and a link carrying the code lets whoever holds it verify the email for someone else.
 *
 * The cookie holds the request id and the code together, so it shows the code only on the
 * status page of the request it was issued for. Knowing a request id is not enough to see its
 * code: forging the cookie means already knowing the code.
 */
export const REG_CODE_COOKIE = 'kv_reg_code';
const MAX_AGE_S = 30 * 60;

export async function rememberDemoCode(requestId: string, code: string): Promise<void> {
  const secure = isHttps(await headers());
  (await cookies()).set(REG_CODE_COOKIE, `${requestId}.${code}`, {
    httpOnly: true, secure, sameSite: 'lax', path: '/register', maxAge: MAX_AGE_S,
  });
}

/** The code issued to this browser for this request, or null. */
export async function demoCodeFor(requestId: string): Promise<string | null> {
  const raw = (await cookies()).get(REG_CODE_COOKIE)?.value ?? '';
  const dot = raw.lastIndexOf('.');
  if (dot < 0 || raw.slice(0, dot) !== requestId) return null;
  const code = raw.slice(dot + 1);
  return /^\d{6}$/.test(code) ? code : null;
}

export async function forgetDemoCode(): Promise<void> {
  (await cookies()).delete({ name: REG_CODE_COOKIE, path: '/register' });
}
