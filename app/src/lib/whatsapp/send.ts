import { scrubNumbers, type WhatsAppConfig } from './config';

/**
 * A small client for the WhatsApp Cloud API (Meta Graph API). Global fetch, no SDK.
 *
 *   POST https://graph.facebook.com/{version}/{phone_number_id}/messages   send a message
 *   GET  https://graph.facebook.com/{version}/{media_id}                   a received photo's url
 *   GET  {that url}                                                         the photo's bytes
 *
 * Every call carries the token as a Bearer header and nothing else carries it: it is never put
 * in a URL, a log line, an error message or a stored row. A send has a 10-second timeout and is
 * tried once more after a 429 or a 5xx answer; any other failure is final. Failures come back as
 * values, never as thrown errors, with a short reason that has had anything number-like removed.
 */

export const GRAPH_HOST = 'https://graph.facebook.com';
const SEND_TIMEOUT_MS = 10_000;
const MEDIA_TIMEOUT_MS = 20_000;

/** Pause before the single retry. Tests set it to 0. */
export const sendTiming = { retryDelayMs: 1500 };

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; httpStatus: number; code: number | null; reason: string };

export interface ReplyButton { id: string; title: string }

export type MessagePayload =
  | { messaging_product: 'whatsapp'; recipient_type: 'individual'; to: string; type: 'text'; text: { preview_url: false; body: string } }
  | {
    messaging_product: 'whatsapp'; recipient_type: 'individual'; to: string; type: 'interactive';
    interactive: { type: 'button'; body: { text: string }; action: { buttons: { type: 'reply'; reply: ReplyButton }[] } };
  }
  | { messaging_product: 'whatsapp'; recipient_type: 'individual'; to: string; type: 'template'; template: { name: string; language: { code: string } } };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const toDigits = (to: string) => to.replace(/\D/g, '');

export function textPayload(to: string, body: string): MessagePayload {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: toDigits(to), type: 'text', text: { preview_url: false, body: clip(body, 4096) } };
}

/** Up to three reply buttons under a body of at most 1024 characters; titles at most 20. */
export function buttonsPayload(to: string, body: string, buttons: ReplyButton[]): MessagePayload {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: toDigits(to), type: 'interactive',
    interactive: {
      type: 'button', body: { text: clip(body, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply' as const, reply: { id: b.id.slice(0, 256), title: clip(b.title, 20) } })) },
    },
  };
}

export function templatePayload(to: string, name: string, languageCode: string): MessagePayload {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: toDigits(to), type: 'template', template: { name, language: { code: languageCode } } };
}

export const messagesUrl = (cfg: Pick<WhatsAppConfig, 'version' | 'phoneNumberId'>) =>
  `${GRAPH_HOST}/${cfg.version}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;

interface GraphError { error?: { message?: string; code?: number; error_data?: { details?: string } } }

async function graphFailure(res: Response): Promise<{ code: number | null; reason: string }> {
  let body: GraphError = {};
  try { body = (await res.json()) as GraphError; } catch { /* not JSON */ }
  const code = typeof body.error?.code === 'number' ? body.error.code : null;
  const text = body.error?.error_data?.details || body.error?.message || res.statusText || 'request failed';
  return { code, reason: scrubNumbers(String(text)).slice(0, 160) };
}

const retryable = (status: number) => status === 429 || status >= 500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send one message. Resolves to the provider's message id, or a short failure. */
export async function postMessage(cfg: WhatsAppConfig, payload: MessagePayload): Promise<SendResult> {
  if (!cfg.sending) return { ok: false, httpStatus: 0, code: null, reason: 'WhatsApp is not configured' };
  const init = (): RequestInit => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(messagesUrl(cfg), init());
    } catch (e) {
      const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
      return { ok: false, httpStatus: 0, code: null, reason: timedOut ? 'no answer from WhatsApp within 10 s' : 'could not reach WhatsApp' };
    }
    if (res.ok) {
      let body: { messages?: { id?: string }[] } = {};
      try { body = (await res.json()) as typeof body; } catch { /* fall through */ }
      const id = body.messages?.[0]?.id;
      return id ? { ok: true, messageId: id } : { ok: false, httpStatus: res.status, code: null, reason: 'WhatsApp gave no message id' };
    }
    if (attempt === 1 && retryable(res.status)) {
      try { await res.body?.cancel(); } catch { /* nothing to drain */ }
      await wait(sendTiming.retryDelayMs);
      continue;
    }
    const f = await graphFailure(res);
    return { ok: false, httpStatus: res.status, ...f };
  }
}

// ---------------------------------------------------------------- received photos
export type MediaResult =
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; code: 'not_image' | 'too_large' | 'download_failed'; reason: string };

/** Hosts a media url may point at; the token is never sent anywhere else. */
const MEDIA_HOST = /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/i;

/**
 * Fetch a photo someone sent: first its url and declared type and size, then the bytes. Refuses
 * anything that is not an image or is over `maxBytes`, by the declared size, the Content-Length
 * and the bytes actually received. The photo's real type is checked again by checkPhoto().
 */
export async function fetchMedia(cfg: WhatsAppConfig, mediaId: string, maxBytes: number): Promise<MediaResult> {
  if (!cfg.sending) return { ok: false, code: 'download_failed', reason: 'WhatsApp is not configured' };
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(mediaId)) return { ok: false, code: 'download_failed', reason: 'bad media id' };
  const auth = { Authorization: `Bearer ${cfg.token}` };
  try {
    const metaRes = await fetch(`${GRAPH_HOST}/${cfg.version}/${encodeURIComponent(mediaId)}`, {
      headers: auth, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
    if (!metaRes.ok) return { ok: false, code: 'download_failed', reason: (await graphFailure(metaRes)).reason };
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number | string };
    const mime = String(meta.mime_type ?? '').toLowerCase().split(';')[0].trim();
    if (!mime.startsWith('image/')) return { ok: false, code: 'not_image', reason: `not an image (${mime.slice(0, 40) || 'unknown type'})` };
    const declared = Number(meta.file_size ?? 0);
    if (declared > maxBytes) return { ok: false, code: 'too_large', reason: `${(declared / 1048576).toFixed(1)} MB is over the limit` };
    let url: URL;
    try { url = new URL(String(meta.url ?? '')); } catch { return { ok: false, code: 'download_failed', reason: 'no media url' }; }
    if (url.protocol !== 'https:' || !MEDIA_HOST.test(url.hostname)) return { ok: false, code: 'download_failed', reason: 'unexpected media host' };

    const fileRes = await fetch(url, { headers: auth, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!fileRes.ok) return { ok: false, code: 'download_failed', reason: `download answered ${fileRes.status}` };
    const len = Number(fileRes.headers.get('content-length') ?? 0);
    if (len > maxBytes) {
      try { await fileRes.body?.cancel(); } catch { /* fine */ }
      return { ok: false, code: 'too_large', reason: `${(len / 1048576).toFixed(1)} MB is over the limit` };
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.length > maxBytes) return { ok: false, code: 'too_large', reason: `${(bytes.length / 1048576).toFixed(1)} MB is over the limit` };
    return { ok: true, bytes, mime };
  } catch (e) {
    const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
    return { ok: false, code: 'download_failed', reason: timedOut ? 'download timed out' : 'download failed' };
  }
}
