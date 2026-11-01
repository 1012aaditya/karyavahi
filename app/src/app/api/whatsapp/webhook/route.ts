import { after } from 'next/server';
import { acceptWebhook, verifyHandshake, MAX_WEBHOOK_BYTES } from '@/lib/whatsapp/inbound';

/**
 * Meta's WhatsApp webhook: https://karyavahi.onrender.com/api/whatsapp/webhook
 *
 * GET is the one-time verification handshake; POST carries messages and delivery statuses.
 * The checks (verify token, X-Hub-Signature-256 over the raw body) and the handling live in
 * src/lib/whatsapp/inbound.ts. The answer to a good POST is a quick 200; what the messages ask
 * for runs after it, so Meta does not time out and retry. No session cookie is involved: the
 * signature is the authentication, and each action runs as the persona the sender maps to.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// One line per call in the server log, so a silent webhook can be told apart from a refused one.
// Never the body, a phone number or a token: only what happened and the status returned.
const note = (what: string, status: number) => console.log(`[whatsapp webhook] ${what} -> ${status}`);

export async function GET(req: Request) {
  const r = verifyHandshake(new URL(req.url).searchParams);
  note(r.status === 200 ? 'verification handshake accepted' : 'verification handshake refused (verify token or mode did not match)', r.status);
  return text(r.body, r.status);
}

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_WEBHOOK_BYTES) return text('Too large', 413);
  let raw: Uint8Array;
  try { raw = new Uint8Array(await req.arrayBuffer()); } catch { return text('Bad request', 400); }
  const r = acceptWebhook(raw, req.headers.get('x-hub-signature-256'));
  note(r.status === 200 ? `event received (${raw.length} bytes)`
    : r.status === 401 ? (req.headers.get('x-hub-signature-256') ? 'refused: signature did not match WHATSAPP_APP_SECRET' : 'refused: no signature header')
    : `refused: ${r.body}`, r.status);
  if (r.work) after(r.work);
  return text(r.body, r.status);
}
