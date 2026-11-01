import { getLanguage } from '@/lib/session';
import { pageSession } from '@/lib/page-session';
import { listOutbox } from '@/lib/feed';
import { userNames } from '@/lib/repo';
import { pick } from '@/lib/i18n';
import { may } from '@/lib/guard';
import { hasRole } from '@/lib/scope';
import { whatsappStatus } from '@/lib/whatsapp/admin';
import { deliveryNotes } from '@/lib/whatsapp/outbound';
import { whatsappTestAction, whatsappConnectAction } from '@/lib/actions-whatsapp';
import { Card, CardHead, PageHead, Callout, Toolbar, Empty, Mono, fmtDate } from '@/components/ui';
import { Pill, NotSent, type Tone } from '@/components/labels';
import { FilterChips } from '@/components/lists';
import { ActionForm } from '@/components/ActionForm';

/**
 * The outbox.
 *
 * A field user without a smartphone is reached by WhatsApp, an IVR call or an SMS. IVR and SMS
 * are not connected, so those messages are written here and marked as not delivered. WhatsApp can
 * be connected to Meta's free test number (README: "WhatsApp (Meta Cloud API test number)"): then
 * the messages for the few personas mapped to testers' phones are really sent, and their rows show
 * what WhatsApp reported — sent, delivered, read, or failed with a short reason. Every other row
 * stays simulated. Showing them is the point: the message text is part of the design, and
 * pretending they went out would be a lie.
 */

const DELIVERY: Record<string, { en: string; hi: string; tone: Tone }> = {
  simulated_not_sent: { en: 'simulated, not sent', hi: 'नकली, भेजा नहीं गया', tone: 'warn' },
  queued: { en: 'sending…', hi: 'भेजा जा रहा है…', tone: 'pending' },
  awaiting_reply: { en: 'waiting for the tester to reply', hi: 'परीक्षक के जवाब की प्रतीक्षा', tone: 'pending' },
  sent: { en: 'sent', hi: 'भेजा गया', tone: 'active' },
  delivered: { en: 'delivered', hi: 'पहुँच गया', tone: 'good' },
  read: { en: 'read', hi: 'पढ़ लिया गया', tone: 'good' },
  failed: { en: 'failed', hi: 'विफल', tone: 'critical' },
};

