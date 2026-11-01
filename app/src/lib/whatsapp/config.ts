/**
 * WhatsApp (Meta Cloud API) settings, from the environment only.
 *
 *   WHATSAPP_ACCESS_TOKEN      the Cloud API token (a system-user token, or the 24-hour one)
 *   WHATSAPP_PHONE_NUMBER_ID   the id of the sending number (Meta's free test number)
 *   WHATSAPP_APP_SECRET        the Meta app's secret: signs every webhook call (X-Hub-Signature-256)
 *   WHATSAPP_VERIFY_TOKEN      a string you choose; Meta echoes it once when the webhook is set up
 *   WHATSAPP_GRAPH_VERSION     Graph API version, default v23.0
 *   WHATSAPP_TEST_RECIPIENTS   demo persona email = tester's real phone (E.164), comma-separated:
 *                              hm.sch-01893@demo.karyavahi.test=+9198xxxxxxxx,crc.clu-001@...=+91...
 *
 * Without the token or the phone number id nothing is sent: the outbox stays simulated exactly as
 * before. A persona not in the mapping is never sent to, whatever its preferred channel.
 *
 * The real phone numbers live in that one variable and nowhere else: never in the database, the
 * logs, the audit chain, an API answer or a page. Where a page has to show one, it shows
 * maskPhone()'s form (+91 98•••••12). Read on every call, so a changed variable needs no rebuild.
 */

export interface WhatsAppConfig {
  /** True when messages can actually be sent (token and phone number id are both set). */
  sending: boolean;
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  version: string;
  /** lower-cased persona email → E.164 number. Only valid entries are kept. */
  recipients: Map<string, string>;
  /** How many entries of WHATSAPP_TEST_RECIPIENTS were not "email=+number" and were skipped. */
  invalidRecipients: number;
}

export const DEFAULT_GRAPH_VERSION = 'v23.0';
const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@=,]+@[^\s@=,]+$/;

export function parseRecipients(raw: string | undefined): { map: Map<string, string>; invalid: number } {
  const map = new Map<string, string>();
  let invalid = 0;
  for (const part of (raw ?? '').split(/[,;\n]/)) {
    const entry = part.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const email = eq > 0 ? entry.slice(0, eq).trim().toLowerCase() : '';
    const phone = eq > 0 ? entry.slice(eq + 1).replace(/[\s()-]/g, '') : '';
    if (!EMAIL.test(email) || !E164.test(phone)) { invalid++; continue; }
    map.set(email, phone);
  }
  return { map, invalid };
}

export function whatsappConfig(): WhatsAppConfig {
  const env = process.env;
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim() ?? '';
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '';
  const version = env.WHATSAPP_GRAPH_VERSION?.trim() ?? '';
  const { map, invalid } = parseRecipients(env.WHATSAPP_TEST_RECIPIENTS);
  return {
    sending: token.length > 0 && /^\d{5,30}$/.test(phoneNumberId),
    token,
    phoneNumberId,
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? '',
    version: /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : DEFAULT_GRAPH_VERSION,
    recipients: map,
    invalidRecipients: invalid,
  };
}

/** Digits only, as WhatsApp writes a sender ("919812345612"). */
export const digitsOf = (phone: string): string => phone.replace(/\D/g, '');

/** The persona email a sender's number belongs to, or null for a number not in the mapping. */
export function emailForSender(cfg: WhatsAppConfig, from: string): string | null {
  const d = digitsOf(from);
  if (!d) return null;
  for (const [email, phone] of cfg.recipients) if (digitsOf(phone) === d) return email;
  return null;
}

/** '+919812345612' → '+91 98•••••12'. The only form in which a number may appear on a page. */
export function maskPhone(phone: string): string {
  const d = digitsOf(phone);
  if (d.length < 8) return '•••';
  const cc = d.startsWith('1') || d.startsWith('7') ? d.slice(0, 1) : d.slice(0, 2);
  const rest = d.slice(cc.length);
  return `+${cc} ${rest.slice(0, 2)}•••••${rest.slice(-2)}`;
}

/** Remove anything that looks like a phone number from provider text before it is stored or logged. */
export const scrubNumbers = (s: string): string => s.replace(/\+?\d[\d\s-]{6,}\d/g, '[number]');
