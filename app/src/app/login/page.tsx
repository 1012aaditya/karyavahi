import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLanguage, getSession } from '@/lib/session';
import { demoAccounts, scopeName } from '@/lib/repo';
import { homeFor } from '@/lib/nav';
import { Card, CardHead, Callout, PageHead, Mono } from '@/components/ui';
import { Pill } from '@/components/labels';
import { ROLE_LABELS } from '@domain/permissions';
import { pick } from '@/lib/i18n';
import { AS_OF_DATE } from '@domain/catalog';

/** The demo front door: one row per seeded demo account, with what that role can actually do. */

const WHAT_YOU_SEE: Record<string, { en: string; hi: string }> = {
  demo_admin: { en: 'Everything, plus the demo controls: reset the seed, move the clock, read the simulated outbox.', hi: 'सब कुछ, साथ ही डेमो नियंत्रण: बीज रीसेट, घड़ी बदलें, आउटबॉक्स देखें।' },
  state_admin: { en: 'The whole state. Configures detection thresholds and decides district and PAB plans.', hi: 'पूरा राज्य। सीमाएँ तय करता है और ज़िला/PAB योजनाएँ स्वीकृत करता है।' },
  auditor: { en: 'Read-only across the state, plus the audit hash chain and every AI interaction.', hi: 'पूरे राज्य में केवल पढ़ने की अनुमति, साथ ही अंकेक्षण श्रृंखला और AI लॉग।' },
  deo: { en: 'One district. Decides district-lever plans, sees escalations from every block.', hi: 'एक ज़िला। ज़िला-स्तर की योजनाएँ तय करता है।' },
  beo: { en: 'One block. Approves block plans, assigns the work, verifies proof, closes cases.', hi: 'एक खंड। योजनाएँ स्वीकृत करता है, काम सौंपता है, सबूत जाँचता है।' },
  brc: { en: 'One block, in the field. Owns training and the independent spot-checks.', hi: 'खंड में क्षेत्र कार्य। प्रशिक्षण और स्वतंत्र जाँच।' },
  crc: { en: 'One cluster. Coaching visits, spot assessments, raising field concerns.', hi: 'एक संकुल। सहयोग भ्रमण, त्वरित आकलन, क्षेत्रीय चिंता दर्ज करना।' },
  headmaster: { en: 'Only their own school and only their own tasks.', hi: 'केवल अपना विद्यालय और अपने काम।' },
};

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const existing = await getSession();
  if (existing) redirect(homeFor(existing));

  const lang = await getLanguage();
  const { error } = await searchParams;
  const accounts = demoAccounts();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title={pick(lang, 'Karyavahi — sign in', 'कार्यवाही — साइन इन')}
        sub={pick(
          lang,
          'Pick a demo account to see the same case ledger through that role\'s eyes. Scope is enforced on the server: a block officer cannot read another block, and a headmaster sees only their own school.',
          'किसी डेमो खाते से साइन इन करें और उसी प्रकरण-पंजी को उस भूमिका की दृष्टि से देखें। दायरा सर्वर पर लागू होता है।',
        )}
      />

      {error === 'unknown-account' ? (
        <div className="mb-4">
          <Callout tone="crit" title={pick(lang, 'That account could not be used', 'यह खाता उपयोग नहीं हो सका')}>
            {pick(lang, 'No active user with that id, or the user has no role assigned.', 'उस आईडी से कोई सक्रिय उपयोगकर्ता नहीं, या कोई भूमिका नहीं।')}
          </Callout>
        </div>
      ) : null}

      <div className="mb-4">
        <Callout tone="warn" title={pick(lang, 'This is a demo on fictional data', 'यह काल्पनिक डेटा पर आधारित डेमो है')}>
          {pick(
            lang,
            `Every school, person, score, cost and outcome below is generated. Nothing is connected to UDISE+, NAS, ASER, a state VSK, WhatsApp or IVR. Sign-in needs no password because there is nothing real to protect. "Today" in the data is ${AS_OF_DATE}.`,
            `नीचे का हर विद्यालय, व्यक्ति, अंक और परिणाम काल्पनिक है। कोई वास्तविक प्रणाली जुड़ी नहीं है। डेटा में "आज" ${AS_OF_DATE} है।`,
          )}
        </Callout>
      </div>

      <Card>
        <CardHead
          title={pick(lang, 'Demo accounts', 'डेमो खाते')}
          hint={pick(lang, 'Seeded accounts on the reserved domain demo.karyavahi.test', 'आरक्षित डोमेन demo.karyavahi.test पर बने खाते')}
        />
        <ul className="divide-y divide-line">
          {accounts.map((a) => {
            const role = ROLE_LABELS[a.role as keyof typeof ROLE_LABELS];
            const blurb = WHAT_YOU_SEE[a.role];
            return (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{a.full_name}</p>
                    <Pill tone="active">{pick(lang, role?.en ?? a.role, role?.hi ?? a.role)}</Pill>
                    <Pill>{scopeName(a.scope_type, a.scope_id)}</Pill>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-faint">{a.email}</p>
                  {blurb ? (
                    <p className="mt-1 max-w-xl text-[13px] leading-snug text-ink-soft">
                      {pick(lang, blurb.en, blurb.hi)}
                    </p>
                  ) : null}
                </div>
                <form action="/api/sign-in" method="post" className="shrink-0 self-center">
                  <input type="hidden" name="user_id" value={a.id} />
                  <button type="submit" className="btn-primary">
                    {pick(lang, 'Sign in', 'साइन इन')}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card className="card-pad">
          <h2 className="text-sm font-semibold text-ink">{pick(lang, 'Where to start', 'कहाँ से शुरू करें')}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {pick(
              lang,
              'Sign in as the block officer for Rampur Sadar. Their July round arrived late, so the queue is fresh and CASE-0184 is waiting on their decision.',
              'रामपुर सदर के खंड शिक्षा अधिकारी के रूप में साइन इन करें। CASE-0184 उनके निर्णय की प्रतीक्षा में है।',
            )}
          </p>
          <form action="/api/sign-in" method="post" className="mt-3">
            <input
              type="hidden" name="user_id"
              value={accounts.find((a) => a.email.startsWith('beo.blk-01@'))?.id ?? ''}
            />
            <button type="submit" className="btn-primary w-full">
              {pick(lang, 'Sign in as the Rampur Sadar block officer', 'खंड शिक्षा अधिकारी के रूप में साइन इन करें')}
            </button>
          </form>
        </Card>
        <Card className="card-pad">
          <h2 className="text-sm font-semibold text-ink">{pick(lang, 'Sign in by role', 'भूमिका से साइन इन')}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {pick(lang, 'Each role has its own entry point.', 'हर भूमिका का अपना प्रवेश मार्ग है।')}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            {Object.entries(ROLE_LABELS).map(([code, r]) => (
              <li key={code}>
                <Link href={r.login} className="link">{pick(lang, r.en, r.hi)}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-4 text-center text-[12px] text-ink-faint">
        <Mono>karyavahi-seed v1.0</Mono> · {pick(lang, 'seed', 'बीज')} 20261024
      </p>
    </div>
  );
}