export default async function OutboxPage({
  searchParams,
}: { searchParams: Promise<{ channel?: string }> }) {
  const session = await pageSession();
  const lang = await getLanguage();
  const sp = await searchParams;

  const all = listOutbox(session, { limit: 500 });
  const messages = sp.channel ? all.filter((m) => m.channel === sp.channel) : all;
  const users = userNames(messages.map((m) => m.user_id));
  const channels = [...new Set(all.map((m) => m.channel))];
  const isAdmin = hasRole(session, 'demo_admin') && may(session, 'demo.reset');
  const wa = whatsappStatus();
  const notes = deliveryNotes(messages.filter((m) => m.channel === 'whatsapp' && m.delivery_status !== 'simulated_not_sent').map((m) => m.id));
  const live = wa.sending && wa.recipients.length > 0;

  return (
    <div>
      <PageHead
        title={pick(lang, 'Message outbox', 'संदेश आउटबॉक्स')}
        sub={live
          ? pick(
            lang,
            'Messages sent over WhatsApp, IVR or SMS. WhatsApp messages to the test recipients below really go out; everything else is simulated and not delivered.',
            'WhatsApp, IVR या SMS से भेजे गए संदेश। नीचे दिए परीक्षण प्राप्तकर्ताओं के WhatsApp संदेश सच में जाते हैं; बाकी सब नकली हैं, भेजे नहीं गए।',
          )
          : pick(
            lang,
            'Messages the app would have sent over WhatsApp, IVR or SMS. Nothing was delivered — there is no connection to any of those services.',
            'जो संदेश ऐप WhatsApp, IVR या SMS से भेजता। कुछ भी भेजा नहीं गया — कोई सेवा जुड़ी नहीं है।',
          )}
        right={live ? null : <NotSent lang={lang} />}
      />

      {isAdmin ? (
        <div className="mb-4">
          <Card>
            <CardHead
              title={wa.sending
                ? pick(lang, `WhatsApp: connected (test number) · ${wa.recipients.length} test recipient${wa.recipients.length === 1 ? '' : 's'}`, `WhatsApp: जुड़ा है (परीक्षण नंबर) · ${wa.recipients.length} परीक्षण प्राप्तकर्ता`)
                : pick(lang, 'WhatsApp: simulated', 'WhatsApp: नकली')}
              hint={wa.webhookReady ? pick(lang, 'webhook ready', 'वेबहुक तैयार') : pick(lang, 'webhook not set up', 'वेबहुक नहीं जुड़ा')}
            />
            <div className="px-4 pb-4 sm:px-5">
              <p className="text-sm leading-relaxed text-ink-soft">
                {wa.sending
                  ? pick(
                    lang,
                    'Outside the 24-hour window WhatsApp allows only an approved template, so the phone first gets Meta\'s "hello_world" and the message waits. Once the tester writes anything (for example "hi") to the test number, the waiting messages go out with their reply buttons.',
                    '24 घंटे की अवधि के बाहर WhatsApp केवल स्वीकृत टेम्पलेट भेजने देता है, इसलिए फ़ोन पर पहले Meta का "hello_world" जाता है और संदेश प्रतीक्षा करता है। परीक्षक के परीक्षण नंबर पर कुछ भी (जैसे "hi") लिखते ही प्रतीक्षा वाले संदेश बटनों के साथ चले जाते हैं।',
                  )
                  : pick(
                    lang,
                    'No WhatsApp access token or phone number id is set on this server, so every message stays in this outbox. The README explains how to connect Meta\'s free test number.',
                    'इस सर्वर पर WhatsApp का एक्सेस टोकन या फ़ोन नंबर आईडी नहीं है, इसलिए हर संदेश इसी आउटबॉक्स में रहता है। Meta का मुफ़्त परीक्षण नंबर जोड़ने का तरीका README में है।',
                  )}
              </p>
              {wa.invalidRecipients > 0 ? (
                <p className="mt-2 text-sm text-warn">
                  {pick(lang, `${wa.invalidRecipients} test recipient entr${wa.invalidRecipients === 1 ? 'y was' : 'ies were'} skipped: write them as email=+countrycode-number.`, `${wa.invalidRecipients} परीक्षण प्रविष्टि छोड़ी गई: इन्हें email=+देश-कोड-नंबर के रूप में लिखें।`)}
                </p>
              ) : null}
              {wa.recipients.length > 0 ? (
                <ul className="mt-3 divide-y divide-line rounded border border-line">
                  {wa.recipients.map((r) => (
                    <li key={r.email} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="text-sm font-medium text-ink">{r.name ?? pick(lang, 'No such account', 'ऐसा खाता नहीं')}</span>
                      <Mono>{r.email}</Mono>
                      <span className="tnum text-sm text-ink-soft" data-masked-phone>{r.masked}</span>
                      <Pill tone={r.windowClosesAt ? 'good' : 'neutral'}>
                        {r.windowClosesAt
                          ? pick(lang, `window open until ${fmtDate(r.windowClosesAt, true)}`, `${fmtDate(r.windowClosesAt, true)} तक अवधि खुली`)
                          : pick(lang, 'window closed: tester must write once', 'अवधि बंद: परीक्षक एक बार लिखें')}
                      </Pill>
                      {wa.sending && r.userId ? (
                        <ActionForm
                          action={whatsappTestAction} hidden={{ user_id: r.userId }} tone="quiet" lang={lang} className="ml-auto"
                          label={pick(lang, 'Send a test message to this WhatsApp', 'इस WhatsApp पर परीक्षण संदेश भेजें')}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {wa.sending ? (
                <div className="mt-4 rounded border border-line bg-paper-sunk/50 p-3">
                  <p className="text-sm font-medium text-ink">{pick(lang, 'Not receiving replies?', 'उत्तर नहीं आ रहे?')}</p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {pick(
                      lang,
                      'Meta forwards a WhatsApp account\'s messages only to apps subscribed to it. Paste the "Messaging account ID" from Meta\'s API Setup page and connect; the server makes the call with its own token.',
                      'Meta किसी WhatsApp खाते के संदेश केवल उससे जुड़े ऐप को भेजता है। Meta के API Setup पृष्ठ से "Messaging account ID" डालें और जोड़ें; सर्वर अपने टोकन से यह करता है।',
                    )}
                  </p>
                  <ActionForm action={whatsappConnectAction} lang={lang} className="mt-2 flex flex-wrap items-end gap-2"
                    label={pick(lang, 'Connect the webhook to this account', 'इस खाते से वेबहुक जोड़ें')}>
                    <label className="block">
                      <span className="text-xs text-ink-soft">{pick(lang, 'WhatsApp Business Account ID', 'WhatsApp बिज़नेस खाता आईडी')}</span>
                      <input name="waba_id" inputMode="numeric" required pattern="[0-9]{6,20}" className="input mt-1 w-64 font-mono"
                        defaultValue={process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? ''} />
                    </label>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mb-4">
        <Callout tone="warn" title={pick(lang, 'Simulated unless marked otherwise', 'जब तक अलग न लिखा हो, नकली')}>
          {pick(
            lang,
            'Rows stored with delivery_status "simulated_not_sent" were never handed to a gateway; they are kept so the wording and the language choice can be reviewed. Only WhatsApp rows for the mapped test recipients show a real status.',
            '"simulated_not_sent" वाली पंक्तियाँ किसी गेटवे को नहीं दी गईं; ये शब्द और भाषा की समीक्षा के लिए रखी गई हैं। केवल परीक्षण प्राप्तकर्ताओं की WhatsApp पंक्तियों में असली स्थिति दिखती है।',
          )}
        </Callout>
      </div>
      <Toolbar>
        <FilterChips
          base="/admin/outbox" param="channel" current={sp.channel} lang={lang}
          options={[
            { value: '', label: pick(lang, 'All channels', 'सभी माध्यम'), count: all.length },
            ...channels.map((c) => ({ value: c, label: c, count: all.filter((m) => m.channel === c).length })),
          ]}
        />
      </Toolbar>
      <Card>
        <CardHead title={pick(lang, 'Messages', 'संदेश')} hint={`${messages.length} ${pick(lang, 'shown, newest first', 'दिखाए')}`} />
        {messages.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-line">
            {messages.map((m) => {
              const d = DELIVERY[m.delivery_status] ?? { en: m.delivery_status.replace(/_/g, ' '), hi: m.delivery_status.replace(/_/g, ' '), tone: 'neutral' as Tone };
              const note = notes.get(m.id);
              return (
                <li key={m.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="active">{m.channel}</Pill>
                    <Pill>{m.language === 'hi' ? 'हिंदी' : 'English'}</Pill>
                    <Mono>{m.template}</Mono>
                    <span className="text-sm text-ink-soft">{users.get(m.user_id) ?? m.user_id}</span>
                    <span className="tnum text-xs text-ink-faint">{fmtDate(m.ts, true)}</span>
                    <Pill tone={d.tone}>{pick(lang, d.en, d.hi)}</Pill>
                  </div>
                  {m.delivery_status === 'failed' && note?.error ? (
                    <p className="mt-1 text-xs text-crit">{pick(lang, 'WhatsApp said', 'WhatsApp का उत्तर')}: {note.error}</p>
                  ) : null}
                  {m.delivery_status === 'awaiting_reply' ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      {pick(lang, 'hello_world was sent; this message goes out once the tester writes to the test number.', 'hello_world भेजा गया; परीक्षक के परीक्षण नंबर पर लिखते ही यह संदेश जाएगा।')}
                    </p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
